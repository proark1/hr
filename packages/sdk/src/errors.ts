/** Error envelope shape returned by the API (matches apps/api/src/errors.ts). */
export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

/** Thrown by every SDK method on a non-2xx response. */
export class MyHRError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "MyHRError";
  }
}
