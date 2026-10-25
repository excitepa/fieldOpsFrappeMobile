import { Draft, OutletSale, OutletOrder } from '../types';
import { localDateStr, parseAppTimestamp } from './timestamp';

export function isToday(timestamp: string, today: Date = new Date()): boolean {
  const d = parseAppTimestamp(timestamp);
  if (isNaN(d.getTime())) return false;
  return d.toDateString() === today.toDateString();
}

/**
 * Real, server-derived "which outlets has this agent visited today" — a sale or
 * order against an outlet today counts as a visit. This used to be a plain local
 * flag (MARK_OUTLET_VISITED / RESET_OUTLET_VISIT_STATUS on outlet.status) set only
 * on whichever device completed the action — meaning it never reflected reality
 * if the agent switched phones mid-day, and vanished on a reinstall. Sales and
 * orders already carry a real `outlet` id and date from the backend (confirmed
 * live), so "visited" is derived from that instead of trusted local-only state.
 *
 * Surveys can't be included yet — get_my_surveys doesn't return which outlet a
 * response belongs to (confirmed live: {"survey":"SRV-0001","status":"Submitted"},
 * no outlet field at all) — so a survey-only visit is currently invisible to this.
 * That's a backend gap, not something fixable from here.
 */
export function getOutletIdsVisitedToday(sales: OutletSale[], orders: OutletOrder[], drafts: Draft[] = []): Set<string> {
  const ids = new Set<string>();
  sales.forEach((s) => { if (isToday(s.timestamp)) ids.add(s.outletId); });
  orders.forEach((o) => { if (isToday(o.timestamp)) ids.add(o.outletId); });
  // A sale or order submitted today with no connection: the visit happened,
  // it just hasn't been sent.
  const today = localDateStr();
  drafts.forEach((d) => { if (d.ready && d.happenedAt?.startsWith(today)) ids.add(d.outletId); });
  return ids;
}

export function isOutletVisitedToday(outletId: string, sales: OutletSale[], orders: OutletOrder[], drafts: Draft[] = []): boolean {
  return getOutletIdsVisitedToday(sales, orders, drafts).has(outletId);
}
