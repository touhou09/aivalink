export interface HistoryItem {
  history_uid: string;
  created_at: string;
  latest_message?: string;
}

export interface IVTuberClient {
  connect(url: string): Promise<void>;
  disconnect(): void;
  sendAudioData(data: Float32Array): void;
  sendTextInput(text: string): void;
  sendInterrupt(heardResponse?: string): void;
  sendImageInput(base64Image: string, prompt?: string): void;
  sendAudioEnd(): void;
  sendAudioEndWithImages(images: string[]): void;
  triggerProactiveSpeech(topic: string): void;
  // Chat History methods
  fetchHistoryList(): void;
  fetchAndSetHistory(historyUid: string): void;
  createNewHistory(): void;
  deleteHistory(historyUid: string): void;
  // Config switch method
  switchConfig(configName: string): void;
  // Callbacks
  onMessage(callback: (message: VTuberMessage) => void): void;
  onConnect(callback: () => void): void;
  onDisconnect(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface VTuberMessage {
  type: string;
  text?: string;
  audio?: number[];
  model_info?: {
    name: string;
    url: string;
    model_path?: string;
    kScale: number;
    idleMotionGroupName: string;
    emotionMap: Record<string, { motion: string; expression: string }>;
    // Advanced Live2D settings
    tapMotions?: Record<string, { motion: string; expression?: string }>;
    eyeTracking?: { enabled: boolean; sensitivity: number };
  };
  conf_name?: string;
  conf_uid?: string;
  client_uid?: string;
  display_text?: {
    text: string;
    type: string;
  };
  // Emotion expressed in the response (happy, sad, angry, surprised, neutral, etc.)
  emotion?: string;
  // Base64-encoded image for vision input
  image?: string;
  // Chat History related fields
  histories?: HistoryItem[];
  history_uid?: string;
}

export class V1VTuberClient implements IVTuberClient {
  private ws: WebSocket | null = null;
  private messageCallbacks: ((message: VTuberMessage) => void)[] = [];
  private connectCallbacks: (() => void)[] = [];
  private disconnectCallbacks: (() => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this.connectCallbacks.forEach((cb) => cb());
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as VTuberMessage;
            this.messageCallbacks.forEach((cb) => cb(message));
          } catch (e) {
            console.error("Failed to parse message:", e);
          }
        };

        this.ws.onclose = () => {
          this.disconnectCallbacks.forEach((cb) => cb());
        };

        this.ws.onerror = () => {
          const error = new Error("WebSocket error");
          this.errorCallbacks.forEach((cb) => cb(error));
          reject(error);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendAudioData(data: Float32Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "mic-audio-data",
          audio: Array.from(data),
        })
      );
    }
  }

  sendTextInput(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "text-input",
          text,
        })
      );
    }
  }

  sendInterrupt(heardResponse?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "interrupt-signal",
          text: heardResponse || "",
        })
      );
    }
  }

  sendImageInput(base64Image: string, prompt?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "image-input",
          image: base64Image,
          text: prompt || "이 이미지에 대해 설명해줘.",
        })
      );
    }
  }

  sendAudioEnd(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "mic-audio-end" }));
    }
  }

  sendAudioEndWithImages(images: string[]): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "mic-audio-end",
          images,
        })
      );
    }
  }

  triggerProactiveSpeech(topic: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "ai-speak-signal",
          text: topic,
        })
      );
    }
  }

  // Chat History methods
  fetchHistoryList(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "fetch-history-list" }));
    }
  }

  fetchAndSetHistory(historyUid: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "fetch-and-set-history",
          history_uid: historyUid,
        })
      );
    }
  }

  createNewHistory(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "create-new-history" }));
    }
  }

  deleteHistory(historyUid: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "delete-history",
          history_uid: historyUid,
        })
      );
    }
  }

  // Config switch method (runtime persona/character change)
  switchConfig(configName: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "switch-config",
          conf_name: configName,
        })
      );
    }
  }

  onMessage(callback: (message: VTuberMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  onConnect(callback: () => void): void {
    this.connectCallbacks.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }
}

export function createVTuberClient(version: "v1" | "v2" = "v1"): IVTuberClient {
  switch (version) {
    case "v1":
      return new V1VTuberClient();
    case "v2":
      // Future: V2VTuberClient
      throw new Error("V2 client not implemented yet");
    default:
      return new V1VTuberClient();
  }
}
