import { create } from "zustand";

export interface Persona {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  persona_prompt: string;
  character_name: string;
  live2d_model_name: string;
  llm_provider: string;
  llm_model: string;
  tts_provider: string;
  tts_voice: string;
  tts_language: string;
  use_letta: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface PersonaState {
  personas: Persona[];
  currentPersona: Persona | null;
  isLoading: boolean;
  error: string | null;
  setPersonas: (personas: Persona[]) => void;
  setCurrentPersona: (persona: Persona | null) => void;
  addPersona: (persona: Persona) => void;
  updatePersona: (id: string, updates: Partial<Persona>) => void;
  removePersona: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const usePersonaStore = create<PersonaState>((set) => ({
  personas: [],
  currentPersona: null,
  isLoading: false,
  error: null,
  setPersonas: (personas) => set({ personas }),
  setCurrentPersona: (persona) => set({ currentPersona: persona }),
  addPersona: (persona) =>
    set((state) => ({ personas: [...state.personas, persona] })),
  updatePersona: (id, updates) =>
    set((state) => ({
      personas: state.personas.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),
  removePersona: (id) =>
    set((state) => ({
      personas: state.personas.filter((p) => p.id !== id),
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
