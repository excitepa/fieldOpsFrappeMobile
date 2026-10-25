import {
  createLead, createOutlet, updateOutlet, submitFieldSale, submitSalesOrder, submitSurveyResponse, uploadSurveyPhoto,
  skipOutletVisit, updateLeadStage, requestLeadRegression, submitStockRequest,
  getOutlets, getItems, getMyOrders, getMySales, getMyGeofence,
  OrderLinePayload, AuthError, NetworkError, ActionMeta,
} from '../services/api';
import { LeadDraft, Draft, OutletDraft, OutletSurvey, SurveyAnswer, PendingSurveyPhoto, ActionStamp, QueuedAction } from '../types';
import { discardKeptPhoto, discardSurveyPhoto, discardSurveyPhotos, surveyPhotoExists } from './surveyPhotos';
import { isAnswered, surveyRejectionMessage } from './surveyAnswers';
import { isOfflineLeadId, isOfflineOutletId, newClientRef, oldestFirst } from './queue';
import { debugLog } from './logger';

/**
 * An item saved before items carried a one-time ID gets one now, kept on it
 * before it's first sent, so the server recognises a retry of it.
 */
const withRef = <T extends ActionStamp>(item: T, keep: (stamped: T) => void): T => {
  if (item.clientRef) return item;
  const stamped = { ...item, clientRef: newClientRef() };
  keep(stamped);
  return stamped;
};

/** What a queued item is sent with: its one-time ID and when it happened, as sent later from the queue. */
const queuedMeta = (item: ActionStamp): ActionMeta => ({ clientRef: item.clientRef, happenedAt: item.happenedAt, capturedOffline: true });

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
  const [outletsRes, productsRes, ordersRes, salesRes, geofenceRes] = await Promise.allSettled([
    campaignId ? getOutlets(campaignId) : Promise.resolve([]),
    getItems(),
    getMyOrders(),
    getMySales(),
    getMyGeofence(),
  ]);
  if (outletsRes.status === 'fulfilled') dispatch({ type: 'SET_OUTLETS', outlets: outletsRes.value });
  if (productsRes.status === 'fulfilled') dispatch({ type: 'SET_PRODUCTS', products: productsRes.value });
  if (ordersRes.status === 'fulfilled') dispatch({ type: 'SET_ORDERS', orders: ordersRes.value });
  if (salesRes.status === 'fulfilled') dispatch({ type: 'SET_SALES', sales: salesRes.value });
  if (geofenceRes.status === 'fulfilled') dispatch({ type: 'SET_GEOFENCE', geofence: geofenceRes.value });
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
  debugLog('[offlineSync] failed to push', label, '->', reason);
  errors.push(`${label}: ${reason}`);
};

