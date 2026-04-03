import { describe, it, expect } from "vitest";
import { classifySignificance } from "../../../src/hooks/core/significance.js";

describe("classifySignificance", () => {
  // --- Read/Glob/Grep are always noise ---
  describe("noise tools", () => {
    it("classifies Read as noise", () => {
      const result = classifySignificance("Read", { file_path: "/foo.ts" }, { content: "x" });
      expect(result.level).toBe("noise");
    });

    it("classifies Glob as noise", () => {
      const result = classifySignificance("Glob", { pattern: "**/*.ts" }, { files: [] });
      expect(result.level).toBe("noise");
    });

    it("classifies Grep as noise", () => {
      const result = classifySignificance("Grep", { pattern: "foo" }, { matches: [] });
      expect(result.level).toBe("noise");
    });
  });

  // --- Bash classification ---
  describe("Bash", () => {
    it("classifies ls as noise", () => {
      const result = classifySignificance("Bash", { command: "ls -la" }, { exitCode: 0 });
      expect(result.level).toBe("noise");
    });

    it("classifies cat as noise", () => {
      const result = classifySignificance("Bash", { command: "cat foo.txt" }, { exitCode: 0 });
      expect(result.level).toBe("noise");
    });

    it("classifies pwd as noise", () => {
      const result = classifySignificance("Bash", { command: "pwd" }, { exitCode: 0 });
      expect(result.level).toBe("noise");
    });

    it("classifies echo as noise", () => {
      const result = classifySignificance("Bash", { command: "echo hello" }, { exitCode: 0 });
      expect(result.level).toBe("noise");
    });

    it("classifies which as noise", () => {
      const result = classifySignificance("Bash", { command: "which node" }, { exitCode: 0 });
      expect(result.level).toBe("noise");
    });

    it("classifies git log as noise", () => {
      const result = classifySignificance("Bash", { command: "git log --oneline" }, { exitCode: 0 });
      expect(result.level).toBe("noise");
    });

    it("classifies git status as noise", () => {
      const result = classifySignificance("Bash", { command: "git status" }, { exitCode: 0 });
      expect(result.level).toBe("noise");
    });

    it("classifies git diff as noise", () => {
      const result = classifySignificance("Bash", { command: "git diff HEAD" }, { exitCode: 0 });
      expect(result.level).toBe("noise");
    });

    it("classifies git branch as noise", () => {
      const result = classifySignificance("Bash", { command: "git branch -a" }, { exitCode: 0 });
      expect(result.level).toBe("noise");
    });

    it("classifies find as noise", () => {
      const result = classifySignificance("Bash", { command: "find . -name '*.ts'" }, { exitCode: 0 });
      expect(result.level).toBe("noise");
    });

    it("escalates failed cat to notable", () => {
      const result = classifySignificance("Bash", { command: "cat nonexistent" }, { exitCode: 1 });
      expect(result.level).toBe("notable");
      expect(result.reason).toBe("read-only command failed");
    });

    it("escalates failed ls to notable", () => {
      const result = classifySignificance("Bash", { command: "ls /no/such/dir" }, { exitCode: 2 });
      expect(result.level).toBe("notable");
    });

    it("escalates failed grep to notable", () => {
      const result = classifySignificance("Bash", { command: "grep pattern missing-file" }, { exitCode: 2 });
      expect(result.level).toBe("notable");
    });

    it("classifies npm test pass as routine", () => {
      const result = classifySignificance("Bash", { command: "npm test" }, { exitCode: 0 });
      expect(result.level).toBe("routine");
    });

    it("classifies npm test failure as important", () => {
      const result = classifySignificance("Bash", { command: "npm test" }, { exitCode: 1 });
      expect(result.level).toBe("important");
    });

    it("classifies vitest pass as routine", () => {
      const result = classifySignificance("Bash", { command: "npx vitest run" }, { exitCode: 0 });
      expect(result.level).toBe("routine");
    });

    it("classifies vitest failure as important", () => {
      const result = classifySignificance("Bash", { command: "npx vitest run" }, { exitCode: 1 });
      expect(result.level).toBe("important");
    });

    it("classifies jest pass as routine", () => {
      const result = classifySignificance("Bash", { command: "jest --ci" }, { exitCode: 0 });
      expect(result.level).toBe("routine");
    });

    it("classifies npm install as notable", () => {
      const result = classifySignificance("Bash", { command: "npm install lodash" }, { exitCode: 0 });
      expect(result.level).toBe("notable");
    });

    it("classifies pip install as notable", () => {
      const result = classifySignificance("Bash", { command: "pip install requests" }, { exitCode: 0 });
      expect(result.level).toBe("notable");
    });

    it("classifies yarn add as notable", () => {
      const result = classifySignificance("Bash", { command: "yarn add react" }, { exitCode: 0 });
      expect(result.level).toBe("notable");
    });

    it("classifies general command success as routine", () => {
      const result = classifySignificance("Bash", { command: "node build.js" }, { exitCode: 0 });
      expect(result.level).toBe("routine");
    });

    it("classifies general command failure as notable", () => {
      const result = classifySignificance("Bash", { command: "node build.js" }, { exitCode: 1 });
      expect(result.level).toBe("notable");
    });

    it("handles exit_code alternate key", () => {
      const result = classifySignificance("Bash", { command: "npm test" }, { exit_code: 1 });
      expect(result.level).toBe("important");
    });

    it("handles string exit code", () => {
      const result = classifySignificance("Bash", { command: "npm test" }, { exitCode: "1" });
      expect(result.level).toBe("important");
    });

    it("handles missing command gracefully", () => {
      const result = classifySignificance("Bash", {}, { exitCode: 0 });
      expect(result.level).toBe("routine");
    });
  });

  // --- Edit classification ---
  describe("Edit", () => {
    it("classifies identical edit as noise", () => {
      const result = classifySignificance("Edit", { old_string: "foo", new_string: "foo" }, {});
      expect(result.level).toBe("noise");
    });

    it("classifies whitespace-only edit as noise", () => {
      const result = classifySignificance("Edit", { old_string: "  foo  ", new_string: "foo" }, {});
      expect(result.level).toBe("noise");
    });

    it("classifies real edit as notable", () => {
      const result = classifySignificance("Edit", { old_string: "foo", new_string: "bar" }, {});
      expect(result.level).toBe("notable");
    });
  });

  // --- Write ---
  it("classifies Write as notable", () => {
    const result = classifySignificance("Write", { file_path: "/foo.ts" }, {});
    expect(result.level).toBe("notable");
  });

  // --- WebFetch/WebSearch ---
  it("classifies WebFetch as routine", () => {
    const result = classifySignificance("WebFetch", { url: "http://example.com" }, {});
    expect(result.level).toBe("routine");
  });

  it("classifies WebSearch as routine", () => {
    const result = classifySignificance("WebSearch", { query: "test" }, {});
    expect(result.level).toBe("routine");
  });

  // --- Task ---
  it("classifies Task as routine", () => {
    const result = classifySignificance("Task", {}, {});
    expect(result.level).toBe("routine");
  });

  // --- Task management tools ---
  it("classifies TaskCreate as routine", () => {
    const result = classifySignificance("TaskCreate", {}, {});
    expect(result.level).toBe("routine");
  });

  it("classifies TaskUpdate as routine", () => {
    const result = classifySignificance("TaskUpdate", {}, {});
    expect(result.level).toBe("routine");
  });

  it("classifies TaskList as noise", () => {
    const result = classifySignificance("TaskList", {}, {});
    expect(result.level).toBe("noise");
  });

  it("classifies TaskGet as noise", () => {
    const result = classifySignificance("TaskGet", {}, {});
    expect(result.level).toBe("noise");
  });

  // --- Unknown ---
  it("classifies unknown tool as routine", () => {
    const result = classifySignificance("FutureTool", {}, {});
    expect(result.level).toBe("routine");
  });
});
