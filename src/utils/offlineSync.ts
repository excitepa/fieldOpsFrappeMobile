import {
  createLead, createOutlet, updateOutlet, submitFieldSale, submitSalesOrder, submitSurveyResponse,
  getOutlets, getItems, getMyOrders, getMySales,
  OrderLinePayload,
} from '../services/api';
import { LeadDraft, Draft, OutletDraft, OutletSurvey } from '../types';

/**
 * Refreshes the core server-owned datasets the app caches locally (outlets,
 * products/stock, orders, sales). Offline-first: each dataset is only replaced
 * if its own request actually came back — a rejected one leaves the locally
 * cached copy untouched, so losing connectivity never blanks out data the
 * agent already had. A genuinely empty success still clears that list, which
 * is the honest outcome.
 *
 * Shared by the Sync screen's manual refresh and the automatic
 * reconnect refresh in App.tsx, so both behave identically.
 */
export async function pullServerData(
  campaignId: string | undefined,
  dispatch: (action: any) => void
): Promise<void> {
  const [outletsRes, productsRes, ordersRes, salesRes] = await Promise.allSettled([
    campaignId ? getOutlets(campaignId) : Promise.resolve([]),
    getItems(),
    getMyOrders(),
    getMySales(),
  ]);
  if (outletsRes.status === 'fulfilled') dispatch({ type: 'SET_OUTLETS', outlets: outletsRes.value });
  if (productsRes.status === 'fulfilled') dispatch({ type: 'SET_PRODUCTS', products: productsRes.value });
  if (ordersRes.status === 'fulfilled') dispatch({ type: 'SET_ORDERS', orders: ordersRes.value });
  if (salesRes.status === 'fulfilled') dispatch({ type: 'SET_SALES', sales: salesRes.value });
}

export interface SyncResult {
  synced: number;
  failed: number;
  /** Why each item failed, so "N still pending" can actually say what's wrong
   *  instead of leaving the agent (and us) with a bare count to guess from. */
  errors: string[];
}

/** Records a failed push with the real reason, and logs it for a device log trail. */
const noteFailure = (errors: string[], label: string, e: any) => {
  const reason = e?.message || String(e) || 'Unknown error';
  console.log('[offlineSync] failed to push', label, '->', reason);
  errors.push(`${label}: ${reason}`);
};

/** Collapses repeated reasons so the alert stays readable. */
export const summariseSyncErrors = (errors: string[], limit = 3): string => {
  const seen = new Map<string, number>();
  for (const e of errors) seen.set(e, (seen.get(e) || 0) + 1);
  const lines = Array.from(seen.entries())
    .slice(0, limit)
    .map(([msg, n]) => (n > 1 ? `• ${msg} (x${n})` : `• ${msg}`));
  const extra = seen.size - lines.length;
  if (extra > 0) lines.push(`• …and ${extra} more`);
  return lines.join('\n');
};

/**
 * Pushes every queued lead draft to the server, deleting each one locally as
 * it succeeds (left in the queue on failure, so a later sync attempt retries
 * it). Shared between SyncScreen and DraftsListScreen so both use the exact
 * same push logic instead of two copies drifting apart.
 */
export async function pushLeadDrafts(
  drafts: LeadDraft[],
  dispatch: (action: any) => void
): Promise<SyncResult> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const draft of drafts) {
    try {
      await createLead(draft.campaignId, {
        name: draft.name,
        company: draft.company,
        phone: draft.phone,
        email: draft.email,
        address: draft.address,
        source: draft.source,
        notes: draft.notes,
        value: draft.leadValue ? parseFloat(draft.leadValue) || undefined : undefined,
      });
      dispatch({ type: 'DELETE_LEAD_DRAFT', draftId: draft.id });
      synced++;
    } catch (e) {
      noteFailure(errors, `Lead "${draft.name}"`, e);
      failed++;
    }
  }
  return { synced, failed, errors };
}

