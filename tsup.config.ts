import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/node.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: false,
    minify: true,
    target: "node18",
    treeshake: true,
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: false,
    minify: true,
    target: "node18",
    treeshake: true,
    external: ["jiti"],
  },
]);
