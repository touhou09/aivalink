export type RestartResult = 'restarted' | 'manual-intervention-required';

export class CrashRestartManager {
  private recoveries = 0;

  constructor(
    private readonly controls: {
      relaunch: () => void;
      quit: () => void;
      maxRecoveries: number;
    },
  ) {}

  handleRendererCrash(_error: Error): RestartResult {
    if (this.recoveries >= this.controls.maxRecoveries) {
      return 'manual-intervention-required';
    }

    this.recoveries += 1;
    this.controls.relaunch();
    this.controls.quit();
    return 'restarted';
  }
}
