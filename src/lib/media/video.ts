import { transcribeAudio } from "./transcription";

/**
 * Analyzes a video by sending it straight to the transcription endpoint —
 * Whisper-compatible APIs accept video/mp4 and extract the audio track
 * themselves.
 */
export async function analyzeVideo(
  videoBuffer: Buffer,
  filename: string,
  mimeType?: string,
  caption?: string
): Promise<{ transcription: string | null; agentText: string }> {
  const transcription = await transcribeAudio(videoBuffer, filename, mimeType);

  const desc = caption ? ` (caption: "${caption}")` : "";

  const agentText = transcription
    ? `[Video${desc}]: ${transcription}`
    : `[Video${desc}]: el cliente envió un video${caption ? `: ${caption}` : ""}`;

  return { transcription, agentText };
}
