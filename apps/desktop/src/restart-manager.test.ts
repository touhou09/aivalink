import { describe, expect, it, vi } from 'vitest';

import { CrashRestartManager } from './restart-manager';

describe('CrashRestartManager', () => {
  it('triggers relaunch when crash is detected', () => {
    const relaunch = vi.fn();
    const quit = vi.fn();
    const manager = new CrashRestartManager({ relaunch, quit, maxRecoveries: 2 });

    manager.handleRendererCrash(new Error('renderer gone'));

    expect(relaunch).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('stops auto recovery after max attempts', () => {
    const relaunch = vi.fn();
    const quit = vi.fn();
    const manager = new CrashRestartManager({ relaunch, quit, maxRecoveries: 2 });

    expect(manager.handleRendererCrash(new Error('1'))).toBe('restarted');
    expect(manager.handleRendererCrash(new Error('2'))).toBe('restarted');
    expect(manager.handleRendererCrash(new Error('3'))).toBe('manual-intervention-required');

    expect(relaunch).toHaveBeenCalledTimes(2);
    expect(quit).toHaveBeenCalledTimes(2);
  });
});
