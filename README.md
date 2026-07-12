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
