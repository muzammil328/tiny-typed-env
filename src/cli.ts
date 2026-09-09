import { existsSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { exampleEnv } from "./env-file";
import { EnvError } from "./errors";
import {
  isSchemaGroup,
  isStandardSchema,
  safeLoadEnv,
  type SchemaTree,
} from "./load";
import { loadEnvFile } from "./node";

const SKIP_FLAG = "TINY_TYPED_ENV_SKIP_VALIDATION";

const SCHEMA_CANDIDATES = [
  "env.ts",
  "env.mts",
  "env.mjs",
  "env.js",
  "env.cjs",
  "src/env.ts",
  "src/env.mts",
  "src/env.mjs",
  "src/env.js",
  "src/env.cjs",
];

type Command = "check" | "example" | "help";

type ParsedArgs = {
  command: Command;
  schema?: string;
  envFile?: string;
  out: string;
  print: boolean;
};

function printHelp(): void {
  console.log(`Usage:
  tiny-typed-env check [--schema <path>] [--env-file <path>]
  tiny-typed-env example [--schema <path>] [--print] [--out <path>]
  tiny-typed-env help

Commands:
  check     Validate current env against your schema (exit 1 on failure)
  example   Write .env.example from your schema keys

Options:
  --schema <path>    Schema module (default: env.ts, src/env.ts, …)
  --env-file <path>  Load a single .env file before check (default: .env stack)
  --print            Print example to stdout instead of writing a file
  --out <path>       Output path for example (default: .env.example)

Your module must export \`schema\`:

  import { createEnv, s } from "tiny-typed-env/node";

  export const schema = {
    DATABASE_URL: s.url(),
    PORT: s.port({ default: 3000 }),
  };

  export const env = createEnv(schema);
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let command: Command | undefined;
  let schema: string | undefined;
  let envFile: string | undefined;
  let out = ".env.example";
  let print = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }
    if (arg === "--print") {
      print = true;
      continue;
    }
    if (arg === "--schema" || arg === "--env-file" || arg === "--out") {
      const value = args[++i];
      if (!value || value.startsWith("-")) {
        throw new Error(`Missing value for ${arg}`);
      }
      if (arg === "--schema") schema = value;
      else if (arg === "--env-file") envFile = value;
      else out = value;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!command) {
      if (arg === "check" || arg === "example" || arg === "help") {
        command = arg;
        continue;
      }
      throw new Error(`Unknown command: ${arg}`);
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (help || !command) {
    return { command: "help", out, print, schema, envFile };
  }

  return { command, schema, envFile, out, print };
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function findSchemaPath(explicit?: string): string {
  if (explicit) {
    const full = resolvePath(explicit);
    if (!existsSync(full)) {
      throw new Error(`Schema file not found: ${full}`);
    }
    return full;
  }

  for (const candidate of SCHEMA_CANDIDATES) {
    const full = resolve(process.cwd(), candidate);
    if (existsSync(full)) return full;
  }

  throw new Error(
    `No schema module found. Create env.ts (or pass --schema).\n\nTried:\n${SCHEMA_CANDIDATES.map((c) => `  ${c}`).join("\n")}`,
  );
}

function isSchemaTree(value: unknown): value is SchemaTree {
  if (!isSchemaGroup(value)) return false;
  const entries = Object.values(value);
  if (entries.length === 0) return false;
  return entries.every(
    (field) => isStandardSchema(field) || isSchemaTree(field),
  );
}

function countLeafKeys(schema: SchemaTree): number {
  let count = 0;
  for (const field of Object.values(schema)) {
    if (isStandardSchema(field)) count += 1;
    else if (isSchemaGroup(field)) count += countLeafKeys(field);
  }
  return count;
}

async function loadSchemaModule(schemaPath: string): Promise<SchemaTree> {
  const mod = await importSchemaFile(schemaPath);

  if (isSchemaTree(mod.schema)) return mod.schema;
  if (isSchemaTree(mod.default)) return mod.default;

  throw new Error(
    `Schema module must export \`schema\` (or default) as a tiny-typed-env / Standard Schema map.\n\nFile: ${schemaPath}`,
  );
}

function isTypeScriptSchema(schemaPath: string): boolean {
  return /\.[cm]?tsx?$/i.test(schemaPath);
}

async function importSchemaFile(
  schemaPath: string,
): Promise<Record<string, unknown>> {
  // Fast path: plain JS — no jiti
  if (!isTypeScriptSchema(schemaPath)) {
    return (await import(pathToFileURL(schemaPath).href)) as Record<
      string,
      unknown
    >;
  }

  // TypeScript: load jiti only when needed
  let createJiti: typeof import("jiti").createJiti;
  try {
    ({ createJiti } = await import("jiti"));
  } catch {
    throw new Error(
      `Cannot load TypeScript schema (${schemaPath}).\n` +
        `Install jiti (npm i -D jiti) or pass a .mjs/.js schema with --schema.`,
    );
  }

  const jiti = createJiti(import.meta.url, { interopDefault: true });
  return (await jiti.import(schemaPath)) as Record<string, unknown>;
}

function loadRuntimeEnv(envFile?: string): void {
  if (typeof envFile === "string") {
    loadEnvFile(envFile, { override: false });
    return;
  }

  const mode = process.env.NODE_ENV;
  const files = [".env", ".env.local"];
  if (mode) {
    files.push(`.env.${mode}`, `.env.${mode}.local`);
  }
  for (const file of files) {
    loadEnvFile(file, { override: false });
  }
}

async function runCheck(args: ParsedArgs): Promise<number> {
  const schemaPath = findSchemaPath(args.schema);
  loadRuntimeEnv(args.envFile);
  const schema = await loadSchemaModule(schemaPath);
  const result = safeLoadEnv(schema, { runtimeEnv: process.env });

  if (!result.ok) {
    console.error(result.error.message);
    return 1;
  }

  const keys = countLeafKeys(schema);
  console.log(`OK — ${keys} variable${keys === 1 ? "" : "s"} valid.`);
  return 0;
}

async function runExample(args: ParsedArgs): Promise<number> {
  process.env[SKIP_FLAG] = "1";
  const schemaPath = findSchemaPath(args.schema);
  const schema = await loadSchemaModule(schemaPath);
  const body = exampleEnv(schema);

  if (args.print) {
    process.stdout.write(body);
    return 0;
  }

  const outPath = resolvePath(args.out);
  writeFileSync(outPath, body, "utf8");
  console.log(`Wrote ${outPath}`);
  return 0;
}

export async function runCli(argv = process.argv): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    printHelp();
    return 1;
  }

  if (args.command === "help") {
    printHelp();
    return 0;
  }

  try {
    if (args.command === "check") return await runCheck(args);
    return await runExample(args);
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      return 1;
    }
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}
