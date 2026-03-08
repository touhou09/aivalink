export type DesktopMode = 'window' | 'pet' | 'tray';

export type ControllableDesktopWindow = {
  setAlwaysOnTop(flag: boolean, level?: string): void;
  setIgnoreMouseEvents(flag: boolean): void;
  setWindowButtonVisibility(flag: boolean): void;
  hide(): void;
  show(): void;
};
