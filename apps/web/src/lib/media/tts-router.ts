import { TTSManager, type TTSOptions } from "../tts/index";
import { detectCapabilities, canRunClientSideTTS } from "./capability-detect";

export interface TTSRouterOptions {
  onAudio?: (buffer: ArrayBuffer) => void;
  onAudioPlay?: (ctx: AudioContext, source: AudioBufferSourceNode) => void;
  onAudioEnd?: () => void;
  onError?: (error: string) => void;
  preferServer?: boolean;
  serverUrl?: string;
}

export class TTSRouter {
  private mode: "client" | "server" = "client";
  private clientTTS: TTSManager | null = null;
  private options: TTSRouterOptions;
  private audioContext: AudioContext | null = null;

  constructor(options: TTSRouterOptions = {}) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    const serverUrl = this.options.serverUrl ?? import.meta.env.VITE_AI_SERVICE_URL ?? "/api/ai";

    if (this.options.preferServer) {
      this.mode = "server";
      return;
    }

    const caps = await detectCapabilities();
    if (canRunClientSideTTS(caps)) {
      this.mode = "client";
      const ttsOptions: TTSOptions = {
        onAudio: this.options.onAudio,
        onAudioPlay: this.options.onAudioPlay,
        onAudioEnd: this.options.onAudioEnd,
        onError: this.options.onError,
      };
      this.clientTTS = new TTSManager(ttsOptions);
      await this.clientTTS.initialize();
    } else {
      this.mode = "server";
    }

    void serverUrl; // used in synthesize()
  }

  synthesize(text: string, voice?: string, language?: string): void {
    if (this.mode === "client" && this.clientTTS) {
      this.clientTTS.synthesize(text, voice, language);
    } else {
      this.synthesizeServer(text, voice, language);
    }
  }

  private async synthesizeServer(text: string, voice?: string, language?: string): Promise<void> {
    const serverUrl = this.options.serverUrl ?? import.meta.env.VITE_AI_SERVICE_URL ?? "/api/ai";
    try {
      const response = await fetch(`${serverUrl}/tts/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, language }),
      });

      if (!response.ok) {
        this.options.onError?.(`Server TTS failed: ${response.statusText}`);
        return;
      }

      const buffer = await response.arrayBuffer();
      this.options.onAudio?.(buffer);
      await this.playServerAudio(buffer);
    } catch (err) {
      this.options.onError?.(err instanceof Error ? err.message : "Server TTS error");
    }
  }

  private async playServerAudio(buffer: ArrayBuffer): Promise<void> {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      const audioBuffer = await this.audioContext.decodeAudioData(buffer.slice(0));
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      this.options.onAudioPlay?.(this.audioContext, source);
      source.onended = () => this.options.onAudioEnd?.();
      source.start();
    } catch (err) {
      this.options.onError?.(err instanceof Error ? err.message : "Audio playback error");
    }
  }

  getMode(): "client" | "server" {
    return this.mode;
  }

  terminate(): void {
    this.clientTTS?.terminate();
    this.clientTTS = null;
    this.audioContext?.close();
    this.audioContext = null;
  }
}
