import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EnvError,
  exampleEnv,
  loadEnv,
  parseEnvFile,
  s,
  safeLoadEnv,
} from "../dist/index.js";

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
});

describe("exampleEnv", () => {
  it("prints KEY= lines", () => {
    assert.equal(exampleEnv(["A", "B"]), "A=\nB=\n");
  });
});
