export interface TTSOptions {
  onReady?: () => void;
  onAudio?: (audioBuffer: ArrayBuffer) => void;
  onError?: (error: string) => void;
  onProgress?: (progress: number) => void;
  onFallback?: (url: string) => void;
  onAudioPlay?: (audioContext: AudioContext, sourceNode: AudioBufferSourceNode) => void;
  onAudioEnd?: () => void;
}

export class TTSManager {
  private worker: Worker | null = null;
  private isReady = false;
  private options: TTSOptions;
  private audioContext: AudioContext | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying = false;

  constructor(options: TTSOptions = {}) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    if (this.worker) return;

    this.audioContext = new AudioContext();

    return new Promise((resolve, _reject) => {
      this.worker = new Worker(
        new URL("../../workers/tts.worker.ts", import.meta.url),
        { type: "module" }
      );

      this.worker.onmessage = (event) => {
        const { type, audio, error, progress, fallbackUrl } = event.data;

        switch (type) {
          case "ready":
            this.isReady = true;
            this.options.onReady?.();
            resolve();
            break;
          case "audio":
            this.options.onAudio?.(audio);
            this.queueAudio(audio);
            break;
          case "error":
            this.options.onError?.(error);
            // Don't reject on error - TTS can still work via fallback
            if (!this.isReady) {
              this.isReady = true; // Mark as ready even with error (fallback available)
              resolve();
            }
            break;
          case "progress":
            this.options.onProgress?.(progress);
            break;
          case "fallback":
            this.options.onFallback?.(fallbackUrl);
            this.fetchAndPlayFallback(fallbackUrl);
            break;
        }
      };

      this.worker.postMessage({ type: "init" });

      // Set timeout for initialization (Kokoro can be slow to load)
      setTimeout(() => {
        if (!this.isReady) {
          this.isReady = true;
          resolve();
        }
      }, 5000);
    });
  }

  synthesize(text: string, voice?: string, language?: string): void {
    if (!this.worker) {
      this.options.onError?.("TTS not initialized");
      return;
    }

    this.worker.postMessage({ type: "synthesize", text, voice, language });
  }

  private async queueAudio(audioBuffer: ArrayBuffer): Promise<void> {
    this.audioQueue.push(audioBuffer);
    if (!this.isPlaying) {
      await this.playNext();
    }
  }

  private async playNext(): Promise<void> {
    if (this.audioQueue.length === 0 || !this.audioContext) {
      this.isPlaying = false;
      this.options.onAudioEnd?.();
      return;
    }

    this.isPlaying = true;
    const buffer = this.audioQueue.shift()!;

    try {
      const audioBuffer = await this.audioContext.decodeAudioData(buffer.slice(0));
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      // Notify Lip Sync that audio playback is starting
      this.options.onAudioPlay?.(this.audioContext, source);

      source.onended = () => this.playNext();
      source.start();
    } catch (error) {
      console.error("Failed to play audio:", error);
      this.playNext();
    }
  }

  private async fetchAndPlayFallback(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Fallback TTS request failed");
      const audioBuffer = await response.arrayBuffer();
      await this.queueAudio(audioBuffer);
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error.message : "Fallback TTS failed"
      );
    }
  }

  stop(): void {
    this.audioQueue = [];
    this.isPlaying = false;
    this.options.onAudioEnd?.();
  }

  terminate(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    this.audioContext?.close();
    this.audioContext = null;
    this.isReady = false;
  }
}
