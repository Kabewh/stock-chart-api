import { PriceSink, Quote } from './types';

export class InMemoryPriceSink implements PriceSink {
  // Map from ticker to the latest Quote
  private store: Map<string, Quote> = new Map();

  public async saveQuotes(quotes: Quote[]): Promise<void> {
    for (const quote of quotes) {
      const existing = this.store.get(quote.ticker);
      if (!existing || quote.timestamp > existing.timestamp) {
        this.store.set(quote.ticker, quote);
      }
    }
  }

  public getQuote(ticker: string): Quote | undefined {
    return this.store.get(ticker);
  }

  public getAllQuotes(): Quote[] {
    return Array.from(this.store.values());
  }

  public getCount(): number {
    return this.store.size;
  }
}
