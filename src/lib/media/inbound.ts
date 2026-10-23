import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { attachments, contacts, conversations } from "@/db/schema";
import { PRIVATE_MEDIA_URL_PREFIX } from "@/lib/storage";
import { KAPSO_MEDIA_DOMAINS } from "@/lib/messaging/providers/kapso";
import { ZERNIO_MEDIA_DOMAINS } from "@/lib/messaging/providers/zernio";
import { getProvider } from "@/lib/messaging/registry";
import type {
  ChannelAccount,
  ChannelKind,
  NormalizedInboundEvent,
  ProviderId,
} from "@/lib/messaging/types";

import { extractDocumentText } from "./document";
import { downloadMedia, saveMediaLocally } from "./downloader";
import { mimeKind, sniffMediaMime, type MediaKind } from "./signatures";
import { transcribeAudio } from "./transcription";
import { analyzeVideo } from "./video";
import { processImage } from "./vision";

/**
 * Inbound media pipeline (A-01/F-05). Wires the normalized `mediaRefs` on an
 * inbound event through the existing media stack:
 *
 *   provider.resolveMedia → downloadMedia → saveMediaLocally →
 *   transcribeAudio | processImage | analyzeVideo | extractDocumentText
 *
 * and returns the agent-facing text the dispatcher should see plus the saved
 * files, so the pipeline can attach them to the contact's organization.
 *
 * Provider coverage: each provider's own `resolveMedia` handles its
 * authenticated flow (ycloud two-step, kapso Graph proxy, zernio re-mint
 * Bearer). Domain allowlists stay per-call — `PROVIDER_MEDIA_DOMAINS` feeds
 * the downloader's `extraAllowedDomains` seam, never the global list.
 *
 * Every failure is non-fatal by contract: callers keep the `[type]`
 * placeholder and the turn still reaches the dispatcher.
 */

const MAX_MEDIA_REFS = 4;

const PROVIDER_MEDIA_DOMAINS: Record<ProviderId, readonly string[]> = {
  // ycloud media is covered by the downloader's global allowlist.
  ycloud: [],
  kapso: KAPSO_MEDIA_DOMAINS,
  zernio: ZERNIO_MEDIA_DOMAINS,
};

export interface InboundMediaItem {
  /** Session-gated `/api/media/<scope>/<file>` URL. */
  url: string;
  /** Storage-relative object identity (`<scope>/<file>`). */
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Container kind detected from magic bytes. */
  mediaKind: MediaKind | null;
  /** Vision classification for images (e.g. "artwork"); "pending" while the race is open. */
  documentType?: string;
  /** Transcription / vision / extraction text for provenance. */
  description?: string;
  /** Binds the deferred vision description to the created attachment row. */
  bindAttachmentId?: (attachmentId: string) => void;
}

export interface ProcessedInboundMedia {
  /** Agent-facing content (media analysis + caption). Undefined → caller placeholder. */
  content?: string;
  items: InboundMediaItem[];
}

/**
 * Auth headers for the resolved download URL, scoped per provider and per
 * host: credentials are sent only to the provider's own endpoints — Meta CDN
 * links arrive pre-signed and get no auth header.
 */
function mediaAuthHeaders(
  provider: ProviderId,
  url: string,
  apiKey: string
): Record<string, string> {
  if (!apiKey) return {};
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return {};
  }
  switch (provider) {
    case "ycloud":
      return host.endsWith("ycloud.com") ? { "X-API-Key": apiKey } : {};
    case "kapso":
      return host === "api.kapso.ai" ? { "X-API-Key": apiKey } : {};
    case "zernio":
      return host.endsWith("zernio.com")
        ? { Authorization: `Bearer ${apiKey}` }
        : {};
  }
}

/**
 * Media fetch key: the resolved account's credential, else the provider env
 * scope (same `<PROVIDER>_API_KEY` convention as accounts.ts) — the legacy
 * env-materialized placeholder carries no key and must still resolve media.
 * Never logged.
 */
function mediaApiKey(
  account: ChannelAccount | undefined,
  provider: ProviderId
): string {
  return (
    account?.credentials.apiKey ||
    process.env[`${provider.toUpperCase()}_API_KEY`] ||
    ""
  );
}

/**
 * The account `resolveMedia` runs against. When the pipeline resolved no
 * account (legacy installs), a synthetic one is built — adapters only read
 * `credentials.apiKey` + `providerAccountId` for media.
 */
