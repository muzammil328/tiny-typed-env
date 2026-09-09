import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv, s } from "../dist/index.js";

/** Feature: frozen env after load. */
describe("freeze", () => {
  it("freezes the env object so callers cannot mutate it", () => {
    const env = loadEnv(
      {
        PORT: s.port({ default: 3000 }),
        server: { API_KEY: s.string() },
      },
      { runtimeEnv: { API_KEY: "secret" } },
    );

    assert.ok(Object.isFrozen(env));
    assert.ok(Object.isFrozen(env.server));
    assert.throws(() => {
      env.PORT = 1;
    });
    assert.throws(() => {
      env.server.API_KEY = "mutated";
    });
    assert.equal(env.PORT, 3000);
    assert.equal(env.server.API_KEY, "secret");
  });
});