/** A refusal: the server answered and said no (anything but a lost connection or an expired login). */
const isRefusal = (e: any) => !(e instanceof NetworkError) && !(e instanceof AuthError);

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
): Promise<SyncResult & { ids: Record<string, string> }> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  // A lead added offline goes by its draft's id until it's on the server.
  const ids: Record<string, string> = {};
  for (const queued of oldestFirst(drafts)) {
    const draft = withRef(queued, (d) => dispatch({ type: 'SAVE_LEAD_DRAFT', leadDraft: d }));
    try {
      const lead = await createLead(draft.campaignId, {
        name: draft.name,
        company: draft.company,
        phone: draft.phone,
        email: draft.email,
        address: draft.address,
        source: draft.source,
        notes: draft.notes,
        value: draft.leadValue ? parseFloat(draft.leadValue) || undefined : undefined,
      }, queuedMeta(draft));
      // Its id on the server replaces the draft's on the phone, so a stage
      // change made offline goes to the right lead.
      if (lead.id) {
        ids[draft.id] = lead.id;
        dispatch({ type: 'REMAP_LEAD_ID', from: draft.id, to: lead.id });
      }
      dispatch({ type: 'DELETE_LEAD_DRAFT', draftId: draft.id });
      synced++;
    } catch (e: any) {
      noteFailure(errors, `Lead "${draft.name}"`, e);
      failed++;
      if (isRefusal(e)) dispatch({ type: 'SAVE_LEAD_DRAFT', leadDraft: { ...draft, syncError: e?.message || 'The server refused it.' } });
    }
  }
  return { synced, failed, errors, ids };
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
  for (const queued of oldestFirst(drafts)) {
    const draft = withRef(queued, (d) => dispatch({ type: 'SAVE_DRAFT', draft: d }));
    try {
      const campaignId = draft.campaignId || fallbackCampaignId;
      // A line saved before units has no uom: the server reads it as the
      // product's stock unit, which is what its quantity was counted in.
      const lines: OrderLinePayload[] = draft.cart.map((l) => ({
        itemCode: l.productId,
        itemName: l.productName,
        qty: l.quantity,
        uom: l.uom,
        rate: l.unitPrice,
      }));
      if (draft.mode === 'sale') {
        const total = draft.cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
        // Where it was recorded (and the agent's reason when that was away
        // from the outlet), for the server's check; it's synced later, so
        // captured offline.
        await submitFieldSale(draft.outletId, campaignId, lines, total, { ...draft.saleLocation, capturedOffline: true }, draft.promoCode, queuedMeta(draft));
      } else {
        await submitSalesOrder(draft.outletId, campaignId, lines, draft.promoCode, queuedMeta(draft));
      }
      dispatch({ type: 'DELETE_DRAFT', draftId: draft.id });
      synced++;
    } catch (e: any) {
      noteFailure(errors, `${draft.mode === 'sale' ? 'Sale' : 'Order'} at ${draft.outletName}`, e);
      failed++;
      // A refusal (such as INSUFFICIENT_STOCK for a sale the agent can't
      // cover) keeps the draft, with the server's reason on it for the
      // Drafts and Sync pages. A lost connection isn't a refusal.
      if (isRefusal(e)) {
        dispatch({ type: 'SAVE_DRAFT', draft: { ...draft, syncError: e?.message || 'The server refused it.' } });
      }
    }
  }
  return { synced, failed, errors };
}

/**
 * A draft's photo answers hold the photo's local path. Drafts saved before
 * answers carried questionType can still hold one as a plain answer, so a
 * local file path counts as a photo too — it must never be submitted as text.
 */
const isPhotoAnswer = (a: SurveyAnswer) =>
  a.questionType === 'photo' || (!a.questionType && typeof a.answer === 'string' && a.answer.startsWith('file://'));

/**
 * Why a survey draft can't be sent as it is, or '' when it can: every
 * question must be answered, and every photo must still be on the phone.
 */
const surveyDraftProblem = (draft: OutletSurvey): string => {
  const blank = draft.answers.filter((a) => !isAnswered(a.answer, isPhotoAnswer(a) ? 'photo' : a.questionType));
  if (blank.length > 0) return `Not complete: ${blank.map((a) => `"${a.question}"`).join(', ')} unanswered.`;
  const lost = draft.answers.filter((a) => isPhotoAnswer(a) && !surveyPhotoExists(a.answer as string));
  if (lost.length > 0) return `The photo for ${lost.map((a) => `"${a.question}"`).join(', ')} is no longer on this device.`;
  return '';
};

/**
 * Pushes every locally-queued draft survey (isDraft: true) to the server, its
 * photos in the same request: a photo answer holds the kept photo's path, and
 * the server only accepts a survey that carries all of them. Once accepted,
 * the phone's copies are deleted. A draft that isn't complete, or has lost a
 * photo, isn't sent, and one the server refuses stays too: both keep the
 * reason for the Drafts and Sync pages, where the draft can be deleted.
 */
