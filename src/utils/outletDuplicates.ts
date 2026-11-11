import * as Crypto from 'expo-crypto';
import { Outlet } from '../types';
import type { OutletMatch } from '../services/api';
import { OutletDirectory } from './outletDirectory';
import { distanceMeters, parseGps } from './geo';
import { isValidPhone, normalizePhone } from './phone';

/**
 * An outlet onboarded twice, spotted on the phone before it's saved — offline
 * too, against the agent's outlets and the territory list downloaded in the
 * morning. The rule is the server's (fieldops.api.outlet_duplicates), so the
 * phone and the server find the same:
 * - phone: one of the new outlet's numbers (its own, its owner's) is one of an
 *   existing outlet's;
 * - nearby_name: both have a location, within the duplicate distance (50 m
 *   unless the backend says otherwise; 0 turns this off), with similar names.
 */

/** Words outlets are often named with, which don't tell two outlets apart. */
const STOP_WORDS = new Set([
  'store', 'stores', 'shop', 'shops', 'supermarket', 'supermart', 'mart', 'enterprise', 'enterprises', 'ent', 'venture',
  'ventures', 'nig', 'nigeria', 'ltd', 'limited', 'co', 'company', 'and', 'the', 'international', 'intl', 'global', 'plaza',
]);
const SIMILAR = 0.8;
const MIN_CONTAINED = 4;
export const DEFAULT_DUPLICATE_DISTANCE_M = 50;

/** Lowercase letters, digits and single spaces only. */
const letters = (text: string) => text.replace(/\s/g, ' ').replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean).join(' ');

/**
 * A name as the check compares it: lowercased, "&" read as " and ", only
 * letters, digits and spaces left, without the common words, spaces
 * collapsed. When nothing is left, the lowercased name with only letters,
 * digits and single spaces.
 */
export const nameKey = (name?: string): string => {
  const lowered = String(name || '').toLowerCase();
  const words = letters(lowered.replace(/&/g, ' and ')).split(' ').filter(Boolean);
  return words.filter((w) => !STOP_WORDS.has(w)).join(' ') || letters(lowered);
};

/** The fewest single-character insertions, deletions and substitutions turning a into b. */
export const levenshtein = (a: string, b: string): number => {
  if (a.length < b.length) [a, b] = [b, a];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    previous = current;
  }
  return previous[b.length];
};

/** 1 - levenshtein / the longer one's length. */
export const similarity = (a: string, b: string): number => {
  const longest = Math.max(a.length, b.length);
  return longest ? 1 - levenshtein(a, b) / longest : 1;
};

/** Two names are similar when equal, one contains the other (the shorter 4+ characters), or 0.8 or more alike. */
export const similarNames = (a?: string, b?: string): boolean => {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  if (shorter.length >= MIN_CONTAINED && longer.includes(shorter)) return true;
  return similarity(x, y) >= SIMILAR - 1e-9;
};

/** A number as FieldOps stores them (11 digits starting with 0), or null for a blank or invalid one. */
export const phoneKey = (value?: string): string | null => {
  if (!value) return null;
  const phone = normalizePhone(value);
  return isValidPhone(phone) ? phone : null;
};

/** What the territory list sends for a number: lowercase hex sha256 of the salt and the number. */
export const phoneHash = (salt: string, key: string): Promise<string> =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}${key}`, { encoding: Crypto.CryptoEncoding.HEX });

export interface NewOutletDetails {
  name: string;
  phones: (string | undefined)[];
  latitude?: number;
  longitude?: number;
}

/**
 * The outlets a new one looks like, on the phone: among the agent's outlets
 * (onboarded offline ones included) and the territory list, phone matches
 * first, then the nearest — as the server orders them.
 */
export async function findLocalMatches(
  outlet: NewOutletDetails,
  ownOutlets: Outlet[],
  directory: OutletDirectory | null,
): Promise<OutletMatch[]> {
  const keys = Array.from(new Set(outlet.phones.map(phoneKey).filter((k): k is string => !!k)));
  const here = outlet.latitude !== undefined && outlet.longitude !== undefined ? { lat: outlet.latitude, lng: outlet.longitude } : null;
  const radius = directory?.duplicateDistanceM ?? DEFAULT_DUPLICATE_DISTANCE_M;
  const hashes = directory?.phoneHashSalt ? await Promise.all(keys.map((k) => phoneHash(directory.phoneHashSalt, k))) : [];
  const byId = new Map<string, OutletMatch>();

  const consider = (candidate: {
    id: string; name: string; address: string; at: { lat: number; lng: number } | null;
    phoneMatch: string | null | undefined; onMyList: boolean; onboardedByName?: string; onboardedOn?: string;
  }) => {
    // Compared unrounded, shown rounded, as the server does.
    const distance = here && candidate.at ? distanceMeters(here, candidate.at) : null;
    const distanceM = distance !== null ? Math.round(distance) : null;
    let match: OutletMatch['match'] | null = null;
    if (candidate.phoneMatch !== undefined && candidate.phoneMatch !== null) match = 'phone';
    else if (distance !== null && radius > 0 && distance <= radius && similarNames(outlet.name, candidate.name)) match = 'nearby_name';
    if (!match) return;
    const found: OutletMatch = {
      outletId: candidate.id,
      outletName: candidate.name,
      address: candidate.address,
      distanceM,
      match,
      onboardedByName: candidate.onboardedByName,
      onboardedOn: candidate.onboardedOn,
      onMyList: candidate.onMyList,
      phoneLast4: candidate.phoneMatch || undefined,
    };
    const before = byId.get(candidate.id);
    // The same outlet from both lists: the stronger match, and on the agent's list if either says so.
    if (!before || (before.match !== 'phone' && match === 'phone')) byId.set(candidate.id, { ...found, onMyList: found.onMyList || !!before?.onMyList });
    else if (found.onMyList) byId.set(candidate.id, { ...before, onMyList: true });
  };

  ownOutlets.forEach((o) => {
    const theirs = [phoneKey(o.phone), phoneKey(o.ownerPhone)].filter((k): k is string => !!k);
    const shared = theirs.find((k) => keys.includes(k));
    consider({
      id: o.id, name: o.name, address: o.address || '', at: parseGps(o.gps),
      phoneMatch: shared ? shared.slice(-4) : null, onMyList: true,
    });
  });
  (directory?.outlets || []).forEach((o) => {
    const index = o.phoneHashes.findIndex((h) => hashes.includes(h));
    consider({
      id: o.id, name: o.name, address: o.address,
      at: o.latitude !== null && o.longitude !== null ? { lat: o.latitude, lng: o.longitude } : null,
      phoneMatch: index >= 0 ? o.phoneLast4[index] || '' : null,
      onMyList: o.onMyList, onboardedByName: o.onboardedByName, onboardedOn: o.onboardedOn,
    });
  });

  return Array.from(byId.values()).sort((a, b) =>
    (a.match === 'phone' ? 0 : 1) - (b.match === 'phone' ? 0 : 1)
    || (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity)
    || a.outletName.toLowerCase().localeCompare(b.outletName.toLowerCase()));
}
