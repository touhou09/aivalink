import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useToolApproval } from "./useToolApproval";
import type { PendingApproval } from "./useToolApproval";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  emotion?: string;
  timestamp: string;
}

interface GatewayChatState {
  messages: ChatMessage[];
  isConnected: boolean;
  emotion: string;
  trustLevel: string;
  conversationCount: number;
  energy: { current: number; max: number; tier: string };
  error: string | null;
  pendingApproval: PendingApproval | null;
}

export interface UseGatewayChatOptions {
  characterId: string;
  onError?: (error: string) => void;
}

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function useGatewayChat(options: UseGatewayChatOptions) {
  const { token } = useAuthStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [emotion, setEmotion] = useState("neutral");
  const [trustLevel, setTrustLevel] = useState("stranger");
  const [conversationCount, setConversationCount] = useState(0);
  const [energy, setEnergy] = useState<{ current: number; max: number; tier: string }>({
    current: 0,
    max: 100,
    tier: "low",
  });
  const [error, setError] = useState<string | null>(null);

  const sendApprovalResponse = useCallback((taskId: string, approved: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        version: 1,
        timestamp: new Date().toISOString(),
        type: "exec_approval_response",
        taskId,
        approved,
      }),
    );
  }, []);

  const toolApproval = useToolApproval({
    onApprove: (taskId) => sendApprovalResponse(taskId, true),
    onReject: (taskId) => sendApprovalResponse(taskId, false),
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleServerMessage = useCallback((data: Record<string, unknown>) => {
    switch (data.type) {
      case "chat_response": {
        const streaming = data.streaming as boolean;
        const content = (data.content as string) ?? "";
        const msgEmotion = (data.emotion as string) ?? undefined;

        if (streaming) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.id === "streaming") {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + content, emotion: msgEmotion ?? last.emotion },
              ];
            }
            return [
              ...prev,
              {
                id: "streaming",
                role: "assistant",
                content,
                emotion: msgEmotion,
                timestamp: new Date().toISOString(),
              },
            ];
          });
        } else {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.id === "streaming") {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  id: crypto.randomUUID(),
                  content: last.content + content,
                  emotion: msgEmotion ?? last.emotion,
                },
              ];
            }
            return [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content,
                emotion: msgEmotion,
                timestamp: new Date().toISOString(),
              },
            ];
          });
          if (msgEmotion) setEmotion(msgEmotion);
        }
        break;
      }

      case "emotion_state":
        if (data.emotion) setEmotion(data.emotion as string);
        break;

      case "trust_level":
        if (data.trustLevel) setTrustLevel(data.trustLevel as string);
        if (typeof data.conversationCount === "number") setConversationCount(data.conversationCount);
        break;

      case "energy_update":
        setEnergy({
          current: (data.current as number) ?? 0,
          max: (data.max as number) ?? 100,
          tier: (data.tier as string) ?? "low",
        });
        break;

      case "memory_update":
        // no UI action needed for now
        break;

      case "exec_approval_request":
        toolApproval.handleApprovalRequest(data);
        break;

      case "error": {
        const errMsg = (data.message as string) ?? "Unknown error";
        setError(errMsg);
        options.onError?.(errMsg);
        break;
      }

      default:
        break;
    }
  }, [options, toolApproval]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const gatewayBase = import.meta.env.VITE_GATEWAY_WS_URL || "/gateway";
    const tokenParam = token ? `token=${encodeURIComponent(token)}&` : "";
    const url = `${gatewayBase}/ws?${tokenParam}characterId=${encodeURIComponent(options.characterId)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      wsRef.current = null;

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, RECONNECT_DELAY_MS);
      } else {
        const msg = "Connection lost. Max reconnect attempts reached.";
        setError(msg);
        options.onError?.(msg);
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      const msg = "WebSocket connection error";
      setError(msg);
      options.onError?.(msg);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data as string);
        handleServerMessage(data);
      } catch {
        // ignore malformed messages
      }
    };
  }, [token, options.characterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // prevent auto-reconnect
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      const msg = "Not connected to gateway";
      setError(msg);
      options.onError?.(msg);
      return;
    }

    const payload = {
      version: 1,
      timestamp: new Date().toISOString(),
      type: "chat",
      content,
    };
    wsRef.current.send(JSON.stringify(payload));

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, [options]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const state: GatewayChatState = {
    messages,
    isConnected,
    emotion,
    trustLevel,
    conversationCount,
    energy,
    error,
    pendingApproval: toolApproval.pendingApproval,
  };

  return {
    ...state,
    connect,
    disconnect,
    sendMessage,
    approveToolCall: toolApproval.approve,
    rejectToolCall: toolApproval.reject,
  };
}
