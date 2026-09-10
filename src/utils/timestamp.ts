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

/**
 * "Today" as YYYY-MM-DD in the DEVICE'S LOCAL calendar day — not UTC.
 *
 * `new Date().toISOString().slice(0, 10)` was used all over this app as a stand-in
 * for "today's date," but `toISOString()` always returns the UTC date, not local.
 * For any positive UTC offset (Nigeria is UTC+1), that's wrong for roughly the
 * first hour(s) after local midnight: e.g. at 00:30 WAT (already a new local day),
 * it's still 23:30 the *previous* day in UTC, so toISOString() reports yesterday's
 * date — attendance clock-in dates, EOD "today" filters, lead creation dates, and
 * day-route navigation would all silently disagree with the device's own clock
 * right when a 12:00 AM reset is supposed to take effect. This builds the date
 * string from the Date object's local getFullYear/getMonth/getDate instead, which
 * always matches whatever the device itself considers "today," in any timezone.
 */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
