import { useCallback, useEffect, useRef, useState } from "react";
import { createVTuberClient, IVTuberClient, VTuberMessage, HistoryItem } from "../lib/websocket/client";
import { STTManager } from "../lib/stt";
import { TTSManager } from "../lib/tts";
import { VisionManager } from "../lib/vision";
// Dynamic import to avoid Cubism SDK requirement on non-VTuber pages
import type { Live2DManager, ModelInfo } from "../lib/live2d";

export interface UseVTuberOptions {
  onMessage?: (message: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onListeningChange?: (listening: boolean) => void;
  onError?: (error: string) => void;
}

export function useVTuber(options: UseVTuberOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSTTReady, setIsSTTReady] = useState(false);
  const [isTTSReady, setIsTTSReady] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScreenShareActive, setIsScreenShareActive] = useState(false);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  // Chat History state
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [currentHistoryUid, setCurrentHistoryUid] = useState<string | null>(null);

  const clientRef = useRef<IVTuberClient | null>(null);
  const sttRef = useRef<STTManager | null>(null);
  const ttsRef = useRef<TTSManager | null>(null);
  const live2dRef = useRef<Live2DManager | null>(null);
  const visionRef = useRef<VisionManager | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<Float32Array[]>([]);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const connect = useCallback(async (websocketUrl: string) => {
    try {
      const client = createVTuberClient("v1");
      clientRef.current = client;

      client.onConnect(() => {
        setIsConnected(true);
      });

      client.onDisconnect(() => {
        setIsConnected(false);
      });

      client.onMessage((message: VTuberMessage) => {
        handleMessage(message);
      });

      client.onError((error) => {
        options.onError?.(error.message);
      });

      await client.connect(websocketUrl);
    } catch (error) {
      options.onError?.(error instanceof Error ? error.message : "Connection failed");
    }
  }, [options]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setIsConnected(false);
  }, []);

  const handleMessage = useCallback((message: VTuberMessage) => {
    switch (message.type) {
      case "full-text":
        options.onMessage?.(message.text || "");
        // Apply emotion-based expression and motion if available
        if (message.emotion && modelInfo?.emotionMap) {
          const emotionMapping = modelInfo.emotionMap[message.emotion];
          if (emotionMapping) {
            if (emotionMapping.expression) {
              live2dRef.current?.setExpression(emotionMapping.expression);
            }
            if (emotionMapping.motion) {
              live2dRef.current?.playMotion(emotionMapping.motion);
            }
          }
        }
        break;
      case "set-model-and-conf":
        if (message.model_info) {
          setModelInfo(message.model_info);
        }
        break;
      case "audio":
        // Audio handling is done by TTS manager via onAudioPlay callback
        break;
      case "control":
        if (message.text === "start-mic") {
          setIsListening(true);
          options.onListeningChange?.(true);
        }
        break;
      // Chat History messages
      case "history-list":
        if (message.histories) {
          setHistoryList(message.histories);
        }
        break;
      case "history-loaded":
        if (message.history_uid) {
          setCurrentHistoryUid(message.history_uid);
        }
        break;
      case "history-created":
        if (message.history_uid) {
          setCurrentHistoryUid(message.history_uid);
          // Refresh history list after creating new history
          clientRef.current?.fetchHistoryList();
        }
        break;
      case "history-deleted":
        // Refresh history list after deletion
        clientRef.current?.fetchHistoryList();
        break;
    }
  }, [options, modelInfo]);

  const initializeSTT = useCallback(async () => {
    if (sttRef.current) return;

    const stt = new STTManager({
      onReady: () => setIsSTTReady(true),
      onResult: (text) => {
        clientRef.current?.sendTextInput(text);
      },
      onError: (error) => options.onError?.(error),
    });

    sttRef.current = stt;
    await stt.initialize();
  }, [options]);

  const initializeTTS = useCallback(async () => {
    if (ttsRef.current) return;

    const tts = new TTSManager({
      onReady: () => setIsTTSReady(true),
      onAudio: () => {
        // Audio received and queued
      },
      onError: (error) => options.onError?.(error),
      onAudioPlay: (audioContext, sourceNode) => {
        // Start lip sync when TTS audio begins playing
        live2dRef.current?.startLipSync(audioContext, sourceNode);
        setIsSpeaking(true);
        options.onSpeakingChange?.(true);
      },
      onAudioEnd: () => {
        // Stop lip sync when TTS audio finishes
        live2dRef.current?.stopLipSync();
        setIsSpeaking(false);
        options.onSpeakingChange?.(false);
      },
    });

    ttsRef.current = tts;
    await tts.initialize();
  }, [options]);

  const initializeLive2D = useCallback(
    async (canvas: HTMLCanvasElement, modelUrl: string) => {
      if (live2dRef.current) {
        live2dRef.current.destroy();
      }

      // Dynamic import to only load Live2D SDK when actually needed
      const { Live2DManager } = await import("../lib/live2d");

      const live2d = new Live2DManager({
        canvas,
        modelUrl,
        onLoad: () => console.log("Live2D model loaded"),
        onError: (error) => options.onError?.(error.message),
      });

      live2dRef.current = live2d;
      await live2d.initialize();
    },
    [options]
  );

  const startListening = useCallback(async () => {
    if (!sttRef.current || !isSTTReady) {
      options.onError?.("STT not ready");
      return;
    }

    try {
      // Clear previous audio buffer
      audioBufferRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioBufferRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      setIsListening(true);
      options.onListeningChange?.(true);
    } catch (error) {
      options.onError?.(error instanceof Error ? error.message : "Mic access failed");
    }
  }, [isSTTReady, options]);

  const stopListening = useCallback(() => {
    // Disconnect processor first
    processorRef.current?.disconnect();
    processorRef.current = null;

    // Stop media tracks
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    // Batch Vision: Capture images from active vision sources
    const images: string[] = [];
    if (visionRef.current?.isCameraActive) {
      const frame = visionRef.current.captureFrame();
      if (frame) images.push(frame);
    }
    if (visionRef.current?.isScreenShareActive) {
      const screen = visionRef.current.captureScreenFrame();
      if (screen) images.push(screen);
    }

    // Merge audio buffers and send to STT
    if (audioBufferRef.current.length > 0 && sttRef.current) {
      const totalLength = audioBufferRef.current.reduce((acc, buf) => acc + buf.length, 0);
      const mergedAudio = new Float32Array(totalLength);
      let offset = 0;
      for (const buf of audioBufferRef.current) {
        mergedAudio.set(buf, offset);
        offset += buf.length;
      }

      // Send to STT worker for transcription
      // Note: If images are captured, they will be sent via WebSocket after STT result
      sttRef.current.transcribe(mergedAudio, 16000);
      audioBufferRef.current = [];

      // If we have images, also signal the WebSocket to expect batch vision
      if (images.length > 0) {
        clientRef.current?.sendAudioEndWithImages(images);
      }
    }

    // Close audio context
    audioContextRef.current?.close();
    audioContextRef.current = null;

    setIsListening(false);
    options.onListeningChange?.(false);
  }, [options]);

  const sendTextInput = useCallback((text: string) => {
    clientRef.current?.sendTextInput(text);
  }, []);

  const interrupt = useCallback((heardResponse?: string) => {
    clientRef.current?.sendInterrupt(heardResponse);
    setIsSpeaking(false);
    ttsRef.current?.stop();
    live2dRef.current?.stopLipSync();
  }, []);

  const triggerProactiveSpeech = useCallback((topic: string) => {
    clientRef.current?.triggerProactiveSpeech(topic);
  }, []);

  // Chat History methods
  const fetchHistoryList = useCallback(() => {
    clientRef.current?.fetchHistoryList();
  }, []);

  const loadHistory = useCallback((historyUid: string) => {
    clientRef.current?.fetchAndSetHistory(historyUid);
  }, []);

  const createNewHistory = useCallback(() => {
    clientRef.current?.createNewHistory();
  }, []);

  const deleteHistory = useCallback((historyUid: string) => {
    clientRef.current?.deleteHistory(historyUid);
  }, []);

  // Config switch method (runtime persona change)
  const switchConfig = useCallback((configName: string) => {
    clientRef.current?.switchConfig(configName);
  }, []);

  // Advanced Live2D methods
  const handleLive2DTouch = useCallback((x: number, y: number) => {
    if (!live2dRef.current || !modelInfo?.tapMotions) return false;
    return live2dRef.current.handleTouch(x, y, modelInfo.tapMotions);
  }, [modelInfo]);

  const lookAt = useCallback((x: number, y: number) => {
    if (!live2dRef.current) return;
    const sensitivity = modelInfo?.eyeTracking?.sensitivity ?? 0.5;
    live2dRef.current.lookAt(x, y, sensitivity);
  }, [modelInfo]);

  const resetLookAt = useCallback(() => {
    live2dRef.current?.resetLookAt();
  }, []);

  // Vision functions
  const initializeVision = useCallback(() => {
    if (visionRef.current) return;

    const vision = new VisionManager({
      onCameraStart: () => setIsCameraActive(true),
      onCameraStop: () => setIsCameraActive(false),
      onScreenShareStart: () => setIsScreenShareActive(true),
      onScreenShareStop: () => setIsScreenShareActive(false),
      onError: (error) => options.onError?.(error),
    });

    visionRef.current = vision;
  }, [options]);

  const startCamera = useCallback(
    async (facingMode: "user" | "environment" = "user") => {
      if (!visionRef.current) {
        initializeVision();
      }
      return visionRef.current!.startCamera(facingMode);
    },
    [initializeVision]
  );

  const stopCamera = useCallback(() => {
    visionRef.current?.stopCamera();
  }, []);

  const captureAndSendFrame = useCallback(
    (prompt?: string) => {
      const base64 = visionRef.current?.captureFrame();
      if (base64) {
        clientRef.current?.sendImageInput(base64, prompt);
      }
      return base64;
    },
    []
  );

  const captureAndSendScreenshot = useCallback(
    async (prompt?: string) => {
      if (!visionRef.current) {
        initializeVision();
      }
      const base64 = await visionRef.current!.captureScreenshot();
      if (base64) {
        clientRef.current?.sendImageInput(base64, prompt);
      }
      return base64;
    },
    [initializeVision]
  );

  const sendImageInput = useCallback((base64Image: string, prompt?: string) => {
    clientRef.current?.sendImageInput(base64Image, prompt);
  }, []);

  // Persistent screen share functions
  const startScreenShare = useCallback(async () => {
    if (!visionRef.current) {
      initializeVision();
    }
    return visionRef.current!.startScreenShare();
  }, [initializeVision]);

  const stopScreenShare = useCallback(() => {
    visionRef.current?.stopScreenShare();
  }, []);

  const captureAndSendScreenFrame = useCallback(
    (prompt?: string) => {
      const base64 = visionRef.current?.captureScreenFrame();
      if (base64) {
        clientRef.current?.sendImageInput(base64, prompt);
      }
      return base64;
    },
    []
  );

  useEffect(() => {
    return () => {
      disconnect();
      sttRef.current?.terminate();
      ttsRef.current?.terminate();
      live2dRef.current?.destroy();
      visionRef.current?.destroy();
      stopListening();
    };
  }, [disconnect, stopListening]);

  return {
    // Connection state
    isConnected,
    isSpeaking,
    isListening,
    isSTTReady,
    isTTSReady,
    isCameraActive,
    isScreenShareActive,
    modelInfo,
    // Chat History state
    historyList,
    currentHistoryUid,
    // Connection methods
    connect,
    disconnect,
    // Initialization methods
    initializeSTT,
    initializeTTS,
    initializeLive2D,
    initializeVision,
    // Audio input methods
    startListening,
    stopListening,
    sendTextInput,
    interrupt,
    triggerProactiveSpeech,
    // Vision methods (camera)
    startCamera,
    stopCamera,
    captureAndSendFrame,
    captureAndSendScreenshot,
    sendImageInput,
    // Vision methods (persistent screen share)
    startScreenShare,
    stopScreenShare,
    captureAndSendScreenFrame,
    // Chat History methods
    fetchHistoryList,
    loadHistory,
    createNewHistory,
    deleteHistory,
    // Config switch method
    switchConfig,
    // Advanced Live2D methods
    handleLive2DTouch,
    lookAt,
    resetLookAt,
  };
}
