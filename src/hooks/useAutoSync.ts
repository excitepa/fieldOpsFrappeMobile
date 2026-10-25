import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useFieldStore } from '../store/useFieldStore';
import { queueState, syncNow } from '../utils/offlineSync';

/** Every couple of minutes while anything is waiting; at most this long while it keeps failing. */
const RETRY_MS = 2 * 60 * 1000;
const MAX_RETRY_MS = 15 * 60 * 1000;

/**
 * Sends the queue on its own (syncNow): when the signal comes back (and the
 * downloaded lists are refreshed then), when the app comes to the
 * foreground, straight after something is queued, and every couple of
 * minutes while anything is waiting — backing off while the server keeps
 * failing. Mounted once, in App, while the agent is in the app.
 */
export const useAutoSync = (enabled: boolean) => {
  const { state, dispatch } = useFieldStore();
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Syncs in a row that couldn't get through: how long to wait before the next. */
  const failures = useRef(0);

  const run = useCallback(async (refresh = false) => {
    if (!stateRef.current.hydrated) return;
    const net = await NetInfo.fetch().catch(() => null);
    if (net && (net.isConnected === false || net.isInternetReachable === false)) return;
    const outcome = await syncNow({ getState: () => stateRef.current, dispatch, refresh }).catch(() => null);
    if (outcome) failures.current = outcome.offline ? failures.current + 1 : 0;
  }, [dispatch]);

  // When the signal comes back: what's waiting goes, and the lists are refreshed.
  useEffect(() => {
    if (!enabled) return;
    let wasOffline = false;
    const unsubscribe = NetInfo.addEventListener((net) => {
      const online = net.isConnected !== false && net.isInternetReachable !== false;
      if (online && wasOffline) {
        failures.current = 0;
        run(true);
      }
      wasOffline = !online;
    });
    return () => unsubscribe();
  }, [enabled, run]);

  // When the app comes to the foreground.
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') run();
    });
    return () => sub.remove();
  }, [enabled, run]);

  // Straight after something is queued (and once on getting into the app).
  const goesOnItsOwn = queueState(state).goesOnItsOwn;
  const before = useRef(-1);
  useEffect(() => {
    if (enabled && goesOnItsOwn > Math.max(0, before.current)) run();
    before.current = goesOnItsOwn;
  }, [enabled, goesOnItsOwn, run]);

  // Again every couple of minutes while anything is waiting.
  const anythingWaiting = goesOnItsOwn > 0;
  useEffect(() => {
    if (!enabled || !anythingWaiting) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const next = () => {
      const wait = Math.min(MAX_RETRY_MS, RETRY_MS * 2 ** failures.current);
      timer = setTimeout(async () => {
        await run();
        if (!stopped) next();
      }, wait);
    };
    next();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, anythingWaiting, run]);

  return { run };
};
