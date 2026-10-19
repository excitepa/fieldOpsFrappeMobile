/**
 * App diagnostics, silent by default so the Metro terminal stays clean. To see
 * them while debugging, set EXPO_PUBLIC_DEBUG_LOGS=1 in .env.local and restart
 * Expo with `-c`. Nothing here is meant for the agent: errors they need to see
 * are already shown in the app.
 */
const enabled = process.env.EXPO_PUBLIC_DEBUG_LOGS === '1' || process.env.EXPO_PUBLIC_DEBUG_LOGS === 'true';

export const debugLog = (...args: unknown[]): void => {
  if (enabled) console.log(...args);
};

export const debugError = (...args: unknown[]): void => {
  if (enabled) console.error(...args);
};
