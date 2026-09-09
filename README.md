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

Core runtime has **zero dependencies**. `jiti` is optional and only used by the CLI for TypeScript schema files.

## CLI

Export a `schema` from `env.ts` (or `src/env.ts`):

```ts
import { createEnv, s } from "tiny-typed-env/node";

export const schema = {
  DATABASE_URL: s.url(),
  PORT: s.port({ default: 3000 }),
};

export const env = createEnv(schema);
```

```bash
npx tiny-typed-env check              # validate env, exit 1 on failure
npx tiny-typed-env example            # write .env.example from schema
npx tiny-typed-env example --print    # print to stdout
```

Options: `--schema <path>`, `--env-file <path>` (check), `--out <path>` (example).

## Nested groups

Group names are only for the typed object. Leaf keys are still normal env vars:

```ts
export const env = createEnv({
  server: {
    DATABASE_URL: s.url(),
    API_KEY: s.string(),
  },
  public: {
    APP_URL: s.url(),
  },
});

env.server.DATABASE_URL; // from process.env.DATABASE_URL
env.public.APP_URL;
```

Flat schemas keep working. You can mix flat keys and groups in one schema.

## Schema (full)

Use built-in `s` (zero extra packages) or pass Zod, Valibot, or ArkType schemas.

Zod, Valibot, and ArkType are optional. Install only the schema library you use:

```bash
npm install zod
# or
npm install valibot
# or
npm install arktype
```

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
| `s.duration()` | `"30s"`, `"5m"`, `"1h"`, `"1500"` | `number` (ms) |
| `s.bytes()` | `"10mb"`, `"1gb"`, `"512"` | `number` (bytes) |

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

### Zod, Valibot, and ArkType (optional)

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

Valibot and ArkType schemas work the same way:

```ts
import * as v from "valibot";
import { type } from "arktype";
import { loadEnv } from "tiny-typed-env";

const env = loadEnv({
  API_KEY: v.string(),
  PORT: type("string.numeric.parse"),
}, { runtimeEnv: process.env });
```

All external schemas must support synchronous Standard Schema validation.

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

### Skip validation (Docker / CI image builds)

When the image build has no real secrets yet:

```ts
export const env = createEnv(schema, {
  skipValidation: process.env.CI === "true",
});
```

`skipValidation: true` returns the runtime env cast to the typed shape without checking.

### Generate `.env.example`

```ts
import { exampleEnv, s } from "tiny-typed-env";

const schema = {
  DATABASE_URL: s.url(),
  PORT: s.port({ default: 3000 }),
  API_KEY: s.string(),
};

exampleEnv(schema);
// DATABASE_URL=
// PORT=
// API_KEY=
```

Also accepts a string list: `exampleEnv(["DATABASE_URL", "PORT"])`.

See the repo’s [`.env.example`](./.env.example) for a documented template.

### Secret redaction

Boot errors for keys matching `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `*_KEY`, and similar **never print the secret value**—only the failure reason (e.g. `Required`, `Must be at least 8 characters`).

### Duration and bytes

```ts
export const env = createEnv({
  TIMEOUT: s.duration({ default: "30s" }), // 30000
  MAX_UPLOAD: s.bytes({ default: "10mb" }), // 10485760
});
```