export async function pushSurveyDrafts(
  drafts: OutletSurvey[],
  dispatch: (action: any) => void
): Promise<SyncResult> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const queued of oldestFirst(drafts)) {
    const draft = withRef(queued, (d) => dispatch({ type: 'UPDATE_SURVEY', survey: d }));
    if (!draft.surveyConfigId) {
      noteFailure(errors, `Survey "${draft.surveyName || 'draft'}"`, new Error('saved without a survey id, cannot be resubmitted'));
      failed++;
      continue;
    }
    const problem = surveyDraftProblem(draft);
    if (problem) {
      noteFailure(errors, `Survey "${draft.surveyName || 'draft'}"`, new Error(problem));
      dispatch({ type: 'SET_SURVEY_SYNC_ERROR', surveyId: draft.id, error: problem });
      failed++;
      continue;
    }
    try {
      const photos: Record<string, string> = {};
      draft.answers.forEach((a) => {
        if (isPhotoAnswer(a) && typeof a.answer === 'string' && a.answer) photos[a.questionId] = a.answer;
      });
      await submitSurveyResponse(
        draft.surveyConfigId,
        draft.answers.map((a) => ({ questionId: a.questionId, questionType: isPhotoAnswer(a) ? 'photo' : a.questionType || 'text', answer: a.answer })),
        undefined,
        undefined,
        draft.outletId,
        photos,
        queuedMeta(draft)
      );
      dispatch({ type: 'MARK_SURVEY_SYNCED', surveyId: draft.id });
      discardSurveyPhotos(photos);
      synced++;
    } catch (e: any) {
      noteFailure(errors, `Survey "${draft.surveyName || 'draft'}"`, e);
      failed++;
      // A refusal (REQUIRED_ANSWERS_MISSING included) keeps the draft with the
      // server's reason; a lost connection isn't a refusal.
      if (isRefusal(e)) {
        dispatch({ type: 'SET_SURVEY_SYNC_ERROR', surveyId: draft.id, error: surveyRejectionMessage(e) });
      }
    }
  }
  return { synced, failed, errors };
}

/**
 * Retries every queued survey photo — its survey response is already on the
 * server, only the photo upload didn't make it. Each is removed from the queue
 * (and its local copy deleted) once it's up. One with no response id or no
 * local file left can never upload, so it's dropped with the reason instead of
 * staying "pending" forever.
 */
export async function pushSurveyPhotos(
  photos: PendingSurveyPhoto[],
  dispatch: (action: any) => void
): Promise<SyncResult> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const photo of photos) {
    const label = `Photo for survey "${photo.surveyName || 'survey'}"`;
    if (!photo.responseId || !surveyPhotoExists(photo.photoUri)) {
      const why = !photo.responseId ? 'there is no survey response to attach it to' : 'the photo file is no longer on this device';
      noteFailure(errors, label, new Error(`${why}, removed from the queue`));
      dispatch({ type: 'DELETE_SURVEY_PHOTO', photoId: photo.id });
      failed++;
      continue;
    }
    try {
      await uploadSurveyPhoto(photo.responseId, photo.questionId, photo.photoUri);
      discardSurveyPhoto(photo.photoUri);
      dispatch({ type: 'DELETE_SURVEY_PHOTO', photoId: photo.id });
      synced++;
    } catch (e) {
      noteFailure(errors, label, e);
      failed++;
    }
  }
  return { synced, failed, errors };
}

/** How a queued action is named on the Drafts and Sync pages. */
export const queuedActionLabel = (a: QueuedAction): string =>
  a.kind === 'skip' ? `Skip at ${a.outletName}`
  : a.kind === 'leadStage' ? `${a.leadName}: move to ${a.stage}`
  : a.kind === 'leadRegression' ? `${a.leadName}: ask to move back to ${a.toStage}`
  : `Stock request (${a.lines.length} product${a.lines.length === 1 ? '' : 's'})`;

/**
 * Pushes every queued skip, lead stage change, approval request and stock
 * request, oldest first, each with its one-time ID, deleting each once the
 * server has it. One the server refuses stays with its reason; one for an
 * outlet or lead added offline that hasn't reached the server yet waits.
 */