/**
 * Pushes every queued sale/order draft (cart saved offline, or manually via
 * "Save Draft") to the server. Needs a fallback campaign id for drafts saved
 * before Draft.campaignId existed.
 */
export async function pushCartDrafts(
  drafts: Draft[],
  dispatch: (action: any) => void,
  fallbackCampaignId: string
): Promise<SyncResult> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const draft of drafts) {
    try {
      const campaignId = draft.campaignId || fallbackCampaignId;
      const lines: OrderLinePayload[] = draft.cart.map((l) => ({
        itemCode: l.productId,
        itemName: l.productName,
        qty: l.quantity,
        rate: l.unitPrice,
      }));
      if (draft.mode === 'sale') {
        const total = draft.cart.reduce((sum, l) => sum + l.unitPrice * l.quantity - l.discount, 0);
        await submitFieldSale(draft.outletId, campaignId, lines, total);
      } else {
        await submitSalesOrder(draft.outletId, campaignId, lines);
      }
      dispatch({ type: 'DELETE_DRAFT', draftId: draft.id });
      synced++;
    } catch (e) {
      noteFailure(errors, `${draft.mode === 'sale' ? 'Sale' : 'Order'} at ${draft.outletName}`, e);
      failed++;
    }
  }
  return { synced, failed, errors };
}

/** Pushes every locally-queued draft survey (isDraft: true) to the server. */
export async function pushSurveyDrafts(
  drafts: OutletSurvey[],
  dispatch: (action: any) => void
): Promise<SyncResult> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const draft of drafts) {
    if (!draft.surveyConfigId) {
      noteFailure(errors, `Survey "${draft.surveyName || 'draft'}"`, new Error('saved without a survey id, cannot be resubmitted'));
      failed++;
      continue;
    }
    try {
      await submitSurveyResponse(
        draft.surveyConfigId,
        draft.answers.map((a) => ({ questionId: a.questionId, questionType: a.questionType || 'text', answer: a.answer })),
        undefined,
        undefined,
        draft.outletId
      );
      dispatch({ type: 'MARK_SURVEY_SYNCED', surveyId: draft.id });
      synced++;
    } catch (e) {
      noteFailure(errors, `Survey "${draft.surveyName || 'draft'}"`, e);
      failed++;
    }
  }
  return { synced, failed, errors };
}

/** Pushes every queued outlet create/edit draft to the server. */
export async function pushOutletDrafts(
  drafts: OutletDraft[],
  dispatch: (action: any) => void
): Promise<SyncResult> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const draft of drafts) {
    try {
      if (draft.mode === 'create') {
        await createOutlet(draft.campaignId, {
          name: draft.name,
          type: draft.type,
          subChannel: draft.subChannel,
          address: draft.address,
          phone: draft.phone,
          ownerName: draft.ownerName,
          ownerPhone: draft.ownerPhone,
          photoUri: draft.photoUri,
          latitude: draft.latitude,
          longitude: draft.longitude,
        });
      } else if (draft.outletId) {
        await updateOutlet(draft.outletId, {
          name: draft.name,
          type: draft.type,
          subChannel: draft.subChannel,
          address: draft.address,
          phone: draft.phone,
          ownerName: draft.ownerName,
          ownerPhone: draft.ownerPhone,
          notes: draft.notes,
          // Was dropped here, so a photo added to an outlet while offline was
          // queued locally and then never actually uploaded on sync.
          photoUri: draft.photoUri,
          latitude: draft.latitude,
          longitude: draft.longitude,
        });
      } else {
        noteFailure(errors, `Outlet "${draft.name}"`, new Error('edit draft is missing its outlet id'));
        failed++;
        continue;
      }
      dispatch({ type: 'DELETE_OUTLET_DRAFT', draftId: draft.id });
      synced++;
    } catch (e) {
      noteFailure(errors, `Outlet "${draft.name}"`, e);
      failed++;
    }
  }
  return { synced, failed, errors };
}
