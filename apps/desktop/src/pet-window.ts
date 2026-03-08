import { BrowserWindow, screen } from 'electron';
import path from 'path';

export interface PetWindowOptions {
  width?: number;   // default 300
  height?: number;  // default 400
}

export function createPetWindow(options?: PetWindowOptions): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const petWindow = new BrowserWindow({
    width: options?.width ?? 300,
    height: options?.height ?? 400,
    x: width - (options?.width ?? 300) - 50,
    y: height - (options?.height ?? 400) - 50,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      sandbox: true,
      preload: undefined, // will add later if needed
    },
  });

  // Make window draggable
  petWindow.setIgnoreMouseEvents(false);

  // Load the pet renderer HTML
  const htmlPath = path.join(__dirname, '..', 'pet-renderer.html');
  petWindow.loadFile(htmlPath).catch(() => {
    petWindow.loadURL('about:blank');
  });

  return petWindow;
}
