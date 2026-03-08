import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";

// Register PIXI to window for pixi-live2d-display
(window as any).PIXI = PIXI;

export interface Live2DOptions {
  canvas: HTMLCanvasElement;
  modelUrl: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export interface TapMotion {
  motion: string;
  expression?: string;
}

export interface EyeTrackingConfig {
  enabled: boolean;
  sensitivity: number; // 0.0 ~ 1.0
}

export interface ModelInfo {
  name: string;
  url: string;
  model_path?: string;
  kScale: number;
  idleMotionGroupName: string;
  emotionMap: Record<
    string,
    {
      motion: string;
      expression: string;
    }
  >;
  // Advanced Live2D settings
  tapMotions?: Record<string, TapMotion>;
  eyeTracking?: EyeTrackingConfig;
}

export class Live2DManager {
  private app: PIXI.Application | null = null;
  private model: Live2DModel | null = null;
  private options: Live2DOptions;
  private lipSyncAnalyser: AnalyserNode | null = null;
  private lipSyncAnimationId: number | null = null;

  constructor(options: Live2DOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    const { canvas, modelUrl, onLoad, onError } = this.options;

    try {
      // Initialize PIXI Application
      this.app = new PIXI.Application({
        view: canvas,
        resizeTo: canvas.parentElement || window,
        backgroundAlpha: 0,
        antialias: true,
      });

      // Load Live2D model
      this.model = await Live2DModel.from(modelUrl);

      // Scale and position model
      this.model.anchor.set(0.5, 0.5);
      this.fitModel();

      // Add to stage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.app.stage.addChild(this.model as any);

      // Start idle motion
      this.model.motion("idle");

      // Handle resize
      window.addEventListener("resize", this.handleResize);

      onLoad?.();
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Failed to load Live2D model"));
    }
  }

  private fitModel(): void {
    if (!this.model || !this.app) return;

    const { width, height } = this.app.screen;
    const modelWidth = this.model.width;
    const modelHeight = this.model.height;

    const scale = Math.min(
      (width * 0.8) / modelWidth,
      (height * 0.9) / modelHeight
    );

    this.model.scale.set(scale);
    this.model.x = width / 2;
    this.model.y = height / 2 + modelHeight * scale * 0.1;
  }

  private handleResize = (): void => {
    this.fitModel();
  };

  setExpression(expressionName: string): void {
    if (!this.model) return;
    this.model.expression(expressionName);
  }

  playMotion(motionGroup: string, index?: number): void {
    if (!this.model) return;
    this.model.motion(motionGroup, index);
  }

  /**
   * Apply emotion-based expression and motion using emotionMap.
   * @param emotion - The emotion name (e.g., "happy", "sad", "angry")
   * @param emotionMap - Mapping from emotion to { motion, expression }
   */
  applyEmotion(
    emotion: string,
    emotionMap?: Record<string, { motion: string; expression: string }>
  ): void {
    if (!this.model || !emotionMap) return;

    const mapping = emotionMap[emotion];
    if (!mapping) {
      console.warn(`No emotion mapping found for: ${emotion}`);
      return;
    }

    if (mapping.expression) {
      this.setExpression(mapping.expression);
    }
    if (mapping.motion) {
      this.playMotion(mapping.motion);
    }
  }

  startLipSync(audioContext: AudioContext, sourceNode: AudioNode): void {
    if (!this.model) return;

    // Create analyser for lip sync
    this.lipSyncAnalyser = audioContext.createAnalyser();
    this.lipSyncAnalyser.fftSize = 256;
    sourceNode.connect(this.lipSyncAnalyser);

    const dataArray = new Uint8Array(this.lipSyncAnalyser.frequencyBinCount);

    const animate = () => {
      if (!this.lipSyncAnalyser || !this.model) return;

      this.lipSyncAnalyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const mouthOpenY = Math.min(average / 128, 1);

      // Update mouth parameter
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.model.internalModel.coreModel as any).setParameterValueById(
        "ParamMouthOpenY",
        mouthOpenY
      );

      this.lipSyncAnimationId = requestAnimationFrame(animate);
    };

