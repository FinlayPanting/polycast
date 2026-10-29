/**
 * The phone's time zone, sent with its push token so nudges arrive in the learner's own daytime (PC-1028-01).
 * Undefined if the phone doesn't give a usable IANA name; the server then falls back to Europe's daytime.
 */
export function deviceTimeZone(resolve: () => string | undefined = () => Intl.DateTimeFormat().resolvedOptions().timeZone): string | undefined {
  try {
    const tz = resolve()
    return typeof tz === 'string' && /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(tz) ? tz : undefined
  } catch {
    return undefined
  }
}
