import { pipeline, env, type ProgressCallback } from "@huggingface/transformers";

// Configure transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

interface STTMessage {
  type: "init" | "transcribe" | "abort";
  audio?: Float32Array;
  sampleRate?: number;
}

interface STTResponse {
  type: "ready" | "result" | "error" | "progress";
  text?: string;
  error?: string;
  progress?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
let isInitializing = false;
let currentTranscriptionId = 0;
let abortedIds = new Set<number>();

async function initializeModel() {
  if (transcriber || isInitializing) return;
  isInitializing = true;

  try {
    self.postMessage({
      type: "progress",
      progress: 0,
    } as STTResponse);

    const progressCallback: ProgressCallback = (progressInfo) => {
      if ("progress" in progressInfo) {
        self.postMessage({
          type: "progress",
          progress: progressInfo.progress,
        } as STTResponse);
      }
    };

    transcriber = await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny.en",
      {
        device: "webgpu",
        dtype: "fp32",
        progress_callback: progressCallback,
      }
    );

    self.postMessage({ type: "ready" } as STTResponse);
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Failed to initialize STT",
    } as STTResponse);
  } finally {
    isInitializing = false;
  }
}

async function transcribe(audio: Float32Array, sampleRate: number) {
  if (!transcriber) {
    self.postMessage({
      type: "error",
      error: "STT model not initialized",
    } as STTResponse);
    return;
  }

  // Assign a unique ID to this transcription
  const transcriptionId = ++currentTranscriptionId;

  try {
    const result = await transcriber(audio, {
      sampling_rate: sampleRate,
      return_timestamps: false,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    // Check if this transcription was aborted
    if (abortedIds.has(transcriptionId)) {
      abortedIds.delete(transcriptionId);
      return; // Silently discard result
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = Array.isArray(result) ? (result[0] as any).text : (result as any).text;

    self.postMessage({
      type: "result",
      text: text.trim(),
    } as STTResponse);
  } catch (error) {
    // Don't report error if aborted
    if (abortedIds.has(transcriptionId)) {
      abortedIds.delete(transcriptionId);
      return;
    }

    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Transcription failed",
    } as STTResponse);
  }
}

self.onmessage = async (event: MessageEvent<STTMessage>) => {
  const { type, audio, sampleRate } = event.data;

  switch (type) {
    case "init":
      await initializeModel();
      break;
    case "transcribe":
      if (audio && sampleRate) {
        await transcribe(audio, sampleRate);
      }
      break;
    case "abort":
      // Mark current transcription as aborted (result will be discarded)
      if (currentTranscriptionId > 0) {
        abortedIds.add(currentTranscriptionId);
      }
      break;
  }
};
