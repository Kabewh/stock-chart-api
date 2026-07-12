import { Clock, CollectorConfig, ProviderClient, ProviderError, Sleeper, PriceSink } from './types';
import { SharedAttemptLimiter } from './rateLimiter';
import { SharedBackoffGate } from './backoff';

interface BatchJob {
  batch: string[];
  generation: number;
}

export class LatestOnlyCollector {
  private isRunning = false;
  private generation = 0;
  private pendingJobs = new Map<number, BatchJob>();

  private limiter: SharedAttemptLimiter;
  private backoffGate: SharedBackoffGate;

  constructor(
    private tickers: string[],
    private config: CollectorConfig,
    private provider: ProviderClient,
    private sink: PriceSink,
    private clock: Clock,
    private sleeper: Sleeper,
    private random: () => number = Math.random
  ) {
    if (!tickers || tickers.length === 0) {
      throw new Error("Ticker catalog cannot be empty");
    }
    this.limiter = new SharedAttemptLimiter(config.rateLimitPerMinute, clock, sleeper);
    this.backoffGate = new SharedBackoffGate(config.baseBackoffMs, config.maxBackoffMs, clock, sleeper, random);
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Initial sweep
    this.scheduleSweep();

    void this.runSweepLoop();
    this.runWorkers();
  }

  public stop() {
    this.isRunning = false;
    this.pendingJobs.clear();
  }

  private async runSweepLoop() {
    while (this.isRunning) {
      await this.sleeper.sleep(this.config.sweepIntervalMs);
      if (this.isRunning) {
        this.scheduleSweep();
      }
    }
  }

  private scheduleSweep() {
    const generation = ++this.generation;
    const numBatches = Math.ceil(this.tickers.length / this.config.batchSize);
    for (let i = 0; i < numBatches; i++) {
      const batch = this.tickers.slice(i * this.config.batchSize, (i + 1) * this.config.batchSize);
      this.pendingJobs.set(i, { batch, generation });
    }
  }

  private runWorkers() {
    for (let i = 0; i < this.config.concurrency; i++) {
      void this.workerLoop();
    }
  }

  private async workerLoop() {
    while (this.isRunning) {
      let jobEntry: [number, BatchJob] | undefined;
      for (const entry of this.pendingJobs.entries()) {
        jobEntry = entry;
        break;
      }

      if (!jobEntry) {
        await this.sleeper.sleep(100);
        continue;
      }

      const [batchIndex, job] = jobEntry;
      this.pendingJobs.delete(batchIndex);

      await this.processBatch(batchIndex, job);
    }
  }

  private hasNewerPendingJob(batchIndex: number, generation: number): boolean {
    const pending = this.pendingJobs.get(batchIndex);
    return pending !== undefined && pending.generation > generation;
  }

  private async processBatch(batchIndex: number, job: BatchJob) {
    let attempts = 0;
    while (attempts <= this.config.maxRetries && this.isRunning) {
      if (this.hasNewerPendingJob(batchIndex, job.generation)) {
        return;
      }

      try {
        // A backoff can begin while another worker is queued at the limiter.
        // Re-check the gate after reserving a slot; if it changed, discard that
        // slot and reserve a fresh one after the outage pause.
        while (true) {
          await this.backoffGate.waitIfBackingOff();

          if (!this.isRunning || this.hasNewerPendingJob(batchIndex, job.generation)) return;

          await this.limiter.reserveSlot();

          if (!this.isRunning || this.hasNewerPendingJob(batchIndex, job.generation)) return;
          if (!this.backoffGate.isBackingOff()) break;
        }

        attempts++;
        const quotes = await this.provider.fetchCurrentPrices(job.batch);

        const validQuotes = quotes.filter(q => q.ticker && typeof q.price === 'number' && typeof q.timestamp === 'number');

        await this.sink.saveQuotes(validQuotes);
        this.backoffGate.reportSuccess();

        // A successful current-price request also satisfies a sweep that was
        // queued while this request was in flight.
        if (this.hasNewerPendingJob(batchIndex, job.generation)) {
          this.pendingJobs.delete(batchIndex);
        }
        return;
      } catch (err: any) {
        const providerError = err as ProviderError;
        if (!providerError.isRetryable) {
          return;
        }

        this.backoffGate.reportFailure(providerError);
      }
    }
  }
}
