import type { StandardSchemaV1 } from "./standard-schema";

const VENDOR = "tiny-typed-env";

export type EnvSchema<Input, Output> = StandardSchemaV1<Input, Output>;

function fail(message: string): StandardSchemaV1.FailureResult {
  return { issues: [{ message }] };
}

function ok<T>(value: T): StandardSchemaV1.SuccessResult<T> {
  return { value };
}

function makeSchema<Input, Output>(
  validate: (value: unknown) => StandardSchemaV1.Result<Output>,
): EnvSchema<Input, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: VENDOR,
      validate,
      types: {
        input: undefined as Input,
        output: undefined as Output,
      },
    },
  };
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null;
}

function asString(value: unknown): string | undefined {
  if (isMissing(value)) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

type RequiredOpts = {
  optional?: false;
  default?: undefined;
};

type OptionalOpts = {
  optional: true;
  default?: undefined;
};

type DefaultOpts<T> = {
  optional?: boolean;
  default: T;
};

export type StringConstraints = {
  min?: number;
  max?: number;
  pattern?: RegExp;
};

export function string(): EnvSchema<string | undefined, string>;
export function string(
  opts: StringConstraints & OptionalOpts,
): EnvSchema<string | undefined, string | undefined>;
export function string(
  opts: StringConstraints & DefaultOpts<string>,
): EnvSchema<string | undefined, string>;
export function string(
  opts: StringConstraints & RequiredOpts,
): EnvSchema<string | undefined, string>;
export function string(
  opts: StringConstraints & { optional?: boolean; default?: string } = {},
): EnvSchema<string | undefined, string | undefined> {
  return makeSchema((value) => {
    const raw = asString(value);
    if (raw === undefined || raw === "") {
      if (opts.default !== undefined) return ok(opts.default);
      if (opts.optional) return ok(undefined);
      return fail("Required");
    }
    if (opts.min !== undefined && raw.length < opts.min) {
      return fail(`Must be at least ${opts.min} characters`);
    }
    if (opts.max !== undefined && raw.length > opts.max) {
      return fail(`Must be at most ${opts.max} characters`);
    }
    if (opts.pattern && !opts.pattern.test(raw)) {
      return fail(`Must match ${opts.pattern}`);
    }
    return ok(raw);
  });
}

export type NumberConstraints = {
  int?: boolean;
  min?: number;
  max?: number;
};

export function number(): EnvSchema<string | undefined, number>;
export function number(
  opts: NumberConstraints & OptionalOpts,
): EnvSchema<string | undefined, number | undefined>;
export function number(
  opts: NumberConstraints & DefaultOpts<number>,
): EnvSchema<string | undefined, number>;
export function number(
  opts: NumberConstraints & RequiredOpts,
): EnvSchema<string | undefined, number>;
export function number(
  opts: NumberConstraints & { optional?: boolean; default?: number } = {},
): EnvSchema<string | undefined, number | undefined> {
  return makeSchema((value) => parseNumber(value, opts));
}

function parseNumber(
  value: unknown,
  opts: NumberConstraints & { optional?: boolean; default?: number },
): StandardSchemaV1.Result<number | undefined> {
  const raw = asString(value);
  if (raw === undefined || raw === "") {
    if (opts.default !== undefined) return ok(opts.default);
    if (opts.optional) return ok(undefined);
    return fail("Required");
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return fail("Expected a number");
  if (opts.int && !Number.isInteger(n)) return fail("Expected an integer");
  if (opts.min !== undefined && n < opts.min) {
    return fail(`Must be >= ${opts.min}`);
  }
  if (opts.max !== undefined && n > opts.max) {
    return fail(`Must be <= ${opts.max}`);
  }
  return ok(n);
}

const TRUTHY = new Set(["true", "1", "yes", "on"]);
const FALSY = new Set(["false", "0", "no", "off"]);

export function boolean(): EnvSchema<string | undefined, boolean>;
export function boolean(
  opts: OptionalOpts,
): EnvSchema<string | undefined, boolean | undefined>;
export function boolean(
  opts: DefaultOpts<boolean>,
): EnvSchema<string | undefined, boolean>;
export function boolean(
  opts: RequiredOpts,
): EnvSchema<string | undefined, boolean>;
export function boolean(
  opts: { optional?: boolean; default?: boolean } = {},
): EnvSchema<string | undefined, boolean | undefined> {
  return makeSchema((value) => {
    if (typeof value === "boolean") return ok(value);
    const raw = asString(value)?.trim().toLowerCase();
    if (raw === undefined || raw === "") {
      if (opts.default !== undefined) return ok(opts.default);
      if (opts.optional) return ok(undefined);
      return fail("Required");
    }
    if (TRUTHY.has(raw)) return ok(true);
    if (FALSY.has(raw)) return ok(false);
    return fail('Expected boolean (true/false, 1/0, yes/no, on/off)');
  });
}

export function enumOf<const T extends string>(
  values: readonly T[],
): EnvSchema<string | undefined, T>;
export function enumOf<const T extends string>(
  values: readonly T[],
  opts: OptionalOpts,
): EnvSchema<string | undefined, T | undefined>;
export function enumOf<const T extends string>(
  values: readonly T[],
  opts: DefaultOpts<T>,
): EnvSchema<string | undefined, T>;
export function enumOf<const T extends string>(
  values: readonly T[],
  opts: RequiredOpts,
): EnvSchema<string | undefined, T>;
export function enumOf<const T extends string>(
  values: readonly T[],
  opts: { optional?: boolean; default?: T } = {},
): EnvSchema<string | undefined, T | undefined> {
  const allowed = new Set<string>(values);
  return makeSchema((value) => {
    const raw = asString(value);
    if (raw === undefined || raw === "") {
      if (opts.default !== undefined) return ok(opts.default);
      if (opts.optional) return ok(undefined);
      return fail("Required");
    }
    if (!allowed.has(raw)) {
      return fail(`Expected one of: ${values.join(", ")}`);
    }
    return ok(raw as T);
  });
}

const URL_PATTERN = /^https?:\/\/.+/i;

export function url(): EnvSchema<string | undefined, string>;
export function url(
  opts: OptionalOpts,
): EnvSchema<string | undefined, string | undefined>;
export function url(
  opts: DefaultOpts<string>,
): EnvSchema<string | undefined, string>;
export function url(
  opts: RequiredOpts,
): EnvSchema<string | undefined, string>;
export function url(
  opts: { optional?: boolean; default?: string } = {},
): EnvSchema<string | undefined, string | undefined> {
  return makeSchema((value) => {
    const raw = asString(value);
    if (raw === undefined || raw === "") {
      if (opts.default !== undefined) return ok(opts.default);
      if (opts.optional) return ok(undefined);
      return fail("Required");
    }
    try {
      const parsed = new URL(raw);
      if (!URL_PATTERN.test(parsed.href) && parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return fail("Expected an http(s) URL");
      }
      return ok(parsed.href);
    } catch {
      return fail("Expected a valid URL");
    }
  });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(): EnvSchema<string | undefined, string>;
export function email(
  opts: OptionalOpts,
): EnvSchema<string | undefined, string | undefined>;
export function email(
  opts: DefaultOpts<string>,
): EnvSchema<string | undefined, string>;
export function email(
  opts: RequiredOpts,
): EnvSchema<string | undefined, string>;
export function email(
  opts: { optional?: boolean; default?: string } = {},
): EnvSchema<string | undefined, string | undefined> {
  return makeSchema((value) => {
    const raw = asString(value);
    if (raw === undefined || raw === "") {
      if (opts.default !== undefined) return ok(opts.default);
      if (opts.optional) return ok(undefined);
      return fail("Required");
    }
    if (!EMAIL_PATTERN.test(raw)) return fail("Expected an email");
    return ok(raw);
  });
}

export function port(): EnvSchema<string | undefined, number>;
export function port(
  opts: OptionalOpts,
): EnvSchema<string | undefined, number | undefined>;
export function port(
  opts: DefaultOpts<number>,
): EnvSchema<string | undefined, number>;
export function port(
  opts: RequiredOpts,
): EnvSchema<string | undefined, number>;
export function port(
  opts: { optional?: boolean; default?: number } = {},
): EnvSchema<string | undefined, number | undefined> {
  return makeSchema((value) =>
    parseNumber(value, { int: true, min: 1, max: 65535, ...opts }),
  );
}

export function json<T = unknown>(): EnvSchema<string | undefined, T>;
export function json<T = unknown>(
  opts: OptionalOpts,
): EnvSchema<string | undefined, T | undefined>;
export function json<T = unknown>(
  opts: DefaultOpts<T>,
): EnvSchema<string | undefined, T>;
export function json<T = unknown>(
  opts: RequiredOpts,
): EnvSchema<string | undefined, T>;
export function json<T = unknown>(
  opts: { optional?: boolean; default?: T } = {},
): EnvSchema<string | undefined, T | undefined> {
  return makeSchema((value) => {
    const raw = asString(value);
    if (raw === undefined || raw === "") {
      if (opts.default !== undefined) return ok(opts.default);
      if (opts.optional) return ok(undefined);
      return fail("Required");
    }
    try {
      return ok(JSON.parse(raw) as T);
    } catch {
      return fail("Expected valid JSON");
    }
  });
}

export function csv(): EnvSchema<string | undefined, string[]>;
export function csv(
  opts: OptionalOpts,
): EnvSchema<string | undefined, string[] | undefined>;
export function csv(
  opts: DefaultOpts<string[]>,
): EnvSchema<string | undefined, string[]>;
export function csv(
  opts: RequiredOpts,
): EnvSchema<string | undefined, string[]>;
export function csv(
  opts: { optional?: boolean; default?: string[] } = {},
): EnvSchema<string | undefined, string[] | undefined> {
  return makeSchema((value) => {
    const raw = asString(value);
    if (raw === undefined || raw === "") {
      if (opts.default !== undefined) return ok(opts.default);
      if (opts.optional) return ok(undefined);
      return fail("Required");
    }
    return ok(
      raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );
  });
}

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const DURATION_RE = /^(-?\d+(?:\.\d+)?)(ms|s|m|h|d)?$/i;

/** Parse `"30s"`, `"5m"`, `"1h"`, or a bare number (ms) into milliseconds. */
export function parseDuration(raw: string | number): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : undefined;
  }
  const match = raw.trim().match(DURATION_RE);
  if (!match?.[1]) return undefined;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return undefined;
  const unit = (match[2] ?? "ms").toLowerCase();
  const mult = DURATION_UNITS[unit];
  if (mult === undefined) return undefined;
  return n * mult;
}

export type DurationConstraints = {
  min?: number;
  max?: number;
};

export function duration(): EnvSchema<string | undefined, number>;
export function duration(
  opts: DurationConstraints & OptionalOpts,
): EnvSchema<string | undefined, number | undefined>;
export function duration(
  opts: DurationConstraints & DefaultOpts<string | number>,
): EnvSchema<string | undefined, number>;
export function duration(
  opts: DurationConstraints & RequiredOpts,
): EnvSchema<string | undefined, number>;
export function duration(
  opts: DurationConstraints & {
    optional?: boolean;
    default?: string | number;
  } = {},
): EnvSchema<string | undefined, number | undefined> {
  const defaultMs =
    opts.default === undefined ? undefined : parseDuration(opts.default);
  if (opts.default !== undefined && defaultMs === undefined) {
    throw new TypeError(`Invalid duration default: ${String(opts.default)}`);
  }

  return makeSchema((value) => {
    const raw = asString(value);
    if (raw === undefined || raw === "") {
      if (defaultMs !== undefined) return ok(defaultMs);
      if (opts.optional) return ok(undefined);
      return fail("Required");
    }
    const ms = parseDuration(raw);
    if (ms === undefined) {
      return fail('Expected duration (e.g. "30s", "5m", "1h", or ms number)');
    }
    if (opts.min !== undefined && ms < opts.min) {
      return fail(`Must be >= ${opts.min}`);
    }
    if (opts.max !== undefined && ms > opts.max) {
      return fail(`Must be <= ${opts.max}`);
    }
    return ok(ms);
  });
}

const BYTES_UNITS: Record<string, number> = {
  b: 1,
  k: 1024,
  kb: 1024,
  kib: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  gib: 1024 ** 3,
  t: 1024 ** 4,
  tb: 1024 ** 4,
  tib: 1024 ** 4,
};

const BYTES_RE = /^(-?\d+(?:\.\d+)?)(b|kb|kib|mb|mib|gb|gib|tb|tib|k|m|g|t)?$/i;

/** Parse `"10mb"`, `"1gb"`, or a bare number into bytes (1024-based). */
export function parseBytes(raw: string | number): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : undefined;
  }
  const match = raw.trim().match(BYTES_RE);
  if (!match?.[1]) return undefined;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return undefined;
  const unit = (match[2] ?? "b").toLowerCase();
  const mult = BYTES_UNITS[unit];
  if (mult === undefined) return undefined;
  return Math.round(n * mult);
}

