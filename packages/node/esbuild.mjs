import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyFileSync, mkdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

// Copy chat-a11y.js from browser package into media/ for the VS Code patcher
const browserDir = path.join(__dirname, "..", "browser");
mkdirSync(path.join(__dirname, "media"), { recursive: true });
copyFileSync(
  path.join(browserDir, "chat-a11y.js"),
  path.join(__dirname, "media", "chat-a11y.js")
);

const ctx = await esbuild.context({
  entryPoints: [path.join(__dirname, "src/vscode/extension.ts")],
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
