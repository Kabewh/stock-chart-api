export interface Quote {
  ticker: string;
  price: number;
  timestamp: number;
  volume: number;
}

export interface ProviderError extends Error {
  isRetryable: boolean;
  status?: number;
  retryAfterMs?: number;
}

export interface ProviderClient {
  fetchCurrentPrices(tickers: string[]): Promise<Quote[]>;
}

export interface PriceSink {
  saveQuotes(quotes: Quote[]): Promise<void>;
}

export interface Clock {
  now(): number;
}

export interface Sleeper {
  sleep(ms: number): Promise<void>;
}

export interface CollectorConfig {
  /** Maximum number of tickers to request in a single batch */
  batchSize: number;
  /** Maximum requests per minute */
  rateLimitPerMinute: number;
  /** Delay between full catalog sweeps (ms) */
  sweepIntervalMs: number;
  /** Max retries for a given batch during a sweep */
  maxRetries: number;
  /** Base backoff for exponential backoff (ms) */
  baseBackoffMs: number;
  /** Max backoff limit for exponential backoff (ms) */
  maxBackoffMs: number;
  /** Number of concurrent workers sending requests */
  concurrency: number;
}