export type BytesConstraints = {
  min?: number;
  max?: number;
};

export function bytes(): EnvSchema<string | undefined, number>;
export function bytes(
  opts: BytesConstraints & OptionalOpts,
): EnvSchema<string | undefined, number | undefined>;
export function bytes(
  opts: BytesConstraints & DefaultOpts<string | number>,
): EnvSchema<string | undefined, number>;
export function bytes(
  opts: BytesConstraints & RequiredOpts,
): EnvSchema<string | undefined, number>;
export function bytes(
  opts: BytesConstraints & {
    optional?: boolean;
    default?: string | number;
  } = {},
): EnvSchema<string | undefined, number | undefined> {
  const defaultBytes =
    opts.default === undefined ? undefined : parseBytes(opts.default);
  if (opts.default !== undefined && defaultBytes === undefined) {
    throw new TypeError(`Invalid bytes default: ${String(opts.default)}`);
  }

  return makeSchema((value) => {
    const raw = asString(value);
    if (raw === undefined || raw === "") {
      if (defaultBytes !== undefined) return ok(defaultBytes);
      if (opts.optional) return ok(undefined);
      return fail("Required");
    }
    const size = parseBytes(raw);
    if (size === undefined) {
      return fail('Expected bytes (e.g. "10mb", "1gb", or byte number)');
    }
    if (opts.min !== undefined && size < opts.min) {
      return fail(`Must be >= ${opts.min}`);
    }
    if (opts.max !== undefined && size > opts.max) {
      return fail(`Must be <= ${opts.max}`);
    }
    return ok(size);
  });
}

/** Built-in env schemas. No Zod required. */
export const s = {
  string,
  number,
  boolean,
  enum: enumOf,
  url,
  email,
  port,
  json,
  csv,
  duration,
  bytes,
};
