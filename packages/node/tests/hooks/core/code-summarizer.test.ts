import { describe, it, expect } from "vitest";
import {
  summarizeCode,
  formatDeclaration,
  formatCodeSummary,
  detectLanguage,
  type Declaration,
  type CodeSummary,
} from "../../../src/hooks/core/code-summarizer.js";

describe("detectLanguage", () => {
  it("detects TypeScript", () => {
    expect(detectLanguage("/src/app.ts")).toBe("TypeScript");
    expect(detectLanguage("/src/app.tsx")).toBe("TypeScript");
  });

  it("detects JavaScript", () => {
    expect(detectLanguage("/src/app.js")).toBe("JavaScript");
    expect(detectLanguage("/src/app.jsx")).toBe("JavaScript");
  });

  it("detects Python", () => {
    expect(detectLanguage("/src/main.py")).toBe("Python");
  });

  it("detects Rust", () => {
    expect(detectLanguage("/src/main.rs")).toBe("Rust");
  });

  it("detects Go", () => {
    expect(detectLanguage("/src/main.go")).toBe("Go");
  });

  it("detects Shell", () => {
    expect(detectLanguage("/script.sh")).toBe("Shell");
    expect(detectLanguage("/script.bash")).toBe("Shell");
    expect(detectLanguage("/script.zsh")).toBe("Shell");
  });

  it("returns null for unknown", () => {
    expect(detectLanguage("/file.xyz")).toBeNull();
  });

  it("returns null for no extension", () => {
    expect(detectLanguage("Makefile")).toBeNull();
  });
});

describe("summarizeCode — TypeScript", () => {
  it("extracts functions with params and return types", () => {
    const code = `
export function getGuideColor(tradition: string): string {
  return "#fff";
}

export async function loadConfig(): Promise<HooksConfig> {
  return {};
}
`;
    const result = summarizeCode(code, "app.ts");
    expect(result.declarations).toHaveLength(2);
    expect(result.declarations[0]).toMatchObject({
      kind: "function",
      name: "getGuideColor",
      params: "(tradition: string)",
      returnType: "string",
      exported: true,
    });
    expect(result.declarations[1]).toMatchObject({
      kind: "function",
      name: "loadConfig",
      params: "()",
      returnType: "Promise<HooksConfig>",
      exported: true,
      async: true,
    });
  });

  it("extracts classes with extends", () => {
    const code = `export abstract class ThemeManager extends BaseManager {
  constructor() {}
}`;
    const result = summarizeCode(code, "theme.ts");
    expect(result.declarations).toHaveLength(1);
    expect(result.declarations[0]).toMatchObject({
      kind: "class",
      name: "ThemeManager",
      exported: true,
      abstract: true,
    });
  });

  it("extracts interfaces", () => {
    const code = `export interface ThemeConfig {
  primary: string;
  secondary: string;
}`;
    const result = summarizeCode(code, "types.ts");
    expect(result.declarations).toHaveLength(1);
    expect(result.declarations[0]).toMatchObject({
      kind: "interface",
      name: "ThemeConfig",
      exported: true,
    });
  });

  it("extracts type aliases", () => {
    const code = `export type Verbosity = "compact" | "minimal" | "normal" | "full";`;
    const result = summarizeCode(code, "types.ts");
    expect(result.declarations).toHaveLength(1);
    expect(result.declarations[0]).toMatchObject({
      kind: "type",
      name: "Verbosity",
      exported: true,
    });
  });

  it("extracts enums", () => {
    const code = `export enum Direction { Up, Down, Left, Right }`;
    const result = summarizeCode(code, "enums.ts");
    expect(result.declarations).toHaveLength(1);
    expect(result.declarations[0]).toMatchObject({
      kind: "enum",
      name: "Direction",
      exported: true,
    });
  });

  it("extracts const declarations", () => {
    const code = `export const DEFAULT_CONFIG: HooksConfig = {};`;
    const result = summarizeCode(code, "defaults.ts");
    expect(result.declarations).toHaveLength(1);
    expect(result.declarations[0]).toMatchObject({
      kind: "const",
      name: "DEFAULT_CONFIG",
      returnType: "HooksConfig",
      exported: true,
    });
  });

  it("extracts imports", () => {
    const code = `import { readFile } from "node:fs";
import path from "node:path";
import "./side-effect.js";
import type { Config } from "./types.js";

export function main() {}`;
    const result = summarizeCode(code, "app.ts");
    expect(result.imports).toHaveLength(4);
    expect(result.imports[0]!.source).toBe("node:fs");
    expect(result.imports[1]!.source).toBe("node:path");
    expect(result.imports[2]!.source).toBe("./side-effect.js");
    expect(result.imports[3]!.source).toBe("./types.js");
  });

  it("detects non-exported declarations", () => {
    const code = `function internalHelper(): void {}
const localVar = 42;`;
    const result = summarizeCode(code, "utils.ts");
    expect(result.declarations[0]!.exported).toBeFalsy();
    expect(result.declarations[1]!.exported).toBeFalsy();
  });

  it("deduplicates overloads by name+kind", () => {
    const code = `function parse(input: string): Result;
function parse(input: Buffer): Result;
function parse(input: string | Buffer): Result {
  return {};
}`;
    const result = summarizeCode(code, "parser.ts");
    expect(result.declarations).toHaveLength(1);
    expect(result.declarations[0]!.name).toBe("parse");
  });
});

