import { createEnv, s } from "../dist/node.js";

/**
 * Copy this file into your app as `src/env.ts`.
 * Then: import { env } from "./env.js"
 */
export const env = createEnv(
  {
    NODE_ENV: s.enum(["development", "test", "production"], {
      default: "development",
    }),
    PORT: s.port({ default: 3000 }),
    DATABASE_URL: s.url(),
    REDIS_URL: s.url({ optional: true }),
    API_KEY: s.string({ min: 1 }),
    DEBUG: s.boolean({ default: false }),
    CORS_ORIGINS: s.csv({ default: [] }),
    FEATURE_FLAGS: s.json({ default: {} }),
  },
  { envFile: false, runtimeEnv: process.env },
);

export type Env = typeof env;
