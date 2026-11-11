import { getSurveyDetail, getSurveysForCampaign } from '../services/api';
import { CampaignSurveyConfig, Outlet, OutletSurvey, SurveyDue } from '../types';

/**
 * A campaign's surveys with their questions, from the server, kept on the
 * device (SET_CAMPAIGN_SURVEYS) so a survey opens offline. The questions come
 * with the list (include_questions); an older backend sends the list only, so
 * each survey's are fetched. Throws when they can't all be loaded; the caller
 * falls back to the copy kept on the device, which is never replaced by part
 * of the surveys.
 */
export async function loadCampaignSurveys(
  campaignId: string,
  dispatch: (action: any) => void,
  options?: { oneAtATime?: boolean },
): Promise<CampaignSurveyConfig[]> {
  const list = await getSurveysForCampaign(campaignId, { includeQuestions: true });
  // oneAtATime: the morning download keeps to one request at a time per part.
  const details: (CampaignSurveyConfig | null)[] = [];
  if (options?.oneAtATime) {
    for (const s of list) details.push(s.detail || (await getSurveyDetail(s.id)));
  } else {
    details.push(...(await Promise.all(list.map((s) => (s.detail ? Promise.resolve(s.detail) : getSurveyDetail(s.id))))));
  }
  const surveys = details
    .map((d, i): CampaignSurveyConfig | null => (d ? { ...d, afterOutletEdit: d.afterOutletEdit || list[i].afterOutletEdit } : null))
    .filter((d): d is CampaignSurveyConfig => !!d);
  dispatch({ type: 'SET_CAMPAIGN_SURVEYS', campaignId, surveys });
  return surveys;
}

/** The campaign's survey to fill after an outlet is edited (at most one), among its surveys. */
export const afterEditSurvey = (surveys?: CampaignSurveyConfig[]): CampaignSurveyConfig | undefined =>
  surveys?.find((s) => s.afterOutletEdit);

/**
 * The survey an outlet is waiting for since it was edited (from get_outlets,
 * or the device's record of an edit that hasn't synced), unless that survey,
 * filled in, is already waiting to sync as an offline draft. While one is
 * due, the outlet can't be edited again.
 */
export const dueSurveyFor = (outlet: Outlet | undefined, surveys: OutletSurvey[]): SurveyDue | undefined => {
  const due = outlet?.surveyDue;
  if (!outlet || !due) return undefined;
  const waitingToSync = surveys.some((s) => s.isDraft && s.outletId === outlet.id && s.surveyConfigId === due.surveyId);
  return waitingToSync ? undefined : due;
};

/**
 * An outlet refreshed from the server, while an edit of it is still waiting
 * to sync: the server doesn't know of that edit yet, so what the device
 * recorded for it (the survey it made due, the location it sent for
 * approval) stands.
 */
export const keepUnsyncedEdit = (server: Outlet, local: Outlet): Outlet => ({
  ...server,
  surveyDue: local.surveyDue || server.surveyDue,
  pendingLocationRequest: local.pendingLocationRequest || server.pendingLocationRequest,
});

/** A due survey's questions: from the device, or loaded (null when they can't be had, e.g. offline and never loaded). */
export async function dueSurveyConfig(due: SurveyDue, cached?: CampaignSurveyConfig[]): Promise<CampaignSurveyConfig | null> {
  const kept = cached?.find((s) => s.id === due.surveyId);
  if (kept) return kept;
  try {
    return await getSurveyDetail(due.surveyId);
  } catch {
    return null;
  }
}
