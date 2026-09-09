# tiny-typed-env — Version Plan

> **`process.env.FOO` is a string or a crash. tiny-typed-env is a typed object that fails at boot.**

Author: **Muzammal Safdar**

```
process.env              tiny-typed-env
     ↓                         ↓
  string | undefined      env.PORT          // number
  silent missing key      env.DATABASE_URL  // string (or process exits)
  "true" is a string      env.DEBUG         // boolean
```

**No Zod required. No silent undefined. No guessing types.**

---

## Product Direction

The developer experience we're building toward:

```ts
import { createEnv, s } from "tiny-typed-env/node";

export const env = createEnv({
  DATABASE_URL: s.url(),
  PORT: s.port({ default: 3000 }),
  NODE_ENV: s.enum(["development", "test", "production"], {
    default: "development",
  }),
});

env.PORT; // number
```

Then:

```bash
npx tiny-typed-env check
npx tiny-typed-env example
```

---

## Architecture Principles

Core stays **runtime-agnostic**. File loading lives in a subpath — never in core.

```
              tiny-typed-env (core)
                 loadEnv / s.*
                      │
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
      Node          Bun         Workers
        │
        ↓
 tiny-typed-env/node   ← .env files, createEnv()
```

Optional later (demand-driven):

```
tiny-typed-env/cli      ← check + generate .env.example
tiny-typed-env/next     ← only if demand
tiny-typed-env/vite     ← only if demand
```

**Not spending early time on:** Next.js adapters, secret managers, UI dashboards, Zod-only APIs.

---

## Three Core Concepts

| Concept | Purpose | Example |
|---------|---------|---------|
| **Schema** | Declare every env key and its type | `{ PORT: s.port(), DATABASE_URL: s.url() }` |
| **Load** | Parse once at boot, then freeze | `loadEnv(schema)` / `createEnv(schema)` |
| **Fail** | Missing or invalid keys stop the process | `EnvError` listing every bad key |

---

## Roadmap

| Phase | Focus | Status | Target |
|-------|-------|--------|--------|
| 1 | Core loader + built-in schemas + Standard Schema | ✅ | **v1.0** |
| 2 | `.env` file loading (Node/Bun) | ✅ | **v1.0** |
| 3 | Safer errors, example file helper, more tests | Planned | **v1.1** |
| 4 | CLI (`check`, `example`) | ✅ | **v2.0** |
| 5 | Nested groups + secret masking in logs | ✅ | **v2.1–2.2** |
| 5b | `s.duration()` / `s.bytes()` | ✅ | **v2.2** |
| 6 | Framework adapters (Next, Vite) | Later | **v3.0** |

---

## Version 1.0 — Core (this release)

**Status:** ✅ Shipped as `1.0.0`  
**Author:** Muzammal Safdar

This is the first public package. It does one job: **validate environment variables at boot and give you typed values.**

### What version 1 is

- Built-in schema helpers (`s.string`, `s.number`, `s.boolean`, `s.enum`, `s.url`, `s.email`, `s.port`, `s.json`, `s.csv`)
- No required dependencies (Zod is optional)
- Works with Zod / Valibot / ArkType through Standard Schema
- `loadEnv(schema)` throws `EnvError` with **every** bad key, not just the first
- `safeLoadEnv(schema)` returns `{ ok: true, data }` or `{ ok: false, error }` (no throw)
- Empty strings count as missing (`PORT=""` fails the same as unset)
- Defaults and `optional: true` on every helper
- Dual ESM + CJS build with TypeScript types
- Node 18+, Bun, Deno, Cloudflare Workers (core entry has **no `fs`**)

### Node helper (`tiny-typed-env/node`)

- `createEnv(schema)` loads `.env` then validates
- Reads `.env`, `.env.local`, `.env.[NODE_ENV]`, `.env.[NODE_ENV].local`
- Does **not** overwrite variables that are already in the real environment
- `loadEnvFile(".env")` if you want files only
- `{ envFile: false }` to skip files

### What version 1 is **not**

- No CLI
- No Next.js / Vite plugin
- No client vs server split (everything is one schema)
- No remote secret stores (Doppler, Vault, AWS)
- No nested `server: { ... }` / `client: { ... }` objects

