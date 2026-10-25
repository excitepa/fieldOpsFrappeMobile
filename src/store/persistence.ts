import { debugLog } from '../utils/logger';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  const memoryStore = new Map<string, string>();
  AsyncStorage = {
    getItem: async (key: string) => (memoryStore.has(key) ? memoryStore.get(key) : null),
    setItem: async (key: string, val: string) => { memoryStore.set(key, val); },
    removeItem: async (key: string) => { memoryStore.delete(key); },
    getAllKeys: async () => Array.from(memoryStore.keys()),
  };
}

/**
 * How the store is kept on the phone.
 *
 * It used to be one JSON value (@fieldops:state) rewritten on every change. On
 * Android a value past ~2 MB can fail to load; the app then started empty and
 * the next save wrote that empty state over the real one, unsent work and all.
 * Now:
 * - each unsent item (a sale/order draft, a lead, outlet or survey draft, a
 *   survey photo, a queued skip, stage change or stock request) is its own small
 *   value, with a backup copy, written as soon as it changes;
 * - the session and each downloaded list are a value each, written only when
 *   they change, the big lists a moment later;
 * - a value that can't be read is never overwritten by an empty default: it's
 *   left on disk and read again on the next start (an unsent item is restored
 *   from its backup).
 */

const PREFIX = '@fieldops:v2:';
const QUEUE_PREFIX = `${PREFIX}q:`;
const BACKUP_PREFIX = `${PREFIX}qb:`;
/** The single value the whole state used to be saved under; moved over once it can be read. */
const LEGACY_KEY = '@fieldops:state';

/** One saved value: the state fields it holds. */
export interface PartSpec {
  fields: string[];
  /** How long to wait for more changes before writing (the big lists). */
  debounceMs?: number;
  /** What's written, from the fields' values (e.g. history older than 30 days left out). */
  prepare?: (slice: Record<string, any>) => Record<string, any>;
}

/** One kind of unsent item: where it lives in the state, and its id. */
export interface QueueSpec {
  kind: string;
  /** The state field the restored items go back to. */
  field: string;
  items: (state: any) => any[];
}

export interface LoadResult {
  /** The state fields to restore (surveys: synced ones; the unsent ones come in queued.survey). */
  restored: Record<string, any>;
  /** The unsent items, by kind. */
  queued: Record<string, any[]>;
  /** Values that couldn't be read, left as they are on disk. */
  unreadable: string[];
}

const isEmptyValue = (value: any): boolean =>
  value === null || value === undefined
  || (Array.isArray(value) && value.length === 0)
  || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

const readJson = async (key: string): Promise<{ status: 'ok'; value: any } | { status: 'missing' } | { status: 'failed' }> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null || raw === undefined) return { status: 'missing' };
    return { status: 'ok', value: JSON.parse(raw) };
  } catch (e) {
    debugLog('[persistence] could not read', key, e);
    return { status: 'failed' };
  }
};

