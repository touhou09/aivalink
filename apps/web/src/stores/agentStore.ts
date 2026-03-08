import { create } from "zustand";
import { useAuthStore } from "./authStore";

const API_URL = import.meta.env.VITE_API_URL || "";

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  agent_type: string;
  config: Record<string, unknown> | null;
  tools: string[] | null;
  llm_provider: string;
  llm_model: string;
  system_prompt: string | null;
  status: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface AgentStore {
  agents: Agent[];
  loading: boolean;
  error: string | null;

  fetchAgents: () => Promise<void>;
  createAgent: (data: Partial<Agent>) => Promise<Agent>;
  updateAgent: (id: string, data: Partial<Agent>) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  loading: false,
  error: null,

  fetchAgents: async () => {
    const token = useAuthStore.getState().token;
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/api/v1/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch agents");
      const data = await response.json();
      set({ agents: Array.isArray(data) ? data : data.items ?? [] });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      set({ loading: false });
    }
  },

  createAgent: async (data) => {
    const token = useAuthStore.getState().token;
    const response = await fetch(`${API_URL}/api/v1/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "Failed to create agent");
    }
    const agent: Agent = await response.json();
    set((state) => ({ agents: [agent, ...state.agents] }));
    return agent;
  },

  updateAgent: async (id, data) => {
    const token = useAuthStore.getState().token;
    const response = await fetch(`${API_URL}/api/v1/agents/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "Failed to update agent");
    }
    const updated: Agent = await response.json();
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? updated : a)),
    }));
  },

  deleteAgent: async (id) => {
    const token = useAuthStore.getState().token;
    const response = await fetch(`${API_URL}/api/v1/agents/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Failed to delete agent");
    set((state) => ({ agents: state.agents.filter((a) => a.id !== id) }));
  },
}));