export async function pushQueuedActions(
  actions: QueuedAction[],
  dispatch: (action: any) => void
): Promise<SyncResult> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const queued of oldestFirst(actions)) {
    const action = withRef(queued, (a) => dispatch({ type: 'QUEUE_ACTION', action: a }));
    const label = queuedActionLabel(action);
    const waitingFor = action.kind === 'skip' && isOfflineOutletId(action.outletId) ? 'its new outlet'
      : (action.kind === 'leadStage' || action.kind === 'leadRegression') && isOfflineLeadId(action.leadId) ? 'its new lead'
      : '';
    if (waitingFor) {
      noteFailure(errors, label, new Error(`waiting for ${waitingFor} to be sent first`));
      failed++;
      continue;
    }
    try {
      const meta = queuedMeta(action);
      if (action.kind === 'skip') {
        const coords = action.latitude !== undefined && action.longitude !== undefined ? { lat: action.latitude, lng: action.longitude } : undefined;
        await skipOutletVisit(action.outletId, action.campaignId, action.reason, meta, coords);
      } else if (action.kind === 'leadStage') {
        await updateLeadStage(action.leadId, action.stage, action.reason, action.notes, meta);
      } else if (action.kind === 'leadRegression') {
        await requestLeadRegression(action.leadId, action.toStage, action.reason, meta);
      } else {
        await submitStockRequest(action.campaignId, action.lines, action.note, meta);
      }
      dispatch({ type: 'DELETE_QUEUED_ACTION', actionId: action.id });
      synced++;
    } catch (e: any) {
      noteFailure(errors, label, e);
      failed++;
      if (isRefusal(e)) dispatch({ type: 'QUEUE_ACTION', action: { ...action, syncError: e?.message || 'The server refused it.' } });
    }
  }
  return { synced, failed, errors };
}

/** Items recorded at an outlet that's still waiting to reach the server: they can't go before it. */
const waitingForOutlet = <T>(items: T[], outletOf: (item: T) => string | undefined, label: (item: T) => string, result: SyncResult): T[] =>
  items.filter((item) => {
    if (!isOfflineOutletId(outletOf(item))) return true;
    noteFailure(result.errors, label(item), new Error('waiting for its new outlet to be sent first'));
    result.failed++;
    return false;
  });

/**
 * Pushes every queue. New outlets and outlet edits go first: what was
 * recorded at an outlet onboarded offline goes with the id the server gave
 * it (it waits while that outlet hasn't reached the server), and the server
 * has to see an edit before the survey that follows it, or the survey that
 * edit made due stays due. New leads go next, for the same reason. The rest
 * go together.
 */
export async function pushAllDrafts(
  queues: {
    leadDrafts: LeadDraft[]; cartDrafts: Draft[]; surveyDrafts: OutletSurvey[]; outletDrafts: OutletDraft[];
    surveyPhotos?: PendingSurveyPhoto[]; queuedActions?: QueuedAction[];
  },
  dispatch: (action: any) => void,
  fallbackCampaignId: string
): Promise<{ leads: SyncResult; carts: SyncResult; surveys: SyncResult; outlets: SyncResult; photos: SyncResult; actions: SyncResult; notices: string[] }> {
  const outlets = await pushOutletDrafts(queues.outletDrafts, dispatch);
  const leads = await pushLeadDrafts(queues.leadDrafts, dispatch);

  // The store swaps the ids too (REMAP_OUTLET_ID); these copies were taken before it did.
  const outletId = (id?: string) => (id && outlets.ids[id]) || id;
  const waitingCarts: SyncResult = { synced: 0, failed: 0, errors: [] };
  const waitingSurveys: SyncResult = { synced: 0, failed: 0, errors: [] };
  const carts = waitingForOutlet(
    queues.cartDrafts.map((d) => (outlets.ids[d.outletId] ? { ...d, outletId: outletId(d.outletId) as string, customerId: outletId(d.customerId) } : d)),
    (d) => d.outletId,
    (d) => `${d.mode === 'sale' ? 'Sale' : 'Order'} at ${d.outletName}`,
    waitingCarts,
  );
  const surveys = waitingForOutlet(
    queues.surveyDrafts.map((d) => (outlets.ids[d.outletId] ? { ...d, outletId: outletId(d.outletId) as string } : d)),
    (d) => d.outletId,
    (d) => `Survey "${d.surveyName || 'draft'}"`,
    waitingSurveys,
  );

  // A skip at a new outlet and a stage change of a new lead go with the ids the server gave them.
  const queuedActions = (queues.queuedActions || []).map((a) => {
    if (a.kind === 'skip' && outlets.ids[a.outletId]) return { ...a, outletId: outlets.ids[a.outletId] };
    if ((a.kind === 'leadStage' || a.kind === 'leadRegression') && leads.ids[a.leadId]) return { ...a, leadId: leads.ids[a.leadId] };
    return a;
  });

  const [cartsSent, surveysSent, actions] = await Promise.all([
    pushCartDrafts(carts, dispatch, fallbackCampaignId),
    pushSurveyDrafts(surveys, dispatch),
    pushQueuedActions(queuedActions, dispatch),
  ]);
  const photos = await pushSurveyPhotos(queues.surveyPhotos || [], dispatch);
  const merge = (a: SyncResult, b: SyncResult): SyncResult => ({ synced: a.synced + b.synced, failed: a.failed + b.failed, errors: [...b.errors, ...a.errors] });
  return {
    leads,
    carts: merge(cartsSent, waitingCarts),
    surveys: merge(surveysSent, waitingSurveys),
    outlets,
    photos,
    actions,
    notices: outlets.notices,
  };
}

