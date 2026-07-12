import { Clock, Sleeper } from '../../src/collector/types';

export class DeterministicClock implements Clock, Sleeper {
  private currentTime: number;
  private timeouts: { triggerTime: number; resolve: () => void }[] = [];

  constructor(startTime: number = 0) {
    this.currentTime = startTime;
  }

  now(): number {
    return this.currentTime;
  }

  async sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.timeouts.push({ triggerTime: this.currentTime + ms, resolve });
      this.timeouts.sort((a, b) => a.triggerTime - b.triggerTime);
    });
  }

  public async advance(ms: number) {
    const targetTime = this.currentTime + ms;
    // console.log(`[Clock] Advancing from ${this.currentTime} to ${targetTime}`);
    while (this.timeouts.length > 0 && this.timeouts[0].triggerTime <= targetTime) {
      const next = this.timeouts.shift()!;
      // console.log(`[Clock] Triggering timeout at ${next.triggerTime}`);
      this.currentTime = next.triggerTime;
      next.resolve();
      // Allow microtasks to run
      await new Promise(r => setTimeout(r, 0));
    }
    // console.log(`[Clock] Finished advancing. Current time: ${this.currentTime}, remaining timeouts: ${this.timeouts.length}`);
    this.currentTime = targetTime;
  }
}
