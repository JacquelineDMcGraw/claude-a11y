import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: [path.join(__dirname, "src/extension.ts")],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  outfile: path.join(__dirname, "dist/extension.js"),
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  mainFields: ["module", "main"],
  conditions: ["import", "node"],
  logLevel: "info",
  absWorkingDir: __dirname,
});

if (watch) {
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
