import { create } from "zustand";

export type InstanceStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

interface VTuberState {
  status: InstanceStatus;
  websocketUrl: string | null;
  isConnected: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  currentMessage: string;
  error: string | null;
  setStatus: (status: InstanceStatus) => void;
  setWebsocketUrl: (url: string | null) => void;
  setConnected: (connected: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  setListening: (listening: boolean) => void;
  setCurrentMessage: (message: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useVTuberStore = create<VTuberState>((set) => ({
  status: "stopped",
  websocketUrl: null,
  isConnected: false,
  isSpeaking: false,
  isListening: false,
  currentMessage: "",
  error: null,
  setStatus: (status) => set({ status }),
  setWebsocketUrl: (websocketUrl) => set({ websocketUrl }),
  setConnected: (isConnected) => set({ isConnected }),
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
  setListening: (isListening) => set({ isListening }),
  setCurrentMessage: (currentMessage) => set({ currentMessage }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      status: "stopped",
      websocketUrl: null,
      isConnected: false,
      isSpeaking: false,
      isListening: false,
      currentMessage: "",
      error: null,
    }),
}));
