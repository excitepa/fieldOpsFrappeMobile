import * as Crypto from 'expo-crypto';
import type { FieldState } from '../store/useFieldStore';
import { ActionStamp, Lead } from '../types';
import { localDateTimeStr } from './timestamp';

/** A one-time ID for an action (client_ref): the server answers a repeat of it as it did the first time. */
export const newClientRef = (): string => Crypto.randomUUID();

/**
 * What an action gets the moment the agent does it, before its first request:
 * its one-time ID, when it happened and who did it. Kept on the draft or queued
 * item when the request fails, and sent unchanged on every retry.
 */
export const newStamp = (agentEmail?: string): Required<Pick<ActionStamp, 'clientRef' | 'happenedAt'>> & ActionStamp => ({
  clientRef: newClientRef(),
  happenedAt: localDateTimeStr(),
  agentEmail: agentEmail?.trim().toLowerCase() || undefined,
});

/** Whether the signed-in agent may send this item: theirs, or saved before items had an owner. */
export const isMine = (item: ActionStamp, email?: string): boolean =>
  !item.agentEmail || item.agentEmail === (email || '').trim().toLowerCase();

/** When an item was done, for ordering: its happenedAt, else the Date.now() in its id, else 0. */
export const itemTime = (item: { id?: string; happenedAt?: string }): number => {
  const at = item.happenedAt?.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (at) return new Date(+at[1], +at[2] - 1, +at[3], +at[4], +at[5], +at[6]).getTime();
  const stamp = String(item.id || '').match(/\d{13}/);
  return stamp ? Number(stamp[0]) : 0;
};

export const newestFirst = <T extends { id?: string; happenedAt?: string }>(items: T[] = []): T[] =>
  [...items].sort((a, b) => itemTime(b) - itemTime(a));

export const oldestFirst = <T extends { id?: string; happenedAt?: string }>(items: T[] = []): T[] =>
  [...items].sort((a, b) => itemTime(a) - itemTime(b));

/** An outlet onboarded offline has a temporary id (od_...) until it reaches the server. */
export const isOfflineOutletId = (id?: string): boolean => !!id && id.startsWith('od_');

/** A lead added offline has its draft's id (ld_...) until it reaches the server. */
export const isOfflineLeadId = (id?: string): boolean => !!id && id.startsWith('ld_');

const swap = (value: string | undefined, from: string, to: string) => (value === from ? to : value);

/**
 * An outlet onboarded offline reached the server: its id there replaces the
 * temporary one everywhere on the phone — the outlets list, every unsent item,
 * the history, the visit status and the route — so what was recorded there
 * goes to the right outlet.
 */
export function remapOutletInState(state: FieldState, from: string, to: string): FieldState {
  if (!from || !to || from === to) return state;
  const already = state.outlets.some((o) => o.id === to);
  return {
    ...state,
    outlets: already
      ? state.outlets.filter((o) => o.id !== from)
      : state.outlets.map((o) => (o.id === from ? { ...o, id: to } : o)),
    drafts: state.drafts.map((d) =>
      d.outletId === from || d.customerId === from ? { ...d, outletId: swap(d.outletId, from, to) as string, customerId: swap(d.customerId, from, to) } : d),
    outletDrafts: state.outletDrafts.map((d) => (d.outletId === from ? { ...d, outletId: to } : d)),
    surveys: state.surveys.map((s) => (s.outletId === from ? { ...s, outletId: to } : s)),
    queuedActions: state.queuedActions.map((a) => (a.kind === 'skip' && a.outletId === from ? { ...a, outletId: to } : a)),
    sales: state.sales.map((s) =>
      s.outletId === from || s.customerId === from ? { ...s, outletId: swap(s.outletId, from, to) as string, customerId: swap(s.customerId, from, to) as string } : s),
    orders: state.orders.map((o) =>
      o.outletId === from || o.customerId === from ? { ...o, outletId: swap(o.outletId, from, to) as string, customerId: swap(o.customerId, from, to) as string } : o),
    skipRecords: state.skipRecords.map((r) => (r.outletId === from ? { ...r, outletId: to } : r)),
    photoCaptures: state.photoCaptures.map((c) => (c.outletId === from ? { ...c, outletId: to } : c)),
    routeAssignments: state.routeAssignments.map((r) =>
      r.outletIds.includes(from) ? { ...r, outletIds: r.outletIds.map((id) => (id === from ? to : id)) } : r),
  };
}

/** A lead added offline reached the server: its id there replaces the temporary one on the phone. */
export function remapLeadInState(state: FieldState, from: string, to: string, lead?: Lead): FieldState {
  if (!from || !to || from === to) return state;
  const already = state.leads.some((l) => l.id === to);
  return {
    ...state,
    leads: already
      ? state.leads.filter((l) => l.id !== from)
      : state.leads.map((l) => (l.id === from ? { ...l, ...lead, id: to } : l)),
    queuedActions: state.queuedActions.map((a) =>
      (a.kind === 'leadStage' || a.kind === 'leadRegression') && a.leadId === from ? { ...a, leadId: to } : a),
    leadSurveyResponses: state.leadSurveyResponses.map((r) => (r.leadId === from ? { ...r, leadId: to } : r)),
  };
}
