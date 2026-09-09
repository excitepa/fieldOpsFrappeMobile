/**
 * Every survey/sale/order in this app stamps its `timestamp` field with
 * `new Date().toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric',
 * hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })` — a
 * human-readable "9/8/2026, 7:04:46 PM" string, used for on-screen display.
 *
 * Feeding that string straight back into `new Date(str)` (what every "is this
 * today" check used to do) is not reliable: per the ECMA-262 spec, parsing a
 * non-ISO date *string* is implementation-defined, and Hermes (the JS engine
 * these Android/iOS builds run on) does not parse this exact "M/D/YYYY,
 * h:mm:ss AM/PM" shape the same way engines like V8 do — it can silently
 * return an Invalid Date. That made EOD's "Surveys completed" (and any other
 * isToday/isThisMonth check) always read 0 even for a survey submitted
 * seconds earlier, despite the submission succeeding on the server.
 *
 * This parses the known format manually via the numeric Date constructor
 * (year, monthIndex, day, hour, minute, second) instead of string parsing —
 * that constructor form is fully spec-defined and portable across engines.
 */
export function parseAppTimestamp(timestamp: string): Date {
  const match = timestamp.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i
  );
  if (match) {
    const [, monthStr, dayStr, yearStr, hourStr, minuteStr, secondStr, meridiem] = match;
    let hour = parseInt(hourStr, 10) % 12;
    if (meridiem.toUpperCase() === 'PM') hour += 12;
    return new Date(
      parseInt(yearStr, 10),
      parseInt(monthStr, 10) - 1,
      parseInt(dayStr, 10),
      hour,
      parseInt(minuteStr, 10),
      parseInt(secondStr, 10)
    );
  }
  // Not our known display format (e.g. already ISO, or from a different
  // source) — fall back to the engine's default parsing.
  return new Date(timestamp);
}
