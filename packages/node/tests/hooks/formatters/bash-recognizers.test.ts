import { describe, it, expect } from "vitest";
import { findRecognizer } from "../../../src/hooks/formatters/bash-recognizers/index.js";
import { gitStatusRecognizer } from "../../../src/hooks/formatters/bash-recognizers/git-status.js";
import { gitDiffRecognizer } from "../../../src/hooks/formatters/bash-recognizers/git-diff.js";
import { npmTestRecognizer } from "../../../src/hooks/formatters/bash-recognizers/npm-test.js";
import { npmInstallRecognizer } from "../../../src/hooks/formatters/bash-recognizers/npm-install.js";

describe("findRecognizer", () => {
  it("finds git status recognizer", () => {
    expect(findRecognizer("git status").id).toBe("git-status");
  });

  it("finds git diff recognizer", () => {
    expect(findRecognizer("git diff HEAD").id).toBe("git-diff");
  });

  it("finds npm test recognizer", () => {
    expect(findRecognizer("npm test").id).toBe("npm-test");
  });

  it("finds npx vitest recognizer", () => {
    expect(findRecognizer("npx vitest run").id).toBe("npm-test");
  });

  it("finds npm install recognizer", () => {
    expect(findRecognizer("npm install lodash").id).toBe("npm-install");
  });

  it("falls back to generic for unknown commands", () => {
    expect(findRecognizer("echo hello").id).toBe("generic");
  });
});

describe("gitStatusRecognizer", () => {
  it("parses short-format status with modified/untracked files", () => {
    const result = gitStatusRecognizer.summarize(
      "git status -s",
      0,
      " M src/index.ts\n M src/app.ts\n?? new-file.ts\n",
    );
    expect(result.contextText).toContain("2 modified");
    expect(result.contextText).toContain("1 untracked");
    expect(result.ttsText).toContain("2 modified");
  });

  it("reports clean status", () => {
    const result = gitStatusRecognizer.summarize("git status", 0, "");
    expect(result.contextText).toContain("clean");
    expect(result.ttsText).toContain("clean");
  });

  it("handles verbose status output", () => {
    const result = gitStatusRecognizer.summarize(
      "git status",
      0,
      "On branch main\nChanges not staged for commit:\n  modified: file.ts\n\nUntracked files:\n  newfile.ts\n",
    );
    expect(result.ttsText).toContain("Git status:");
  });

  it("handles failure", () => {
    const result = gitStatusRecognizer.summarize("git status", 128, "fatal: not a git repository");
    expect(result.ttsText).toContain("failed");
  });
});

describe("gitDiffRecognizer", () => {
  it("parses diff stat summary", () => {
    const result = gitDiffRecognizer.summarize(
      "git diff --stat",
      0,
      " src/index.ts | 5 +++--\n src/app.ts   | 3 ++-\n 2 files changed, 5 insertions(+), 3 deletions(-)\n",
    );
    expect(result.contextText).toContain("2 files changed");
    expect(result.contextText).toContain("+5 -3");
    expect(result.ttsText).toContain("5 added");
    expect(result.ttsText).toContain("3 removed");
  });

  it("handles no differences", () => {
    const result = gitDiffRecognizer.summarize("git diff", 0, "");
    expect(result.contextText).toContain("No differences");
    expect(result.ttsText).toContain("no differences");
  });

  it("counts raw diff lines when no stats", () => {
    const result = gitDiffRecognizer.summarize(
      "git diff",
      0,
      "--- a/file.ts\n+++ b/file.ts\n+added line\n-removed line\n",
    );
    expect(result.contextText).toContain("+1 -1");
  });
});

describe("npmTestRecognizer", () => {
  it("parses vitest output", () => {
    const result = npmTestRecognizer.summarize(
      "npx vitest run",
      0,
      "Test Files  17 passed (17)\n Tests  191 passed (191)\n",
    );
    expect(result.contextText).toContain("191 passed");
    expect(result.ttsText).toContain("All 191 tests passed");
  });

  it("parses vitest output with failures", () => {
    const result = npmTestRecognizer.summarize(
      "npm test",
      1,
      "Tests  3 failed | 10 passed | 1 skipped\n",
    );
    expect(result.contextText).toContain("3 failed");
    expect(result.contextText).toContain("10 passed");
    expect(result.contextText).toContain("1 skipped");
    expect(result.ttsText).toContain("3 failed");
  });

  it("handles unparseable test output", () => {
    const result = npmTestRecognizer.summarize("npm test", 0, "some unknown output\n");
    expect(result.ttsText).toContain("Tests passed");
  });

  it("matches yarn test", () => {
    expect(npmTestRecognizer.matches("yarn test")).toBe(true);
  });

  it("matches pnpm test", () => {
    expect(npmTestRecognizer.matches("pnpm test")).toBe(true);
  });
});

describe("npmInstallRecognizer", () => {
  it("parses npm install output", () => {
    const result = npmInstallRecognizer.summarize(
      "npm install lodash",
      0,
      "added 1 package in 2s\n",
    );
    expect(result.contextText).toContain("Installed 1 package");
    expect(result.ttsText).toContain("Installed 1 package");
  });

  it("parses multiple packages", () => {
    const result = npmInstallRecognizer.summarize(
      "npm install",
      0,
      "added 152 packages in 10s\n",
    );
    expect(result.contextText).toContain("152 packages");
  });

  it("handles install failure", () => {
    const result = npmInstallRecognizer.summarize("npm install bad-pkg", 1, "ERR! 404\n");
    expect(result.ttsText).toContain("failed");
  });

  it("matches yarn add", () => {
    expect(npmInstallRecognizer.matches("yarn add lodash")).toBe(true);
  });

  it("matches pnpm add", () => {
    expect(npmInstallRecognizer.matches("pnpm add lodash")).toBe(true);
  });

  it("matches npm i shorthand", () => {
    expect(npmInstallRecognizer.matches("npm i lodash")).toBe(true);
  });
});
