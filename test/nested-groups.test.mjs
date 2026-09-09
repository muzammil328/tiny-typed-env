import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  exampleEnv,
  flattenSchemaKeys,
  loadEnv,
  s,
  safeLoadEnv,
} from "../dist/index.js";
import { createEnv } from "../dist/node.js";

/** Feature: nested groups (`env.server.*`). */
describe("nested groups", () => {
  it("maps flat process.env keys into nested typed objects", () => {
    const schema = {
      server: {
        DATABASE_URL: s.url(),
        API_KEY: s.string(),
      },
      public: {
        APP_URL: s.url(),
      },
      PORT: s.port({ default: 3000 }),
    };

    const env = loadEnv(schema, {
      runtimeEnv: {
        DATABASE_URL: "https://db.example.com",
        API_KEY: "secret",
        APP_URL: "https://app.example.com",
      },
    });

    assert.equal(env.server.DATABASE_URL, "https://db.example.com/");
    assert.equal(env.server.API_KEY, "secret");
    assert.equal(env.public.APP_URL, "https://app.example.com/");
    assert.equal(env.PORT, 3000);

    const viaCreate = createEnv(schema, {
      envFile: false,
      runtimeEnv: {
        DATABASE_URL: "https://db.example.com",
        API_KEY: "secret",
        APP_URL: "https://app.example.com",
      },
    });
    assert.equal(viaCreate.server.DATABASE_URL, "https://db.example.com/");

    assert.deepEqual(flattenSchemaKeys(schema), [
      "DATABASE_URL",
      "API_KEY",
      "APP_URL",
      "PORT",
    ]);
    assert.equal(
      exampleEnv(schema),
      "DATABASE_URL=\nAPI_KEY=\nAPP_URL=\nPORT=\n",
    );

    const dup = safeLoadEnv(
      {
        server: { DATABASE_URL: s.url() },
        other: { DATABASE_URL: s.url() },
      },
      { runtimeEnv: { DATABASE_URL: "https://db.example.com" } },
    );
    assert.equal(dup.ok, false);
    if (!dup.ok) {
      assert.match(dup.error.issues[0]?.message ?? "", /Duplicate/);
    }
  });
});
