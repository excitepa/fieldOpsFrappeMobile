import { Alert } from 'react-native';

/**
 * True while the agent is in "day complete" mode — set by submitting the
 * End-of-Day report, cleared automatically once the clock passes local
 * midnight. Survives a plain logout on purpose (this device remembers the
 * same agent already finished today, so logging back in skips straight back
 * to safe mode instead of Attendance — see App.tsx's login/resume flows).
 * A *different* agent logging in on this shared device is protected instead
 * by RESET_AGENT_SESSION, which clears this along with the rest of the
 * previous agent's session state.
 */
export const isDayLocked = (dayLockedUntil: string | null): boolean =>
  !!dayLockedUntil && Date.now() < new Date(dayLockedUntil).getTime();

/**
 * Call at the top of any write/submit action (add outlet, add lead, request
 * stock, submit a sale/order/survey, skip a visit, reconcile stock, clock in,
 * ...). Returns true and shows the explanation alert if the action should be
 * blocked; the caller just needs to `return` when this is true. Browsing,
 * editing, and logging out all stay available — only new activity is locked.
 */
export const blockIfDayLocked = (dayLockedUntil: string | null): boolean => {
  if (!isDayLocked(dayLockedUntil)) return false;
  Alert.alert(
    "You're Done for Today",
    "Your end-of-day report is in. New activity is locked until 12:00 AM — you can still look around, or log out.",
  );
  return true;
};
