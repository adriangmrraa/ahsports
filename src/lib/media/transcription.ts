import { resolveAgentRuntime, type ResolvedAgentRuntime } from "@/lib/ai/config";

/**
 * Audio transcription for inbound media, on top of the provider-neutral
 * agent runtime (src/lib/ai/). Credentials and endpoint resolve the same way
 * as the agent loop — no vendor or model is hardcoded beyond the
 * transcription-model default.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — Whisper-compatible endpoint limit

/**
 * Transcription needs a Whisper-compatible endpoint on the configured
 * provider. Resolution order:
 *   1. AGENT_AI_TRANSCRIPTION_ENDPOINT_URL (explicit override)
 *   2. AGENT_AI_BASE_URL + /audio/transcriptions
 *   3. Derivation from the resolved chat endpoint (…/chat/completions →
 *      …/audio/transcriptions)
 * If none applies, callers fall back to asking for text.
 */
export function resolveTranscriptionUrl(runtime: ResolvedAgentRuntime): string | null {
  const explicit = process.env.AGENT_AI_TRANSCRIPTION_ENDPOINT_URL?.trim();
  if (explicit) return explicit;

  const base = process.env.AGENT_AI_BASE_URL?.trim();
  if (base) return `${base.replace(/\/+$/, "")}/audio/transcriptions`;

  const endpoint = runtime.endpointUrl;
  if (/\/chat\/completions\/?$/i.test(endpoint)) {
    return endpoint.replace(/\/chat\/completions\/?$/i, "/audio/transcriptions");
  }
  return null;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<string | null> {
  const resolution = await resolveAgentRuntime();
  if (!resolution.configured) {
    console.warn("[transcription] AI runtime not configured, skipping.");
    return null;
  }
  const transcriptionsUrl = resolveTranscriptionUrl(resolution.runtime);
  if (!transcriptionsUrl) {
    console.warn("[transcription] No transcription endpoint resolvable, skipping.");
    return null;
  }
  const apiKey = resolution.runtime.apiKey;
  const model = process.env.AGENT_AI_TRANSCRIPTION_MODEL?.trim() || "whisper-1";

  if (audioBuffer.length > MAX_FILE_SIZE) {
    console.warn(`[transcription] Audio too large: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB (max 25MB)`);
    return null;
  }

  const MAX_ATTEMPTS = 2;
  const RETRY_DELAY = 2000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const blobType = mimeType || "audio/ogg";
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: blobType });
      formData.append("file", blob, filename || "audio." + (mimeType?.split("/")[1] || "ogg"));
      formData.append("model", model);
      formData.append("language", "es");

      console.log(`[transcription] Sending: ${(audioBuffer.length / 1024).toFixed(0)}KB (attempt ${attempt + 1})`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch(transcriptionsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const result = (await response.json()) as { text?: string };
        if (result.text) {
          console.log(`[transcription] OK (${result.text.length} chars)`);
          return result.text;
        }
      }

      const errorBody = await response.text().catch(() => "no body");
      console.error(
        `[transcription] API error (attempt ${attempt + 1}/${MAX_ATTEMPTS}): status=${response.status}`,
        errorBody.slice(0, 200)
      );

      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAY);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTimeout = msg.includes("abort") || msg.includes("timeout");
      console.error(
        `[transcription] ${isTimeout ? "TIMEOUT" : "Error"} (attempt ${attempt + 1}/${MAX_ATTEMPTS}):`,
        msg
      );

      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAY);
      }
    }
  }

  console.warn(`[transcription] All attempts failed, returning null. fileSize: ${(audioBuffer.length / 1024).toFixed(0)}KB`);
  return null;
}
