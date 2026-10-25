"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  GarmentConfigurator,
  type ConfiguratorFabric,
  type ConfiguratorProduct,
  type ConfiguratorState,
  type UploadedAsset,
} from "@/configurator";
import type { GarmentConfigInput } from "@/configurator/model";
import {
  bindDraftUploadSession,
  ensureConfiguratorDraft,
  saveConfiguratorItem,
  updateConfiguratorDraftPayload,
} from "@/app/actions/configurator";

const HOME_STORAGE_KEY = "cfg_upload_home";

/**
 * Home configurator — the shared GarmentConfigurator in `home` mode plus the
 * conversion CTA. Designing costs nothing; "Cotizar este diseño" materializes
 * the draft (or reuses the live one) and hands off to the wizard with `?d=`.
 */
export function HomeConfigurator({
  products,
  fabrics,
  draftToken,
  initialProductId,
  initialConfig,
  initialAssets,
}: {
  products: readonly ConfiguratorProduct[];
  fabrics: readonly ConfiguratorFabric[];
  /** Live draft resumed from `?d=` — null starts fresh at CTA time. */
  draftToken: string | null;
  initialProductId?: string | null;
  initialConfig?: GarmentConfigInput | null;
  initialAssets?: readonly UploadedAsset[];
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = useRef<ConfiguratorState | null>(null);
  const sessionId = useRef<string | null>(null);

  const onStateChange = useCallback((state: ConfiguratorState) => {
    latest.current = state;
  }, []);

  const onUploadSession = useCallback(
    (id: string) => {
      sessionId.current = id;
      // A resumed draft binds the session immediately so a reload keeps files.
      if (draftToken) void bindDraftUploadSession(draftToken, id);
    },
    [draftToken],
  );

  async function startQuote() {
    if (starting) return;
    setStarting(true);
    setError(null);

    // Reuse the live draft when the URL carried one; otherwise open a fresh
    // one seeded with the product pick and the upload session (if any).
    let token = draftToken;
    if (!token) {
      const res = await ensureConfiguratorDraft({
        productId: latest.current?.productId ?? initialProductId ?? products[0]?.id ?? undefined,
        uploadSessionId: sessionId.current ?? undefined,
        step: 1,
      });
      if (!res.ok) {
        setError(res.error);
        setStarting(false);
        return;
      }
      token = res.token;
    } else if (sessionId.current) {
      await bindDraftUploadSession(token, sessionId.current);
    }

    const state = latest.current;
    const productId = state?.productId ?? initialProductId ?? products[0]?.id;
    if (productId) {
      // Persist even untouched: what the user saw on screen is the design.
      const saved = await saveConfiguratorItem(
        token,
        { productId, config: state?.config ?? initialConfig ?? {} },
        "home",
      );
      if (!saved.ok) {
        setError(saved.error);
        setStarting(false);
        return;
      }
      // Keep the flow's product pick aligned with the designed garment so
      // step 2 preselects what the user actually configured.
      await updateConfiguratorDraftPayload(token, { productId });
    }
    router.push(`/presupuesto/1?d=${encodeURIComponent(token)}`);
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <GarmentConfigurator
        mode="home"
        products={products}
        fabrics={fabrics}
        initialProductId={initialProductId}
        initialConfig={initialConfig}
        initialAssets={initialAssets}
        onStateChange={onStateChange}
        onUploadSession={onUploadSession}
        storageKey={HOME_STORAGE_KEY}
        showAttachments
        showExport
      />
      {error && (
        <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      )}
      <div className="flex justify-center">
        <Button
          type="button"
          size="lg"
          onClick={startQuote}
          disabled={starting}
          className="animate-pulse-cta border-accent bg-accent px-8 text-on-accent hover:border-accent-strong hover:bg-accent-strong hover:text-on-accent"
        >
          {starting ? "Preparando…" : "Cotizar este diseño"}
          <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
