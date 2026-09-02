export const MAX_ITERATIONS = 12;
export const MAX_TOOL_CALLS_PER_ITERATION = 6;
/** Per tool result, after which the JSON is cut with a marker. */
export const MAX_TOOL_RESULT_BYTES = 12_000;
/** Across all tool results in one request. */
export const MAX_TOTAL_TOOL_BYTES = 120_000;
export const MAX_OUTPUT_TOKENS = 8000;
/** Hard ceiling for one question end to end, and for a single provider call. */
export const MAX_RUN_MS = 10 * 60 * 1000;
export const PROVIDER_TIMEOUT_MS = 120 * 1000;
/** History actually sent to the model (the request may carry more; older/longer turns are trimmed). Bounds input tokens per iteration. */
export const MAX_HISTORY_TURNS_SENT = 20;
export const MAX_HISTORY_CHARS_PER_TURN = 6000;
export const NOTES_SUMMARY_CHARS = 2000;
export const BODY_PREVIEW_CHARS = 600;

/** Tracks the bytes of tool results handed to the model in one request. */
export class ByteBudget {
  private used = 0;
  constructor(private readonly total: number = MAX_TOTAL_TOOL_BYTES) {}
  get remaining(): number {
    return Math.max(0, this.total - this.used);
  }
  get exhausted(): boolean {
    return this.used >= this.total;
  }
  spend(bytes: number) {
    this.used += bytes;
  }
}
