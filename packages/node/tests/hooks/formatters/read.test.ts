import { describe, it, expect } from "vitest";
import { readFormatter } from "../../../src/hooks/formatters/read.js";
import fixture from "../fixtures/hook-inputs/read.json";

describe("readFormatter", () => {
  it("formats a basic file read", () => {
    const result = readFormatter.format(fixture);
    expect(result.contextText).toContain("/src/index.ts");
    expect(result.contextText).toContain("5 lines");
    expect(result.ttsText).toContain("index.ts");
  });

  it("detects TypeScript language", () => {
    const result = readFormatter.format({
      tool_name: "Read",
      tool_input: { file_path: "/src/app.ts" },
      tool_response: { content: "import foo from 'bar';\nexport function main() {}\n" },
    });
    expect(result.contextText).toContain("[TypeScript]");
    expect(result.contextText).toContain("1 import");
    expect(result.contextText).toContain("1 export");
    expect(result.contextText).toContain("1 function");
  });

  it("detects Python language and constructs", () => {
    const result = readFormatter.format({
      tool_name: "Read",
      tool_input: { file_path: "/src/main.py" },
      tool_response: {
        content: [
          "import os",
          "from pathlib import Path",
          "class MyClass:",
          "    pass",
          "def helper():",
          "    return 1",
          "def another():",
          "    return 2",
          "",
        ].join("\n"),
      },
    });
    expect(result.contextText).toContain("[Python]");
    expect(result.contextText).toContain("2 imports");
    expect(result.contextText).toContain("1 class");
    expect(result.contextText).toContain("2 functions");
  });

  it("detects Rust language", () => {
    const result = readFormatter.format({
      tool_name: "Read",
      tool_input: { file_path: "/src/lib.rs" },
      tool_response: {
        content: "use std::io;\npub fn main() {}\nfn helper() {}\n",
      },
    });
    expect(result.contextText).toContain("[Rust]");
    expect(result.contextText).toContain("1 import");
    expect(result.contextText).toContain("1 export");
    expect(result.contextText).toContain("2 functions");
  });

  it("handles unknown file extension", () => {
    const result = readFormatter.format({
      tool_name: "Read",
      tool_input: { file_path: "/data/config.yaml" },
      tool_response: { content: "key: value\nother: data\n" },
    });
    expect(result.contextText).not.toContain("[");
    expect(result.contextText).toContain("2 lines");
  });

  it("handles empty content", () => {
    const result = readFormatter.format({
      tool_name: "Read",
      tool_input: { file_path: "/empty.ts" },
      tool_response: { content: "" },
    });
    expect(result.contextText).toContain("0 lines");
    expect(result.contextText).not.toContain("Contains:");
  });

  it("counts interfaces", () => {
    const result = readFormatter.format({
      tool_name: "Read",
      tool_input: { file_path: "/types.ts" },
      tool_response: {
        content: [
          "export interface Foo {",
          "  x: number;",
          "}",
          "interface Bar {",
          "  y: string;",
          "}",
        ].join("\n"),
      },
    });
    expect(result.contextText).toContain("2 interfaces");
  });

  it("detects Go language", () => {
    const result = readFormatter.format({
      tool_name: "Read",
      tool_input: { file_path: "/main.go" },
      tool_response: {
        content: 'import "fmt"\nfunc main() {\n  fmt.Println("hello")\n}\n',
      },
    });
    expect(result.contextText).toContain("[Go]");
    expect(result.contextText).toContain("1 function");
  });
});
