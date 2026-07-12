import { LatestOnlyCollector } from '../src/collector/collector';
import { CollectorConfig } from '../src/collector/types';
import { InMemoryPriceSink } from '../src/collector/inMemoryPriceSink';
import { DeterministicClock } from './helpers/clock';
import { MockProviderClient } from './helpers/mockProvider';

describe('LatestOnlyCollector', () => {
  it('should process 30,000 tickers in batches of 100 correctly', async () => {
    const clock = new DeterministicClock();
    const config: CollectorConfig = {
      batchSize: 100,
      rateLimitPerMinute: 1000,
      sweepIntervalMs: 5 * 60 * 1000,
      maxRetries: 3,
      baseBackoffMs: 1000,
      maxBackoffMs: 30000,
      concurrency: 5
    };

    const tickers = Array.from({ length: 30000 }, (_, i) => `TICKER${i}`);
    const provider = new MockProviderClient(clock);
    const sink = new InMemoryPriceSink();

    const collector = new LatestOnlyCollector(
      tickers,
      config,
      provider,
      sink,
      clock,
      clock,
      () => 0.5 // deterministic random
    );

    collector.start();

    // Allow workers to start and queue timeouts
    await new Promise(r => setTimeout(r, 0));

    // The collector schedules a sweep immediately.
    // 30,000 / 100 = 300 batches.
    // At 1000 requests per minute, 300 batches should take 300 * 60ms = 18000ms.
    await clock.advance(20000);

    collector.stop();
    // Allow any remaining background loops to exit
    await clock.advance(1000);

    // Verify exactly 300 requests were made
    expect(provider.attempts.length).toBe(300);

    // Verify all 30000 tickers are in the sink
    expect(sink.getCount()).toBe(30000);

    // Check completion is well inside 10 minutes (actually we only advanced 20 seconds)
    const firstAttempt = provider.attempts[0].timestamp;
    const lastAttempt = provider.attempts[provider.attempts.length - 1].timestamp;
    expect(lastAttempt - firstAttempt).toBeLessThanOrEqual(18000 + 1000);
  });
});
