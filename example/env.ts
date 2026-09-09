import { createEnv, s } from "../dist/node.js";

/**
 * Copy this file into your app as `src/env.ts` (or `env.ts`).
 *
 * CLI (from your app root):
 *   npx tiny-typed-env check
 *   npx tiny-typed-env example
 *
 * Then in code: import { env } from "./env.js"
 */

export const schema = {
  NODE_ENV: s.enum(["development", "test", "production"], {
    default: "development",
  }),
  PORT: s.port({ default: 3000 }),
  DEBUG: s.boolean({ default: false }),

  // Nested groups — leaf keys are still flat process.env vars
  server: {
    DATABASE_URL: s.url(),
    REDIS_URL: s.url({ optional: true }),
    API_KEY: s.string({ min: 1 }),
  },
  public: {
    APP_URL: s.url({ optional: true }),
  },

  CORS_ORIGINS: s.csv({ default: [] }),
  FEATURE_FLAGS: s.json<Record<string, boolean>>({ default: {} }),
  TIMEOUT: s.duration({ default: "30s" }),
  MAX_UPLOAD: s.bytes({ default: "10mb" }),
};

export const env = createEnv(schema, {
  // Skip .env files in this package example; createEnv uses process.env by default.
  envFile: false,
});

export type Env = typeof env;

// env.PORT              → number
// env.server.DATABASE_URL
// env.TIMEOUT           → 30000
// env.MAX_UPLOAD        → 10485760
