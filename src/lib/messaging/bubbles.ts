/**
 * Outbound bubble splitting + own-echo detection.
 *
 * Port of the pure helpers in SocialCRM `src/lib/buffer/response-sender.ts`
 * (`splitIntoBubbles`, `matchesAssistantBubble`). The bubble sender stays out
 * of this port: the AH dispatcher sends a single `messenger.send`, matching
 * AH's existing WhatsApp reply convention.
 *
 * Own-echo recognition (A-04): a provider echoes outbound sends back through
 * the webhook. A reply longer than MAX_BUBBLE_CHARS would be sent as N bubbles,
 * each with its own providerMessageId but only one persisted id — so echo
 * detection must also match by CONTENT: true when `displayText` equals the
 * whole stored message or any single bubble it was split into.
 */

const MAX_BUBBLE_CHARS = 250;

/**
 * Split text into natural WhatsApp-style bubbles.
 * Rules:
 * 1. Split by double newlines (paragraphs) first
 * 2. Lists (lines starting with - or •) get grouped together as one bubble
 * 3. Long paragraphs split by sentences
 * 4. Each bubble ≤ MAX_BUBBLE_CHARS
 * 5. Strip markdown formatting (bold **text**, backticks, etc.) for natural feel
 */
export function splitIntoBubbles(text: string): string[] {
  // Clean up markdown artifacts + internal markers for WhatsApp
  const cleaned = text
    .replace(/\[INTERNAL_[^\]]*\]/g, "")  // [INTERNAL_*] markers
    .replace(/\*\*([^*]*)\*\*/g, "$1")   // **bold** → bold (allow empty)
    .replace(/\*([^*]+)\*/g, "$1")       // *italic* → italic
    .replace(/`([^`]+)`/g, "$1")         // `code` → code
    .replace(/^#+\s*/gm, "")             // # headers → remove
    .replace(/^[-*]\s+/gm, "- ")         // normalize bullet points
    .replace(/---+/g, "")                // --- dividers
    .replace(/👇/g, "")                  // remove pointer emojis
    .replace(/\n{3,}/g, "\n\n")          // collapse 3+ newlines
    .trim();

  const paragraphs = cleaned.split(/\n\n+/).filter((p) => p.trim());

  // Single short paragraph → one bubble directly
  if (paragraphs.length <= 1 && cleaned.length <= MAX_BUBBLE_CHARS) return [cleaned];

  const bubbles: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (trimmed.length <= MAX_BUBBLE_CHARS) {
      bubbles.push(trimmed);
      continue;
    }

    // Split long paragraph by sentences
    const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
    let current = "";

    for (const sentence of sentences) {
      if (current.length + sentence.length + 1 > MAX_BUBBLE_CHARS) {
        if (current) bubbles.push(current.trim());
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
    if (current) bubbles.push(current.trim());
  }

  // Filter empty bubbles
  const result = bubbles.filter((b) => b.trim().length > 0);
  return result.length > 0 ? result : [cleaned.slice(0, MAX_BUBBLE_CHARS)];
}

/**
 * A-04 — own-echo recognition for multi-bubble replies.
 *
 * True when `displayText` equals the whole stored message or any single bubble
 * it was split into. The comparison runs the stored content through the same
 * splitter that produced the sends, so markdown stripping and bullet
 * normalization can't cause a false mismatch.
 */
export function matchesAssistantBubble(
  lastContent: string,
  displayText: string
): boolean {
  const fragment = displayText.trim();
  if (!fragment) return false;
  if (lastContent.trim() === fragment) return true;
  return splitIntoBubbles(lastContent).some(
    (bubble) => bubble.trim() === fragment
  );
}
