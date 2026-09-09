import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadEnv,
  parseBytes,
  parseDuration,
  s,
  safeLoadEnv,
} from "../dist/index.js";

/** Feature: s.duration() / s.bytes(). */
describe("duration", () => {
  it("parses units into milliseconds", () => {
    assert.equal(parseDuration("30s"), 30_000);
    assert.equal(parseDuration("5m"), 300_000);
    assert.equal(parseDuration("1h"), 3_600_000);
    assert.equal(parseDuration("1d"), 86_400_000);
    assert.equal(parseDuration("1500"), 1500);

    const env = loadEnv(
      {
        TIMEOUT: s.duration({ default: "30s" }),
        SHORT: s.duration(),
      },
      { runtimeEnv: { SHORT: "5m" } },
    );
    assert.equal(env.TIMEOUT, 30_000);
    assert.equal(env.SHORT, 300_000);

    assert.equal(
      safeLoadEnv(
        { TIMEOUT: s.duration() },
        { runtimeEnv: { TIMEOUT: "soon" } },
      ).ok,
      false,
    );
    assert.throws(() => s.duration({ default: "soon" }), /Invalid duration/);
  });
});

describe("bytes", () => {
  it("parses size strings into byte counts", () => {
    assert.equal(parseBytes("10mb"), 10 * 1024 * 1024);
    assert.equal(parseBytes("1gb"), 1024 ** 3);
    assert.equal(parseBytes("2kib"), 2048);

    const env = loadEnv(
      {
        MAX_UPLOAD: s.bytes({ default: "10mb" }),
        CACHE: s.bytes(),
      },
      { runtimeEnv: { CACHE: "1gb" } },
    );
    assert.equal(env.MAX_UPLOAD, 10 * 1024 * 1024);
    assert.equal(env.CACHE, 1024 ** 3);

    assert.equal(
      safeLoadEnv(
        { MAX_UPLOAD: s.bytes() },
        { runtimeEnv: { MAX_UPLOAD: "big" } },
      ).ok,
      false,
    );
    assert.throws(() => s.bytes({ default: "huge" }), /Invalid bytes/);
  });
});
