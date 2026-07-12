import { SharedAttemptLimiter } from '../src/collector/rateLimiter';
import { DeterministicClock } from './helpers/clock';

describe('SharedAttemptLimiter', () => {
  it('should enforce the rate limit', async () => {
    const clock = new DeterministicClock();
    const rateLimitPerMinute = 1000;
    const limiter = new SharedAttemptLimiter(rateLimitPerMinute, clock, clock);

    let resolvedCount = 0;
    const attemptTimes: number[] = [];

    // Queue 2000 attempts
    for (let i = 0; i < 2000; i++) {
      limiter.reserveSlot().then(() => {
        resolvedCount++;
        attemptTimes.push(clock.now());
      });
    }

    await Promise.resolve();

    // Advance time by 60 seconds
    await clock.advance(60000);

    expect(resolvedCount).toBe(1000);

    for (let i = 0; i < attemptTimes.length; i++) {
      const windowStart = attemptTimes[i];
      const inWindow = attemptTimes.filter(t => t >= windowStart && t < windowStart + 60000);
      expect(inWindow.length).toBeLessThanOrEqual(1000);
    }
  });
});
