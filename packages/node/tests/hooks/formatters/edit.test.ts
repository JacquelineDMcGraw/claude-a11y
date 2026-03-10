import { describe, it, expect } from "vitest";
import { editFormatter } from "../../../src/hooks/formatters/edit.js";
import fixture from "../fixtures/hook-inputs/edit.json";

describe("editFormatter", () => {
  it("formats a basic edit", () => {
    const result = editFormatter.format(fixture);
    expect(result.contextText).toContain("/src/index.ts");
    expect(result.contextText).toContain("Replaced 1 line");
    expect(result.contextText).toContain("2 lines");
    expect(result.ttsText).toContain("index.ts");
  });

  it("reports replace_all", () => {
    const input = {
      tool_name: "Edit",
      tool_input: {
        file_path: "/src/foo.ts",
        old_string: "a",
        new_string: "b",
        replace_all: true,
      },
      tool_response: {},
    };
    const result = editFormatter.format(input);
    expect(result.contextText).toContain("all occurrences");
    expect(result.ttsText).toContain("all occurrences");
  });

  it("detects rename in edit", () => {
    const input = {
      tool_name: "Edit",
      tool_input: {
        file_path: "/src/app.ts",
        old_string: "const myOldVar = 1;",
        new_string: "const myNewVar = 1;",
      },
      tool_response: {},
    };
    const result = editFormatter.format(input);
    expect(result.contextText).toContain("Renamed myOldVar to myNewVar");
  });

  it("detects deletion", () => {
    const input = {
      tool_name: "Edit",
      tool_input: {
        file_path: "/src/app.ts",
        old_string: "const unused = true;\nconst alsoUnused = false;",
        new_string: "",
      },
      tool_response: {},
    };
    const result = editFormatter.format(input);
    expect(result.contextText).toContain("Deleted 2 lines");
  });
});
