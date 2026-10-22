/**
 * Order-status semantics for the customer-facing WhatsApp agent.
 *
 * Port of SocialCRM `src/lib/whatsapp/status-utils.ts`, adapted to the AH
 * Sports `orderStatus` machine (docs/04-BUSINESS-RULES.md). These helpers
 * never invent business facts — they translate a stored status into honest
 * es-AR wording the model may use verbatim.
 */

export type OrderStatusSemantic = {
  /** Canonical label shown to customers. */
  label: string;
  /** One-line plain-language explanation of what the status means. */
  description: string;
  /** Whether the order is still commercially/operationally open. */
  open: boolean;
  /** Whether the order reached a terminal state. */
  terminal: boolean;
};

const SEMANTICS: Record<string, OrderStatusSemantic> = {
  borrador: {
    label: "borrador",
    description:
      "el pedido está cargado como borrador — todavía no es un presupuesto formal ni está en producción",
    open: true,
    terminal: false,
  },
  presupuesto_enviado: {
    label: "presupuesto enviado",
    description:
      "ya les enviamos el presupuesto — falta que lo aprueben para avanzar",
    open: true,
    terminal: false,
  },
  aprobado: {
    label: "aprobado",
    description:
      "el pedido está aprobado — falta registrar la seña para entrar a producción",
    open: true,
    terminal: false,
  },
  seniado: {
    label: "señado",
    description: "la seña ya está registrada — el pedido queda habilitado para producción",
    open: true,
    terminal: false,
  },
  en_produccion: {
    label: "en producción",
    description: "el pedido ya entró a producción",
    open: true,
    terminal: false,
  },
  corte: {
    label: "en corte",
    description: "las prendas están en la etapa de corte",
    open: true,
    terminal: false,
  },
  confeccion: {
    label: "en confección",
    description: "las prendas están en la etapa de confección",
    open: true,
    terminal: false,
  },
  estampado: {
    label: "en estampado/personalización",
    description: "las prendas están en la etapa de estampado o personalización",
    open: true,
    terminal: false,
  },
  control: {
    label: "en control de calidad",
    description: "el pedido está en control de calidad — falta poco para la entrega",
    open: true,
    terminal: false,
  },
  entregado: {
    label: "entregado",
    description: "el pedido ya fue entregado",
    open: false,
    terminal: true,
  },
  cancelado: {
    label: "cancelado",
    description: "el pedido fue cancelado",
    open: false,
    terminal: true,
  },
  bloqueado_pago: {
    label: "bloqueado por pago",
    description:
      "el pedido está frenado porque falta cubrir la seña o el saldo mínimo requerido",
    open: true,
    terminal: false,
  },
};

export function getStatusSemantic(status: string | null | undefined): OrderStatusSemantic {
  const key = (status ?? "").trim().toLowerCase();
  return (
    SEMANTICS[key] ?? {
      label: key || "desconocido",
      description: `el estado registrado es "${key || "desconocido"}" — si no queda claro, derivá a una persona`,
      open: false,
      terminal: false,
    }
  );
}

export function isActiveStatus(status: string | null | undefined): boolean {
  return getStatusSemantic(status).open && !getStatusSemantic(status).terminal;
}

export function isTerminalStatus(status: string | null | undefined): boolean {
  return getStatusSemantic(status).terminal;
}