function effectiveMediaAccount(
  event: NormalizedInboundEvent,
  channel: ChannelKind,
  account: ChannelAccount | undefined,
  apiKey: string
): ChannelAccount {
  return {
    id: account?.id ?? `${channel}:media`,
    tenantId: account?.tenantId ?? "default",
    provider: event.provider,
    channel,
    providerAccountId:
      account?.providerAccountId ?? event.providerAccountId ?? "",
    senderAddress: account?.senderAddress ?? "",
    credentials: {
      apiKey,
      webhookSecret: account?.credentials.webhookSecret ?? "",
    },
    status: "active",
  };
}

/**
 * Downloads each media ref and derives the agent-facing text per detected
 * container kind. Per-ref failures degrade to the `[type]` placeholder
 * (omitted when a caption already carries the message); a fully failed
 * event returns `content: undefined` so the caller uses its own placeholder.
 */
export async function processInboundMedia(
  event: NormalizedInboundEvent,
  ctx: {
    channel: ChannelKind;
    account?: ChannelAccount;
    /** Opaque dir scope for the private uploads tree (conversation thread id). */
    scope: string;
  }
): Promise<ProcessedInboundMedia | undefined> {
  const refs = event.mediaRefs;
  if (!refs?.length) return undefined;

  const provider = getProvider(event.provider);
  const apiKey = mediaApiKey(ctx.account, event.provider);
  const account = effectiveMediaAccount(event, ctx.channel, ctx.account, apiKey);
  const extraDomains = PROVIDER_MEDIA_DOMAINS[event.provider] ?? [];
  const caption = event.text?.trim() || undefined;

  const pieces: string[] = [];
  const items: InboundMediaItem[] = [];

  for (const ref of refs.slice(0, MAX_MEDIA_REFS)) {
    try {
      let url = ref.url;
      let mimeType = ref.mimeType;
      let fileName = ref.filename;

      if (provider.resolveMedia && (ref.id || ref.refreshUrl || ref.url)) {
        const resolved = await provider.resolveMedia(account, ref);
        url = resolved.url;
        mimeType = resolved.mimeType ?? mimeType;
        fileName = resolved.filename ?? fileName;
      }
      if (!url) continue;

      // The declared mime is only trusted when it maps to a known container
      // kind — the magic-byte check is the real validator downstream.
      const declared = mimeType && mimeKind(mimeType) ? mimeType : undefined;
      const buffer = await downloadMedia(
        url,
        mediaAuthHeaders(event.provider, url, apiKey),
        extraDomains,
        declared
      );

      const sniff = sniffMediaMime(buffer);
      const effectiveMime =
        declared ?? sniff?.mime ?? "application/octet-stream";
      const name =
        fileName ??
        `media-${event.deliveryId.slice(0, 12)}-${items.length + 1}`;
      const mediaUrl = await saveMediaLocally(
        buffer,
        ctx.scope,
        name,
        effectiveMime === "application/octet-stream" ? undefined : effectiveMime
      );

      const item: InboundMediaItem = {
        url: mediaUrl,
        storageKey: mediaUrl.startsWith(PRIVATE_MEDIA_URL_PREFIX)
          ? mediaUrl.slice(PRIVATE_MEDIA_URL_PREFIX.length)
          : mediaUrl,
        fileName: name,
        mimeType: effectiveMime,
        sizeBytes: buffer.length,
        mediaKind: sniff?.kind ?? mimeKind(effectiveMime),
      };

      pieces.push(await analyzeMedia(item, buffer, sniff?.kind ?? null, caption));
      items.push(item);
    } catch (error) {
      console.warn(
        `[media] ${event.provider} media fetch failed for ${event.deliveryId} — keeping placeholder`,
        error instanceof Error ? error.message : error
      );
      if (!caption) pieces.push(`[${event.type ?? "media"}]`);
    }
  }

  // Video analysis already embeds the caption in its agentText.
  if (caption && event.type !== "video") pieces.push(caption);
  return { content: pieces.join("\n").trim() || undefined, items };
}

/**
 * Derives the agent-facing text for one downloaded file by detected kind and
 * enriches the item with its analysis output. Image analysis uses the vision
 * race; a deferred resolution lands on the attachment row via
 * `bindAttachmentId`.
 */
