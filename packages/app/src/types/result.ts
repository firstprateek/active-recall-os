/**
 * Result<T, E> — repositories never throw; they return this discriminated union.
 */

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AppErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'STORAGE'
  | 'UNKNOWN';

export interface AppError {
  code: AppErrorCode;
  message: string;
  cause?: unknown;
}

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err(
  code: AppErrorCode,
  message: string,
  cause?: unknown,
): { ok: false; error: AppError } {
  return cause === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, cause } };
}

/** Wrap an async storage call, translating thrown exceptions into Result errors. */
export async function tryStorage<T>(
  op: () => Promise<T>,
  context: string,
): Promise<Result<T>> {
  try {
    return ok(await op());
  } catch (cause) {
    return err('STORAGE', `${context} failed`, cause);
  }
}
