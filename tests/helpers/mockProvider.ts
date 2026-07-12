import { ProviderClient, Quote, ProviderError } from '../../src/collector/types';

export class MockProviderClient implements ProviderClient {
  public attempts: { tickers: string[]; timestamp: number }[] = [];
  public failNext: number = 0;
  public failStatus: number = 500;
  public failRetryAfterMs?: number;

  constructor(private clock: { now: () => number }) {}

  async fetchCurrentPrices(tickers: string[]): Promise<Quote[]> {
    this.attempts.push({ tickers, timestamp: this.clock.now() });

    if (this.failNext > 0) {
      this.failNext--;
      const error: ProviderError = new Error('Mock failure') as ProviderError;
      error.isRetryable = true;
      error.status = this.failStatus;
      error.retryAfterMs = this.failRetryAfterMs;
      throw error;
    }

    return tickers.map(ticker => ({
      ticker,
      price: 100, // mock price
      timestamp: this.clock.now(),
      volume: 1000
    }));
  }
}
