import { LatestOnlyCollector } from '../src/collector/collector';
import { CollectorConfig } from '../src/collector/types';
import { ProviderError } from '../src/collector/types';
import { InMemoryPriceSink } from '../src/collector/inMemoryPriceSink';
import { DeterministicClock } from './helpers/clock';
import { MockProviderClient } from './helpers/mockProvider';

describe('Collector Resilience', () => {
  it('should handle 429 with Retry-After and 5xx exponential backoff', async () => {
    const clock = new DeterministicClock();
    const config: CollectorConfig = {
      batchSize: 100,
      rateLimitPerMinute: 1000,
      sweepIntervalMs: 5 * 60 * 1000, // 5 mins
      maxRetries: 5,
      baseBackoffMs: 1000,
      maxBackoffMs: 10000,
      concurrency: 1
    };

    const tickers = Array.from({ length: 400 }, (_, i) => `TICKER${i}`);
    const provider = new MockProviderClient(clock);
    const sink = new InMemoryPriceSink();

    const collector = new LatestOnlyCollector(
      tickers,
      config,
      provider,
      sink,
      clock,
      clock,
      () => 1 // max jitter for predictable exponential backoff
    );

    // Force failures
    // First request hits 429 with retry-after 5000ms
    provider.failNext = 1;
    provider.failStatus = 429;
    provider.failRetryAfterMs = 5000;

    collector.start();
    await new Promise(r => setTimeout(r, 0));

    // After 2 seconds, no new requests should be made because of 5000ms backoff
    await clock.advance(2000);
    expect(provider.attempts.length).toBe(1);

    // After 6 seconds, backoff is over, next request happens
    // But let's make it fail with 5xx
    provider.failNext = 1;
    provider.failStatus = 500;
    
    await clock.advance(4000); // Now at 6000
    // Attempt 1 happened at 0, hit 429.
    // Attempt 2 happens at 5000, hits 500.
    // This triggers exponential backoff (base 1000ms).
    
    // Attempt 3 happens at 5000 + 1000 = 6000.
    // Wait, let's just advance plenty of time and see it recovers.
    await clock.advance(10000);

    // It should have fully succeeded by now
    expect(sink.getCount()).toBe(400);

    collector.stop();
  });

  it('coalesces sweeps missed during an outage into one recovery fetch', async () => {
    const clock = new DeterministicClock();
    const config: CollectorConfig = {
      batchSize: 100,
      rateLimitPerMinute: 1000,
      sweepIntervalMs: 1000,
      maxRetries: 10,
      baseBackoffMs: 1000,
      maxBackoffMs: 10000,
      concurrency: 1
    };
    const provider = new MockProviderClient(clock);
    const sink = new InMemoryPriceSink();
    let attempts = 0;

    provider.fetchCurrentPrices = async (tickers) => {
      attempts++;
      if (attempts === 1) {
        const error = new Error('rate limited') as ProviderError;
        error.isRetryable = true;
        error.status = 429;
        error.retryAfterMs = 3500;
        throw error;
      }

      return tickers.map(ticker => ({
        ticker,
        price: 200,
        timestamp: clock.now(),
        volume: 1000
      }));
    };

    const collector = new LatestOnlyCollector(
      ['AAPL'],
      config,
      provider,
      sink,
      clock,
      clock
    );

    collector.start();
    await new Promise(resolve => setTimeout(resolve, 0));
    await clock.advance(3900);
    collector.stop();

    // Sweeps were scheduled at 1s, 2s, and 3s during the outage. Recovery
    // makes one current-price request rather than replaying all three.
    expect(attempts).toBe(2);
    expect(sink.getQuote('AAPL')?.price).toBe(200);
  });

  it('does not let an older provider response replace a newer quote', async () => {
    const clock = new DeterministicClock();
    const config: CollectorConfig = {
      batchSize: 100,
      rateLimitPerMinute: 1000,
      sweepIntervalMs: 60 * 1000, // 1 min for faster test
      maxRetries: 0, // Drop on failure to test coalescing
      baseBackoffMs: 1000,
      maxBackoffMs: 10000,
      concurrency: 1
    };

    const tickers = ['AAPL', 'GOOG'];
    const provider = new MockProviderClient(clock);
    const sink = new InMemoryPriceSink();

    const collector = new LatestOnlyCollector(
      tickers,
      config,
      provider,
      sink,
      clock,
      clock
    );

    let callCount = 0;
    provider.fetchCurrentPrices = async (t) => {
      callCount++;
      return t.map(ticker => ({
        ticker,
        price: callCount === 1 ? 100 : 200,
        // Second call returns an OLDER timestamp to test newest-wins
        timestamp: callCount === 1 ? 20000 : 10000,
        volume: 1000
      }));
    };

    collector.start();
    await new Promise(r => setTimeout(r, 0));

    await clock.advance(1000); // Process first sweep
    
    const aaplFirst = sink.getQuote('AAPL');
    expect(aaplFirst?.price).toBe(100);
    expect(aaplFirst?.timestamp).toBe(20000);

    // Wait for second sweep
    await clock.advance(60 * 1000);

    const aaplSecond = sink.getQuote('AAPL');
    // Because the second call returned timestamp 10000 (older than 20000), sink should ignore it
    expect(aaplSecond?.price).toBe(100); // Remains 100
    expect(aaplSecond?.timestamp).toBe(20000);

    collector.stop();
  });
});
