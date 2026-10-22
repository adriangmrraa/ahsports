import { resolveAgentRuntime } from "@/lib/ai/config";

/**
 * Image analysis for inbound media, on top of the provider-neutral agent
 * runtime (src/lib/ai/). The resolved endpoint, key and model come from
 * `agent_config` + env — same source as the agent loop. AH Sports has no
 * per-image description columns, so persistence is a caller-injected seam
 * (`persist`) instead of direct DB writes.
 */

const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const VISION_TIMEOUT_MS = 30_000;
const RACE_TIMEOUT_MS = 15_000;

const FALLBACK_DESCRIPTION = "[Imagen sin descripción]";
const PROCESSING_PLACEHOLDER = "[Imagen enviada, procesando...]";

function buildVisionPrompt(): string {
  return `Sos un asistente de AH Sports, una fábrica de indumentaria deportiva y personalizada, que analiza imágenes enviadas por clientes.

Describí brevemente qué ves en la imagen en 1-2 oraciones. Sé conciso y directo.

Clasificá la imagen en una de estas categorías:
- COMPROBANTE: si es una captura de transferencia bancaria, recibo de pago, comprobante de Mercado Pago, o cualquier prueba de pago
- DISENO: si es un logo, escudo, arte o diseño que el cliente quiere estampar o personalizar
- PRENDA: si es una foto de indumentaria, ropa deportiva o una prenda a producir
- DOCUMENTO: si es una factura, presupuesto, lista, documento formal
- SELFIE: si es una selfie o foto de persona
- LOCAL: si es una foto de un local, club, equipo o espacio
- OTRO: cualquier otra cosa

Respondé SOLO con este formato exacto (sin markdown):
CATEGORIA: [categoría]
DESCRIPCION: [descripción breve]`;
}

// ─── Core: analyzeImage ──────────────────────────────────────────────────────

export async function analyzeImage(
  buffer: Buffer,
  mimeType: string,
  context?: string
): Promise<string> {
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return FALLBACK_DESCRIPTION;
  }

  try {
    const resolution = await resolveAgentRuntime();
    if (!resolution.configured) {
      console.warn("[vision] AI runtime not configured, skipping.");
      return FALLBACK_DESCRIPTION;
    }
    const { endpointUrl, apiKey } = resolution.runtime;
    const model = process.env.AGENT_AI_VISION_MODEL?.trim() || resolution.runtime.model;

    const base64 = buffer.toString("base64");
    const dataUri = `data:${mimeType};base64,${base64}`;

    const userPrompt = context
      ? `Contexto adicional: ${context}\n\nAnalizá esta imagen.`
      : "Analizá esta imagen.";

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildVisionPrompt() },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: { url: dataUri, detail: "low" },
              },
            ],
          },
        ],
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("[vision] AI API error:", response.status);
      return FALLBACK_DESCRIPTION;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content?.trim() || FALLBACK_DESCRIPTION;
  } catch (error) {
    console.error("[vision] Error:", error);
    return FALLBACK_DESCRIPTION;
  }
}

// ─── Race helper: vision con timeout ─────────────────────────────────────────

export interface VisionRaceResult {
  resolved: boolean;
  description: string;
  pendingPromise?: Promise<string>;
}

export async function raceVision(
  buffer: Buffer,
  mimeType: string,
  context?: string
): Promise<VisionRaceResult> {
  const visionPromise = analyzeImage(buffer, mimeType, context);

  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), RACE_TIMEOUT_MS)
  );

  const result = await Promise.race([visionPromise, timeoutPromise]);

  if (result !== null) {
    return { resolved: true, description: result };
  }

  // Timeout — vision still running in background
  return {
    resolved: false,
    description: PROCESSING_PLACEHOLDER,
    pendingPromise: visionPromise,
  };
}

// ─── Shared helper: processImage ─────────────────────────────────────────────

export interface ProcessImageResult {
  agentText: string;
  description: string;
  documentType: string;
  /** Fires the deferred persist when vision resolved past the race window. */
  backgroundPersist?: () => void;
}

export type ProcessImagePersist = (result: {
  description: string;
  documentType: string;
}) => Promise<void>;

/**
 * AH adaptation: persistence is caller-injected. Channel pipelines (wave-2
 * whatsapp/telegram worktrees) pass `persist` to store the description
 * wherever their schema keeps it — this module never touches the DB.
 */
export async function processImage(
  buffer: Buffer,
  mimeType: string,
  options?: {
    context?: string;
    persist?: ProcessImagePersist;
  }
): Promise<ProcessImageResult> {
  const race = await raceVision(buffer, mimeType, options?.context);

  const documentType = parseDocumentType(race.description);

  if (race.resolved) {
    if (options?.persist) {
      options
        .persist({ description: race.description, documentType })
        .catch((err) => console.error("[vision] persist error:", err));
    }

    return {
      agentText: `[Imagen]: ${formatForAgent(race.description)}`,
      description: race.description,
      documentType,
    };
  }

  const backgroundPersist = () => {
    if (!race.pendingPromise || !options?.persist) return;
    race.pendingPromise.then((desc) => {
      const docType = parseDocumentType(desc);
      options.persist!({ description: desc, documentType: docType }).catch(
        (err) => console.error("[vision] async persist error:", err)
      );
    });
  };

  return {
    agentText: PROCESSING_PLACEHOLDER,
    description: PROCESSING_PLACEHOLDER,
    documentType: "pending",
    backgroundPersist,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

export function parseDocumentType(description: string): string {
  const match = description.match(/CATEGORIA:\s*(\w+)/i);
  if (!match) return "image";

  const category = match[1].toUpperCase();
  switch (category) {
    case "COMPROBANTE":
      return "payment_receipt";
    case "DISENO":
      return "artwork";
    case "PRENDA":
      return "garment_photo";
    case "DOCUMENTO":
      return "document";
    case "SELFIE":
      return "selfie";
    case "LOCAL":
      return "location_photo";
    default:
      return "image";
  }
}

export function formatForAgent(description: string): string {
  // Include CATEGORIA in agent-facing text for classification context
  const catMatch = description.match(/CATEGORIA:\s*(\w+)/i);
  const descMatch = description.match(/DESCRIPCION:\s*(.+)/i);

  const category = catMatch ? catMatch[1].toUpperCase() : null;
  const desc = descMatch ? descMatch[1].trim() : description;

  return category ? `[${category}] ${desc}` : desc;
}