describe("summarizeCode — Python", () => {
  it("extracts functions with params and return types", () => {
    const code = `def process(data: str, count: int) -> bool:
    return True

async def fetch_data(url: str) -> dict:
    pass`;
    const result = summarizeCode(code, "main.py");
    expect(result.language).toBe("Python");
    expect(result.declarations).toHaveLength(2);
    expect(result.declarations[0]).toMatchObject({
      kind: "function",
      name: "process",
      params: "(data: str, count: int)",
      returnType: "bool",
    });
    expect(result.declarations[1]).toMatchObject({
      kind: "function",
      name: "fetch_data",
      async: true,
    });
  });

  it("extracts classes with inheritance", () => {
    const code = `class Animal:
    pass

class Dog(Animal):
    pass`;
    const result = summarizeCode(code, "models.py");
    expect(result.declarations).toHaveLength(2);
    expect(result.declarations[0]!.name).toBe("Animal");
    expect(result.declarations[1]!.name).toBe("Dog");
  });

  it("extracts imports", () => {
    const code = `from os import path
import sys
from typing import Optional`;
    const result = summarizeCode(code, "main.py");
    expect(result.imports).toHaveLength(3);
    expect(result.imports[0]!.source).toBe("os");
    expect(result.imports[1]!.source).toBe("sys");
    expect(result.imports[2]!.source).toBe("typing");
  });
});

describe("summarizeCode — Rust", () => {
  it("extracts functions with return types", () => {
    const code = `pub async fn process(data: &str) -> Result<(), Error> {
    Ok(())
}

fn helper() {
}`;
    const result = summarizeCode(code, "lib.rs");
    expect(result.language).toBe("Rust");
    expect(result.declarations).toHaveLength(2);
    expect(result.declarations[0]).toMatchObject({
      kind: "function",
      name: "process",
      exported: true,
      async: true,
    });
    expect(result.declarations[1]).toMatchObject({
      kind: "function",
      name: "helper",
      exported: false,
    });
  });

  it("extracts structs and enums", () => {
    const code = `pub struct Config {
    name: String,
}

pub enum Status {
    Active,
    Inactive,
}`;
    const result = summarizeCode(code, "types.rs");
    expect(result.declarations).toHaveLength(2);
    expect(result.declarations[0]).toMatchObject({ kind: "class", name: "Config", exported: true });
    expect(result.declarations[1]).toMatchObject({ kind: "enum", name: "Status", exported: true });
  });

  it("extracts traits", () => {
    const code = `pub trait Serializable {
    fn serialize(&self) -> String;
}`;
    const result = summarizeCode(code, "traits.rs");
    // Trait + inner fn serialize both get extracted
    expect(result.declarations.length).toBeGreaterThanOrEqual(1);
    expect(result.declarations[0]).toMatchObject({ kind: "interface", name: "Serializable", exported: true });
  });

  it("extracts use statements", () => {
    const code = `use std::io::Read;
use crate::config::Config;`;
    const result = summarizeCode(code, "main.rs");
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]!.source).toBe("std::io::Read");
    expect(result.imports[1]!.source).toBe("crate::config::Config");
  });
});

