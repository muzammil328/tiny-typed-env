import { EnvError, type EnvIssue } from "./errors";
import type { StandardSchemaV1 } from "./standard-schema";

/** Flat schema: one Standard Schema per env key. */
export type SchemaMap = Record<string, StandardSchemaV1<unknown, unknown>>;

/**
 * Nested or flat schema tree.
 * Group names (`server`, `public`) are only for the typed object —
 * leaf keys are still read from `process.env` / `runtimeEnv`.
 */
export type SchemaTree = {
  [key: string]: StandardSchemaV1<unknown, unknown> | SchemaTree;
};

export type InferEnv<T extends SchemaTree> = {
  [K in keyof T]: T[K] extends StandardSchemaV1<unknown, unknown>
    ? StandardSchemaV1.InferOutput<T[K]>
    : T[K] extends SchemaTree
      ? InferEnv<T[K]>
      : never;
};

export type RuntimeEnv = Record<string, string | undefined>;

export type LoadOptions = {
  /** Values to validate. Defaults to `process.env` when available. */
  runtimeEnv?: RuntimeEnv;
  /** Treat empty strings as missing. Default: true. */
  emptyAsUndefined?: boolean;
  /**
   * Skip validation (Docker/CI image builds without real secrets yet).
   * Returns raw env values shaped like the schema. Default: false.
   */
  skipValidation?: boolean;
};

export type SafeEnv<T extends SchemaTree> =
  | { ok: true; data: InferEnv<T> }
  | { ok: false; error: EnvError };

function getProcessEnv(): RuntimeEnv {
  if (typeof process !== "undefined" && process.env) {
    return process.env as RuntimeEnv;
  }
  return {};
}

export function isStandardSchema(
  value: unknown,
): value is StandardSchemaV1<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "~standard" in value &&
    typeof (value as StandardSchemaV1)["~standard"]?.validate === "function"
  );
}

export function isSchemaGroup(
  value: unknown,
): value is SchemaTree {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !isStandardSchema(value)
  );
}

function parseValue(
  schema: StandardSchemaV1<unknown, unknown>,
  value: unknown,
): StandardSchemaV1.Result<unknown> {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new TypeError(
      "tiny-typed-env only supports sync schemas (Zod/Valibot/ArkType sync, or built-in `s`)",
    );
  }
  return result;
}

function groupPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function buildSkipped(
  schema: SchemaTree,
  runtimeEnv: RuntimeEnv,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) {
    const field = schema[key];
    if (isStandardSchema(field)) {
      data[key] = runtimeEnv[key];
    } else if (isSchemaGroup(field)) {
      data[key] = buildSkipped(field, runtimeEnv);
    }
  }
  return data;
}

function walkSchema(
  schema: SchemaTree,
  runtimeEnv: RuntimeEnv,
  emptyAsUndefined: boolean,
  issues: EnvIssue[],
  data: Record<string, unknown>,
  seen: Map<string, string>,
  path: string,
): void {
  for (const key of Object.keys(schema)) {
    const field = schema[key];
    if (!field) {
      issues.push({
        key: groupPath(path, key),
        message: "Value is not a Standard Schema (use `s.string()` or Zod)",
      });
      continue;
    }

    if (isStandardSchema(field)) {
      const where = groupPath(path, key);
      const prior = seen.get(key);
      if (prior !== undefined) {
        issues.push({
          key,
          message: `Duplicate env key (also declared at ${prior})`,
        });
        continue;
      }
      seen.set(key, where);

      let raw: unknown = runtimeEnv[key];
      if (emptyAsUndefined && raw === "") raw = undefined;

      const result = parseValue(field, raw);
      if (result.issues) {
        issues.push({
          key,
          message: result.issues.map((issue) => issue.message).join("; "),
        });
        continue;
      }
      data[key] = result.value;
      continue;
    }

    if (isSchemaGroup(field)) {
      const nested: Record<string, unknown> = {};
      walkSchema(
        field,
        runtimeEnv,
        emptyAsUndefined,
        issues,
        nested,
        seen,
        groupPath(path, key),
      );
      data[key] = nested;
      continue;
    }

    issues.push({
      key: groupPath(path, key),
      message: "Value is not a Standard Schema (use `s.string()` or Zod)",
    });
  }
}

function freezeDeep<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = freezeDeep(value[i]);
    }
    return Object.freeze(value);
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    obj[key] = freezeDeep(obj[key]);
  }
  return Object.freeze(value);
}

export function safeLoadEnv<T extends SchemaTree>(
  schema: T,
  options: LoadOptions = {},
): SafeEnv<T> {
  const runtimeEnv = options.runtimeEnv ?? getProcessEnv();

  if (options.skipValidation) {
    return {
      ok: true,
      data: freezeDeep(buildSkipped(schema, runtimeEnv)) as InferEnv<T>,
    };
  }

  const emptyAsUndefined = options.emptyAsUndefined ?? true;
  const issues: EnvIssue[] = [];
  const data: Record<string, unknown> = {};
  const seen = new Map<string, string>();

  walkSchema(schema, runtimeEnv, emptyAsUndefined, issues, data, seen, "");

  if (issues.length > 0) {
    return { ok: false, error: new EnvError(issues) };
  }

  return { ok: true, data: freezeDeep(data) as InferEnv<T> };
}

export function loadEnv<T extends SchemaTree>(
  schema: T,
  options: LoadOptions = {},
): InferEnv<T> {
  const result = safeLoadEnv(schema, options);
  if (!result.ok) throw result.error;
  return result.data;
}

/** Flatten nested schema leaf keys (env var names) in declaration order. */
export function flattenSchemaKeys(schema: SchemaTree): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  function walk(node: SchemaTree): void {
    for (const key of Object.keys(node)) {
      const field = node[key];
      if (isStandardSchema(field)) {
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      } else if (isSchemaGroup(field)) {
        walk(field);
      }
    }
  }

  walk(schema);
  return keys;
}
