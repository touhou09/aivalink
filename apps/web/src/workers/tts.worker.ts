// Kokoro TTS Worker for WebGPU-based text-to-speech (English)
// Falls back to Edge TTS via server for other languages

interface TTSMessage {
  type: "init" | "synthesize" | "abort";
  text?: string;
  voice?: string;
  language?: string;
}

interface TTSResponse {
  type: "ready" | "audio" | "error" | "progress" | "fallback";
  audio?: ArrayBuffer;
  error?: string;
  progress?: number;
  fallbackUrl?: string;
}

let kokoroModel: any = null;
let isInitializing = false;
let currentSynthesisId = 0;
let abortedIds = new Set<number>();

async function initializeKokoro() {
  if (kokoroModel || isInitializing) return;
  isInitializing = true;

  try {
    self.postMessage({
      type: "progress",
      progress: 0,
    } as TTSResponse);

    // Dynamic import for Kokoro
    // Note: kokoro-js needs to be properly configured
    const { KokoroTTS } = await import("kokoro-js");

    kokoroModel = await KokoroTTS.from_pretrained(
      "onnx-community/Kokoro-82M-v1.0-ONNX",
      {
        dtype: "fp32",
        device: "webgpu",
      }
    );

    self.postMessage({ type: "ready" } as TTSResponse);
  } catch (error) {
    // Kokoro initialization failed, will use fallback
    self.postMessage({
      type: "error",
      error: `Kokoro init failed: ${error instanceof Error ? error.message : "Unknown"}. Will use server fallback.`,
    } as TTSResponse);
  } finally {
    isInitializing = false;
  }
}

async function synthesize(text: string, voice: string, language: string) {
  // Assign a unique ID to this synthesis
  const synthesisId = ++currentSynthesisId;

  // For non-English or if Kokoro not available, request server fallback
  if (language !== "en" || !kokoroModel) {
    // Check if aborted before sending fallback
    if (abortedIds.has(synthesisId)) {
      abortedIds.delete(synthesisId);
      return;
    }
    self.postMessage({
      type: "fallback",
      fallbackUrl: `/api/v1/tts?text=${encodeURIComponent(text)}&voice=${voice}&lang=${language}`,
    } as TTSResponse);
    return;
  }

  try {
    const audio = await kokoroModel.generate(text, {
      voice: voice || "af_bella",
    });

    // Check if this synthesis was aborted
    if (abortedIds.has(synthesisId)) {
      abortedIds.delete(synthesisId);
      return; // Silently discard result
    }

    // Convert to ArrayBuffer
    const audioBuffer = audio.toWav();

    self.postMessage(
      {
        type: "audio",
        audio: audioBuffer,
      } as TTSResponse,
      [audioBuffer]
    );
  } catch (error) {
    // Don't report error if aborted
    if (abortedIds.has(synthesisId)) {
      abortedIds.delete(synthesisId);
      return;
    }

    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "TTS synthesis failed",
    } as TTSResponse);
  }
}

self.onmessage = async (event: MessageEvent<TTSMessage>) => {
  const { type, text, voice, language } = event.data;

  switch (type) {
    case "init":
      await initializeKokoro();
      break;
    case "synthesize":
      if (text) {
        await synthesize(text, voice || "af_bella", language || "en");
      }
      break;
    case "abort":
      // Mark current synthesis as aborted (result will be discarded)
      if (currentSynthesisId > 0) {
        abortedIds.add(currentSynthesisId);
      }
      break;
  }
};
