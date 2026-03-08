export interface MediaCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  sharedArrayBuffer: boolean;
  hardwareConcurrency: number;
}

export async function detectCapabilities(): Promise<MediaCapabilities> {
  const webgpu = typeof navigator !== "undefined" && "gpu" in navigator && navigator.gpu !== null;
  const webgl2 = (() => {
    try {
      const canvas = document.createElement("canvas");
      return canvas.getContext("webgl2") !== null;
    } catch {
      return false;
    }
  })();
  const sharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";
  const hardwareConcurrency =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 1 : 1;

  return { webgpu, webgl2, sharedArrayBuffer, hardwareConcurrency };
}

export function canRunClientSideTTS(caps: MediaCapabilities): boolean {
  // Kokoro can run with WebGPU or with sufficient WebGL2 + cores
  return caps.webgpu || (caps.webgl2 && caps.hardwareConcurrency >= 4);
}

export function canRunClientSideSTT(caps: MediaCapabilities): boolean {
  // Whisper WebGPU requires WebGPU
  return caps.webgpu;
}
