/**
 * Custom error class for Claude Code Gateway client errors.
 */
export class ClaudeCodeError extends Error {
  code: string;
  rawText?: string;

  constructor(message: string, code: string, rawText?: string) {
    super(message);
    this.name = "ClaudeCodeError";
    this.code = code;
    this.rawText = rawText;
  }
}
