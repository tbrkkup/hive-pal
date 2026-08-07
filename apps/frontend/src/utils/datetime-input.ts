/**
 * Formats a date as local wall-clock time for an `<input type="datetime-local">`.
 *
 * The input has no timezone, so handing it an ISO/UTC string makes it display
 * the wrong time for anyone not on UTC.
 */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
