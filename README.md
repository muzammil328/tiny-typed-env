# tiny-typed-env

Tiny typed environment loader. **No Zod required.** Also works with Zod, Valibot, and ArkType via [Standard Schema](https://standardschema.dev).

```ts
import { createEnv, s } from "tiny-typed-env/node";

export const env = createEnv({
  DATABASE_URL: s.url(),
  PORT: s.port({ default: 3000 }),
  NODE_ENV: s.enum(["development", "test", "production"], {
    default: "development",
  }),
  DEBUG: s.boolean({ default: false }),
  API_KEY: s.string({ min: 8 }),
});

env.PORT; // number
env.DATABASE_URL; // string
```

If a variable is missing or invalid, the process **fails at boot** with:

```
Invalid environment variables:

  DATABASE_URL: Expected a valid URL
  API_KEY: Must be at least 8 characters

Fix your .env file or the host environment, then restart.
```

## Install

```bash
npm install tiny-typed-env
```

## Schema (full)

Use built-in `s` (zero extra packages) or pass Zod/Valibot schemas.

| Helper | Input examples | Output type |
|---|---|---|
| `s.string()` | `hello` | `string` |
| `s.string({ min, max, pattern })` | | `string` |
| `s.string({ optional: true })` | missing / `""` | `string \| undefined` |
| `s.string({ default: "x" })` | missing | `string` |
| `s.number()` | `"42"` | `number` |
| `s.number({ int: true, min, max })` | | `number` |
| `s.boolean()` | `true`, `1`, `yes`, `on` / `false`, `0`, `no`, `off` | `boolean` |
| `s.enum(["a", "b"])` | `a` | `"a" \| "b"` |
| `s.url()` | `https://x.com` | `string` |
| `s.email()` | `a@b.c` | `string` |
| `s.port()` | `"3000"` | `number` (1–65535) |
| `s.json()` | `'{"a":1}'` | parsed JSON |
| `s.csv()` | `a, b, c` | `string[]` |

Empty strings are treated as missing by default.

### App schema template

Copy this into `src/env.ts`:

```ts
import { createEnv, s } from "tiny-typed-env/node";

export const env = createEnv({
  NODE_ENV: s.enum(["development", "test", "production"], {
    default: "development",
  }),
  PORT: s.port({ default: 3000 }),
  DATABASE_URL: s.url(),
  REDIS_URL: s.url({ optional: true }),
  API_KEY: s.string({ min: 1 }),
  DEBUG: s.boolean({ default: false }),
  CORS_ORIGINS: s.csv({ default: [] }),
  FEATURE_FLAGS: s.json<Record<string, boolean>>({ default: {} }),
});

export type Env = typeof env;
```

### Zod (optional)

```ts
import { loadEnv } from "tiny-typed-env";
import { z } from "zod";

export const env = loadEnv(
  {
    DATABASE_URL: z.string().url(),
    PORT: z.coerce.number().default(3000),
  },
  { runtimeEnv: process.env },
);
```

Needs Zod 3.24+ or Zod 4 (Standard Schema support).

## APIs

### `tiny-typed-env` (all runtimes)

No `fs`. Pass values yourself. Use this on Cloudflare Workers, Deno Deploy, browsers.

```ts
import { loadEnv, safeLoadEnv, s } from "tiny-typed-env";

const env = loadEnv(
  { TOKEN: s.string() },
  { runtimeEnv: process.env },
);

const result = safeLoadEnv(
  { TOKEN: s.string() },
  { runtimeEnv: { TOKEN: "" } },
);
// result.ok === false
```

### `tiny-typed-env/node` (Node + Bun)

Loads `.env`, `.env.local`, `.env.[NODE_ENV]`, `.env.[NODE_ENV].local` (does not overwrite real environment variables).

```ts
import { createEnv, loadEnvFile, s } from "tiny-typed-env/node";

loadEnvFile(".env"); // optional, createEnv already does this

export const env = createEnv({
  DATABASE_URL: s.url(),
});
```

Skip files: `createEnv(schema, { envFile: false })`.

