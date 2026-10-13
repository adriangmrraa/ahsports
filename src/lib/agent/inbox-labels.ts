/** Presentation labels for the agent inbox list + timeline. */

export const CHANNEL_LABEL: Record<string, string> = { telegram: "Telegram", whatsapp: "WhatsApp" };

export const DIRECTION_LABEL: Record<string, string> = { inbound: "Entrante", outbound: "Saliente" };

export const SENDER_LABEL: Record<string, string> = {
  customer: "Cliente",
  agent: "Agente IA",
  operator: "Operador",
};

export const DELIVERY_LABEL: Record<string, string> = {
  received: "Recibido",
  queued: "En cola",
  sent: "Enviado",
  failed: "Falló",
  imported: "Importado",
};

export const CONTENT_LABEL: Record<string, string> = {
  text: "Texto",
  image: "Imagen",
  document: "Documento",
  system: "Sistema",
};

export type DeliveryTone = "error" | "success" | "warning" | "muted";

export function deliveryTone(state: string): DeliveryTone {
  if (state === "failed") return "error";
  if (state === "sent") return "success";
  if (state === "queued") return "warning";
  return "muted";
}
