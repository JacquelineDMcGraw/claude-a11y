import { describe, it, expect } from "vitest";
import { analyzeEdit, extractStructuralChanges, formatStructuralChanges } from "../../../src/hooks/formatters/edit-analysis.js";

describe("analyzeEdit", () => {
  it("detects identical strings", () => {
    const result = analyzeEdit("const x = 1;", "const x = 1;", "/a.ts", false);
    expect(result.operation.type).toBe("identical");
    expect(result.summary).toContain("No change");
  });

  it("detects whitespace-only change", () => {
    const result = analyzeEdit("  const x = 1;  ", "const x = 1;", "/a.ts", false);
    expect(result.operation.type).toBe("whitespace_only");
    expect(result.summary).toContain("Whitespace");
  });

  it("detects pure insertion (empty old)", () => {
    const result = analyzeEdit("", "line1\nline2\nline3", "/a.ts", false);
    expect(result.operation.type).toBe("insert");
    if (result.operation.type === "insert") {
      expect(result.operation.lineCount).toBe(3);
    }
    expect(result.summary).toContain("Inserted 3 lines");
  });

  it("detects single line insertion", () => {
    const result = analyzeEdit("", "single line", "/a.ts", false);
    expect(result.summary).toContain("Inserted 1 line");
    expect(result.summary).not.toContain("lines");
  });

  it("detects pure deletion (empty new)", () => {
    const result = analyzeEdit("line1\nline2", "", "/a.ts", false);
    expect(result.operation.type).toBe("delete");
    if (result.operation.type === "delete") {
      expect(result.operation.lineCount).toBe(2);
    }
    expect(result.summary).toContain("Deleted 2 lines");
  });

  it("detects replace_all", () => {
    const result = analyzeEdit("foo", "bar", "/a.ts", true);
    expect(result.operation.type).toBe("replace_all");
    expect(result.summary).toContain("Replaced all occurrences");
  });

  it("detects simple rename", () => {
    const result = analyzeEdit(
      "const BUILDABLE_ELEMENTS = [1, 2, 3];",
      "const SHARED_BUILDABLE = [1, 2, 3];",
      "/a.ts",
      false,
    );
    expect(result.operation.type).toBe("rename");
    if (result.operation.type === "rename") {
      expect(result.operation.from).toBe("BUILDABLE_ELEMENTS");
      expect(result.operation.to).toBe("SHARED_BUILDABLE");
    }
    expect(result.summary).toContain("Renamed BUILDABLE_ELEMENTS to SHARED_BUILDABLE");
  });

  it("detects rename across multiple lines", () => {
    const result = analyzeEdit(
      "const myVar = 1;\nconsole.log(myVar);\nreturn myVar;",
      "const myVal = 1;\nconsole.log(myVal);\nreturn myVal;",
      "/a.ts",
      false,
    );
    expect(result.operation.type).toBe("rename");
    if (result.operation.type === "rename") {
      expect(result.operation.from).toBe("myVar");
      expect(result.operation.to).toBe("myVal");
    }
  });

  it("does not detect rename when multiple different identifiers change", () => {
    const result = analyzeEdit(
      "const foo = bar;",
      "const baz = qux;",
      "/a.ts",
      false,
    );
    // Two different identifiers changed → not a rename, it's a replacement
    expect(result.operation.type).toBe("replace");
  });

  it("detects general replacement", () => {
    const result = analyzeEdit(
      "if (x > 0) {\n  return true;\n}",
      "if (x > 0) {\n  log('positive');\n  return true;\n}\nlog('done');",
      "/a.ts",
      false,
    );
    expect(result.operation.type).toBe("replace");
    if (result.operation.type === "replace") {
      expect(result.operation.oldLineCount).toBe(3);
      expect(result.operation.newLineCount).toBe(5);
    }
    expect(result.summary).toContain("Replaced 3 lines with 5 lines");
    expect(result.summary).toContain("+2 net");
  });

  it("shows negative net for shrinking replacements", () => {
    const result = analyzeEdit(
      "line1\nline2\nline3\nline4",
      "combined",
      "/a.ts",
      false,
    );
    expect(result.summary).toContain("-3 net");
  });

  it("handles multiline old and new with same line count", () => {
    const result = analyzeEdit(
      "const a = 1;\nconst b = 2;",
      "const x = 10;\nconst y = 20;",
      "/a.ts",
      false,
    );
    expect(result.operation.type).toBe("replace");
    expect(result.summary).toContain("0 net");
  });

  it("detects rename on single token line", () => {
    const result = analyzeEdit("oldName", "newName", "/a.ts", false);
    expect(result.operation.type).toBe("rename");
    if (result.operation.type === "rename") {
      expect(result.operation.from).toBe("oldName");
      expect(result.operation.to).toBe("newName");
    }
  });

  it("handles single character old and new strings", () => {
    const result = analyzeEdit("a", "b", "/a.ts", false);
    expect(result.operation.type).toBe("rename");
  });

  it("does not crash on empty lines", () => {
    const result = analyzeEdit("\n\n", "a\nb\n", "/a.ts", false);
    expect(result.operation.type).toBe("replace");
  });

  it("ttsSummary is always concise", () => {
    const longOld = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const longNew = Array.from({ length: 100 }, (_, i) => `new line ${i}`).join("\n");
    const result = analyzeEdit(longOld, longNew, "/a.ts", false);
    expect(result.ttsSummary.length).toBeLessThan(100);
  });

  it("detects rename when same identifier appears multiple times on one line", () => {
    const result = analyzeEdit(
      "const foo = foo + foo;",
      "const bar = bar + bar;",
      "/a.ts",
      false,
    );
    expect(result.operation.type).toBe("rename");
    if (result.operation.type === "rename") {
      expect(result.operation.from).toBe("foo");
      expect(result.operation.to).toBe("bar");
    }
  });
});

