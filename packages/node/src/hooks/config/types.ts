import type { SignificanceLevel } from "../core/significance.js";

export type Verbosity = "compact" | "minimal" | "normal" | "full";

export interface TtsConfig {
  enabled: boolean;
  engine: "auto" | "say" | "spd-say";
  rate: number;
  maxLength: number;
}

export interface PermissionRule {
  tool: string;
  pattern?: string;
  action: "allow" | "deny";
}

export interface PermissionsConfig {
  rules: PermissionRule[];
}

export interface SilenceConfig {
  enabled: boolean;
  tools: Record<string, boolean>;
}

export interface SignificanceConfig {
  enabled: boolean;
  overrides: Record<string, SignificanceLevel>;
}

export interface DigestConfig {
  enabled: boolean;
}

export interface EarconConfig {
  enabled: boolean;
  engine: "auto" | "afplay" | "paplay" | "canberra-gtk-play";
  volume: number; // 0.0–1.0
  overrides: Record<string, string | false>; // earcon-id → custom path or false to disable
}

export interface ProgressConfig {
  enabled: boolean;
  thresholdMs: number; // min elapsed to announce (default 3000)
}

export interface HistoryConfig {
  enabled: boolean;
  maxEntries: number; // per session (default 500)
}

export interface SummarizeConfig {
  enabled: boolean;
  maxDeclarations: number; // max declarations in contextText (default 20)
  maxTtsNames: number; // max names spoken in TTS (default 3)
}

export interface HooksConfig {
  verbosity: Verbosity;
  tts: TtsConfig;
  permissions: PermissionsConfig;
  silence: SilenceConfig;
  significance: SignificanceConfig;
  digest: DigestConfig;
  earcon: EarconConfig;
  progress: ProgressConfig;
  history: HistoryConfig;
  summarize: SummarizeConfig;
}
