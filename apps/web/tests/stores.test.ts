import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "../src/stores/authStore";
import { usePersonaStore } from "../src/stores/personaStore";
import { useVTuberStore } from "../src/stores/vtuberStore";

describe("AuthStore", () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  });

  it("should set auth state", () => {
    const { setAuth } = useAuthStore.getState();
    setAuth("test-token", {
      id: "1",
      email: "test@example.com",
      username: "testuser",
    });

    const state = useAuthStore.getState();
    expect(state.token).toBe("test-token");
    expect(state.user?.email).toBe("test@example.com");
    expect(state.isAuthenticated).toBe(true);
  });

  it("should logout", () => {
    const { setAuth, logout } = useAuthStore.getState();
    setAuth("test-token", {
      id: "1",
      email: "test@example.com",
      username: "testuser",
    });
    logout();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});

describe("PersonaStore", () => {
  beforeEach(() => {
    usePersonaStore.setState({
      personas: [],
      currentPersona: null,
      isLoading: false,
      error: null,
    });
  });

  it("should add persona", () => {
    const { addPersona } = usePersonaStore.getState();
    const persona = {
      id: "1",
      owner_id: "user1",
      name: "Test Persona",
      description: null,
      avatar_url: null,
      persona_prompt: "You are a test AI",
      character_name: "Testy",
      live2d_model_name: "shizuku",
      llm_provider: "ollama",
      llm_model: "qwen2.5:latest",
      tts_provider: "edge_tts",
      tts_voice: "en-US-AriaNeural",
      tts_language: "en",
      use_letta: false,
      is_public: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    addPersona(persona);

    const state = usePersonaStore.getState();
    expect(state.personas).toHaveLength(1);
    expect(state.personas[0].name).toBe("Test Persona");
  });

  it("should remove persona", () => {
    const { setPersonas, removePersona } = usePersonaStore.getState();
    setPersonas([
      {
        id: "1",
        owner_id: "user1",
        name: "Persona 1",
        description: null,
        avatar_url: null,
        persona_prompt: "Test",
        character_name: "Test",
        live2d_model_name: "shizuku",
        llm_provider: "ollama",
        llm_model: "qwen2.5",
        tts_provider: "edge_tts",
        tts_voice: "en-US-AriaNeural",
        tts_language: "en",
        use_letta: false,
        is_public: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    removePersona("1");

    const state = usePersonaStore.getState();
    expect(state.personas).toHaveLength(0);
  });
});

describe("VTuberStore", () => {
  beforeEach(() => {
    useVTuberStore.getState().reset();
  });

  it("should update status", () => {
    const { setStatus } = useVTuberStore.getState();
    setStatus("running");

    const state = useVTuberStore.getState();
    expect(state.status).toBe("running");
  });

  it("should set connected state", () => {
    const { setConnected, setWebsocketUrl } = useVTuberStore.getState();
    setWebsocketUrl("/vtuber/123/client-ws");
    setConnected(true);

    const state = useVTuberStore.getState();
    expect(state.isConnected).toBe(true);
    expect(state.websocketUrl).toBe("/vtuber/123/client-ws");
  });

  it("should reset state", () => {
    const { setStatus, setConnected, reset } = useVTuberStore.getState();
    setStatus("running");
    setConnected(true);
    reset();

    const state = useVTuberStore.getState();
    expect(state.status).toBe("stopped");
    expect(state.isConnected).toBe(false);
  });
});
