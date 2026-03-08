import { describe, expect, it } from 'vitest';

import { DesktopModeController } from './mode-controller';

describe('DesktopModeController', () => {
  it('starts in window mode by default', () => {
    const controller = new DesktopModeController();
    expect(controller.currentMode).toBe('window');
  });

  it('applies pet mode visual behavior', () => {
    const controller = new DesktopModeController();
    const window = createWindowSpy();

    controller.switchMode('pet', window);

    expect(window.setAlwaysOnTopCalls).toEqual([true, 'screen-saver']);
    expect(window.setIgnoreMouseEventsCalls).toEqual([true]);
    expect(window.setWindowButtonVisibilityCalls).toEqual([false]);
  });

  it('applies tray mode behavior by hiding the window', () => {
    const controller = new DesktopModeController();
    const window = createWindowSpy();

    controller.switchMode('tray', window);

    expect(window.hideCalls).toBe(1);
    expect(window.showCalls).toBe(0);
  });

  it('resets pet-only flags when moving from pet mode to tray mode', () => {
    const controller = new DesktopModeController();
    const window = createWindowSpy();

    controller.switchMode('pet', window);
    controller.switchMode('tray', window);

    expect(window.hideCalls).toBe(1);
    expect(window.setAlwaysOnTopCalls.at(-1)).toBe(false);
    expect(window.setIgnoreMouseEventsCalls.at(-1)).toBe(false);
  });

  it('restores window mode after tray mode', () => {
    const controller = new DesktopModeController();
    const window = createWindowSpy();

    controller.switchMode('tray', window);
    controller.switchMode('window', window);

    expect(window.showCalls).toBe(1);
    expect(window.setAlwaysOnTopCalls.at(-1)).toBe(false);
    expect(window.setIgnoreMouseEventsCalls.at(-1)).toBe(false);
  });
});

function createWindowSpy() {
  return {
    setAlwaysOnTopCalls: [] as Array<boolean | string>,
    setIgnoreMouseEventsCalls: [] as boolean[],
    setWindowButtonVisibilityCalls: [] as boolean[],
    hideCalls: 0,
    showCalls: 0,
    setAlwaysOnTop(flag: boolean, level?: string) {
      this.setAlwaysOnTopCalls.push(flag);
      if (level) {
        this.setAlwaysOnTopCalls.push(level);
      }
    },
    setIgnoreMouseEvents(flag: boolean) {
      this.setIgnoreMouseEventsCalls.push(flag);
    },
    setWindowButtonVisibility(flag: boolean) {
      this.setWindowButtonVisibilityCalls.push(flag);
    },
    hide() {
      this.hideCalls += 1;
    },
    show() {
      this.showCalls += 1;
    },
  };
}
