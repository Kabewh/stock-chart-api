# Stock Chart API - Take-Home Exercise

This project is set up and initialized for the Tribes Take-Home one-hour exercise.

## Core Configuration Included:
- **TypeScript**: Pre-configured with `tsconfig.json` targeting Node.js.
- **Express**: Basic web server set up in `src/index.ts`.
- **Jest & Supertest**: Test environment configured in `jest.config.js` and `tests/dummy.test.ts`.
- **Nodemon**: Hot-reloading for development (`npm run dev`).
- **Data Model**: Core `Tick` model interface located in `src/models/Tick.ts`.
- **Third-Party Client Stub**: Located in `src/services/thirdPartyClient.ts`.
- **Data Generator**: Helper to generate sample data in `src/utils/generateData.ts`.
- **Sample Data**: Sample JSON data placed in `src/data/sample-data.json`.

## Available Commands:
- `npm run dev` - Starts the development server with hot-reloading (ts-node + nodemon).
- `npm run build` - Compiles the TypeScript source into the `dist/` directory.
- `npm run start:prod` - Runs the compiled application from the `dist/` directory.
- `npm run test` - Runs the Jest test suite.
- `npm run test:watch` - Runs the Jest test suite in watch mode.

## Project Structure:
```text
.
├── src/
│   ├── data/                 # Sample data files
│   ├── models/               # TypeScript interfaces/types (e.g., Tick.ts)
│   ├── services/             # API clients, data fetching logic
│   ├── utils/                # Helper functions (e.g., sample data generator)
│   └── index.ts              # Express application entry point
├── tests/                    # Jest test files
├── dist/                     # Compiled JavaScript output
├── jest.config.js            # Jest configuration
├── tsconfig.json             # TypeScript configuration
└── package.json              # Project dependencies and scripts
```

## Ready for the Assessment
You can now start recording your session and pick one of the components (Collector or Chart API) to implement. The foundational structure is fully prepared so you can focus directly on the logic, testing, and architecture.

## Implemented Collector Component

The collector handles fetching current prices from a third-party provider and writing them to a `PriceSink`. The design ensures that:
- **Batching**: The 30,000 ticker catalog is split into `ceil(30,000 / 100) = 300` stable batches.
- **Freshness**: A sweep starts every 5 minutes. This gives a full extra sweep of margin against the 10-minute freshness requirement.
- **Newest-State / No Replay**: We queue one pending job per batch key. A newer sweep replaces an older pending job, so a network outage never creates a replay backlog. Older quotes (detected by timestamp) are discarded if a newer one was already saved.
- **Strict Rate Limiting**: Every initial call and retry routes through one shared serialized limiter. Reserving outbound start slots 60 ms apart permits at most 1,000 attempts in any rolling 60-second window. A normal 300-request sweep dispatches in about 18 seconds plus latency.
- **Resilience**: A bounded worker pool interacts with a provider-wide backoff gate. It honors `Retry-After` for 429s, and applies capped exponential backoff with jitter for retryable network/5xx errors. Successful traffic immediately resets the outage backoff.

### Manual outage simulation

Run:

```bash
npm run demo:collector
```

The demo performs a real-time 30,000-ticker sweep. Its mock provider returns a
429 with a one-second `Retry-After`, then two 503 outage responses, and finally
recovers. The final summary reports the stored quote count, outbound attempts,
elapsed time, and the maximum attempts observed in any rolling minute. It exits
non-zero if all 30,000 current prices are not recovered within 45 seconds.

### Production Extension Points

The current implementation provides robust core logic behind clear interfaces (`ProviderClient`, `PriceSink`, `Clock`, `Sleeper`). To deploy this to production, you would extend the interfaces:

1. **Real HTTP Adapter**: Implement `ProviderClient` using `fetch` or `axios` to contact the actual third-party `/stocks` API, handling real HTTP status codes and parsing `Retry-After` headers.
2. **Durable Sink**: Implement `PriceSink` using a time-series database (e.g., TimescaleDB, InfluxDB) or a Redis cache. The sink must ensure newest-wins semantics (e.g., using SQL `ON CONFLICT` or Redis Lua scripts based on the quote `timestamp`).
3. **Distributed Limiter**: If the collector needs to be deployed across multiple instances (horizontally scaled), the `SharedAttemptLimiter` and `SharedBackoffGate` should be backed by Redis (e.g., using Redis Cell or a token bucket Lua script) to coordinate rate limits globally.
4. **Single Active Collector**: Alternatively, run a single active collector instance (using leader election) so the in-memory limiter and backoff gates accurately reflect the global state.
