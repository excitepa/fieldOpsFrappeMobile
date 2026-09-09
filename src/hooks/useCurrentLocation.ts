import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

/**
 * One-shot read of the device's current GPS fix, for on-screen distance checks
 * (not attendance clock-in, which has its own capture flow with a selfie/retry
 * UI). Shows the device's cached last-known fix immediately (near-instant —
 * this is what was making the Next Stop distance feel slow to appear, since it
 * was waiting on a fresh GPS lock before showing anything at all), then
 * refines it with a real fresh fix once that resolves.
 */
export const useCurrentLocation = () => {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        try {
          const last = await Location.getLastKnownPositionAsync({});
          if (last && !cancelled) {
            setCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
          }
        } catch (e) {
          // No cached fix available — fine, the fresh read below still runs.
        }

        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        }
      } catch (e) {
        // Non-fatal — callers just don't get a distance to show.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return coords;
};
