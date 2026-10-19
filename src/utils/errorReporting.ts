import { Alert } from 'react-native';
import { debugError } from './logger';

/**
 * React Native's own default error handler (installed automatically before any
 * app code runs, see node_modules/react-native/Libraries/Core/setUpErrorHandling.js)
 * only shows a visible error overlay when `__DEV__` is true. In a release APK,
 * ANY uncaught JS error — and, just as importantly, any unhandled promise
 * rejection, which RN's own promise-rejection tracking (promiseRejectionTrackingOptions.js)
 * funnels into this exact same handler — is silently logged to a native log
 * nobody can see and nothing else happens. No alert, no crash screen, no visible
 * change at all. That's the "I tap it and nothing happens" report across sale,
 * survey, stock request, add outlet/lead/customer, edit — on release builds,
 * a bug in any one of those (a null field, a bad image URI, an edge case only
 * one Android version hits) doesn't fail loudly, it just vanishes.
 *
 * This chains onto RN's existing handler (still calls it, so native crash
 * logging/fatal behavior is unaffected) and additionally shows a real alert
 * with the actual error message, so a tester sees *something* happened and can
 * report the exact text back — turning a silent failure into a traceable one.
 */
export function installGlobalErrorHandlers(): void {
  const g = globalThis as any;
  if (!g.ErrorUtils) return;

  const previousHandler = g.ErrorUtils.getGlobalHandler?.();

  g.ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    try {
      const message = error?.message || String(error) || 'Unknown error';
      debugError('[Unhandled Error]', isFatal ? 'FATAL' : 'non-fatal', message, error?.stack);
      Alert.alert(
        isFatal ? 'Something went wrong' : 'Action failed',
        message,
      );
    } catch {
      // Never let the error handler itself throw and mask the original error.
    }
    previousHandler?.(error, isFatal);
  });
}