async function analyzeMedia(
  item: InboundMediaItem,
  buffer: Buffer,
  kind: MediaKind | null,
  caption: string | undefined
): Promise<string> {
  switch (kind) {
    case "image": {
      const deferred: { attachmentId?: string } = {};
      const result = await processImage(buffer, item.mimeType, {
        context: caption ? `El cliente escribió: ${caption}` : undefined,
        persist: async ({ description, documentType }) => {
          item.description = description;
          item.documentType = documentType;
          if (deferred.attachmentId) {
            await db
              .update(attachments)
              .set({
                notes: description,
                ...(documentType === "artwork"
                  ? { kind: "diseno_pedido" as const }
                  : {}),
              })
              .where(eq(attachments.id, deferred.attachmentId));
          }
        },
      });
      item.documentType = result.documentType;
      item.description = result.description;
      item.bindAttachmentId = (attachmentId) => {
        deferred.attachmentId = attachmentId;
        result.backgroundPersist?.();
      };
      return result.agentText;
    }
    case "audio": {
      const transcription = await transcribeAudio(
        buffer,
        item.fileName,
        item.mimeType
      );
      if (transcription) {
        item.description = transcription;
        return `[Audio]: ${transcription}`;
      }
      return "[Audio sin transcripción]";
    }
    case "video": {
      const { agentText, transcription } = await analyzeVideo(
        buffer,
        item.fileName,
        item.mimeType,
        caption
      );
      if (transcription) item.description = transcription;
      return agentText;
    }
    case "pdf":
    case "doc":
    case "text": {
      const text = await extractDocumentText(buffer, item.fileName, item.mimeType);
      if (text) {
        item.description = text;
        return (
          `El cliente envió un documento "${item.fileName}". ` +
          `Contenido extraído:\n\n${text}`
        );
      }
      return `El cliente envió un documento: ${item.fileName}`;
    }
    default:
      return `[${kind ?? "media"}]`;
  }
}

/**
 * The attachment kind for a saved file — the enum is order-domain, so only
 * document-shaped media maps honestly: artwork-classified images get
 * `diseno_pedido`, everything else document-shaped gets
 * `documento_operativo`. Audio/video stay file-only (no honest kind).
 */
function attachmentKindFor(
  item: InboundMediaItem
): "diseno_pedido" | "documento_operativo" | undefined {
  if (item.mediaKind === "image") {
    return item.documentType === "artwork"
      ? "diseno_pedido"
      : "documento_operativo";
  }
  if (item.mediaKind === "pdf" || item.mediaKind === "doc" || item.mediaKind === "text") {
    return "documento_operativo";
  }
  return undefined;
}

/**
 * Persists downloaded media as `attachments` rows when the conversation
 * resolves to an organization (directly or through its linked contact — the
 * org library is the linkable surface; attachments carry no conversation or
 * message FK). Customer-sent media enters as `cliente`/`pendiente_revision`.
 * Returns the number of rows created. Never throws — callers treat it as
 * best-effort.
 */
export async function persistInboundMediaAttachments(input: {
  conversationId: string;
  items: InboundMediaItem[];
  /** Provenance stamped on the row, e.g. `<provider>:<deliveryId>`. */
  source: string;
}): Promise<number> {
  try {
    const { conversationId, items, source } = input;
    const attachable = items.filter((item) => attachmentKindFor(item));
    if (attachable.length === 0) return 0;

    const [conversation] = await db
      .select({
        customerId: conversations.customerId,
        organizationId: conversations.organizationId,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conversation) return 0;

    let organizationId = conversation.organizationId ?? null;
    if (!organizationId && conversation.customerId) {
      const [contact] = await db
        .select({ organizationId: contacts.organizationId })
        .from(contacts)
        .where(eq(contacts.id, conversation.customerId))
        .limit(1);
      organizationId = contact?.organizationId ?? null;
    }
    if (!organizationId) return 0;

    let count = 0;
    for (const item of attachable) {
      const kind = attachmentKindFor(item)!;
      const notes =
        item.description && item.documentType !== "pending"
          ? `inbound ${source}\n${item.description}`
          : `inbound ${source}`;
      const [row] = await db
        .insert(attachments)
        .values({
          organizationId,
          kind,
          name: item.fileName.slice(0, 255),
          originalName: item.fileName.slice(0, 255),
          mimeType: item.mimeType.slice(0, 128),
          sizeBytes: item.sizeBytes,
          url: item.url,
          storageKey: item.storageKey.slice(0, 512),
          status: "pendiente_revision",
          uploadedByRole: "cliente",
          notes,
        })
        .returning({ id: attachments.id });
      if (row) {
        count++;
        item.bindAttachmentId?.(row.id);
      }
    }
    return count;
  } catch (error) {
    console.error("[media] attachment persistence failed:", error);
    return 0;
  }
}
