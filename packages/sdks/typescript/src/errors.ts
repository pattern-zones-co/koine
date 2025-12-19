/**
 * Custom error class for Koine client errors.
 */
export class KoineError extends Error {
  code: string;
  rawText?: string;

  constructor(message: string, code: string, rawText?: string) {
    super(message);
    this.name = "KoineError";
    this.code = code;
    this.rawText = rawText;
  }
}