describe("summarizeCode — Go", () => {
  it("extracts functions", () => {
    const code = `func main() {
}

func ProcessData(input string) (string, error) {
}`;
    const result = summarizeCode(code, "main.go");
    expect(result.language).toBe("Go");
    expect(result.declarations).toHaveLength(2);
    expect(result.declarations[0]).toMatchObject({ kind: "function", name: "main" });
    expect(result.declarations[1]).toMatchObject({
      kind: "function",
      name: "ProcessData",
      params: "(input string)",
      returnType: "(string, error)",
      exported: true,
    });
  });

  it("extracts methods with receivers", () => {
    const code = `func (s *Server) Start(port int) error {
}`;
    const result = summarizeCode(code, "server.go");
    expect(result.declarations).toHaveLength(1);
    expect(result.declarations[0]).toMatchObject({
      kind: "function",
      name: "Start",
      params: "(port int)",
      returnType: "error",
      exported: true,
    });
  });

  it("extracts struct and interface types", () => {
    const code = `type Config struct {
    Name string
}

type Handler interface {
    Handle() error
}`;
    const result = summarizeCode(code, "types.go");
    expect(result.declarations).toHaveLength(2);
    expect(result.declarations[0]).toMatchObject({ kind: "class", name: "Config", exported: true });
    expect(result.declarations[1]).toMatchObject({ kind: "interface", name: "Handler", exported: true });
  });
});

describe("summarizeCode — Java/C#", () => {
  it("extracts Java classes", () => {
    const code = `public abstract class UserService {
    public User findById(int id) {
        return null;
    }
}`;
    const result = summarizeCode(code, "UserService.java");
    expect(result.language).toBe("Java");
    expect(result.declarations).toHaveLength(2);
    expect(result.declarations[0]).toMatchObject({
      kind: "class",
      name: "UserService",
      exported: true,
      abstract: true,
    });
  });

  it("extracts C# classes", () => {
    const code = `public class OrderController {
    public IActionResult GetOrders() {
    }
}`;
    const result = summarizeCode(code, "OrderController.cs");
    expect(result.language).toBe("C#");
    expect(result.declarations).toHaveLength(2);
  });

  it("extracts Java imports", () => {
    const code = `import java.util.List;
import java.io.File;`;
    const result = summarizeCode(code, "App.java");
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]!.source).toBe("java.util.List");
  });
});

describe("summarizeCode — Shell", () => {
  it("extracts shell functions", () => {
    const code = `#!/bin/bash

function setup() {
  echo "setting up"
}

cleanup() {
  echo "cleaning up"
}

MY_VAR=hello`;
    const result = summarizeCode(code, "script.sh");
    expect(result.language).toBe("Shell");
    expect(result.declarations).toHaveLength(3);
    expect(result.declarations[0]).toMatchObject({ kind: "function", name: "setup" });
    expect(result.declarations[1]).toMatchObject({ kind: "function", name: "cleanup" });
    expect(result.declarations[2]).toMatchObject({ kind: "variable", name: "MY_VAR" });
  });
});

describe("summarizeCode — edge cases", () => {
  it("returns empty summary for empty code", () => {
    const result = summarizeCode("", "app.ts");
    expect(result.declarations).toHaveLength(0);
    expect(result.imports).toHaveLength(0);
  });

  it("returns empty declarations for non-code files", () => {
    const result = summarizeCode("just some text\nnothing special", "readme.txt");
    // Falls back to TS/JS patterns, but won't match
    expect(result.declarations).toHaveLength(0);
  });

  it("handles very long param lists by truncating", () => {
    const longParams = "(a: string, b: number, c: boolean, d: object, e: Map<string, number>, f: Set<string>, g: Array<number>, h: Record<string, unknown>)";
    const code = `export function longFunc${longParams}: void {}`;
    const result = summarizeCode(code, "long.ts");
    expect(result.declarations).toHaveLength(1);
    const params = result.declarations[0]!.params!;
    expect(params.length).toBeLessThanOrEqual(80);
    expect(params.endsWith("...")).toBe(true);
  });
});

