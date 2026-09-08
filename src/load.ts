import { EnvError, type EnvIssue } from "./errors";
import type { StandardSchemaV1 } from "./standard-schema";

export type SchemaMap = Record<string, StandardSchemaV1<unknown, unknown>>;

export type InferEnv<T extends SchemaMap> = {
  [K in keyof T]: StandardSchemaV1.InferOutput<T[K]>;
};

export type RuntimeEnv = Record<string, string | undefined>;

export type LoadOptions = {
  /** Values to validate. Defaults to `process.env` when available. */
  runtimeEnv?: RuntimeEnv;
  /** Treat empty strings as missing. Default: true. */
  emptyAsUndefined?: boolean;
  /**
   * Skip validation (Docker/CI image builds without real secrets yet).
   * Returns `runtimeEnv` cast to the inferred env type. Default: false.
   */
  skipValidation?: boolean;
};

export type SafeEnv<T extends SchemaMap> =
  | { ok: true; data: InferEnv<T> }
  | { ok: false; error: EnvError };

function getProcessEnv(): RuntimeEnv {
  if (typeof process !== "undefined" && process.env) {
    return process.env as RuntimeEnv;
  }
  return {};
}

function isStandardSchema(
  value: unknown,
): value is StandardSchemaV1<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "~standard" in value &&
    typeof (value as StandardSchemaV1)["~standard"]?.validate === "function"
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

export function safeLoadEnv<T extends SchemaMap>(
  schema: T,
  options: LoadOptions = {},
): SafeEnv<T> {
  const runtimeEnv = options.runtimeEnv ?? getProcessEnv();

  if (options.skipValidation) {
    return { ok: true, data: runtimeEnv as InferEnv<T> };
  }

  const emptyAsUndefined = options.emptyAsUndefined ?? true;
  const issues: EnvIssue[] = [];
  const data: Record<string, unknown> = {};

  for (const key of Object.keys(schema) as Array<keyof T & string>) {
    const field = schema[key];
    if (!field || !isStandardSchema(field)) {
      issues.push({
        key,
        message: "Value is not a Standard Schema (use `s.string()` or Zod)",
      });
      continue;
    }

    let raw: unknown = runtimeEnv[key];
    if (emptyAsUndefined && raw === "") raw = undefined;

    const result = parseValue(field, raw);
    if (result.issues) {
      const message = result.issues
        .map((issue) => issue.message)
        .join("; ");
      issues.push({ key, message });
      continue;
    }
    data[key] = result.value;
  }

  if (issues.length > 0) {
    return { ok: false, error: new EnvError(issues) };
  }

  return { ok: true, data: data as InferEnv<T> };
}

export function loadEnv<T extends SchemaMap>(
  schema: T,
  options: LoadOptions = {},
): InferEnv<T> {
  const result = safeLoadEnv(schema, options);
  if (!result.ok) throw result.error;
  return result.data;
}
