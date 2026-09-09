import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EnvError,
  formatIssues,
  isSecretKey,
  loadEnv,
  redactIssueMessage,
  s,
  safeLoadEnv,
} from "../dist/index.js";

/** Feature: secret masking in boot errors. */
describe("secret masking", () => {
  it("never prints secret values — only the failure reason", () => {
    assert.equal(isSecretKey("API_KEY"), true);
    assert.equal(isSecretKey("STRIPE_KEY"), true);
    assert.equal(isSecretKey("JWT_SECRET"), true);
    assert.equal(isSecretKey("DATABASE_URL"), false);

    const secret = "super-secret-value-xyz";
    const msg = redactIssueMessage(
      "API_KEY",
      `Invalid input: received "${secret}"`,
    );
    assert.equal(msg.includes(secret), false);
    assert.match(msg, /\[redacted\]/);

    assert.equal(
      redactIssueMessage("DATABASE_URL", 'Expected URL, received "oops"'),
      'Expected URL, received "oops"',
    );

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
      assert.match(error.message, /Must be at least 64 characters/);
    }

    const missing = safeLoadEnv({ STRIPE_KEY: s.string() }, { runtimeEnv: {} });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.error.issues[0]?.message, "Required");
    }
  });
});
