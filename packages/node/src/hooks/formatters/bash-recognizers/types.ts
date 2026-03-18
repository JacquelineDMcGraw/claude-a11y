export interface BashRecognizerResult {
  contextText: string;
  ttsText: string;
}

export interface BashRecognizer {
  id: string;
  matches(command: string): boolean;
  summarize(command: string, exitCode: string | number, stdout: string): BashRecognizerResult;
}
