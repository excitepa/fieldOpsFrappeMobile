import { MasterOption, OutletFormOptions } from '../types';

/** What the agent picked on the Add/Edit Outlet form, by id. */
export interface OutletPicks {
  outletTypeId?: string;
  channelId?: string;
  subChannelId?: string;
  distributorId?: string;
}

/** A channel's sub-channels ([] when no channel is picked). */
export const subChannelsOf = (options: OutletFormOptions, channelId?: string): MasterOption[] =>
  channelId ? (options.subChannels || []).filter((s) => s.parent === channelId) : [];

/**
 * The picked option's name: from the list, or else the name the outlet
 * already had for that id (a choice since made inactive isn't in the list).
 */
export const pickedName = (
  list: MasterOption[] | undefined,
  id: string | undefined,
  knownId?: string,
  knownName?: string,
): string | undefined => {
  if (!id) return undefined;
  return list?.find((o) => o.id === id)?.name || (id === knownId ? knownName : undefined);
};

/**
 * Why the form can't be saved yet, or null. Outlet Type and Channel are
 * required, the sub-channel when the chosen channel has any, and the
 * distributor when the agent has any. A list that has never loaded (or has
 * nothing in it) gives nothing to choose, so it isn't required.
 */
export const missingPick = (options: OutletFormOptions, picks: OutletPicks): string | null => {
  if (options.types?.length && !picks.outletTypeId) return 'Please choose the outlet type.';
  if (options.channels?.length && !picks.channelId) return 'Please choose the outlet channel.';
  if (subChannelsOf(options, picks.channelId).length > 0 && !picks.subChannelId) return 'Please choose the outlet sub-channel.';
  if (options.distributors?.length && !picks.distributorId) return 'Please choose the distributor.';
  return null;
};

/** A picker's placeholder for its list's state: still loading, never loaded, empty, or ready. */
export const listPlaceholder = (list: MasterOption[] | undefined, loading: boolean, prompt: string): string => {
  if (list === undefined) return loading ? 'Loading…' : 'Not available offline';
  return list.length === 0 ? 'None to choose from' : prompt;
};
