/**
 * Anti-loop detection for the customer WhatsApp agent.
 *
 * Port of SocialCRM `src/lib/whatsapp/anti-loop.ts`, adapted to the AH
 * Sports textile domain (garment/order vocabulary instead of food) and to
 * the session `metadata` sub-map in `agent_session_states.state` (AH
 * `conversations` has no metadata column). Counters persist via the
 * whole-blob CAS in `session-metadata.ts`, so concurrent writers never
 * silently lose fields.
 */
import { updateSessionMetadataCAS } from "./session-metadata";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MessageType = "order" | "greeting" | "menu" | "info" | "complaint" | "non_commercial" | "other";

export type ConversationMetadata = {
  repromptCount: number;
  lastUserMessageType: MessageType;
  lastSuggestedProducts: string[];
  lastTools: string[];
  /** Names of the tool ids executed on the previous turn (audit aid). */
  // Opaque fields written by other subsystems are preserved verbatim.
  [extra: string]: unknown;
};

// ─── Analyze message type ───────────────────────────────────────────────────

export function classifyMessageType(text: string): MessageType {
  const lower = text.toLowerCase();

  // Order/purchase intent — textile vocabulary.
  const orderKeywords = [
    "quiero", "dame", "pedir", "llevo", "compra", "necesito", "encargo", "encargar",
    "remera", "camiseta", "chomba", "campera", "pantalon", "pantalón", "short",
    "bermuda", "buzo", "conjunto", "prenda", "uniforme", "egresado",
    "agreg", "otro", "ponele", "mandale", "haceme", "armame", "armá",
    "presupuesto", "cotiza", "pedido",
  ];
  if (orderKeywords.some((k) => lower.includes(k))) return "order";

  // Catalog questions.
  const menuKeywords = [
    "menú", "menu", "catálogo", "catalogo", "carta", "productos", "tienen",
    "venden", "qué hay", "que hay", "lista", "modelos", "prendas",
  ];
  if (menuKeywords.some((k) => lower.includes(k))) return "menu";

  // Information (BEFORE greeting — a greeting plus a price question is "info").
  const infoKeywords = [
    "precio", "precios", "cuesta", "vale", "cuánto", "cuanto", "horario",
    "ubica", "dirección", "direccion", "donde", "dónde", "envío", "envio",
    "entrega", "plazo", "seña", "sena", "señar", "talles", "talle", "medidas",
    "demora", "mínimo", "minimo",
  ];
  if (infoKeywords.some((k) => lower.includes(k))) return "info";

  // Complaints.
  const complaintKeywords = ["queja", "reclamo", "pésimo", "pesimo", "error", "falta", "problema", "demor", "tard"];
  if (complaintKeywords.some((k) => lower.includes(k))) return "complaint";

  // Greetings (after info so "Hola, pasame precios" stays "info").
  const greetingKeywords = ["hola", "buenas", "buen día", "buenas tardes", "buenas noches", "qué tal", "que tal", "como estas", "cómo estás", "buen dia"];
  if (greetingKeywords.some((k) => lower.includes(k))) return "greeting";

  // Non-commercial: casual talk, thanks, plain affirmations.
  const nonCommercialKeywords = [
    "cumpa", "vro", "todo bien?", "todo bien",
    "que onda", "que ondaa", "ke onda", "ké onda",
    "amigo", "como andas", "cómo andas", "todo tranqui",
    "en la lucha", "de una de una",
    "gracias", "graciass", "muchas gracias", "mil gracias",
    "ok", "okay", "okei",
    "obvio", "claro", "seguro",
    "naa", "nah",
  ];
  if (nonCommercialKeywords.some((k) => lower.includes(k))) return "non_commercial";

  // Emoji-only message (no text).
  const emojiOnlyRegex = /^[\p{Emoji}\s]+$/u;
  if (lower.replace(/\s/g, "").length < 3 && emojiOnlyRegex.test(text.trim())) return "non_commercial";

  return "other";
}

// ─── Analyze conversation state ─────────────────────────────────────────────

export async function analyzeConversationState(
  conversationId: string,
  lastUserMessage: string,
  lastToolCalls: string[],
): Promise<{
  isLooping: boolean;
  repromptCount: number;
  directive: string;
  metadata: ConversationMetadata;
}> {
  const messageType = classifyMessageType(lastUserMessage);

  // Persist counters through the session-metadata CAS — the merge re-applies
  // on top of the freshest state on conflict, so a concurrent lifecycle/tool
  // write is never silently lost.
  let effectiveMeta: ConversationMetadata = {
    repromptCount: 0,
    lastUserMessageType: messageType,
    lastSuggestedProducts: [],
    lastTools: lastToolCalls,
  };
  try {
    await updateSessionMetadataCAS(conversationId, (current) => {
      const cur = current as Partial<ConversationMetadata>;
      const reprompt = messageType === cur.lastUserMessageType;
      const repromptCount = reprompt
        ? (typeof cur.repromptCount === "number" ? cur.repromptCount : 0) + 1
        : 0;
      effectiveMeta = {
        ...cur,
        repromptCount,
        lastUserMessageType: messageType,
        lastSuggestedProducts: Array.isArray(cur.lastSuggestedProducts) ? cur.lastSuggestedProducts : [],
        lastTools: lastToolCalls,
      } as ConversationMetadata;
      return effectiveMeta;
    });
  } catch {
    // non-fatal — the directive still reflects this turn's classification.
  }

  const isLooping = effectiveMeta.repromptCount >= 2;
  let directive: string;

  if (isLooping) {
    directive = `⚠️ DETECTÉ QUE ESTAMOS EN UN CICLO. Ya preguntaste/viste esto antes.
ACCIÓN REQUERIDA:
1. NO preguntes lo mismo de nuevo.
2. Si el cliente quiere cotizar o armar un pedido → ejecutá la acción (quoteGarment / draftQuote / draftOrder).
3. Si el cliente está pidiendo información que ya diste → dala de nuevo sin vueltas.
4. Si no sabés qué hacer → "¿Qué más necesitás?" y escuchá.
5. BAJO NINGÚN CONCEPTO sigas preguntando lo mismo.`;
  } else if (effectiveMeta.repromptCount === 1) {
    directive = `⚠️ CUIDADO: El cliente está repitiendo el tipo de mensaje anterior ("${messageType}").
Probablemente no entendió tu respuesta anterior o quiere avanzar.
Intentá ser más directo: si quiere cotizar o pedir → ejecutalo. Si es una pregunta → respondela sin preguntar de nuevo.`;
  } else {
    directive = "";
  }

  return { isLooping, repromptCount: effectiveMeta.repromptCount, directive, metadata: effectiveMeta };
}
