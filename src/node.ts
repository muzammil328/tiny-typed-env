import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnvFile } from "./env-file";
import { loadEnv, type LoadOptions, type SchemaTree } from "./load";

export type NodeLoadOptions = LoadOptions & {
  /**
   * Path to a .env file, or `false` to skip files.
   * Default: `.env` plus `.env.local` and `.env.[NODE_ENV]`.
   */
  envFile?: string | false;
  /** If true, .env values overwrite existing process.env keys. Default: false. */
  override?: boolean;
};

function applyParsed(
  parsed: Record<string, string>,
  override: boolean,
): void {
  for (const [key, value] of Object.entries(parsed)) {
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** Load KEY=value pairs from a .env file into `process.env`. */
export function loadEnvFile(
  filePath = ".env",
  options: { override?: boolean } = {},
): Record<string, string> {
  const full = resolve(process.cwd(), filePath);
  if (!existsSync(full)) return {};
  const parsed = parseEnvFile(readFileSync(full, "utf8"));
  applyParsed(parsed, options.override ?? false);
  return parsed;
}

function defaultEnvFiles(): string[] {
  const mode = process.env.NODE_ENV;
  const files = [".env", ".env.local"];
  if (mode) {
    files.push(`.env.${mode}`, `.env.${mode}.local`);
  }
  return files;
}

/**
 * Node/Bun helper: load `.env` files, then validate.
 *
 * ```ts
 * import { createEnv, s } from "tiny-typed-env/node";
 *
 * export const env = createEnv({
 *   server: {
 *     DATABASE_URL: s.url(),
 *     API_KEY: s.string(),
 *   },
 *   public: {
 *     APP_URL: s.url(),
 *   },
 * });
 *
 * env.server.DATABASE_URL;
 * ```
 */
export function createEnv<T extends SchemaTree>(
  schema: T,
  options: NodeLoadOptions = {},
) {
  if (options.envFile !== false) {
    const files =
      typeof options.envFile === "string"
        ? [options.envFile]
        : defaultEnvFiles();
    for (const file of files) {
      loadEnvFile(file, { override: options.override });
    }
  }

  const skipFromCli =
    process.env.TINY_TYPED_ENV_SKIP_VALIDATION === "1" ||
    process.env.TINY_TYPED_ENV_SKIP_VALIDATION === "true";

  return loadEnv(schema, {
    runtimeEnv: options.runtimeEnv ?? process.env,
    emptyAsUndefined: options.emptyAsUndefined,
    skipValidation: options.skipValidation ?? skipFromCli,
  });
}

export { exampleEnv, parseEnvFile } from "./env-file";
export { EnvError, formatIssues, isSecretKey, redactIssueMessage } from "./errors";
export { flattenSchemaKeys, loadEnv, safeLoadEnv } from "./load";
export { parseBytes, parseDuration, s } from "./schema";
export type {
  InferEnv,
  LoadOptions,
  RuntimeEnv,
  SchemaMap,
  SchemaTree,
} from "./load";
