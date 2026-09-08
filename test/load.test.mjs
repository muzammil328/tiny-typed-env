import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  EnvError,
  exampleEnv,
  formatIssues,
  isSecretKey,
  loadEnv,
  parseEnvFile,
  redactIssueMessage,
  s,
  safeLoadEnv,
} from "../dist/index.js";
import { createEnv, loadEnvFile } from "../dist/node.js";

describe("loadEnv", () => {
  it("parses a full schema", () => {
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

  it("surfaces Zod failures as EnvError", () => {
    const result = safeLoadEnv(
      { DATABASE_URL: z.string().url() },
      { runtimeEnv: { DATABASE_URL: "nope" } },
    );
    assert.equal(result.ok, false);
  });
});

describe("secret redaction", () => {
  it("detects secret-looking keys", () => {
    assert.equal(isSecretKey("API_KEY"), true);
    assert.equal(isSecretKey("AUTH_TOKEN"), true);
    assert.equal(isSecretKey("DB_PASSWORD"), true);
    assert.equal(isSecretKey("DATABASE_URL"), false);
    assert.equal(isSecretKey("PORT"), false);
  });

  it("redacts values in secret issue messages", () => {
    const msg = redactIssueMessage(
      "API_KEY",
      `Invalid input: received "super-secret-value"`,
    );
    assert.equal(msg.includes("super-secret-value"), false);
    assert.match(msg, /\[redacted\]/);
  });

  it("keeps non-secret messages intact", () => {
    assert.equal(
      redactIssueMessage("DATABASE_URL", 'Expected URL, received "oops"'),
      'Expected URL, received "oops"',
    );
  });

  it("never prints secret values in EnvError text", () => {
    const secret = "super-secret-value-xyz";
    try {
      loadEnv(
        { API_KEY: s.string({ min: 64 }) },
        { runtimeEnv: { API_KEY: secret } },
      );
      assert.fail("expected throw");
    } catch (error) {
      assert.ok(error instanceof EnvError);
      assert.equal(error.message.includes(secret), false);
      assert.match(formatIssues(error.issues), /API_KEY:/);
    }
  });
});

describe("parseEnvFile", () => {
  it("parses quotes, export, and comments", () => {
    const parsed = parseEnvFile(`
# comment
export DATABASE_URL="https://example.com"
PORT=3000 # inline
EMPTY=
NAME='tiny'
`);
    assert.equal(parsed.DATABASE_URL, "https://example.com");
    assert.equal(parsed.PORT, "3000");
    assert.equal(parsed.EMPTY, "");
    assert.equal(parsed.NAME, "tiny");
  });

  it("parses Windows CRLF line endings", () => {
    const parsed = parseEnvFile("A=1\r\nB=2\r\n");
    assert.equal(parsed.A, "1");
    assert.equal(parsed.B, "2");
  });
});

describe("exampleEnv", () => {
  it("prints KEY= lines from a string list", () => {
    assert.equal(exampleEnv(["A", "B"]), "A=\nB=\n");
  });

  it("prints KEY= lines from a schema object", () => {
    const schema = {
      DATABASE_URL: s.url(),
      PORT: s.port({ default: 3000 }),
    };
    assert.equal(exampleEnv(schema), "DATABASE_URL=\nPORT=\n");
  });
});

describe(".env override rules", () => {
  it("does not overwrite existing process.env by default", () => {
    const dir = mkdtempSync(join(tmpdir(), "tte-"));
    const file = join(dir, ".env");
    writeFileSync(file, "OVERRIDE_TEST_KEY=from-file\n", "utf8");

    const prev = process.env.OVERRIDE_TEST_KEY;
    process.env.OVERRIDE_TEST_KEY = "from-process";
    try {
      const parsed = loadEnvFile(file);
      assert.equal(parsed.OVERRIDE_TEST_KEY, "from-file");
      assert.equal(process.env.OVERRIDE_TEST_KEY, "from-process");
    } finally {
      if (prev === undefined) delete process.env.OVERRIDE_TEST_KEY;
      else process.env.OVERRIDE_TEST_KEY = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("overwrites process.env when override is true", () => {
    const dir = mkdtempSync(join(tmpdir(), "tte-"));
    const file = join(dir, ".env");
    writeFileSync(file, "OVERRIDE_TEST_KEY=from-file\n", "utf8");

    const prev = process.env.OVERRIDE_TEST_KEY;
    process.env.OVERRIDE_TEST_KEY = "from-process";
    try {
      loadEnvFile(file, { override: true });
      assert.equal(process.env.OVERRIDE_TEST_KEY, "from-file");
    } finally {
      if (prev === undefined) delete process.env.OVERRIDE_TEST_KEY;
      else process.env.OVERRIDE_TEST_KEY = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("createEnv respects envFile: false", () => {
    const env = createEnv(
      { PORT: s.port({ default: 3000 }) },
      { envFile: false, runtimeEnv: {} },
    );
    assert.equal(env.PORT, 3000);
  });
});

describe("Windows paths", () => {
  it("loadEnvFile accepts absolute paths with platform separators", () => {
    const dir = mkdtempSync(join(tmpdir(), "tte-win-"));
    const file = join(dir, "custom.env");
    writeFileSync(file, "WIN_PATH_KEY=ok\n", "utf8");

    const prev = process.env.WIN_PATH_KEY;
    delete process.env.WIN_PATH_KEY;
    try {
      const parsed = loadEnvFile(file);
      assert.equal(parsed.WIN_PATH_KEY, "ok");
      assert.equal(process.env.WIN_PATH_KEY, "ok");
      // Path used join() so it contains platform separators (\ on Windows)
      assert.ok(file.includes("custom.env"));
    } finally {
      if (prev === undefined) delete process.env.WIN_PATH_KEY;
      else process.env.WIN_PATH_KEY = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
