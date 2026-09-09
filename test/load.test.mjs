import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  EnvError,
  exampleEnv,
  loadEnv,
  parseEnvFile,
  s,
  safeLoadEnv,
} from "../dist/index.js";
import { createEnv, loadEnvFile } from "../dist/node.js";

/** Core loader (v1) — flat schemas only. */
describe("loadEnv", () => {
  it("parses a full flat schema", () => {
    const env = loadEnv(
      {
        DATABASE_URL: s.url(),
        PORT: s.port({ default: 3000 }),
        DEBUG: s.boolean({ default: false }),
        NODE_ENV: s.enum(["development", "test", "production"], {
          default: "development",
        }),
        API_KEY: s.string({ min: 8 }),
        ADMIN_EMAIL: s.email({ optional: true }),
        FEATURES: s.csv({ default: [] }),
        META: s.json({ default: { ok: true } }),
      },
      {
        runtimeEnv: {
          DATABASE_URL: "https://db.example.com/app",
          API_KEY: "secretkey",
          FEATURES: "a, b, c",
        },
      },
    );

    assert.equal(env.DATABASE_URL, "https://db.example.com/app");
    assert.equal(env.PORT, 3000);
    assert.equal(env.DEBUG, false);
    assert.equal(env.NODE_ENV, "development");
    assert.equal(env.API_KEY, "secretkey");
    assert.equal(env.ADMIN_EMAIL, undefined);
    assert.deepEqual(env.FEATURES, ["a", "b", "c"]);
    assert.deepEqual(env.META, { ok: true });
  });

  it("treats empty strings as missing", () => {
    const result = safeLoadEnv(
      { DATABASE_URL: s.url() },
      { runtimeEnv: { DATABASE_URL: "" } },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.issues[0]?.key, "DATABASE_URL");
    }
  });

  it("throws EnvError with every bad key", () => {
    assert.throws(
      () =>
        loadEnv(
          {
            DATABASE_URL: s.url(),
            PORT: s.port(),
            DEBUG: s.boolean(),
          },
          {
            runtimeEnv: {
              DATABASE_URL: "not-a-url",
              PORT: "abc",
              DEBUG: "maybe",
            },
          },
        ),
      (error) => {
        assert.ok(error instanceof EnvError);
        assert.equal(error.issues.length, 3);
        return true;
      },
    );
  });

  it("coerces booleans and numbers", () => {
    const env = loadEnv(
      {
        DEBUG: s.boolean(),
        PORT: s.number({ int: true }),
      },
      { runtimeEnv: { DEBUG: "yes", PORT: "8080" } },
    );
    assert.equal(env.DEBUG, true);
    assert.equal(env.PORT, 8080);
  });

  it("skips validation when skipValidation is true", () => {
    const env = loadEnv(
      { DATABASE_URL: s.url(), API_KEY: s.string({ min: 32 }) },
      {
        skipValidation: true,
        runtimeEnv: { DATABASE_URL: "not-ready", API_KEY: "x" },
      },
    );
    assert.equal(env.DATABASE_URL, "not-ready");
    assert.equal(env.API_KEY, "x");
  });
});

describe("Zod interop", () => {
  it("loads Zod schemas via Standard Schema", () => {
    const env = loadEnv(
      {
        DATABASE_URL: z.string().url(),
        PORT: z.coerce.number().default(3000),
      },
      {
        runtimeEnv: {
          DATABASE_URL: "https://example.com",
        },
      },
    );
    assert.equal(env.DATABASE_URL, "https://example.com");
    assert.equal(env.PORT, 3000);
  });
});

describe("parseEnvFile", () => {
  it("parses quotes, export, comments, and CRLF", () => {
    const parsed = parseEnvFile(
      `# comment\r\nexport DATABASE_URL="https://example.com"\r\nPORT=3000 # inline\r\n`,
    );
    assert.equal(parsed.DATABASE_URL, "https://example.com");
    assert.equal(parsed.PORT, "3000");
  });
});

describe("exampleEnv", () => {
  it("prints KEY= lines from keys or a flat schema", () => {
    assert.equal(exampleEnv(["A", "B"]), "A=\nB=\n");
    assert.equal(
      exampleEnv({ DATABASE_URL: s.url(), PORT: s.port() }),
      "DATABASE_URL=\nPORT=\n",
    );
  });
});

describe("createEnv / .env files", () => {
  it("loads files without overwriting process.env by default", () => {
    const dir = mkdtempSync(join(tmpdir(), "tte-"));
    const file = join(dir, ".env");
    writeFileSync(file, "OVERRIDE_TEST_KEY=from-file\n", "utf8");

    const prev = process.env.OVERRIDE_TEST_KEY;
    process.env.OVERRIDE_TEST_KEY = "from-process";
    try {
      const parsed = loadEnvFile(file);
      assert.equal(parsed.OVERRIDE_TEST_KEY, "from-file");
      assert.equal(process.env.OVERRIDE_TEST_KEY, "from-process");

      loadEnvFile(file, { override: true });
      assert.equal(process.env.OVERRIDE_TEST_KEY, "from-file");

      const env = createEnv(
        { PORT: s.port({ default: 3000 }) },
        { envFile: false, runtimeEnv: {} },
      );
      assert.equal(env.PORT, 3000);
    } finally {
      if (prev === undefined) delete process.env.OVERRIDE_TEST_KEY;
      else process.env.OVERRIDE_TEST_KEY = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