export function createPersistence(spec: {
  parts: Record<string, PartSpec>;
  queue: QueueSpec[];
  /** The state the app starts with: a part that couldn't be read is never overwritten with these. */
  defaults: Record<string, any>;
}) {
  const partKey = (name: string) => `${PREFIX}${name}`;
  const itemKey = (kind: string, id: string) => `${QUEUE_PREFIX}${kind}:${id}`;
  const backupKey = (kind: string, id: string) => `${BACKUP_PREFIX}${kind}:${id}`;

  /** Each part's field values as last written. */
  const savedParts: Record<string, Record<string, any>> = {};
  /** Parts that couldn't be read: not written until the app has real data for them. */
  const blocked = new Set<string>();
  /** Each unsent item as last written, by its key. */
  let savedQueue = new Map<string, any>();
  /** Unsent items to write on the first save (restored from their backup, or moved from the old value). */
  const queueToRewrite = new Set<string>();
  /** Unsent items that couldn't be read at all: never written or removed. */
  const unreadableItems = new Set<string>();
  const timers: Record<string, ReturnType<typeof setTimeout> | undefined> = {};
  const pendingSlices: Record<string, Record<string, any> | undefined> = {};
  let legacyToRemove = false;

  /** Writes a part; false when it couldn't be (it's written again on its next change). */
  const writePart = async (name: string, slice: Record<string, any>): Promise<boolean> => {
    const part = spec.parts[name];
    try {
      await AsyncStorage.setItem(partKey(name), JSON.stringify(part.prepare ? part.prepare(slice) : slice));
      savedParts[name] = slice;
      return true;
    } catch (e) {
      debugLog('[persistence] could not save', name, e);
      return false;
    }
  };

  /** Writes an unsent item and its backup; false when it couldn't be (it's written again on the next save). */
  const writeItem = async (key: string, backup: string, item: any): Promise<boolean> => {
    try {
      const text = JSON.stringify(item);
      await AsyncStorage.setItem(key, text);
      await AsyncStorage.setItem(backup, text);
      return true;
    } catch (e) {
      debugLog('[persistence] could not save', key, e);
      savedQueue.delete(key);
      return false;
    }
  };

  const removeItem = async (key: string, backup: string): Promise<boolean> => {
    try {
      await AsyncStorage.removeItem(key);
      await AsyncStorage.removeItem(backup);
      return true;
    } catch (e) {
      debugLog('[persistence] could not remove', key, e);
      return false;
    }
  };

  /** Reads everything saved, moving the old single value over when it can be read. */
  async function load(seedVersionKey: string, seedVersion: number): Promise<LoadResult> {
    const restored: Record<string, any> = {};
    const queued: Record<string, any[]> = {};
    const unreadable: string[] = [];
    spec.queue.forEach((q) => { queued[q.kind] = []; });

    let keys: string[] = [];
    try {
      keys = await AsyncStorage.getAllKeys();
    } catch (e) {
      debugLog('[persistence] could not list saved values', e);
    }

    // Unsent items: the main copy, or its backup when the main copy can't be
    // read. A backup without a main copy is an item that was sent (or
    // deleted) as the app closed, so it goes.
    const mainKeys = new Set(keys.filter((k) => k.startsWith(QUEUE_PREFIX)));
    await Promise.all(keys.filter((k) => k.startsWith(BACKUP_PREFIX)).map(async (k) => {
      if (!mainKeys.has(QUEUE_PREFIX + k.slice(BACKUP_PREFIX.length))) {
        await AsyncStorage.removeItem(k).catch(() => {});
      }
    }));
    await Promise.all(Array.from(mainKeys).map(async (key) => {
      const rest = key.slice(QUEUE_PREFIX.length);
      const kind = rest.slice(0, rest.indexOf(':'));
      if (!(kind in queued)) return;
      const main = await readJson(key);
      if (main.status === 'ok') {
        queued[kind].push(main.value);
        savedQueue.set(key, main.value);
        return;
      }
      const backup = await readJson(BACKUP_PREFIX + rest);
      if (backup.status === 'ok') {
        queued[kind].push(backup.value);
        queueToRewrite.add(key);
        return;
      }
      unreadableItems.add(key);
      unreadable.push(key);
    }));

    // The seed version only decides whether the saved lists are restored;
    // unsent work always is.
    let seedMatches = false;
    try {
      seedMatches = Number(await AsyncStorage.getItem(seedVersionKey)) === seedVersion;
      if (!seedMatches) await AsyncStorage.setItem(seedVersionKey, String(seedVersion));
    } catch (e) {
      debugLog('[persistence] could not read the seed version', e);
    }

    const partStatus: Record<string, 'ok' | 'missing' | 'failed'> = {};
    await Promise.all(Object.entries(spec.parts).map(async ([name, part]) => {
      if (!seedMatches) {
        partStatus[name] = 'missing';
        return;
      }
      const read = await readJson(partKey(name));
      partStatus[name] = read.status;
      if (read.status === 'ok' && read.value && typeof read.value === 'object') {
        part.fields.forEach((f) => { if (f in read.value) restored[f] = read.value[f]; });
        savedParts[name] = Object.fromEntries(part.fields.map((f) => [f, restored[f]]));
      } else if (read.status === 'failed') {
        blocked.add(name);
        unreadable.push(partKey(name));
      }
    }));

    // The old single value: its unsent items join the queue, and it fills the
    // parts that aren't saved yet. Removed once everything is written; left
    // to be read again next time when it can't be read now.
    if (keys.includes(LEGACY_KEY)) {
      const legacy = await readJson(LEGACY_KEY);
      if (legacy.status === 'ok' && legacy.value && typeof legacy.value === 'object') {
        const old = legacy.value;
        spec.queue.forEach((q) => {
          const have = new Set(queued[q.kind].map((item) => String(item?.id)));
          q.items(old).forEach((item: any) => {
            if (!item?.id || have.has(String(item.id))) return;
            queued[q.kind].push(item);
            queueToRewrite.add(itemKey(q.kind, String(item.id)));
          });
        });
        if (seedMatches) {
          Object.entries(spec.parts).forEach(([name, part]) => {
            if (partStatus[name] !== 'missing') return;
            part.fields.forEach((f) => { if (f in old) restored[f] = old[f]; });
          });
        }
        legacyToRemove = true;
      } else if (legacy.status === 'failed') {
        unreadable.push(LEGACY_KEY);
      }
    }

    return { restored, queued, unreadable };
  }

  /** Writes what changed since the last save. Call with every new state once it's restored. */
  function save(state: any) {
    // Unsent items, straight away.
    const current = new Map<string, any>();
    spec.queue.forEach((q) => {
      q.items(state).forEach((item) => {
        if (item?.id) current.set(itemKey(q.kind, String(item.id)), item);
      });
    });
    const writes: Promise<boolean>[] = [];
    current.forEach((item, key) => {
      if (unreadableItems.has(key)) return;
      if (savedQueue.get(key) !== item || queueToRewrite.has(key)) {
        queueToRewrite.delete(key);
        writes.push(writeItem(key, BACKUP_PREFIX + key.slice(QUEUE_PREFIX.length), item));
      }
    });
    savedQueue.forEach((_, key) => {
      if (!current.has(key)) writes.push(removeItem(key, BACKUP_PREFIX + key.slice(QUEUE_PREFIX.length)));
    });
    savedQueue = new Map(Array.from(current).filter(([key]) => !unreadableItems.has(key)));

    // The session and the lists, when one of their fields changed.
    Object.entries(spec.parts).forEach(([name, part]) => {
      const slice = Object.fromEntries(part.fields.map((f) => [f, state[f]]));
      const before = savedParts[name];
      const changed = !before || part.fields.some((f) => before[f] !== slice[f]);
      if (!changed) return;
      if (blocked.has(name)) {
        // Couldn't be read: only real data from this session may replace it.
        const real = part.fields.some((f) => slice[f] !== spec.defaults[f] && !isEmptyValue(slice[f]));
        if (!real) return;
        blocked.delete(name);
      }
      pendingSlices[name] = slice;
      if (timers[name]) clearTimeout(timers[name]);
      timers[name] = setTimeout(() => {
        timers[name] = undefined;
        const latest = pendingSlices[name];
        pendingSlices[name] = undefined;
        if (latest) writePart(name, latest);
      }, part.debounceMs || 0);
    });

    if (legacyToRemove) {
      // The old value goes only once everything it held is written: when a
      // write fails, it's moved over again on the next start.
      legacyToRemove = false;
      Promise.all(writes).then(async (done) => {
        const flushed = await flush();
        if (done.every(Boolean) && flushed) await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
      });
    }
  }

  /** Writes any part still waiting for its debounce, e.g. as the app goes to the background; false when one couldn't be written. */
  async function flush(): Promise<boolean> {
    const waiting = Object.keys(pendingSlices).filter((name) => pendingSlices[name]);
    const done = await Promise.all(waiting.map((name) => {
      if (timers[name]) clearTimeout(timers[name]);
      timers[name] = undefined;
      const slice = pendingSlices[name] as Record<string, any>;
      pendingSlices[name] = undefined;
      return writePart(name, slice);
    }));
    return done.every(Boolean);
  }

  return { load, save, flush };
}

/** A record's date from its timestamp: the app's "M/D/YYYY, h:mm:ss AM" or the server's "YYYY-MM-DD[ HH:MM:SS]"; null when it's neither. */
export const recordDate = (timestamp?: string): Date | null => {
  if (!timestamp) return null;
  const iso = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const app = timestamp.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (app) return new Date(Number(app[3]), Number(app[1]) - 1, Number(app[2]));
  return null;
};

/** Records from the last `days` days (and any whose date can't be read). */
export const lastDays = <T extends { timestamp?: string }>(records: T[] | undefined, days: number, now: Date = new Date()): T[] => {
  if (!Array.isArray(records)) return [];
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return records.filter((r) => {
    const date = recordDate(r.timestamp);
    return !date || date >= cutoff;
  });
};