/**
 * Pushes every queued outlet create/edit draft to the server, oldest first.
 * An outlet onboarded offline goes by a temporary id (od_...) until it's
 * there: its id on the server then replaces it everywhere on the phone
 * (REMAP_OUTLET_ID), and returned in `ids` for what's sent after it. A draft's
 * kept photo is deleted once it's gone up with it.
 */
export async function pushOutletDrafts(
  drafts: OutletDraft[],
  dispatch: (action: any) => void
): Promise<SyncResult & { ids: Record<string, string>; notices: string[] }> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  const ids: Record<string, string> = {};
  // What to tell the agent beyond sent / not sent.
  const notices: string[] = [];
  for (const queued of oldestFirst(drafts)) {
    const draft = withRef(queued, (d) => dispatch({ type: 'SAVE_OUTLET_DRAFT', outletDraft: d }));
    try {
      if (draft.mode === 'create') {
        const { outlet, photoUploaded, photoError, possibleDuplicate } = await createOutlet(draft.campaignId, {
          name: draft.name,
          type: draft.type,
          outletTypeId: draft.outletTypeId,
          channelId: draft.channelId,
          subChannelId: draft.subChannelId,
          distributorId: draft.distributorId,
          subChannel: draft.subChannel,
          address: draft.address,
          phone: draft.phone,
          ownerName: draft.ownerName,
          ownerPhone: draft.ownerPhone,
          photoUri: draft.photoUri,
          latitude: draft.latitude,
          longitude: draft.longitude,
          confirmedNew: draft.confirmedNew,
        }, queuedMeta(draft));
        if (outlet.id) {
          ids[draft.id] = outlet.id;
          dispatch({ type: 'REMAP_OUTLET_ID', from: draft.id, to: outlet.id });
        }
        if (draft.photoUri) {
          if (!photoUploaded) notices.push(`${draft.name} was sent, but its photo wasn't${photoError ? ` (${photoError})` : ''}. Add it again from Edit Customer.`);
          discardKeptPhoto(draft.photoUri);
        }
        if (possibleDuplicate) notices.push(`Sent. Your supervisor will check whether ${draft.name} is a duplicate.`);
      } else if (draft.outletId) {
        const target = ids[draft.outletId] || draft.outletId;
        // An edit of an outlet onboarded offline that hasn't reached the server.
        if (isOfflineOutletId(target)) {
          noteFailure(errors, `Outlet "${draft.name}"`, new Error('waiting for the new outlet to be sent first'));
          failed++;
          continue;
        }
        await updateOutlet(target, {
          name: draft.name,
          type: draft.type,
          outletTypeId: draft.outletTypeId,
          channelId: draft.channelId,
          subChannelId: draft.subChannelId,
          distributorId: draft.distributorId,
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
          gpsAccuracy: draft.gpsAccuracy,
          // Its campaign's after-edit survey becomes due once it reaches the server.
          campaign: draft.campaignId,
        }, queuedMeta(draft));
        discardKeptPhoto(draft.photoUri);
      } else {
        noteFailure(errors, `Outlet "${draft.name}"`, new Error('edit draft is missing its outlet id'));
        failed++;
        continue;
      }
      dispatch({ type: 'DELETE_OUTLET_DRAFT', draftId: draft.id });
      synced++;
    } catch (e: any) {
      noteFailure(errors, `Outlet "${draft.name}"`, e);
      failed++;
      if (isRefusal(e)) dispatch({ type: 'SAVE_OUTLET_DRAFT', outletDraft: { ...draft, syncError: e?.message || 'The server refused it.' } });
    }
  }
  return { synced, failed, errors, ids, notices };
}
