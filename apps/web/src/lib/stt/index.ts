export interface STTOptions {
  onReady?: () => void;
  onResult?: (text: string) => void;
  onError?: (error: string) => void;
  onProgress?: (progress: number) => void;
}

export class STTManager {
  private worker: Worker | null = null;
  private isReady = false;
  private options: STTOptions;

  constructor(options: STTOptions = {}) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    if (this.worker) return;

    return new Promise((resolve, reject) => {
      this.worker = new Worker(
        new URL("../../workers/stt.worker.ts", import.meta.url),
        { type: "module" }
      );

      this.worker.onmessage = (event) => {
        const { type, text, error, progress } = event.data;

        switch (type) {
          case "ready":
            this.isReady = true;
            this.options.onReady?.();
            resolve();
            break;
          case "result":
            this.options.onResult?.(text);
            break;
          case "error":
            this.options.onError?.(error);
            if (!this.isReady) reject(new Error(error));
            break;
          case "progress":
            this.options.onProgress?.(progress);
            break;
        }
      };

      this.worker.postMessage({ type: "init" });
    });
  }

  transcribe(audio: Float32Array, sampleRate: number = 16000): void {
    if (!this.worker || !this.isReady) {
      this.options.onError?.("STT not initialized");
      return;
    }

    this.worker.postMessage(
      { type: "transcribe", audio, sampleRate },
      [audio.buffer]
    );
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.isReady = false;
  }
}
