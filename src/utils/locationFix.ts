import * as Location from 'expo-location';
import { LocationFix } from './geofence';
import { localDateTimeStr } from './timestamp';

/**
 * A fresh GPS fix with its accuracy, for checking a sale's location; null
 * when location is off, denied, or takes longer than timeoutMs. The cached
 * last-known position isn't used: it can be from somewhere else entirely.
 */
export async function freshFix(timeoutMs = 15000): Promise<LocationFix | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!position) return null;
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
      capturedAt: localDateTimeStr(new Date(position.timestamp || Date.now())),
    };
  } catch {
    return null;
  }
}
