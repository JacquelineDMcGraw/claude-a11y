#!/usr/bin/env node
/**
 * Temporarily overrides the "files" field in package.json to exclude
 * VS Code extension artifacts before npm pack/publish, then restores
 * the original on postpack. This lets npm consumers get a slim package
 * (~35 KB) while vsce still sees the full file set.
 *
 * Usage: called automatically via npm lifecycle hooks (prepack/postpack).
 */
const fs = require("node:fs");
const path = require("node:path");

const pkgPath = path.join(__dirname, "..", "package.json");
const backupPath = pkgPath + ".bak";
const mode = process.argv[2]; // "pre" or "post"

const SLIM_FILES = [
  "dist/core/",
  "dist/cli/",
  "bin/",
  "LICENSE",
  "README.md",
];

if (mode === "pre") {
  const raw = fs.readFileSync(pkgPath, "utf-8");
  fs.writeFileSync(backupPath, raw, "utf-8");

  const pkg = JSON.parse(raw);
  pkg.files = SLIM_FILES;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log("[slim-pack] pre: files narrowed to", SLIM_FILES.join(", "));
} else if (mode === "post") {
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, pkgPath);
    fs.unlinkSync(backupPath);
    console.log("[slim-pack] post: package.json restored");
  }
} else {
  console.error("Usage: slim-pack.js [pre|post]");
  process.exit(1);
}
