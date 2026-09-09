import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCli } from "../dist/cli.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const nodeEntry = pathToFileURL(join(pkgRoot, "dist", "node.js")).href;

function writeSchema(dir, body) {
  const file = join(dir, "env.mjs");
  writeFileSync(file, body, "utf8");
  return file;
}

describe("CLI", () => {
  let cwd;
  let prevCwd;
  let logs;
  let errors;

  before(() => {
    prevCwd = process.cwd();
  });

  after(() => {
    process.chdir(prevCwd);
  });

  function setup() {
    cwd = mkdtempSync(join(tmpdir(), "tte-cli-"));
    process.chdir(cwd);
    logs = [];
    errors = [];
    console.log = (...args) => {
      logs.push(args.map(String).join(" "));
    };
    console.error = (...args) => {
      errors.push(args.map(String).join(" "));
    };
  }

  function cleanup(realLog, realError) {
    console.log = realLog;
    console.error = realError;
    process.chdir(prevCwd);
    rmSync(cwd, { recursive: true, force: true });
    delete process.env.TINY_TYPED_ENV_SKIP_VALIDATION;
    delete process.env.DATABASE_URL;
    delete process.env.PORT;
  }

  it("check passes with valid env", async () => {
    const realLog = console.log;
    const realError = console.error;
    setup();
    try {
      writeSchema(
        cwd,
        `
import { s } from ${JSON.stringify(nodeEntry)};
export const schema = {
  DATABASE_URL: s.url(),
  PORT: s.port({ default: 3000 }),
};
`,
      );
      writeFileSync(join(cwd, ".env"), "DATABASE_URL=https://db.example.com\n");
      const code = await runCli(["node", "cli", "check", "--schema", "env.mjs"]);
      assert.equal(code, 0);
      assert.match(logs.join("\n"), /OK/);
    } finally {
      cleanup(realLog, realError);
    }
  });

  it("check fails with missing required env", async () => {
    const realLog = console.log;
    const realError = console.error;
    setup();
    try {
      writeSchema(
        cwd,
        `
import { s } from ${JSON.stringify(nodeEntry)};
export const schema = {
  DATABASE_URL: s.url(),
};
`,
      );
      const code = await runCli(["node", "cli", "check", "--schema", "env.mjs"]);
      assert.equal(code, 1);
      assert.match(errors.join("\n"), /DATABASE_URL/);
    } finally {
      cleanup(realLog, realError);
    }
  });

  it("example --print writes keys to stdout", async () => {
    const realLog = console.log;
    const realError = console.error;
    const chunks = [];
    const realWrite = process.stdout.write.bind(process.stdout);
    setup();
    process.stdout.write = (chunk, ...rest) => {
      chunks.push(String(chunk));
      return true;
    };
    try {
      writeSchema(
        cwd,
        `
import { s } from ${JSON.stringify(nodeEntry)};
export const schema = {
  DATABASE_URL: s.url(),
  PORT: s.port({ default: 3000 }),
};
`,
      );
      const code = await runCli([
        "node",
        "cli",
        "example",
        "--schema",
        "env.mjs",
        "--print",
      ]);
      assert.equal(code, 0);
      assert.equal(chunks.join(""), "DATABASE_URL=\nPORT=\n");
    } finally {
      process.stdout.write = realWrite;
      cleanup(realLog, realError);
    }
  });

  it("example writes .env.example file", async () => {
    const realLog = console.log;
    const realError = console.error;
    setup();
    try {
      writeSchema(
        cwd,
        `
import { s } from ${JSON.stringify(nodeEntry)};
export const schema = {
  API_KEY: s.string(),
  DEBUG: s.boolean({ default: false }),
};
`,
      );
      const code = await runCli([
        "node",
        "cli",
        "example",
        "--schema",
        "env.mjs",
        "--out",
        ".env.example",
      ]);
      assert.equal(code, 0);
      assert.equal(
        readFileSync(join(cwd, ".env.example"), "utf8"),
        "API_KEY=\nDEBUG=\n",
      );
      assert.match(logs.join("\n"), /\.env\.example/);
    } finally {
      cleanup(realLog, realError);
    }
  });

  it("example skips createEnv validation via CLI flag", async () => {
    const realLog = console.log;
    const realError = console.error;
    const chunks = [];
    const realWrite = process.stdout.write.bind(process.stdout);
    setup();
    process.stdout.write = (chunk) => {
      chunks.push(String(chunk));
      return true;
    };
    try {
      writeSchema(
        cwd,
        `
import { createEnv, s } from ${JSON.stringify(nodeEntry)};
export const schema = {
  DATABASE_URL: s.url(),
};
export const env = createEnv(schema, { envFile: false });
`,
      );
      const code = await runCli([
        "node",
        "cli",
        "example",
        "--schema",
        "env.mjs",
        "--print",
      ]);
      assert.equal(code, 0);
      assert.equal(chunks.join(""), "DATABASE_URL=\n");
    } finally {
      process.stdout.write = realWrite;
      cleanup(realLog, realError);
    }
  });

  it("auto-discovers src/env.mjs", async () => {
    const realLog = console.log;
    const realError = console.error;
    setup();
    try {
      mkdirSync(join(cwd, "src"));
      writeFileSync(
        join(cwd, "src", "env.mjs"),
        `
import { s } from ${JSON.stringify(nodeEntry)};
export const schema = {
  PORT: s.port({ default: 3000 }),
};
`,
        "utf8",
      );
      const code = await runCli(["node", "cli", "check"]);
      assert.equal(code, 0);
    } finally {
      cleanup(realLog, realError);
    }
  });
});