    animate();
  }

  stopLipSync(): void {
    if (this.lipSyncAnimationId) {
      cancelAnimationFrame(this.lipSyncAnimationId);
      this.lipSyncAnimationId = null;
    }

    if (this.model) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.model.internalModel.coreModel as any).setParameterValueById(
        "ParamMouthOpenY",
        0
      );
    }

    this.lipSyncAnalyser?.disconnect();
    this.lipSyncAnalyser = null;
  }

  setMouthOpen(value: number): void {
    if (!this.model) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.model.internalModel.coreModel as any).setParameterValueById(
      "ParamMouthOpenY",
      Math.max(0, Math.min(1, value))
    );
  }

  /**
   * Handle touch/click interactions on the Live2D model.
   * Returns true if a hit area was found and a motion was triggered.
   * @param x - X coordinate relative to canvas
   * @param y - Y coordinate relative to canvas
   * @param tapMotions - Mapping from hit area name to motion config
   */
  handleTouch(
    x: number,
    y: number,
    tapMotions?: Record<string, TapMotion>
  ): boolean {
    if (!this.model) return false;

    // Convert canvas coordinates to model coordinates
    const modelX = x - this.model.x;
    const modelY = y - this.model.y;

    // Test for hits on defined hit areas
    const hitAreas = this.model.hitTest(modelX, modelY);

    if (hitAreas.length > 0 && tapMotions) {
      const hitArea = hitAreas[0]; // Take the first hit area
      const tapConfig = tapMotions[hitArea];

      if (tapConfig) {
        if (tapConfig.expression) {
          this.setExpression(tapConfig.expression);
        }
        if (tapConfig.motion) {
          this.playMotion(tapConfig.motion);
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Make the Live2D model look at a specific point.
   * Uses normalized coordinates (-1 to 1 for both axes).
   * @param x - Normalized X coordinate (-1 = left, 0 = center, 1 = right)
   * @param y - Normalized Y coordinate (-1 = bottom, 0 = center, 1 = top)
   * @param sensitivity - How much the model should respond (0.0 ~ 1.0)
   */
  lookAt(x: number, y: number, sensitivity = 0.5): void {
    if (!this.model) return;

    // Clamp values to valid range
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));

    // Apply sensitivity multiplier (typical range: 30 degrees max)
    const angleX = clampedX * 30 * sensitivity;
    const angleY = clampedY * 30 * sensitivity;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coreModel = this.model.internalModel.coreModel as any;

    // Update head angle parameters
    coreModel.setParameterValueById("ParamAngleX", angleX);
    coreModel.setParameterValueById("ParamAngleY", angleY);

    // Update eye ball position (typically ranges from -1 to 1)
    coreModel.setParameterValueById("ParamEyeBallX", clampedX * sensitivity);
    coreModel.setParameterValueById("ParamEyeBallY", clampedY * sensitivity);
  }

  /**
   * Reset eye/head tracking to default (center) position.
   */
  resetLookAt(): void {
    this.lookAt(0, 0, 0);
  }

  /**
   * Get the internal PIXI Live2D model instance.
   * Useful for advanced customizations.
   */
  getModel(): Live2DModel | null {
    return this.model;
  }

  /**
   * Check if a hit test matches any defined hit area at the given coordinates.
   * @param x - X coordinate relative to canvas
   * @param y - Y coordinate relative to canvas
   * @returns Array of hit area names that were hit
   */
  hitTest(x: number, y: number): string[] {
    if (!this.model) return [];

    const modelX = x - this.model.x;
    const modelY = y - this.model.y;

    return this.model.hitTest(modelX, modelY);
  }

  destroy(): void {
    window.removeEventListener("resize", this.handleResize);
    this.stopLipSync();
    this.model?.destroy();
    this.app?.destroy();
    this.model = null;
    this.app = null;
  }
}
