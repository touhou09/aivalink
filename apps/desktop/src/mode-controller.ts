import type { ControllableDesktopWindow, DesktopMode } from './types';

export class DesktopModeController {
  currentMode: DesktopMode = 'window';

  private clearPetOnlyFlags(window: ControllableDesktopWindow) {
    window.setAlwaysOnTop(false);
    window.setIgnoreMouseEvents(false);
  }

  switchMode(mode: DesktopMode, window: ControllableDesktopWindow): DesktopMode {
    if (mode === 'pet') {
      window.show();
      window.setWindowButtonVisibility(false);
      window.setAlwaysOnTop(true, 'screen-saver');
      window.setIgnoreMouseEvents(true);
      this.currentMode = mode;
      return this.currentMode;
    }

    if (mode === 'tray') {
      this.clearPetOnlyFlags(window);
      window.hide();
      this.currentMode = mode;
      return this.currentMode;
    }

    window.show();
    window.setWindowButtonVisibility(true);
    this.clearPetOnlyFlags(window);
    this.currentMode = mode;
    return this.currentMode;
  }
}
