import { STTManager, type STTOptions } from "../stt/index";
import { detectCapabilities, canRunClientSideSTT } from "./capability-detect";

export interface STTRouterOptions {
  onResult?: (text: string) => void;
  onError?: (error: string) => void;
  onProgress?: (progress: number) => void;
  preferServer?: boolean;
  serverUrl?: string;
}

export class STTRouter {
  private mode: "client" | "server" = "client";
  private clientSTT: STTManager | null = null;
  private options: STTRouterOptions;

  constructor(options: STTRouterOptions = {}) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    if (this.options.preferServer) {
      this.mode = "server";
      return;
    }

    const caps = await detectCapabilities();
    if (canRunClientSideSTT(caps)) {
      this.mode = "client";
      const sttOptions: STTOptions = {
        onResult: this.options.onResult,
        onError: this.options.onError,
        onProgress: this.options.onProgress,
      };
      this.clientSTT = new STTManager(sttOptions);
      await this.clientSTT.initialize();
    } else {
      this.mode = "server";
    }
  }

  transcribe(audio: Float32Array, sampleRate: number = 16000): void {
    if (this.mode === "client" && this.clientSTT) {
      this.clientSTT.transcribe(audio, sampleRate);
    } else {
      this.transcribeServer(audio, sampleRate);
    }
  }

  private async transcribeServer(audio: Float32Array, sampleRate: number): Promise<void> {
    const serverUrl = this.options.serverUrl ?? import.meta.env.VITE_AI_SERVICE_URL ?? "/api/ai";
    try {
      const wavBlob = encodeWav(audio, sampleRate);
      const formData = new FormData();
      formData.append("audio", wavBlob, "audio.wav");

      const response = await fetch(`${serverUrl}/stt/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        this.options.onError?.(`Server STT failed: ${response.statusText}`);
        return;
      }

      const { text } = await response.json() as { text: string };
      this.options.onResult?.(text);
    } catch (err) {
      this.options.onError?.(err instanceof Error ? err.message : "Server STT error");
    }
  }

  getMode(): "client" | "server" {
    return this.mode;
  }

  terminate(): void {
    this.clientSTT?.terminate();
    this.clientSTT = null;
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}
