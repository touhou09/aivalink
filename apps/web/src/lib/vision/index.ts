export interface VisionOptions {
  onCameraStart?: () => void;
  onCameraStop?: () => void;
  onScreenShareStart?: () => void;
  onScreenShareStop?: () => void;
  onCapture?: (base64Image: string) => void;
  onError?: (error: string) => void;
}

export class VisionManager {
  private options: VisionOptions;
  // Camera-related properties
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private isActive = false;

  // Screen share-related properties (independent from camera)
  private screenStream: MediaStream | null = null;
  private screenVideoElement: HTMLVideoElement | null = null;
  private screenCanvas: HTMLCanvasElement | null = null;
  private isScreenActive = false;

  constructor(options: VisionOptions = {}) {
    this.options = options;
  }

  /**
   * Start camera stream and return the video element for preview
   */
  async startCamera(
    facingMode: "user" | "environment" = "user"
  ): Promise<HTMLVideoElement> {
    if (this.isActive) {
      throw new Error("Camera is already active");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      this.videoElement = document.createElement("video");
      this.videoElement.srcObject = this.stream;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;

      await this.videoElement.play();

      // Create canvas for capturing frames
      this.canvas = document.createElement("canvas");

      this.isActive = true;
      this.options.onCameraStart?.();

      return this.videoElement;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to access camera";
      this.options.onError?.(message);
      throw error;
    }
  }

  /**
   * Stop camera stream
   */
  stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.canvas = null;
    this.isActive = false;
    this.options.onCameraStop?.();
  }

  /**
   * Capture current frame from camera as base64 image
   */
  captureFrame(quality = 0.8): string | null {
    if (!this.videoElement || !this.canvas) {
      this.options.onError?.("Camera not active");
      return null;
    }

    const { videoWidth, videoHeight } = this.videoElement;

    // Set canvas size to video dimensions
    this.canvas.width = videoWidth;
    this.canvas.height = videoHeight;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      this.options.onError?.("Failed to get canvas context");
      return null;
    }

    // Draw video frame to canvas
    ctx.drawImage(this.videoElement, 0, 0, videoWidth, videoHeight);

    // Convert to base64 (remove data URL prefix)
    const dataUrl = this.canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");

    this.options.onCapture?.(base64);
    return base64;
  }

  /**
   * Capture screenshot using Screen Capture API
   */
  async captureScreenshot(quality = 0.8): Promise<string | null> {
    try {
      // Request screen capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
        },
      });

      // Create video element to display the stream
      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;

      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });
      await video.play();

      // Capture frame
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        stream.getTracks().forEach((t) => t.stop());
        this.options.onError?.("Failed to get canvas context");
        return null;
      }

      ctx.drawImage(video, 0, 0);

      // Stop the stream immediately after capture
      stream.getTracks().forEach((t) => t.stop());

      // Convert to base64
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");

      this.options.onCapture?.(base64);
      return base64;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to capture screenshot";
      this.options.onError?.(message);
      return null;
    }
  }

  /**
   * Convert image file to base64
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.replace(/^data:image\/\w+;base64,/, "");
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Check if camera is currently active
   */
  get isCameraActive(): boolean {
    return this.isActive;
  }

  /**
   * Get current video element (for preview)
   */
  get video(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Start persistent screen share stream and return the video element for preview
   * Unlike captureScreenshot(), this keeps the stream active for continuous capture
   */
  async startScreenShare(): Promise<HTMLVideoElement> {
    if (this.isScreenActive) {
      throw new Error("Screen share is already active");
    }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
        },
        audio: false,
      });

      this.screenVideoElement = document.createElement("video");
      this.screenVideoElement.srcObject = this.screenStream;
      this.screenVideoElement.autoplay = true;
      this.screenVideoElement.playsInline = true;

      await this.screenVideoElement.play();

      // Create canvas for capturing screen frames
      this.screenCanvas = document.createElement("canvas");

      this.isScreenActive = true;
      this.options.onScreenShareStart?.();

      // Handle stream end (user clicks "Stop sharing" in browser UI)
      this.screenStream.getVideoTracks()[0].addEventListener("ended", () => {
        this.stopScreenShare();
      });

      return this.screenVideoElement;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start screen share";
      this.options.onError?.(message);
      throw error;
    }
  }

  /**
   * Stop screen share stream
   */
  stopScreenShare(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    if (this.screenVideoElement) {
      this.screenVideoElement.srcObject = null;
      this.screenVideoElement = null;
    }

    this.screenCanvas = null;

    if (this.isScreenActive) {
      this.isScreenActive = false;
      this.options.onScreenShareStop?.();
    }
  }

  /**
   * Capture current frame from active screen share as base64 image
   * Returns null if screen share is not active
   */
  captureScreenFrame(quality = 0.8): string | null {
    if (!this.screenVideoElement || !this.screenCanvas || !this.isScreenActive) {
      this.options.onError?.("Screen share not active");
      return null;
    }

    const { videoWidth, videoHeight } = this.screenVideoElement;

    // Set canvas size to video dimensions
    this.screenCanvas.width = videoWidth;
    this.screenCanvas.height = videoHeight;

    const ctx = this.screenCanvas.getContext("2d");
    if (!ctx) {
      this.options.onError?.("Failed to get canvas context");
      return null;
    }

    // Draw video frame to canvas
    ctx.drawImage(this.screenVideoElement, 0, 0, videoWidth, videoHeight);

    // Convert to base64 (remove data URL prefix)
    const dataUrl = this.screenCanvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");

    this.options.onCapture?.(base64);
    return base64;
  }

  /**
   * Check if screen share is currently active
   */
  get isScreenShareActive(): boolean {
    return this.isScreenActive;
  }

  /**
   * Get current screen video element (for preview)
   */
  get screenVideo(): HTMLVideoElement | null {
    return this.screenVideoElement;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopCamera();
    this.stopScreenShare();
  }
}
