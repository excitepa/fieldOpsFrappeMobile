import { RefObject } from 'react';
import { View } from 'react-native';
import * as Location from 'expo-location';
import { captureRef } from 'react-native-view-shot';
import { Directory, File, Paths } from 'expo-file-system';

type Coords = { lat: number; lng: number };

/** Same format as the attendance watermark, e.g. "Tue, Oct 13, 2:28 PM". */
export const formatStampTime = (date: Date): string =>
  date.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

/** Exact street-level address, same as the attendance watermark — the actual spot, not the district/LGA. */
export const streetAddressFromPlace = (place?: Location.LocationGeocodedAddress | null): string => {
  if (!place) return '';
  const streetLine = [place.streetNumber, place.street].filter(Boolean).join(' ');
  return place.formattedAddress
    || [streetLine || place.name, place.city || place.subregion].filter(Boolean).join(', ');
};

/** Watermark lines for a field photo — only the parts that are actually known, so a missing GPS fix still leaves the time. */
export const buildStampLines = (takenAt: Date | null, address: string, coords: Coords | null): string[] =>
  [
    takenAt ? formatStampTime(takenAt) : '',
    address,
    coords ? `GPS ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : '',
  ].filter(Boolean);

/** Live device position plus its street address, for stamping a photo; null if location is unavailable. */
export const getStampLocation = async (): Promise<{ coords: Coords; address: string } | null> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
    let address = '';
    try {
      const places = await Location.reverseGeocodeAsync({ latitude: coords.lat, longitude: coords.lng });
      address = streetAddressFromPlace(places?.[0]);
    } catch {
      // Reverse geocoding can fail offline — the coordinates still stand on their own.
    }
    return { coords, address };
  } catch {
    return null;
  }
};

/**
 * Snapshots a rendered StampedPhoto (photo + watermark) into a new JPEG and
 * returns its URI — that snapshot, not the raw camera file, is what gets
 * uploaded, so the time/place is part of the image Frappe stores. Same settle
 * delay and single retry as the attendance capture, since a capture that fires
 * before the overlay has painted can come out stale. If both attempts fail it
 * falls back to the unstamped photo rather than blocking the save.
 */
export const burnStampIntoPhoto = async (ref: RefObject<View | null>, photoUri: string): Promise<string> => {
  if (!ref.current) return photoUri;
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await captureRef(ref, { format: 'jpg', quality: 0.85 });
    } catch (e) {
      console.log('[photoStamp] watermark capture failed, attempt', attempt + 1, e);
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return photoUri;
};

/**
 * Copies a photo into the app's documents folder for an offline draft. Stamped
 * snapshots are written to the OS temp folder, which iOS can clear while the
 * app is closed — before the draft has had a chance to sync.
 */
export const keepPhotoForDraft = (photoUri: string): string => {
  try {
    const dir = new Directory(Paths.document, 'draft-photos');
    dir.create({ idempotent: true });
    const source = new File(photoUri);
    const copy = new File(dir, `${Date.now()}-${source.name}`);
    source.copySync(copy);
    return copy.uri;
  } catch (e) {
    console.log('[photoStamp] could not keep draft photo, using the original', e);
    return photoUri;
  }
};
