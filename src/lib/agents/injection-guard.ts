/**
 * Prompt-injection defense (runtime side).
 *
 * Prompt construction instructs the model to treat message content as data, but
 * defence-in-depth also flags the most common manipulation patterns so the loop
 * can annotate the untrusted block. Detection is advisory only — it never
 * changes control flow and never the model's only line of defense.
 */

export type InjectionSignal = {
  /** Stable, non-secret label for the matched tactic. */
  id: string;
  description: string;
};

const SIGNATURES: Array<{ id: string; description: string; pattern: RegExp }> = [
  { id: "ignore_instructions", description: "Intento de anular instrucciones previas.", pattern: /(ignor(a|á|e|en|es)|olvid(a|á|e)|disregard|ignore)[^\n.]{0,40}(instruc|regla|rule|prompt|orden|indicacion)/i },
  { id: "ignore_english", description: "Intento de anular instrucciones previas.", pattern: /\bignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\b/i },
  { id: "reveal_prompt", description: "Intento de revelar el prompt/instrucciones del sistema.", pattern: /(revel(a|á|e)|mostr(a|á|e)|decime|dime|print|repeat|show)[^\n.]{0,30}(prompt|instruc|sistema|system|regla|configuraci)/i },
  { id: "role_override", description: "Intento de redefinir el rol del asistente.", pattern: /(act(u|ú)a|comportate|behave|pretend|simul(a|á))[^\n.]{0,25}como\b|\byou are now\b|\bact as\b|\bjailbreak\b|\bDAN mode\b/i },
  { id: "confirm_action", description: "Intento de forzar una acción irreversible (confirmar/cobrar/avanzar).", pattern: /(confirm(a|á|e)|aprob(a|á|e)|cobr(a|á|e)|cerr(a|á|e)|finaliz(a|á|e))[^\n.]{0,30}(pedido|orden|pago|sena|seña|presupuesto)/i },
  { id: "authority_claim", description: "Afirmación de autoridad para saltar reglas.", pattern: /(soy|i am)[^\n.]{0,30}(admin|administrador|due(ñ|n)o|gerente|owner|developer)/i },
];

export function detectInjectionAttempt(text: string): InjectionSignal[] {
  const input = text.slice(0, 20000);
  const found: InjectionSignal[] = [];
  for (const signature of SIGNATURES) {
    if (signature.pattern.test(input)) {
      found.push({ id: signature.id, description: signature.description });
    }
  }
  return found;
}
