import {
  createLead, createOutlet, updateOutlet, submitFieldSale, submitSalesOrder, submitSurveyResponse, uploadSurveyPhoto,
  getOutlets, getItems, getMyOrders, getMySales, getMyGeofence,
  OrderLinePayload, AuthError, NetworkError,
} from '../services/api';
import { LeadDraft, Draft, OutletDraft, OutletSurvey, SurveyAnswer, PendingSurveyPhoto } from '../types';
import { discardSurveyPhoto, discardSurveyPhotos, surveyPhotoExists } from './surveyPhotos';
import { isAnswered, surveyRejectionMessage } from './surveyAnswers';
import { debugLog } from './logger';

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
        await submitFieldSale(draft.outletId, campaignId, lines, total, { ...draft.saleLocation, capturedOffline: true }, draft.promoCode);
      } else {
        await submitSalesOrder(draft.outletId, campaignId, lines, draft.promoCode);
      }
      dispatch({ type: 'DELETE_DRAFT', draftId: draft.id });
      synced++;
    } catch (e: any) {
      noteFailure(errors, `${draft.mode === 'sale' ? 'Sale' : 'Order'} at ${draft.outletName}`, e);
      failed++;
      // A refusal (such as INSUFFICIENT_STOCK for a sale the agent can't
      // cover) keeps the draft, with the server's reason on it for the
      // Drafts and Sync pages. A lost connection isn't a refusal.
      if (!(e instanceof NetworkError) && !(e instanceof AuthError)) {
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
  for (const draft of drafts) {
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
        photos
      );
      dispatch({ type: 'MARK_SURVEY_SYNCED', surveyId: draft.id });
      discardSurveyPhotos(photos);
      synced++;
    } catch (e: any) {
      noteFailure(errors, `Survey "${draft.surveyName || 'draft'}"`, e);
      failed++;
      // A refusal (REQUIRED_ANSWERS_MISSING included) keeps the draft with the
      // server's reason; a lost connection isn't a refusal.
      if (!(e instanceof NetworkError) && !(e instanceof AuthError)) {
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
        });
      } else if (draft.outletId) {
        await updateOutlet(draft.outletId, {
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
