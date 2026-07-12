import { Clock, Sleeper } from './types';

export class SharedAttemptLimiter {
  private lastAttemptMs: number = 0;
  private queue: Array<() => void> = [];
  private isProcessing = false;

  constructor(
    private rateLimitPerMinute: number,
    private clock: Clock,
    private sleeper: Sleeper
  ) {}

  public async reserveSlot(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const minInterval = 60000 / this.rateLimitPerMinute;
      const now = this.clock.now();
      const timeSinceLast = now - this.lastAttemptMs;

      if (timeSinceLast < minInterval) {
        const waitTime = minInterval - timeSinceLast;
        await this.sleeper.sleep(waitTime);
      }

      // Record the time we are actually releasing the slot
      this.lastAttemptMs = this.clock.now();
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }

    this.isProcessing = false;
  }
}
