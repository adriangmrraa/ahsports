import "server-only";

import type { AuthorizedOperator } from "@/lib/agent/identity";

/**
 * Safe command handling for the Telegram internal operator agent.
 *
 * P1 has no AI runtime (P2) and no write tools (P3): it answers a deterministic,
 * non-mutating command set only. Unknown input returns help. `context.text` is
 * untrusted and treated as data, never interpolated into SQL or shell.
 */

const HELP_TEXT = [
  "Comandos disponibles:",
  "/start — iniciar y verificar identidad",
  "/help — mostrar esta ayuda",
  "/whoami — ver la identidad autorizada",
  "/status — estado del agente operativo",
].join("\n");

export type CommandContext = {
  text: string;
  identity: AuthorizedOperator;
};

export function handleOperatorCommand({ text, identity }: CommandContext): string {
  const command = text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

  switch (command) {
    case "/start":
      return `Operador autorizado: ${identity.name} (${identity.role}).\n${HELP_TEXT}`;
    case "/help":
      return HELP_TEXT;
    case "/whoami":
      return `Identidad autorizada: ${identity.name} — rol ${identity.role}.`;
    case "/status":
      return "Agente operativo activo. Persistencia de conversaciones operativa.";
    default:
      return `Comando no reconocido.\n${HELP_TEXT}`;
  }
}
