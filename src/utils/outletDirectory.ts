import { Directory, File, Paths } from 'expo-file-system';
import { debugLog } from './logger';

/** One outlet of the territory list (get_outlet_directory), for spotting a duplicate offline. */
export interface DirectoryOutlet {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  /** Lowercase hex sha256(phoneHashSalt + number) of its outlet and owner numbers; the numbers aren't sent. */
  phoneHashes: string[];
  /** The last 4 digits of each, in the same order. */
  phoneLast4: string[];
  onboardedByName?: string;
  onboardedOn?: string;
  /** Assigned to this agent or on their routes. */
  onMyList: boolean;
}

/** The territory list as downloaded in the morning. */
export interface OutletDirectory {
  /** How close two outlets with similar names must be to look like one (0: phone numbers only). */
  duplicateDistanceM: number;
  phoneHashSalt: string;
  outlets: DirectoryOutlet[];
  /** Whose list it is, and when it was saved. */
  agentEmail?: string;
  savedAt: string;
}

/**
 * The list is kept in a file in the documents folder rather than with the
 * rest of the saved data: for a few thousand outlets it's a couple of MB,
 * more than a saved value can safely hold on Android. Written to a temporary
 * file first, so a write cut short never leaves half a list.
 */
const folder = () => new Directory(Paths.document, 'offline');
const listFile = () => new File(folder(), 'outlet-directory.json');

let cached: OutletDirectory | null | undefined;

export function saveOutletDirectory(directory: OutletDirectory) {
  const dir = folder();
  dir.create({ idempotent: true });
  const tmp = new File(dir, 'outlet-directory.json.tmp');
  tmp.write(JSON.stringify(directory));
  tmp.moveSync(listFile(), { overwrite: true });
  cached = directory;
}

/** The saved list, or null when there's none (or it can't be read; it's read again next time). */
export async function loadOutletDirectory(): Promise<OutletDirectory | null> {
  if (cached !== undefined) return cached;
  try {
    const file = listFile();
    if (!file.exists) {
      cached = null;
      return null;
    }
    cached = JSON.parse(await file.text()) as OutletDirectory;
    return cached;
  } catch (e) {
    debugLog('[outletDirectory] could not read the territory list', e);
    return null;
  }
}

/** Another agent signed in: the previous agent's territory list goes. */
export function clearOutletDirectory() {
  cached = null;
  try {
    const file = listFile();
    if (file.exists) file.delete();
  } catch (e) {
    debugLog('[outletDirectory] could not delete the territory list', e);
  }
}
