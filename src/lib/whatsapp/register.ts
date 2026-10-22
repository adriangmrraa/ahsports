/**
 * Dispatcher registration for the customer WhatsApp sales agent.
 *
 * Importing this module installs `whatsappSalesDispatcher` on the wave-1
 * inbound pipeline — the ONLY supported wiring point (`setInboundTurnDispatcher`
 * replaces the module-level `turnDispatcher` the buffer calls after debounce).
 *
 * Owned-path caveat: `src/app/api/whatsapp/webhook/[token]/route.ts` imports
 * this module, so the Meta-shaped webhook path always runs the sales agent.
 * For the unified ingress route (`/api/webhooks/ingress/[provider]`) to run
 * it too, that route — wave-1 owned — needs a one-line `import "@/lib/whatsapp/register"`;
 * until then it keeps the default canonical dispatcher.
 */
import { setInboundTurnDispatcher } from "@/lib/messaging/inbound-pipeline";
import { whatsappSalesDispatcher } from "./sales-agent";

let registered = false;

/** Idempotent — safe to import from several entry points. */
export function registerWhatsAppSalesDispatcher(): void {
  if (registered) return;
  registered = true;
  setInboundTurnDispatcher(whatsappSalesDispatcher);
}

registerWhatsAppSalesDispatcher();