### API (v1)

```ts
import { createEnv, s } from "tiny-typed-env/node";
import { loadEnv, safeLoadEnv } from "tiny-typed-env";

createEnv(schema)                 // Node/Bun: load .env + validate
loadEnv(schema, { runtimeEnv })   // any runtime: validate only
safeLoadEnv(schema, { runtimeEnv })
parseEnvFile(text)
exampleEnv(["DATABASE_URL", "PORT"])
```

### Schema helpers (v1)

| Helper | Coerces | Output |
|--------|---------|--------|
| `s.string({ min, max, pattern, optional, default })` | — | `string` |
| `s.number({ int, min, max, optional, default })` | `"42"` → `42` | `number` |
| `s.boolean({ optional, default })` | `true/1/yes/on` | `boolean` |
| `s.enum(["a", "b"], { optional, default })` | — | `"a" \| "b"` |
| `s.url({ optional, default })` | — | `string` |
| `s.email({ optional, default })` | — | `string` |
| `s.port({ optional, default })` | `"3000"` → `3000` | `number` (1–65535) |
| `s.json<T>({ optional, default })` | JSON parse | `T` |
| `s.csv({ optional, default })` | `a, b` → `["a","b"]` | `string[]` |
| `s.duration({ optional, default, min, max })` | `"30s"` → `30000` | `number` (ms) |
| `s.bytes({ optional, default, min, max })` | `"10mb"` → `10485760` | `number` |

---

## Version 1.1 — Trust polish

**Status:** Shipped (`1.1.0`)  
**Does not break v1**

Small fixes people hit after the first install.

- `exampleEnv(schema)` from the schema object (not just a string list)
- Redact secret-looking keys in error output (`API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`)
- `skipValidation` flag for Docker/CI image builds that do not have real env yet
- Documented `.env.example` file in the repo
- Extra tests: Zod interop, `.env` override rules, Windows paths

---

## Version 2.0 — CLI and safer DX

**Status:** CLI + nested groups + secret masking + duration/bytes shipped (`2.2.0`)

Version 2 is for people who already use v1 and want tooling around the schema.

### CLI ✅

Export `schema` from `env.ts` / `src/env.ts` (or pass `--schema`).

```bash
npx tiny-typed-env check              # validate current env, exit 1 on failure
npx tiny-typed-env example            # write .env.example from schema
npx tiny-typed-env example --print    # print to stdout
```

`example` sets `TINY_TYPED_ENV_SKIP_VALIDATION=1` so `createEnv(schema)` in the same file does not fail when secrets are missing.

### Nested groups ✅

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

env.server.DATABASE_URL;
env.public.APP_URL;
```

v1 flat schemas keep working. Groups are extra. Leaf keys must be unique across groups.

### Secret masking ✅

Failed boot logs show `API_KEY: Required` — never the actual secret value. Keys matching `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `*_KEY`, and similar are redacted.

### `s.duration()` / `s.bytes()` ✅

```ts
TIMEOUT: s.duration({ default: "30s" })  // 30000
MAX_UPLOAD: s.bytes({ default: "10mb" }) // 10485760
```

---

## Version 3.0 — Adapters (later, demand only)

**Status:** Later  
**Do not build until v1 is published and used**

- `tiny-typed-env/next` — Next.js `NEXT_PUBLIC_*` prefix check
- `tiny-typed-env/vite` — `VITE_*` prefix check
- Optional load from a secret manager (only if people ask)

---

## Compatibility promise

| From | To | Promise |
|------|----|---------|
| v1.0 → v1.x | Additive | Existing `s.*` and `loadEnv` keep working |
| v1 → v2 | Additive where possible | Flat schema still valid; CLI is new |
| v2 → v3 | Adapters only | Core API stays |

If a change would break existing `createEnv({ PORT: s.port() })` code, it waits for a major version and is listed here first.

---

## Current package

| Field | Value |
|-------|-------|
| Name | `tiny-typed-env` |
| Version | `2.3.0` (Version 2.3 — faster/smaller) |
| Author | Muzammal Safdar |
| License | MIT |
| Node | >= 18 |