describe("formatDeclaration", () => {
  it("formats a simple function", () => {
    const decl: Declaration = { kind: "function", name: "hello" };
    expect(formatDeclaration(decl)).toBe("function hello");
  });

  it("formats function with params and return type", () => {
    const decl: Declaration = {
      kind: "function",
      name: "getColor",
      params: "(tradition: string)",
      returnType: "string",
    };
    expect(formatDeclaration(decl)).toBe("function getColor(tradition: string): string");
  });

  it("formats exported async function", () => {
    const decl: Declaration = {
      kind: "function",
      name: "loadConfig",
      params: "()",
      returnType: "Promise<Config>",
      exported: true,
      async: true,
    };
    expect(formatDeclaration(decl)).toBe("export async function loadConfig(): Promise<Config>");
  });

  it("formats abstract class", () => {
    const decl: Declaration = {
      kind: "class",
      name: "BaseService",
      abstract: true,
      exported: true,
    };
    expect(formatDeclaration(decl)).toBe("export abstract class BaseService");
  });

  it("formats interface", () => {
    const decl: Declaration = {
      kind: "interface",
      name: "Config",
      exported: true,
    };
    expect(formatDeclaration(decl)).toBe("export interface Config");
  });

  it("formats const with type", () => {
    const decl: Declaration = {
      kind: "const",
      name: "DEFAULT",
      returnType: "HooksConfig",
      exported: true,
    };
    expect(formatDeclaration(decl)).toBe("export const DEFAULT: HooksConfig");
  });
});

describe("formatCodeSummary", () => {
  const baseSummary: CodeSummary = {
    language: "TypeScript",
    imports: [{ source: "node:fs" }, { source: "./types.js" }],
    declarations: [
      { kind: "function", name: "getColor", params: "(t: string)", returnType: "string" },
      { kind: "interface", name: "Config" },
      { kind: "class", name: "App" },
    ],
  };

  it("includes all declarations in contextText within limit", () => {
    const result = formatCodeSummary(baseSummary, { maxDeclarations: 20, maxTtsNames: 3 });
    expect(result.contextText).toContain("Contains:");
    expect(result.contextText).toContain("function getColor(t: string): string");
    expect(result.contextText).toContain("interface Config");
    expect(result.contextText).toContain("class App");
    expect(result.contextText).toContain("2 imports from node:fs, ./types.js.");
  });

  it("truncates declarations at maxDeclarations", () => {
    const result = formatCodeSummary(baseSummary, { maxDeclarations: 2, maxTtsNames: 3 });
    expect(result.contextText).toContain("function getColor");
    expect(result.contextText).toContain("interface Config");
    expect(result.contextText).toContain("+1 more");
    expect(result.contextText).not.toContain("class App.");
  });

  it("includes brief names in ttsText", () => {
    const result = formatCodeSummary(baseSummary, { maxDeclarations: 20, maxTtsNames: 3 });
    expect(result.ttsText).toBe("Contains getColor, Config, and App.");
  });

  it("truncates ttsText at maxTtsNames", () => {
    const result = formatCodeSummary(baseSummary, { maxDeclarations: 20, maxTtsNames: 2 });
    expect(result.ttsText).toBe("Contains getColor and Config, +1 more.");
  });

  it("handles single declaration in TTS", () => {
    const single: CodeSummary = {
      language: "TypeScript",
      imports: [],
      declarations: [{ kind: "function", name: "main" }],
    };
    const result = formatCodeSummary(single, { maxDeclarations: 20, maxTtsNames: 3 });
    expect(result.ttsText).toBe("Contains main.");
  });

  it("returns empty strings for no declarations", () => {
    const empty: CodeSummary = { language: "TypeScript", imports: [], declarations: [] };
    const result = formatCodeSummary(empty, { maxDeclarations: 20, maxTtsNames: 3 });
    expect(result.contextText).toBe("");
    expect(result.ttsText).toBe("");
  });

  it("truncates import list at 5", () => {
    const manyImports: CodeSummary = {
      language: "TypeScript",
      imports: [
        { source: "a" }, { source: "b" }, { source: "c" },
        { source: "d" }, { source: "e" }, { source: "f" }, { source: "g" },
      ],
      declarations: [{ kind: "function", name: "main" }],
    };
    const result = formatCodeSummary(manyImports, { maxDeclarations: 20, maxTtsNames: 3 });
    expect(result.contextText).toContain("7 imports from a, b, c, d, e, +2 more.");
  });
});