describe("extractStructuralChanges", () => {
  it("detects added function", () => {
    const oldStr = "const x = 1;";
    const newStr = "const x = 1;\nfunction parseConfig() {\n  return {};\n}";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "added", kind: "function", name: "parseConfig" });
  });

  it("detects removed function", () => {
    const oldStr = "function oldHelper() {\n  return 1;\n}\nconst x = 2;";
    const newStr = "const x = 2;";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "removed", kind: "function", name: "oldHelper" });
  });

  it("detects added class", () => {
    const oldStr = "const x = 1;";
    const newStr = "const x = 1;\nclass UserManager {\n}";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "added", kind: "class", name: "UserManager" });
  });

  it("detects added interface", () => {
    const oldStr = "";
    const newStr = "export interface Config {\n  key: string;\n}";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "added", kind: "interface", name: "Config" });
  });

  it("detects added type alias", () => {
    const oldStr = "";
    const newStr = "export type Verbosity = 'minimal' | 'full';";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "added", kind: "type", name: "Verbosity" });
  });

  it("detects modified function (same name, different body)", () => {
    const oldStr = "function loadConfig() {\n  return {};\n}";
    const newStr = "function loadConfig() {\n  return { key: 'value' };\n}";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "modified", kind: "function", name: "loadConfig" });
  });

  it("detects multiple modified declarations when bodies differ", () => {
    const oldStr = "function alpha() {\n  return 1;\n}\nfunction beta() {\n  return 2;\n}";
    const newStr = "function alpha() {\n  return 10;\n}\nfunction beta() {\n  return 20;\n}";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toHaveLength(2);
    expect(changes).toContainEqual({ type: "modified", kind: "function", name: "alpha" });
    expect(changes).toContainEqual({ type: "modified", kind: "function", name: "beta" });
  });

  it("detects export function", () => {
    const oldStr = "";
    const newStr = "export function processEvent() {}";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "added", kind: "function", name: "processEvent" });
  });

  it("detects async function", () => {
    const oldStr = "";
    const newStr = "export async function fetchData() {}";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "added", kind: "function", name: "fetchData" });
  });

  it("detects Python def", () => {
    const oldStr = "";
    const newStr = "def process_item(item):\n    return item";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "added", kind: "function", name: "process_item" });
  });

  it("detects Rust fn", () => {
    const oldStr = "";
    const newStr = "pub fn calculate(x: i32) -> i32 {\n    x * 2\n}";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "added", kind: "function", name: "calculate" });
  });

  it("detects Go func", () => {
    const oldStr = "";
    const newStr = "func HandleRequest(w http.ResponseWriter) {}";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "added", kind: "function", name: "HandleRequest" });
  });

  it("detects abstract class", () => {
    const oldStr = "";
    const newStr = "export abstract class BaseHandler {}";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toContainEqual({ type: "added", kind: "class", name: "BaseHandler" });
  });

  it("returns empty for non-structural changes", () => {
    const oldStr = "const x = 1;";
    const newStr = "const x = 2;";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes).toHaveLength(0);
  });

  it("handles multiple changes", () => {
    const oldStr = "function old1() {}\nfunction old2() {}";
    const newStr = "function new1() {}\nclass NewClass {}";
    const changes = extractStructuralChanges(oldStr, newStr);
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("formatStructuralChanges", () => {
  it("returns null for empty changes", () => {
    expect(formatStructuralChanges([])).toBeNull();
  });

  it("formats single addition", () => {
    const result = formatStructuralChanges([
      { type: "added", kind: "function", name: "parseConfig" },
    ]);
    expect(result!.summary).toBe("Added function parseConfig.");
    expect(result!.ttsSummary).toBe("added parseConfig.");
  });

  it("formats multiple changes", () => {
    const result = formatStructuralChanges([
      { type: "added", kind: "function", name: "parseConfig" },
      { type: "modified", kind: "function", name: "loadSettings" },
    ]);
    expect(result!.summary).toContain("Added function parseConfig");
    expect(result!.summary).toContain("Modified function loadSettings");
    expect(result!.ttsSummary).toContain("added parseConfig");
    expect(result!.ttsSummary).toContain("modified loadSettings");
  });

  it("truncates TTS at 2 names with +N more", () => {
    const result = formatStructuralChanges([
      { type: "added", kind: "function", name: "a" },
      { type: "added", kind: "function", name: "b" },
      { type: "added", kind: "function", name: "c" },
      { type: "added", kind: "function", name: "d" },
    ]);
    expect(result!.ttsSummary).toContain("+2 more");
  });

  it("formats removal", () => {
    const result = formatStructuralChanges([
      { type: "removed", kind: "class", name: "OldManager" },
    ]);
    expect(result!.summary).toBe("Removed class OldManager.");
    expect(result!.ttsSummary).toBe("removed OldManager.");
  });
});
