import {
  Clock,
  CollectorConfig,
  ProviderClient,
  ProviderError,
  Quote,
  Sleeper
} from './collector/types';
import { LatestOnlyCollector } from './collector/collector';
import { InMemoryPriceSink } from './collector/inMemoryPriceSink';

const clock: Clock = {
  now: () => Date.now()
};

const sleeper: Sleeper = {
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

class OutageSimulationProvider implements ProviderClient {
  readonly attemptTimes: number[] = [];
  private attempt = 0;

  constructor(private readonly startedAt: number) {}

  async fetchCurrentPrices(tickers: string[]): Promise<Quote[]> {
    this.attempt++;
    this.attemptTimes.push(Date.now());
    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(2);

    if (this.attempt === 1) {
      console.log(`[+${elapsed}s] attempt 1: simulated 429, Retry-After 1s`);
      throw this.providerError('simulated rate limit', 429, 1000);
    }

    if (this.attempt === 2 || this.attempt === 3) {
      console.log(`[+${elapsed}s] attempt ${this.attempt}: simulated 503 outage`);
      throw this.providerError('simulated provider outage', 503);
    }

    if (this.attempt === 4 || this.attempt % 50 === 0) {
      console.log(`[+${elapsed}s] attempt ${this.attempt}: provider recovered`);
    }

    const timestamp = Date.now();
    return tickers.map((ticker, index) => ({
      ticker,
      price: 100 + index / 100,
      timestamp,
      volume: 1000 + index
    }));
  }

  private providerError(message: string, status: number, retryAfterMs?: number): ProviderError {
    const error = new Error(message) as ProviderError;
    error.isRetryable = true;
    error.status = status;
    error.retryAfterMs = retryAfterMs;
    return error;
  }
}

function maxAttemptsInRollingMinute(attemptTimes: number[]): number {
  let max = 0;
  let left = 0;

  for (let right = 0; right < attemptTimes.length; right++) {
    while (attemptTimes[right] - attemptTimes[left] >= 60_000) {
      left++;
    }
    max = Math.max(max, right - left + 1);
  }

  return max;
}

async function waitForCompletion(
  sink: InMemoryPriceSink,
  expectedQuotes: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (sink.getCount() < expectedQuotes) {
    if (Date.now() >= deadline) {
      throw new Error(`demo timed out with ${sink.getCount()}/${expectedQuotes} quotes`);
    }
    await sleeper.sleep(100);
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const tickers = Array.from({ length: 30_000 }, (_, index) => `TICKER${index}`);
  const provider = new OutageSimulationProvider(startedAt);
  const sink = new InMemoryPriceSink();
  const config: CollectorConfig = {
    batchSize: 100,
    rateLimitPerMinute: 1000,
    sweepIntervalMs: 5 * 60_000,
    maxRetries: 5,
    baseBackoffMs: 500,
    maxBackoffMs: 10_000,
    concurrency: 5
  };
  const collector = new LatestOnlyCollector(
    tickers,
    config,
    provider,
    sink,
    clock,
    sleeper,
    () => 1
  );

  console.log('Starting 30,000-ticker sweep with a simulated 429 and outage...');
  collector.start();

  try {
    await waitForCompletion(sink, tickers.length, 45_000);
    const elapsedMs = Date.now() - startedAt;
    const rollingMax = maxAttemptsInRollingMinute(provider.attemptTimes);

    console.log('\nRecovery complete');
    console.log(`quotes stored: ${sink.getCount()}`);
    console.log(`outbound attempts: ${provider.attemptTimes.length}`);
    console.log(`elapsed: ${(elapsedMs / 1000).toFixed(2)}s`);
    console.log(`max attempts in a rolling minute: ${rollingMax}/1000`);
  } finally {
    collector.stop();
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
