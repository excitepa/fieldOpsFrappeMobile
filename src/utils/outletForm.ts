import { MasterOption, OutletFormOptions } from '../types';

/**
 * The outlet's classification on the Add/Edit Outlet form, by id: Channel >
 * Sub Channel > Outlet Type, each picked from under the one above.
 */
export interface OutletPicks {
  channelId?: string;
  subChannelId?: string;
  outletTypeId?: string;
}

/** A channel's sub channels ([] when no channel is picked). */
export const subChannelsOf = (options: OutletFormOptions, channelId?: string): MasterOption[] =>
  channelId ? (options.subChannels || []).filter((s) => s.parent === channelId) : [];

/**
 * The outlet types to offer for the picks: the sub channel's, plus the types
 * under none yet (an older type, until an admin places it; a list kept from
 * before types had a sub channel is all of those). Nothing until a sub channel
 * is picked, except where there can't be one: the sub channels never loaded
 * (every type), or the channel has none (the unplaced types).
 */
export const typesOf = (options: OutletFormOptions, picks: OutletPicks): MasterOption[] => {
  const types = options.types || [];
  if (picks.subChannelId) return types.filter((t) => !t.parent || t.parent === picks.subChannelId);
  if (options.subChannels === undefined) return types;
  if (picks.channelId && subChannelsOf(options, picks.channelId).length === 0) return types.filter((t) => !t.parent);
  return [];
};

/** The picks with a new channel: a sub channel outside it goes, and then a type outside the sub channel. */
export const pickChannel = (options: OutletFormOptions, picks: OutletPicks, channelId: string): OutletPicks => {
  const keepSub = subChannelsOf(options, channelId).some((s) => s.id === picks.subChannelId);
  return withTypeInside(options, { ...picks, channelId, subChannelId: keepSub ? picks.subChannelId : undefined });
};

/** The picks with a new sub channel: a type outside it goes. */
export const pickSubChannel = (options: OutletFormOptions, picks: OutletPicks, subChannelId: string): OutletPicks =>
  withTypeInside(options, { ...picks, subChannelId });

/**
 * Why the form can't be saved yet, or null, asked in the form's order: the
 * channel, the sub channel when the channel has any, then the type when there
 * are any to offer. A list that has never loaded (or has nothing in it) gives
 * nothing to choose, so it isn't required.
 */
export const missingPick = (options: OutletFormOptions, picks: OutletPicks): string | null => {
  if (options.channels?.length && !picks.channelId) return 'Please choose the outlet channel.';
  if (subChannelsOf(options, picks.channelId).length > 0 && !picks.subChannelId) return 'Please choose the outlet sub channel.';
  if (typesOf(options, picks).length > 0 && !picks.outletTypeId) return 'Please choose the outlet type.';
  return null;
};

/** Whether the picks differ from what the outlet has saved: Edit Outlet checks them only then. */
export const classificationChanged = (saved: OutletPicks, picks: OutletPicks): boolean =>
  (['channelId', 'subChannelId', 'outletTypeId'] as const).some((key) => (saved[key] || undefined) !== (picks[key] || undefined));

/** The type picker's placeholder: the list's state, or that it waits for a sub channel. */
export const typePlaceholder = (options: OutletFormOptions, picks: OutletPicks, loading: boolean): string => {
  if (options.types === undefined) return listPlaceholder(undefined, loading, '');
  if (typesOf(options, picks).length > 0) return 'Select outlet type';
  if (picks.subChannelId) return 'None for this sub channel';
  if (picks.channelId && options.subChannels !== undefined && subChannelsOf(options, picks.channelId).length === 0) return 'None for this channel';
  return 'Select a sub channel first';
};

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

/** A picker's placeholder for its list's state: still loading, never loaded, empty, or ready. */
export const listPlaceholder = (list: MasterOption[] | undefined, loading: boolean, prompt: string): string => {
  if (list === undefined) return loading ? 'Loading…' : 'Not available offline';
  return list.length === 0 ? 'None to choose from' : prompt;
};

const withTypeInside = (options: OutletFormOptions, picks: OutletPicks): OutletPicks =>
  typesOf(options, picks).some((t) => t.id === picks.outletTypeId) ? picks : { ...picks, outletTypeId: undefined };
