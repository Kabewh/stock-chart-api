import { Clock, ProviderError, Sleeper } from './types';

export class SharedBackoffGate {
  private backoffUntilMs: number = 0;
  private currentBackoffMs: number;

  constructor(
    private baseBackoffMs: number,
    private maxBackoffMs: number,
    private clock: Clock,
    private sleeper: Sleeper,
    private random: () => number = Math.random
  ) {
    this.currentBackoffMs = this.baseBackoffMs;
  }

  public async waitIfBackingOff(): Promise<void> {
    while (this.isBackingOff()) {
      await this.sleeper.sleep(this.backoffUntilMs - this.clock.now());
    }
  }

  public isBackingOff(): boolean {
    return this.clock.now() < this.backoffUntilMs;
  }

  public reportSuccess(): void {
    this.currentBackoffMs = this.baseBackoffMs;
  }

  public reportFailure(error: ProviderError): void {
    const now = this.clock.now();
    let delayMs = 0;

    if (error.status === 429 && error.retryAfterMs !== undefined) {
      delayMs = error.retryAfterMs;
    } else {
      // Exponential backoff with full jitter
      const maxJitter = this.currentBackoffMs;
      delayMs = this.random() * maxJitter;

      // Escalate backoff for the next failure
      this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, this.maxBackoffMs);
    }

    const proposedBackoffUntil = now + delayMs;
    if (proposedBackoffUntil > this.backoffUntilMs) {
      this.backoffUntilMs = proposedBackoffUntil;
    }
  }
}
