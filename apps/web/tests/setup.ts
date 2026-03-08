import { vi } from "vitest";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: Error) => void) | null = null;

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    // Mock send
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);

// Mock AudioContext
vi.stubGlobal("AudioContext", vi.fn(() => ({
  createAnalyser: vi.fn(() => ({
    fftSize: 256,
    frequencyBinCount: 128,
    getByteFrequencyData: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  createMediaStreamSource: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  createScriptProcessor: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null,
  })),
  createBufferSource: vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    buffer: null,
    onended: null,
  })),
  decodeAudioData: vi.fn(),
  destination: {},
  close: vi.fn(),
})));

// Mock navigator.mediaDevices
vi.stubGlobal("navigator", {
  ...navigator,
  mediaDevices: {
    getUserMedia: vi.fn(() =>
      Promise.resolve({
        getTracks: () => [{ stop: vi.fn() }],
      })
    ),
  },
});
