/**
 * Server Action Result Shape
 *
 * Every server action whose outcome the UI shows returns this shape, so
 * callers never have to guess whether a failure arrives as a thrown error,
 * a `message`, or an `error`. Validation failures are returned, never thrown:
 * a thrown error from a server action surfaces as the generic error page.
 */

export type ActionFailure = { success: false; error: string; code?: string }
export type ActionResult<T extends object = object> = ({ success: true } & T) | ActionFailure

export function fail(error: string, code?: string): ActionFailure {
  return code ? { success: false, error, code } : { success: false, error }
}
