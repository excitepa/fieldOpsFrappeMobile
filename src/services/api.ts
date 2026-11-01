import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import {
  getBaseUrl,
  getAccessToken,
  getTenantId,
  setAccessToken,
  setTenantId,
  clearAccessToken,
  setUserInfo,
  getUserInfo,
  clearUserInfo,
} from './apiConfig';
import { Campaign, CampaignCategory, CampaignModule, UserProfile, Lead, OutletList, LeadStage, LeadStageInfo, PendingStageRequest, MasterOption, Outlet, OutletStatus, GeofenceConfig, SaleLocation, SurveyDue, Product, ProductUnit, ProductPromotion, OutletOrder, OutletSale, RouteAssignment, NotificationItem, CampaignSurveyConfig, DynamicSurveyQuestion, QuestionType } from '../types';
import { localDateStr } from '../utils/timestamp';
import { debugLog } from '../utils/logger';
import type { OutletDirectory } from '../utils/outletDirectory';
import { firstStage, normalizeStage, stageScore } from '../utils/leadStages';
import { cleanNumberAnswer } from '../utils/surveyAnswers';

/** Thrown by authFetch when the stored session is missing or the server rejects the token (401). */
export class AuthError extends Error {}

/** Thrown by authFetch only when the device couldn't reach the server at all (no response received) — distinct from a request that reached the server and was rejected, which should never be treated as "offline". */
export class NetworkError extends Error {}

/**
 * Thrown by authFetch when the server answers HTTP 200 but the actual result is
 * a *soft* failure nested inside `message` — e.g. check_in's duplicate-clock-in
 * response: `{"message":{"status":"error","code":"ALREADY_CHECKED_IN",...}}`.
 * Frappe's normal validation failures raise a real exception (HTTP 417/500,
 * already caught below), but some hand-written endpoints in mobile_api.py
 * instead return 200 with this nested shape for an expected/recoverable
 * rejection. Before this was detected, authFetch treated the whole response as
 * a success (only `data.status`, never `data.message.status`, was checked) —
 * so the calling code would silently extract whatever id/fields happened to be
 * present and act as if the action succeeded, even though nothing was actually
 * created. That's the exact shape of "I had to do it twice before it showed up
 * on web" for any action that hits one of these soft-error paths: the first
 * attempt silently no-ops, and only a subsequent, genuinely-accepted attempt
 * shows up. `data` carries the nested payload so a caller that specifically
 * expects a given soft error (like clockIn's ALREADY_CHECKED_IN) can recover
 * from it instead of just failing — see clockIn below for that pattern.
 */
export class SoftError extends Error {
  code?: string;
  data: any;
  constructor(message: string, data: any) {
    super(message);
    this.code = data?.code;
    this.data = data;
  }
}

/**
 * What an action the app may send again carries (see ActionStamp): its
 * one-time ID, which the server answers a repeat of exactly as the first time
 * ("idempotent": true), when the agent did it, which the server dates the
 * record by, and whether it's being sent later from the phone's queue. A
 * backend without them ignores them.
 */
export interface ActionMeta {
  clientRef?: string;
  happenedAt?: string;
  capturedOffline?: boolean;
}

const stampFields = (meta?: ActionMeta): Record<string, any> => {
  const fields: Record<string, any> = {};
  if (meta?.clientRef) fields.client_ref = meta.clientRef;
  if (meta?.happenedAt) fields.happened_at = meta.happenedAt;
  if (meta?.capturedOffline) fields.captured_offline = 1;
  return fields;
};

export interface LoginResult {
  success: boolean;
  message?: string;
  accessToken?: string;
  user?: UserProfile;
}

/** Attaches the stored bearer token and tenant base URL to a request against a protected `/agent/*` or `/api/*` route. */
// No timeout was ever configured on these requests, so a fetch() call just hung
// on whatever the native HTTP stack's own default is (which can be very long) —
// and when it finally did fail, the catch below unconditionally said "check your
// connection," even when the device was genuinely online and the real cause was
// a slow/unresponsive server (e.g. a free-tier backend waking up from sleep) or
// a one-off dropped connection. That's confirmed as a real, misleading report —
// "it says no network when there is network." Image uploads legitimately take
// longer on a real mobile connection than a plain JSON call, so they get a
// longer budget before being treated as stuck rather than just slow.
/**
 * The message for the agent in an error response. Endpoints that answer with
 * `message: "..."` say it there; Frappe's own errors (frappe.throw, permission
 * errors) put it in `_server_messages` — a JSON list of JSON-encoded messages —
 * or in `exception` ("frappe.exceptions.ValidationError: ..."). Without this,
 * every such refusal showed only "Request failed (HTTP 417)". Any HTML in the
 * message is dropped.
 */
const serverErrorMessage = (data: any): string | undefined => {
  const clean = (text: string) => text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (typeof data?.message === 'string' && data.message.trim()) return clean(data.message);
  if (typeof data?._server_messages === 'string') {
    try {
      const messages = (JSON.parse(data._server_messages) as unknown[])
        .map((m) => {
          if (typeof m !== 'string') return '';
          try {
            const parsed = JSON.parse(m);
            return typeof parsed === 'string' ? parsed : parsed?.message || '';
          } catch {
            return m;
          }
        })
        .map((m) => clean(String(m)))
        .filter(Boolean);
      if (messages.length > 0) return messages.join('\n');
    } catch {
      // Not the usual shape — fall through to `exception`.
    }
  }
  if (typeof data?.exception === 'string') {
    const text = clean(data.exception.replace(/^[\w.]+?(?:Error|Exception):\s*/, ''));
    if (text) return text;
  }
  return undefined;
};

const JSON_TIMEOUT_MS = 25000;
const UPLOAD_TIMEOUT_MS = 60000;

const authFetch = async (path: string, options: RequestInit = {}): Promise<any> => {
  const [token, tenantId] = await Promise.all([getAccessToken(), getTenantId()]);
  if (!token || !tenantId) {
    throw new AuthError('Your session has expired. Please sign in again.');
  }

  const url = `${getBaseUrl(tenantId)}${path}`;
  const method = options.method || 'GET';
  const isUpload = options.body instanceof FormData;
  debugLog('[FieldOps API]', method, url, isUpload ? '(form-data)' : options.body ?? '');

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), isUpload ? UPLOAD_TIMEOUT_MS : JSON_TIMEOUT_MS);
  try {
    try {
      response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err: any) {
    // Read from our own signal rather than err.name: Expo's fetch rejects an
    // aborted request with a plain FetchError, never an AbortError.
    const isTimeout = controller.signal.aborted;
    // Expo's fetch (the global fetch since Expo 57) wraps every failure of the
    // request itself in a FetchError ("fetch failed: ..."); React Native's
    // fetch rejects with "Network request failed". Anything else was thrown
    // while the request was still being built on the device (e.g. an
    // unsupported multipart part), so nothing was sent — reporting that as
    // "check your connection", or queueing it as an offline draft, hides a
    // problem that would fail the same way on every retry.
    const isConnectionFailure =
      isTimeout ||
      String(err?.message ?? '').startsWith('fetch failed') ||
      (err instanceof TypeError && err.message === 'Network request failed');
    debugLog(
      '[FieldOps API]', method, url,
      isTimeout ? '-> TIMEOUT' : isConnectionFailure ? '-> NETWORK ERROR' : '-> REQUEST NOT SENT',
      err?.message || err,
    );

    if (!isConnectionFailure) {
      throw new Error(`The request could not be sent from this device: ${err?.message || err}`);
    }

    // A failed/aborted fetch does NOT by itself mean the device is offline —
    // check real connectivity before deciding which message is actually true.
    let reallyOffline = true;
    try {
      const netState = await NetInfo.fetch();
      reallyOffline = netState.isConnected === false || netState.isInternetReachable === false;
    } catch {
      // Connectivity check itself failed — fall back to the safer assumption
      // (offline) rather than claiming a connectivity state we can't verify.
    }

    const message = reallyOffline
      ? 'Could not reach the server. Check your connection and try again.'
      : isTimeout
        ? 'The server took too long to respond — it may be temporarily slow or waking up. Please try again.'
        : "Could not reach the server, even though this device appears to be online. The server may be temporarily unavailable — please try again.";
    throw new NetworkError(message);
  }

  const rawText = await response.text();
  debugLog('[FieldOps API]', method, url, '->', response.status, rawText);

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Server returned an unexpected response (HTTP ${response.status}).`);
  }

  if (response.status === 401) {
    throw new AuthError(serverErrorMessage(data) || 'Your session has expired. Please sign in again.');
  }
  if (!response.ok || data?.status === 'error') {
    const failure: Error & { status?: number } = new Error(serverErrorMessage(data) || `Request failed (HTTP ${response.status}).`);
    failure.status = response.status;
    throw failure;
  }

  // A real HTTP 200 can still carry a soft failure nested inside `message` —
  // see SoftError's doc comment for why this matters (silent no-op actions
  // that needed a second, genuinely-accepted attempt to show up anywhere).
  // Only treated as an error when `message` is a plain object with its own
  // status — get_items/get_my_leads/etc. return `message` as an array of
  // records, and plenty of endpoints return it as a bare success string, so
  // this can't just check "does message exist".
  const nested = data?.message;
  if (nested && typeof nested === 'object' && !Array.isArray(nested) && nested.status === 'error') {
    const nestedMessage = typeof nested.message === 'string' ? nested.message : `Request failed (HTTP ${response.status}).`;
    throw new SoftError(nestedMessage, nested);
  }

  return data;
};

/**
 * Whether a request failed because the backend doesn't have the endpoint
 * (an older backend): Frappe answers "Failed to get method for command ..."
 * or 404. The app then carries on without what it gives.
 */
export const isMissingEndpoint = (e: any): boolean =>
  !(e instanceof NetworkError) && !(e instanceof AuthError)
  && (e?.status === 404 || /failed to get method|has no attribute|not found: .*fieldops\.api/i.test(String(e?.message || '')));

export const mapUserInfoToProfile = (info: any, fallbackEmail?: string): UserProfile => {
  const email = info?.email || (typeof info?.user === 'string' && info.user.includes('@') ? info.user : fallbackEmail || '');
  
  // Clean up full_name and reject "Guest" or "Guest User"
  let rawFullName = (typeof info?.full_name === 'string' ? info.full_name.trim() : '') || (typeof info?.employee?.employee_name === 'string' ? info.employee.employee_name.trim() : '');
  if (rawFullName.toLowerCase() === 'guest' || rawFullName.toLowerCase() === 'guest user') {
    rawFullName = '';
  }

  // If full_name is missing, derive a human-readable name from the email/username prefix
  if (!rawFullName) {
    if (typeof info?.user === 'string' && !info.user.includes('@') && info.user.toLowerCase() !== 'guest') {
      rawFullName = info.user;
    } else if (email) {
      const prefix = email.split('@')[0];
      rawFullName = prefix
        .replace(/[._-]+/g, ' ')
        .replace(/([a-zA-Z])(\d+)/g, '$1 $2')
        .split(' ')
        .filter(Boolean)
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }

  const fullName = rawFullName || 'Field Agent';

  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
  const initials = nameParts.length >= 2
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : fullName.slice(0, 2).toUpperCase() || 'FA';

  const role = Array.isArray(info?.roles) && info.roles.length > 0
    ? (info.roles.find((r: string) => r !== 'All' && r !== 'Desk User') || info.roles[0])
    : (info?.user_type || 'Field Execution Agent');

  return {
    name: fullName,
    email: email,
    initials: initials,
    role: role,
    territory: info?.territory || 'Assigned Territory',
    rank: info?.rank ?? 1,
    totalAgents: info?.totalAgents ?? 1,
    profileCompletion: info?.profileCompletion ?? 100,
  };
};

export const getStoredUserProfile = async (): Promise<UserProfile | null> => {
  const info = await getUserInfo();
  if (!info) return null;
  return mapUserInfoToProfile(info);
};

export const fetchUserProfile = async (): Promise<UserProfile | null> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.get_my_profile');
    const profileInfo = data?.message || data;
    if (profileInfo && typeof profileInfo === 'object') {
      await setUserInfo(profileInfo);
      return mapUserInfoToProfile(profileInfo);
    }
  } catch (e) {
    // Non-fatal, fallback to stored profile
  }
  return getStoredUserProfile();
};

export const login = async (email: string, password: string, tenantId: string): Promise<LoginResult> => {
  const url = `${getBaseUrl(tenantId)}/auth/login`;
  const body = { email, password, tenantID: tenantId };

  // Never the credentials or the response body (it carries the access token).
  debugLog('[FieldOps API] POST', url);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  debugLog('[FieldOps API] login response', response.status);

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (err) {
    debugLog('[FieldOps API] login response was not valid JSON', err);
    return { success: false, message: `Server returned an unexpected response (HTTP ${response.status}).` };
  }

  // Contract specifies the token may be at any of these three locations.
  const token = data?.access_token || data?.data?.access_token || data?.message?.access_token;

  if (!token) {
    const message = serverErrorMessage(data) || data?.error || 'Login failed. Please check your credentials.';
    return { success: false, message };
  }

  const rawUserInfo = data?.user_info || data?.data?.user_info || data?.message?.user_info || {
    user: email,
    email: email,
    full_name: email.split('@')[0],
  };

  await setAccessToken(token);
  await setTenantId(tenantId);
  await setUserInfo(rawUserInfo);

  let profile = mapUserInfoToProfile(rawUserInfo, email);

  // Fetch full User doctype profile from Frappe
  try {
    const fetched = await fetchUserProfile();
    if (fetched && fetched.name && fetched.name !== 'Field Agent') {
      profile = fetched;
    }
  } catch {
    // Non-fatal
  }

  return { success: true, accessToken: token, user: profile };
};

export const logout = async (): Promise<void> => {
  await clearAccessToken();
  await clearUserInfo();
};

const deriveCampaignCategory = (modules: CampaignModule[]): CampaignCategory => {
  if (modules.includes('sales')) return 'Sales';
  if (modules.includes('orders')) return 'Orders';
  if (modules.includes('surveys')) return 'Survey';
  if (modules.includes('merchandising')) return 'Merchandising';
  return 'Mixed';
};

/**
 * The API only returns id/name/campaign_type/dates/modules for campaigns (per the integration
 * contract, no color/target/progress/description/beat/surveys/dashboard config exist server-side).
 * Real fields are mapped through; everything else gets a safe UI default rather than an invented value.
 * `modules` is passed through as-is (lowercased) rather than filtered against a hardcoded allowlist —
 * the exact set of module strings the backend sends isn't fully confirmed, and silently dropping an
 * unrecognized one would break module-driven UI (e.g. Dashboard Quick Access) for no visible reason.
 */
const mapCampaign = (raw: any): Campaign => {
  const modules: CampaignModule[] = Array.isArray(raw?.modules)
    ? raw.modules.filter((m: any): m is string => typeof m === 'string').map((m: string) => m.toLowerCase())
    : [];
  const isOutletCampaign = modules.includes('orders') || modules.includes('merchandising');

  return {
    // `name` is the real Frappe document primary key (e.g. "CAM-00016") — the RPC
    // endpoints (submit_lead, get_my_leads, check_in's `campaign` field, etc.) look
    // campaigns up by this exact value. `id` (e.g. 16) is a decorative numeric field
    // that doesn't exist as a lookup key server-side; using it caused a 404
    // "Campaign 16 not found" DoesNotExistError on lead creation.
    id: String(raw?.name ?? raw?.id ?? ''),
    name: raw?.campaign_name || raw?.name || 'Untitled Campaign',
    client: raw?.campaign_type || 'FieldOps',
    type: raw?.campaign_type || '',
    category: deriveCampaignCategory(modules),
    progress: 0,
    // Was hardcoded to '' regardless of what the backend sent, so every progress
    // bar/target denominator across the app (Orders, Sales Value, Target
    // Achievement, etc.) silently fell back to a made-up default (20, 100000...)
    // instead of the campaign's real configured target (e.g. 50.0 here) —
    // confirmed live via /agent/campaigns, which does send a real `target` field.
    target: raw?.target !== undefined && raw?.target !== null ? String(raw.target) : '',
    color: '#1B2559',
    beat: '',
    description: raw?.description || '',
    startDate: raw?.start_date || undefined,
    endDate: raw?.end_date || undefined,
    modules,
    ctaType: isOutletCampaign ? 'outlets' : 'leads',
  };
};

export const getCampaigns = async (): Promise<Campaign[]> => {
  const data = await authFetch('/agent/campaigns');
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(mapCampaign);
};

/**
 * Fetches fields the list endpoint (`/agent/campaigns`) doesn't carry — per mapCampaign's
 * comment, progress/target/description don't exist there, so `get_campaign_details` is
 * the only place a single campaign's real progress/target could come from. Returns a
 * patch to merge onto the already-mapped Campaign rather than a full Campaign, since
 * most of the shape (name/type/modules/etc.) is already correct from the list call.
 */
export const getCampaignDetails = async (
  campaignId: string
): Promise<{ description?: string; target?: string; progress?: number; startDate?: string; endDate?: string } | null> => {
  try {
    const data = await authFetch(`/api/method/fieldops.api.mobile_api.get_campaign_details?campaign_id=${encodeURIComponent(campaignId)}`);
    const raw = data?.message ?? data?.data ?? data;
    if (!raw || typeof raw !== 'object') return null;
    const progress = Number(raw?.progress ?? raw?.percent_complete ?? raw?.completion_pct);
    return {
      description: raw?.description || undefined,
      target: raw?.target || raw?.target_label || raw?.goal || undefined,
      progress: Number.isFinite(progress) ? progress : undefined,
      startDate: raw?.start_date || undefined,
      endDate: raw?.end_date || undefined,
    };
  } catch (e: any) {
    if (e instanceof AuthError || e instanceof NetworkError) throw e;
    return null;
  }
};

/** Fetch the product/stock allocation scoped to a campaign via `get_campaign_inventory`. */
export const getCampaignInventory = async (campaignId: string): Promise<Product[]> => {
  try {
    const [data, tenantId] = await Promise.all([
      authFetch(`/api/method/fieldops.api.mobile_api.get_campaign_inventory?campaign_id=${encodeURIComponent(campaignId)}`),
      getTenantId(),
    ]);
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
    return flattenInventoryResponse(list, getBaseUrl(tenantId || ""));
  } catch (e: any) {
    if (e instanceof AuthError || e instanceof NetworkError) throw e;
    return [];
  }
};

/**
 * Clocks in the agent via the RPC contract (`check_in`). The v3 contract accepts the
 * shift selfie as a base64 data URI in the JSON body (not multipart like the old
 * `/agent/attendance/clock-in` route). Returns the attendance record id from the
 * response (if the backend sends one) so it can be passed to `clockOut` later.
 */
export const clockIn = async (
  coordinates: { lat: number; lng: number },
  options?: { imageUri?: string; campaignId?: string; remarks?: string }
): Promise<{ attendanceId?: string; alreadyCheckedIn?: boolean; alreadyCheckedOut?: boolean }> => {
  const body: Record<string, any> = {
    latitude: coordinates.lat,
    longitude: coordinates.lng,
  };
  if (options?.campaignId) body.campaign = options.campaignId;
  if (options?.remarks) body.remarks = options.remarks;
  if (options?.imageUri) {
    const base64 = await FileSystem.readAsStringAsync(options.imageUri, { encoding: FileSystem.EncodingType.Base64 });
    body.image = `data:image/jpeg;base64,${base64}`;
  }

  // check_in returns HTTP 200 with a nested error status (not a 4xx/AuthError)
  // when the agent already has an attendance record for today — confirmed live:
  // {"message":{"status":"error","code":"ALREADY_CHECKED_IN","already_checked_in":true,
  //  "has_checked_out":false,"attendance_id":"ATT-00014",...}}. authFetch now throws
  // this as a SoftError instead of returning it as a normal success (previously it
  // didn't, so the caller would treat the existing attendanceId as a fresh clock-in —
  // which is how a second device, or a same-device relogin, bypassed the once-per-day
  // rule). This is the one place that specifically expects and recovers from that
  // exact soft error; anywhere else it surfaces, it's a real, visible failure now
  // instead of a silent no-op.
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.check_in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = data?.message ?? data?.data ?? data;
    return { attendanceId: result?.attendance_id || result?.name || result?.id };
  } catch (e: any) {
    if (e instanceof SoftError && e.code === 'ALREADY_CHECKED_IN') {
      return {
        attendanceId: e.data?.attendance_id,
        alreadyCheckedIn: true,
        alreadyCheckedOut: e.data?.has_checked_out === true,
      };
    }
    throw e;
  }
};

/** Clocks out the agent via the RPC contract (`check_out`). `attendanceId` is the id returned by `clockIn`. */
export const clockOut = async (
  coordinates: { lat: number; lng: number },
  attendanceId?: string,
  remarks?: string
): Promise<void> => {
  const body: Record<string, any> = {
    latitude: coordinates.lat,
    longitude: coordinates.lng,
  };
  if (attendanceId) body.attendance_id = attendanceId;
  if (remarks) body.remarks = remarks;

  await authFetch('/api/method/fieldops.api.mobile_api.check_out', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

export interface AttendanceStats {
  presentDays: number;
  absentDays: number;
  lateDays: number;
  onTimeDays: number;
  totalWorkingDays: number;
  attendancePercentage: number;
  streakDays: number;
  todayStatus: string;
  /** Real, server-confirmed "have I already clocked in/out today" — this is what lets
   *  a device that has never seen this agent (a second phone, a reinstall) find out
   *  without attempting a full photo+GPS clock-in first. See resolveTodayAttendance. */
  isCheckedInToday: boolean;
  isCheckedOutToday: boolean;
}

/** Fetch the homepage attendance KPI breakdown via the RPC contract (`get_my_attendance_stats`). */
export const getAttendanceStats = async (): Promise<AttendanceStats | null> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.get_my_attendance_stats');
    const raw = data?.message ?? data?.data ?? data;
    if (!raw || typeof raw !== 'object') return null;
    // `today`/`today_status` is an object ({is_checked_in, is_checked_out, status, ...}),
    // not the plain string the old `todayStatus` field assumed — confirmed live.
    const today = raw.today ?? raw.today_status;
    return {
      presentDays: Number(raw.present_days) || 0,
      absentDays: Number(raw.absent_days) || 0,
      lateDays: Number(raw.late_days) || 0,
      onTimeDays: Number(raw.on_time_days) || 0,
      totalWorkingDays: Number(raw.total_working_days) || 0,
      attendancePercentage: Number(raw.attendance_percentage) || 0,
      streakDays: Number(raw.streak_days) || 0,
      todayStatus: typeof today === 'object' ? (today?.status || '') : (today || ''),
      isCheckedInToday: !!(typeof today === 'object' && today?.is_checked_in),
      isCheckedOutToday: !!(typeof today === 'object' && today?.is_checked_out),
    };
  } catch (e: any) {
    if (e instanceof AuthError || e instanceof NetworkError) throw e;
    return null;
  }
};

// ─── Leads API ─────────────────────────────────────────────────────────────────

/** `pending_stage_request` ({id, to_stage, requested_on} or null) from get_my_leads. */
const mapPendingStageRequest = (raw: any): PendingStageRequest | undefined =>
  raw?.id && raw?.to_stage
    ? { id: String(raw.id), toStage: normalizeStage(raw.to_stage), requestedOn: raw?.requested_on ? String(raw.requested_on) : undefined }
    : undefined;

const mapLead = (raw: any): Lead => {
  // The server's stage, with the app's old names converted — an unknown
  // stage is kept as it is rather than shown as the first one.
  const stage = normalizeStage(raw?.funnel_stage);
  return {
    id: raw?.name || String(raw?.id || ''),
    name: raw?.lead_name || raw?.name || 'Unknown',
    company: raw?.company_name || '',
    phone: raw?.phone || '',
    email: raw?.email || undefined,
    position: raw?.position || undefined,
    address: raw?.address || undefined,
    stage,
    score: stageScore(stage),
    next: raw?.next_contact || '',
    nextActionDate: raw?.next_action_date || undefined,
    createdAt: raw?.creation ? raw.creation.slice(0, 10) : undefined,
    lastContactDate: raw?.modified ? raw.modified.slice(0, 10) : undefined,
    // Backend stores this in Lead.annual_revenue but accepts/echoes several aliases.
    value: (() => {
      const raw_value = raw?.annual_revenue ?? raw?.opportunity_amount ?? raw?.value ?? raw?.amount ?? raw?.lead_value ?? raw?.opportunity_value;
      const n = Number(raw_value);
      return n > 0 ? `₦${n.toLocaleString()}` : '';
    })(),
    source: raw?.source || undefined,
    notes: raw?.notes || undefined,
    gps: raw?.latitude && raw?.longitude ? `${raw.latitude}, ${raw.longitude}` : undefined,
    pendingStageRequest: mapPendingStageRequest(raw?.pending_stage_request),
  };
};

/**
 * The backend's stage list via `get_lead_stages` ({data: [{name, order,
 * is_final, agent_can_set}]}). Throws when it can't be loaded (a backend
 * without it), so the caller keeps the list it has.
 */
export const getLeadStages = async (): Promise<LeadStageInfo[]> => {
  const data = await authFetch('/api/method/fieldops.api.mobile_api.get_lead_stages');
  const body = data?.message ?? data;
  const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
  return rows
    .filter((r: any) => typeof r?.name === 'string' && r.name.trim())
    .map((r: any, index: number) => ({
      name: r.name.trim(),
      order: Number.isFinite(Number(r?.order)) ? Number(r.order) : index + 1,
      isFinal: !!Number(r?.is_final),
      agentCanSet: r?.agent_can_set === undefined ? true : !!Number(r.agent_can_set),
    }));
};

// ─── Paged lists ─────────────────────────────────────────────────────────────────

/** For a list fetched in pages: told how many rows are in so far ("Outlets: 400…"). */
export interface ListOptions {
  onProgress?: (count: number) => void;
}

/** The most pages one list is fetched in, so a backend that keeps answering full pages can't loop for ever. */
const MAX_PAGES = 200;

/**
 * A list fetched page by page (limit_start, limit_page_length) until it's all in.
 * The backend orders each list by its sort and then name, so pages neither skip
 * nor repeat rows. A page that comes back short is the last; so is one longer
 * than asked (a backend that doesn't page sends everything at once) and one
 * with nothing new. Where the backend counts the rows (`total`), that decides.
 * The next page starts after the rows that came, so a page the backend keeps
 * smaller than asked doesn't end it early. Every page must arrive: one that
 * fails throws, so the caller keeps the copy on the phone. `max` stops early,
 * with `capped` when there's more.
 */
export async function fetchAllPages<T>(
  fetchPage: (start: number, size: number) => Promise<{ rows: T[]; total?: number }>,
  options: { size: number; idOf: (row: T) => string; max?: number; onProgress?: (count: number) => void },
): Promise<{ rows: T[]; capped: boolean }> {
  const { size, idOf, max, onProgress } = options;
  const rows: T[] = [];
  const seen = new Set<string>();
  let start = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { rows: got, total } = await fetchPage(start, size);
    let added = 0;
    for (const row of got) {
      const id = idOf(row);
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
      added++;
      // Capped once there's a row past `max`: a list of exactly `max` isn't.
      if (max && rows.length > max) {
        rows.length = max;
        onProgress?.(max);
        return { rows, capped: true };
      }
    }
    onProgress?.(rows.length);
    if (got.length === 0 || added === 0 || got.length > size) break;
    if (total !== undefined ? rows.length >= total : got.length < size) break;
    start += got.length;
  }
  return { rows, capped: false };
}

/** A page of a list endpoint, as `limit_start`/`limit_page_length` (and any other params) in the query. */
const pageQuery = (start: number, size: number, extra: Record<string, string | undefined> = {}): string => {
  const params = new URLSearchParams({ limit_start: String(start), limit_page_length: String(size) });
  Object.entries(extra).forEach(([key, value]) => { if (value) params.set(key, value); });
  return `?${params.toString()}`;
};

const listOf = (data: any): any[] => {
  const raw = data?.message ?? data?.data ?? data;
  return Array.isArray(raw) ? raw : [];
};

/** Supervisors and admins: get_outlets can be the whole tenant for them. */
const OVERSEER_ROLES = ['Supervisor', 'Field Supervisor', 'System Manager', 'Administrator', 'Company Admin'];

const isOverseer = async (): Promise<boolean> => {
  const info = await getUserInfo().catch(() => null);
  return Array.isArray(info?.roles) && info.roles.some((r: any) => OVERSEER_ROLES.includes(String(r)));
};

/**
 * Fetch leads for the active campaign via the RPC contract (`get_my_leads`). The old
 * campaign-nested REST route (`/agent/campaigns/{id}/leads`) no longer exists — get_my_leads
 * returns leads across all of the agent's campaigns, so results are narrowed to campaignId
 * client-side whenever the response actually carries a campaign field. Every lead, 200
 * at a time (the backend's page is 20). Throws when any page can't be loaded, so the
 * copy on the phone is kept.
 */
export const getLeads = async (campaignId: string, options?: ListOptions): Promise<Lead[]> => {
  const { rows: list } = await fetchAllPages(
    async (start, size) => ({ rows: listOf(await authFetch(`/api/method/fieldops.api.mobile_api.get_my_leads${pageQuery(start, size)}`)) }),
    { size: 200, idOf: (l: any) => String(l?.name || l?.id || ''), onProgress: options?.onProgress },
  );
  const scoped = campaignId
    ? list.filter((l: any) => {
        // An empty string is common on leads whose campaign link didn't save server-side —
        // treat it the same as "unknown" rather than a real mismatch, or the lead vanishes
        // from every campaign's list.
        const c = l?.campaign || l?.campaign_id;
        return !c || String(c) === String(campaignId);
      })
    : list;
  return scoped.map(mapLead);
};

export interface CreateLeadPayload {
  name: string;           // lead_name
  company: string;        // company_name
  phone: string;
  email?: string;
  address?: string;
  source?: string;
  notes?: string;
  value?: number;         // stored server-side as Lead.annual_revenue
}

/** A lead's fields as submit_lead (and update_lead) take them. */
const leadFields = (payload: CreateLeadPayload): Record<string, any> => ({
  lead_name: payload.name,
  contact_person: payload.name,
  phone_number: payload.phone,
  email_address: payload.email,
  outlet: payload.company,
  address: payload.address,
  source: payload.source,
  notes: payload.notes,
  value: payload.value,
});

/**
 * Submit a new lead via the RPC contract (`submit_lead`). The v3 contract added outlet/
 * address/source/notes fields, so the values collected on the lead form are sent again.
 * `outlet_id` (a real linked Outlet record) and `latitude`/`longitude` are left out — the
 * app has no outlet-picker or GPS capture on this form yet, so there's no real value to send.
 */
export const createLead = async (campaignId: string, payload: CreateLeadPayload, meta?: ActionMeta): Promise<Lead> => {
  const body: Record<string, any> = { ...leadFields(payload), campaign: campaignId, ...stampFields(meta) };

  const data = await authFetch('/api/method/fieldops.api.mobile_api.submit_lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = data?.message ?? data?.data ?? data;
  const leadId = result?.lead_id || result?.name || result?.id;

  // Return a minimal Lead object immediately so the UI can update optimistically
  return mapLead({
    name: leadId,
    lead_name: payload.name,
    company_name: payload.company,
    phone: payload.phone,
    email: payload.email,
    funnel_stage: firstStage(),
    source: payload.source,
    address: payload.address,
    notes: payload.notes,
    annual_revenue: payload.value,
    creation: new Date().toISOString(),
  });
};

/**
 * Moves a lead to another stage via `update_lead_stage`, with the agent's
 * reason and optional notes. A move the backend won't make throws a
 * SoftError: code STAGE_REGRESSION_NEEDS_APPROVAL for a move back (or out of
 * Won or Lost), STAGE_CHANGE_NOT_ALLOWED otherwise.
 */
export const updateLeadStage = async (leadId: string, stage: LeadStage, reason: string, notes?: string, meta?: ActionMeta): Promise<void> => {
  await authFetch('/api/method/fieldops.api.mobile_api.update_lead_stage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId, funnel_stage: stage, reason, notes, ...stampFields(meta) }),
  });
};

/**
 * Asks a supervisor to move a lead back to an earlier stage, via
 * `request_lead_regression`. Returns the request (the lead's existing
 * pending one, if it already had one).
 */
export const requestLeadRegression = async (leadId: string, toStage: LeadStage, reason: string, meta?: ActionMeta): Promise<PendingStageRequest> => {
  const data = await authFetch('/api/method/fieldops.api.mobile_api.request_lead_regression', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId, to_stage: toStage, reason, ...stampFields(meta) }),
  });
  const result = data?.message ?? data;
  const request = result?.request ?? result;
  return {
    id: String(request?.id || request?.request_id || request?.name || ''),
    toStage: normalizeStage(request?.to_stage || toStage),
    requestedOn: request?.requested_on ? String(request.requested_on) : localDateStr(),
  };
};

/** Saves an edited lead via `update_lead`, which takes submit_lead's fields. */
export const updateLead = async (leadId: string, payload: CreateLeadPayload): Promise<void> => {
  await authFetch('/api/method/fieldops.api.mobile_api.update_lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId, ...leadFields(payload) }),
  });
};

// ─── Outlets API ───────────────────────────────────────────────────────────────

/**
 * `campaignId` is stamped onto the mapped Outlet purely for local bookkeeping (the Outlet
 * type requires it) — the v3 contract's `submit_outlet`/`get_outlets` bodies have no
 * campaign field at all, so outlets aren't campaign-scoped server-side the way leads are.
 */
const mapOutlet = (raw: any, campaignId: string, baseUrl: string): Outlet => {
  const status: OutletStatus = raw?.status === 'Visited' || raw?.status === 'visited'
    ? 'visited'
    : raw?.status === 'Skipped' || raw?.status === 'skipped'
      ? 'skipped'
      : 'pending';

  const images = Array.isArray(raw?.images) ? raw.images : Array.isArray(raw?.image_urls) ? raw.image_urls : [];

  const text = (value: any): string | undefined => (value ? String(value) : undefined);

  return {
    id: raw?.name || String(raw?.id || ''),
    name: raw?.outlet_name || raw?.name || 'Unknown Outlet',
    // The Outlet Type's own name where the backend sends it; older backends
    // only have outlet_type, forced into Retail/Wholesale/Distributor/Other.
    type: raw?.outlet_type_name || raw?.outlet_type || '',
    category: raw?.outlet_sub_channel_name || raw?.sub_channel || raw?.category || undefined,
    area: raw?.area || raw?.territory || '',
    address: raw?.address || raw?.location || '',
    phone: raw?.phone_number || raw?.phone || '',
    ownerName: raw?.owner_name || raw?.owner || undefined,
    ownerPhone: raw?.owner_phone || undefined,
    isOpen: raw?.is_open ?? true,
    // No live distance signal from the backend — left blank rather than invented.
    distance: '',
    notes: raw?.notes || undefined,
    status,
    gps: raw?.latitude && raw?.longitude ? `${raw.latitude}, ${raw.longitude}` : undefined,
    photoUri: resolveImageUrl(raw?.image || raw?.photo || raw?.photo_url || raw?.image_url || images[0] || undefined, baseUrl),
    campaignId,
    isScheduledToday: !!raw?.is_scheduled_today,
    scheduledDate: raw?.scheduled_date || undefined,
    beatName: raw?.beat_name || undefined,
    sequence: raw?.sequence !== undefined && raw?.sequence !== null ? Number(raw.sequence) : undefined,
    outletTypeId: text(raw?.outlet_type_id),
    outletTypeName: text(raw?.outlet_type_name),
    channelId: text(raw?.outlet_channel_id),
    channelName: text(raw?.outlet_channel_name),
    subChannelId: text(raw?.outlet_sub_channel_id),
    subChannelName: text(raw?.outlet_sub_channel_name),
    distributorId: text(raw?.distributor_id),
    distributorName: text(raw?.distributor_name),
    pendingLocationRequest: raw?.pending_location_request?.id
      ? {
          id: String(raw.pending_location_request.id),
          latitude: Number(raw.pending_location_request.latitude),
          longitude: Number(raw.pending_location_request.longitude),
          requestedOn: text(raw.pending_location_request.requested_on),
        }
      : undefined,
    surveyDue: mapSurveyDue(raw?.survey_due),
  };
};

/** `survey_due` ({survey_id, survey_name, since} or null): the after-edit survey an outlet is waiting for. */
const mapSurveyDue = (raw: any): SurveyDue | undefined =>
  raw?.survey_id
    ? { surveyId: String(raw.survey_id), surveyName: String(raw.survey_name || raw.survey_id), since: raw.since ? String(raw.since) : undefined }
    : undefined;

/** A supervisor's or admin's download stops here: get_outlets can be the whole tenant for them. */
export const OUTLETS_CAP = 2000;

/**
 * Fetch outlets via the RPC contract (`get_outlets`): every outlet on the agent's list, 200
 * at a time (the backend's page is 50). For a supervisor or admin it stops at OUTLETS_CAP,
 * marked `capped`: the outlets beyond it are found by searching the server (`search`, which
 * gets the first 200 matches). Throws when any page can't be loaded, so the copy on the
 * phone is kept.
 */
export const getOutlets = async (campaignId: string, options?: ListOptions & { search?: string }): Promise<OutletList> => {
  const search = options?.search?.trim() || undefined;
  const [tenantId, overseer] = await Promise.all([getTenantId(), isOverseer()]);
  const page = async (start: number, size: number) =>
    ({ rows: listOf(await authFetch(`/api/method/fieldops.api.mobile_api.get_outlets${pageQuery(start, size, { search })}`)) });
  const { rows, capped } = search
    ? { rows: (await page(0, 200)).rows, capped: false }
    : await fetchAllPages(page, {
        size: 200,
        idOf: (o: any) => String(o?.name || o?.id || ''),
        max: overseer ? OUTLETS_CAP : undefined,
        onProgress: options?.onProgress,
      });
  const baseUrl = getBaseUrl(tenantId || '');
  const outlets: OutletList = rows.map((o: any) => mapOutlet(o, campaignId, baseUrl));
  if (capped) outlets.capped = true;
  return outlets;
};

/**
 * `master_data.py`'s endpoints wrap responses as `{success, data, meta, message}` —
 * unlike the rest of the mobile API, `message` here is a literal status string
 * ("Success"), not the payload, so the usual `data?.message ?? data?.data ?? data`
 * unwrap would grab that string instead of the real array. This unwraps the RPC
 * envelope first, then reaches into that inner `.data` specifically.
 */
const unwrapMasterDataList = (data: any): any[] => {
  const outer = data?.message ?? data?.data ?? data;
  const inner = Array.isArray(outer) ? outer : outer?.data;
  return Array.isArray(inner) ? inner : [];
};

/** A master-data row as a choice: id and name kept; inactive rows and rows without an id are left out. */
const mapMasterOptions = (rows: any[]): MasterOption[] =>
  rows
    .filter((r) => r?.id && r?.isActive !== false)
    .map((r) => ({
      id: String(r.id),
      name: String(r?.name || r.id),
      parent: r?.parent ? String(r.parent) : undefined,
      phone: r?.phone ? String(r.phone) : undefined,
    }));

/**
 * The outlet master lists for the Add/Edit Outlet pickers. Each throws when
 * it can't load, so the caller can tell a list that loaded empty from one
 * that didn't load, and fall back to the copy kept on the device.
 */
export const getOutletTypes = async (): Promise<MasterOption[]> =>
  mapMasterOptions(unwrapMasterDataList(await authFetch('/api/method/fieldops.api.master_data.get_outlet_types')));

export const getOutletChannels = async (): Promise<MasterOption[]> =>
  mapMasterOptions(unwrapMasterDataList(await authFetch('/api/method/fieldops.api.master_data.get_outlet_channels')));

/** Each sub-channel's `parent` is its channel's id. */
export const getOutletSubChannels = async (): Promise<MasterOption[]> =>
  mapMasterOptions(unwrapMasterDataList(await authFetch('/api/method/fieldops.api.master_data.get_outlet_sub_channels')));

/**
 * The distributors this agent can sell through, via `get_my_distributors`
 * ({data: [{id, name, phone}], default_id}). Throws on a backend without it,
 * which then shows no distributor picker.
 */
export const getMyDistributors = async (): Promise<{ distributors: MasterOption[]; defaultId?: string }> => {
  const data = await authFetch('/api/method/fieldops.api.mobile_api.get_my_distributors');
  const body = data?.message ?? data;
  const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
  const distributors = mapMasterOptions(rows);
  const defaultId = body?.default_id ? String(body.default_id) : undefined;
  return { distributors, defaultId: defaultId && distributors.some((d) => d.id === defaultId) ? defaultId : undefined };
};

/** The outlet's type, channel, sub-channel and distributor, by id. */
export interface OutletClassificationPayload {
  /** Outlet Type id, sent as `outlet_type`. */
  outletTypeId?: string;
  /** Outlet Channel id, sent as `outlet_channel`. */
  channelId?: string;
  /** Outlet Sub Channel id, sent as `outlet_sub_channel`. */
  subChannelId?: string;
  /** Distributor (Customer) id, sent as `distributor`. */
  distributorId?: string;
}

/** The classification fields of a submit_outlet / update_outlet request. */
const classificationFields = (payload: OutletClassificationPayload & { type?: string; subChannel?: string }): Record<string, any> => {
  const fields: Record<string, any> = {};
  // A draft saved before the pickers kept ids has only `type` (a channel's
  // name), which the backend still recognises.
  const outletType = payload.outletTypeId || payload.type;
  if (outletType) fields.outlet_type = outletType;
  if (payload.channelId) fields.outlet_channel = payload.channelId;
  if (payload.subChannelId) fields.outlet_sub_channel = payload.subChannelId;
  if (payload.distributorId) fields.distributor = payload.distributorId;
  // The sub-channel's name: what older backends store.
  if (payload.subChannel) fields.category = payload.subChannel;
  return fields;
};

export interface CreateOutletPayload extends OutletClassificationPayload {
  name: string;
  /**
   * Sent as `outlet_type` only when there's no `outletTypeId`: a draft saved
   * before the pickers kept ids carries a channel's name here.
   */
  type?: string;
  /** The sub-channel's name, sent as `category` — what older backends store. */
  subChannel?: string;
  address: string;
  phone?: string;
  ownerName?: string;
  ownerPhone?: string;
  photoUri?: string;
  latitude?: number;
  longitude?: number;
  /** Ask the server to refuse it (POSSIBLE_DUPLICATE) when it looks like an outlet already onboarded. */
  checkDuplicates?: boolean;
  /** The agent said it's a different outlet from the ones it looked like. */
  confirmedNew?: boolean;
}

/** An outlet already onboarded that a new one looks like (submit_outlet's POSSIBLE_DUPLICATE, or the phone's own check). */
export interface OutletMatch {
  outletId: string;
  outletName: string;
  address: string;
  /** Meters between the two; null when either has no location. */
  distanceM: number | null;
  /** Same phone number, or near with a similar name. */
  match: 'phone' | 'nearby_name';
  onboardedByName?: string;
  onboardedOn?: string;
  /** Assigned to this agent or on their routes. */
  onMyList: boolean;
  phoneLast4?: string;
}

const mapOutletMatches = (raw: any): OutletMatch[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((m: any) => m?.outlet_id)
    .map((m: any) => ({
      outletId: String(m.outlet_id),
      outletName: String(m.outlet_name || m.outlet_id),
      address: m.address ? String(m.address) : '',
      distanceM: m.distance_m === null || m.distance_m === undefined ? null : Number(m.distance_m),
      match: m.match === 'phone' ? 'phone' : 'nearby_name',
      onboardedByName: m.onboarded_by_name ? String(m.onboarded_by_name) : undefined,
      onboardedOn: m.onboarded_on ? String(m.onboarded_on) : undefined,
      onMyList: !!m.on_my_list,
      phoneLast4: m.phone_last4 ? String(m.phone_last4) : undefined,
    }));

/** The outlets submit_outlet says a new one looks like, when it refused it as POSSIBLE_DUPLICATE ([] for any other error). */
export const possibleDuplicateMatches = (e: any): OutletMatch[] =>
  e instanceof SoftError && e.code === 'POSSIBLE_DUPLICATE' ? mapOutletMatches(e.data?.matches) : [];

/**
 * Builds the multipart file part for an outlet photo. Since Expo 57 the global
 * fetch is Expo's own, which only accepts strings and Blob-like parts — React
 * Native's `{ uri, name, type }` descriptor made it throw "Unsupported
 * FormDataPart implementation" before anything was sent, so every outlet photo
 * upload failed. An expo-file-system File is Blob-like: fetch reads its bytes
 * and takes the part's filename and mime type from the real file. Any query
 * string is dropped since it isn't part of the file path.
 */
const buildPhotoPart = (photoUri: string) => {
  const file = new File(photoUri.split('?')[0]);
  if (!file.exists) {
    throw new Error('The photo file is no longer on this device. Please retake the photo and try again.');
  }
  return file;
};

/**
 * Attaches a photo to an outlet that already exists, via `update_outlet`'s
 * multipart image support (confirmed live: it accepts the same
 * images[]/images/image/photo fields `submit_outlet` does and attaches them
 * publicly to the Outlet record).
 */
export const uploadOutletPhoto = async (outletId: string, photoUri: string): Promise<void> => {
  const form = new FormData();
  form.append('outlet', outletId);
  form.append('outlet_id', outletId);
  form.append('image', buildPhotoPart(photoUri));
  await authFetch('/api/method/fieldops.api.mobile_api.update_outlet', {
    method: 'POST',
    body: form,
  });
};

/**
 * Submit a new outlet via the RPC contract (`submit_outlet`).
 *
 * The outlet record itself is ALWAYS created with a plain JSON request, never
 * multipart — a photo is then attached as a separate follow-up call. Doing both
 * in one multipart request meant any problem uploading the image (a file URI the
 * OS no longer serves, a slow/stalled upload, a timeout) failed the whole
 * request, so the outlet was never onboarded at all — reported as "onboarding
 * an outlet with an image isn't working," while the same outlet without a photo
 * saved fine. Both the JSON create and the multipart attach are confirmed
 * working server-side; splitting them means the worst case is now a missing
 * photo on a real outlet, instead of losing the outlet entirely.
 *
 * `photoUploaded` tells the caller which of those happened so it can say so,
 * and `photoError` carries the actual reason it didn't — a bare "photo not
 * uploaded" with the reason thrown away leaves nobody anything to act on.
 */
export const createOutlet = async (
  campaignId: string,
  payload: CreateOutletPayload,
  meta?: ActionMeta
): Promise<{
  outlet: Outlet;
  photoUploaded: boolean;
  photoError?: string;
  /** Onboarded, but it looks like an outlet already onboarded: a supervisor will check it. */
  possibleDuplicate?: { reviewId: string; matches: OutletMatch[] };
}> => {
  const fields: Record<string, any> = {
    outlet_name: payload.name,
    ...classificationFields(payload),
    address: payload.address,
    phone_number: payload.phone,
    owner_name: payload.ownerName,
    owner_phone: payload.ownerPhone,
    ...stampFields(meta),
  };
  if (payload.latitude !== undefined) fields.latitude = payload.latitude;
  if (payload.longitude !== undefined) fields.longitude = payload.longitude;
  // An older backend ignores both and onboards it as before.
  if (payload.checkDuplicates) fields.check_duplicates = 1;
  if (payload.confirmedNew) fields.confirmed_new = 1;

  const data = await authFetch('/api/method/fieldops.api.mobile_api.submit_outlet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });

  const result = data?.message ?? data?.data ?? data;
  const outletId = result?.outlet_id || result?.name || result?.id;

  let photoUploaded = false;
  let photoError: string | undefined;
  if (payload.photoUri && outletId) {
    // Attempted twice: the attach is a separate request from the create that
    // already succeeded, so one dropped or stalled upload on a field
    // connection shouldn't be the difference between the outlet having its
    // photo and not. Both failures are still non-fatal — the outlet is real
    // either way — but the reason is kept instead of discarded.
    for (let attempt = 1; attempt <= 2 && !photoUploaded; attempt++) {
      try {
        await uploadOutletPhoto(String(outletId), payload.photoUri);
        photoUploaded = true;
        photoError = undefined;
      } catch (e: any) {
        photoError = e?.message || 'The photo upload failed for an unknown reason.';
        debugLog(`[createOutlet] outlet ${outletId} saved but photo upload failed (attempt ${attempt}/2) ->`, photoError, e);
      }
    }
  }

  // Return a rich Outlet object immediately so the UI can update optimistically
  const outlet = mapOutlet({
    name: outletId,
    outlet_name: payload.name,
    outlet_type: payload.type,
    category: payload.subChannel,
    address: payload.address,
    phone_number: payload.phone,
    owner_name: payload.ownerName,
    owner_phone: payload.ownerPhone,
    image: payload.photoUri,
    latitude: payload.latitude,
    longitude: payload.longitude,
    // '' is fine here — this optimistic object's image is always payload.photoUri,
    // a local device URI with its own scheme (file://, content://, ...), which
    // resolveImageUrl passes through untouched regardless of baseUrl.
  }, campaignId, '');
  const flagged = result?.possible_duplicate;
  return {
    outlet,
    photoUploaded,
    photoError,
    possibleDuplicate: flagged?.review_id ? { reviewId: String(flagged.review_id), matches: mapOutletMatches(flagged.matches) } : undefined,
  };
};

export interface UpdateOutletPayload extends OutletClassificationPayload {
  name?: string;
  /** As CreateOutletPayload's: only from a draft saved before the pickers kept ids. */
  type?: string;
  /** The sub-channel's name, sent as `category`. */
  subChannel?: string;
  address?: string;
  phone?: string;
  ownerName?: string;
  ownerPhone?: string;
  notes?: string;
  photoUri?: string;
  /** Only a newly captured location: the backend makes it a request for a supervisor to approve. */
  latitude?: number;
  longitude?: number;
  /** That fix's accuracy, in meters. */
  gpsAccuracy?: number;
  /** The agent's active campaign: its after-edit survey becomes due for the outlet. */
  campaign?: string;
}

/** What update_outlet says beyond saving the edit. */
export interface UpdateOutletResult {
  /** A moved location wasn't applied: it waits for a supervisor's approval. */
  locationRequest?: { id: string; status: string };
  /** The campaign's after-edit survey, now due for the outlet. */
  surveyDue?: SurveyDue;
}

const mapUpdateOutletResult = (data: any): UpdateOutletResult => {
  const result = data?.message ?? data?.data ?? data;
  const request = result?.location_request;
  return {
    locationRequest: request?.id ? { id: String(request.id), status: String(request.status || 'Pending') } : undefined,
    surveyDue: mapSurveyDue(result?.survey_due),
  };
};

/**
 * Update an existing outlet via the RPC contract (`update_outlet`). A
 * location more than 10 m from the saved one isn't applied by the backend:
 * it becomes a request a supervisor approves (`locationRequest`). With the
 * campaign sent, its after-edit survey becomes due for the outlet
 * (`surveyDue`); while one is due, an edit is refused with
 * SURVEY_REQUIRED_AFTER_EDIT (a SoftError carrying survey_id, survey_name).
 */
export const updateOutlet = async (outletId: string, payload: UpdateOutletPayload, meta?: ActionMeta): Promise<UpdateOutletResult> => {
  const fields: Record<string, any> = {
    // Identity key naming isn't confirmed against a real device log yet — sending both
    // `outlet` and `outlet_id` since those are the two conventions used elsewhere in
    // this contract (record_outlet_visit uses `outlet`, update_lead_stage uses `lead_id`).
    outlet: outletId,
    outlet_id: outletId,
    ...stampFields(meta),
  };
  if (payload.name !== undefined) fields.outlet_name = payload.name;
  Object.assign(fields, classificationFields(payload));
  if (payload.address !== undefined) fields.address = payload.address;
  if (payload.phone !== undefined) fields.phone_number = payload.phone;
  if (payload.ownerName !== undefined) fields.owner_name = payload.ownerName;
  if (payload.ownerPhone !== undefined) fields.owner_phone = payload.ownerPhone;
  if (payload.notes !== undefined) fields.notes = payload.notes;
  // Same field names submit_outlet documents for coordinates — update_outlet
  // itself isn't in the Postman contract at all, so this follows the one
  // documented naming convention available for outlet geo-fields.
  if (payload.latitude !== undefined) fields.latitude = payload.latitude;
  if (payload.longitude !== undefined) fields.longitude = payload.longitude;
  if (payload.gpsAccuracy !== undefined) fields.gps_accuracy = payload.gpsAccuracy;
  if (payload.campaign) fields.campaign = payload.campaign;

  if (payload.photoUri) {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.append(key, String(value));
    });
    // Same part builder the onboarding upload uses, so a `?query`-suffixed or
    // non-jpeg camera URI is handled identically here instead of being sent
    // with a broken part name and a hardcoded mime type.
    form.append('image', buildPhotoPart(payload.photoUri));
    return mapUpdateOutletResult(await authFetch('/api/method/fieldops.api.mobile_api.update_outlet', {
      method: 'POST',
      body: form,
    }));
  }
  return mapUpdateOutletResult(await authFetch('/api/method/fieldops.api.mobile_api.update_outlet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  }));
};

/** Skip an outlet visit via the RPC contract (`skip_outlet_visit`), with where the agent was when there's a fix. */
export const skipOutletVisit = async (
  outletId: string,
  campaignId: string,
  reason: string,
  meta?: ActionMeta,
  coordinates?: { lat: number; lng: number }
): Promise<void> => {
  const body: Record<string, any> = { outlet: outletId, outlet_id: outletId, campaign: campaignId, reason, skip_reason: reason, ...stampFields(meta) };
  if (coordinates) {
    body.latitude = coordinates.lat;
    body.longitude = coordinates.lng;
  }
  await authFetch('/api/method/fieldops.api.mobile_api.skip_outlet_visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

// ─── End of Day API ─────────────────────────────────────────────────────────────

/** Submit the end-of-day report via the RPC contract (`submit_eod_report`). */
export const submitEodReport = async (date: string, summary: string, expenses?: number): Promise<void> => {
  const body: Record<string, any> = { date, summary };
  if (expenses !== undefined) body.expenses = expenses;

  await authFetch('/api/method/fieldops.api.mobile_api.submit_eod_report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

// ─── Items / Orders / Sales API ─────────────────────────────────────────────────

/**
 * Frappe returns item/outlet images as a site-relative path (e.g. "/files/product.png"),
 * not an absolute URL — React Native's <Image> can't resolve that (no host/scheme)
 * and just renders blank, so it needs the current tenant's origin prefixed on.
 * Anything that already has its own scheme (http(s)://, data:, or a local device
 * URI like file:// / content:// / ph:// from an optimistic just-created record)
 * is passed through untouched.
 */
const resolveImageUrl = (raw: string | undefined, baseUrl: string): string | undefined => {
  if (!raw) return undefined;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw;
  return `${baseUrl}${raw.startsWith('/') ? '' : '/'}${raw}`;
};

/**
 * The units a product sells in, stock unit first, each priced for one of that
 * unit (`units` from get_items and the inventory endpoints). An older backend
 * sends none — the product then sells only in its stock unit (see
 * getProductUnits), so this returns undefined rather than inventing one.
 */
const mapUnits = (raw: any): ProductUnit[] | undefined => {
  if (!Array.isArray(raw?.units)) return undefined;
  const units = raw.units
    .filter((u: any) => u?.uom && Number(u?.conversion_factor) > 0)
    .map((u: any): ProductUnit => ({
      uom: String(u.uom),
      conversionFactor: Number(u.conversion_factor),
      price: Number(u.price) || 0,
      mustBeWholeNumber: u.must_be_whole_number !== false,
    }));
  return units.length > 0 ? units : undefined;
};

/** The promotions earned by buying a product (get_items' `promotions`; none from an older backend). */
const mapPromotions = (raw: any): ProductPromotion[] | undefined => {
  if (!Array.isArray(raw?.promotions)) return undefined;
  return raw.promotions
    .filter((p: any) => p?.id && p?.uom && p?.reward_item && Number(p?.buy_quantity) > 0 && Number(p?.free_quantity) > 0)
    .map((p: any): ProductPromotion => ({
      id: String(p.id),
      name: p.name || String(p.id),
      buyQuantity: Number(p.buy_quantity),
      uom: String(p.uom),
      rewardItem: String(p.reward_item),
      rewardItemName: p.reward_item_name || String(p.reward_item),
      freeQuantity: Number(p.free_quantity),
      // The server resolves the unit free goods come in; it falls back to the
      // promotion's own uom here only if a response ever leaves it out.
      freeUom: String(p.free_uom || p.uom),
      requiresCode: Boolean(p.requires_code),
      validTo: p.valid_to || undefined,
    }));
};

const mapItem = (raw: any, baseUrl: string): Product => {
  const price = Number(raw?.rate ?? raw?.standard_rate ?? raw?.selling_price ?? raw?.price) || 0;
  // current_stock/on_hand/qty are the field names the backend documented for get_items/
  // get_my_inventory/get_campaign_inventory as of the 2026-09-07 contract update — checked
  // ahead of the older actual_qty/available_qty/stock_qty aliases this app already handled.
  const stock = Number(raw?.current_stock ?? raw?.on_hand ?? raw?.qty ?? raw?.actual_qty ?? raw?.available_qty ?? raw?.stock_qty ?? raw?.stock) || 0;
  return {
    id: raw?.item_code || raw?.name || String(raw?.id || ''),
    name: raw?.item_name || raw?.name || raw?.item_code || 'Unknown Item',
    sku: raw?.item_code || raw?.sku || '',
    price,
    stock,
    category: raw?.item_group || raw?.category || undefined,
    warehouse: raw?.warehouse || '',
    unitsPerCase: Number(raw?.units_per_case ?? raw?.conversion_factor) || 1,
    imageUrl: resolveImageUrl(raw?.image || raw?.image_url || undefined, baseUrl),
    description: raw?.description || undefined,
    unit: raw?.stock_uom || raw?.unit || undefined,
    brand: raw?.brand || undefined,
    size: raw?.size || undefined,
    salesUom: raw?.sales_uom || undefined,
    isMsl: Boolean(raw?.is_msl),
    stockStatus: raw?.stock_status || undefined,
    units: mapUnits(raw),
    promotions: mapPromotions(raw),
  };
};

/**
 * get_my_inventory/get_campaign_inventory return an array of inventory *documents*
 * (id/inventory_date/status), each carrying a nested `items` child array with the
 * actual per-product stock lines — not a flat item list like get_items. Detects
 * which shape came back (rather than assuming) so a future flat response still works.
 */
const flattenInventoryResponse = (raw: any[], baseUrl: string): Product[] => {
  if (raw.length > 0 && Array.isArray(raw[0]?.items)) {
    return raw.flatMap((rec: any) => (Array.isArray(rec.items) ? rec.items.map((it: any) => mapItem(it, baseUrl)) : []));
  }
  return raw.map((it: any) => mapItem(it, baseUrl));
};

/** Fetch the product catalog via the RPC contract (`get_items`). Throws when it can't be loaded, so the copy on the phone is kept. */
export const getItems = async (options?: ListOptions): Promise<Product[]> => {
  const tenantId = await getTenantId();
  // The whole catalog, 500 at a time (the backend's page is 100): a bigger one was cut off, offline included.
  const { rows } = await fetchAllPages(
    async (start, size) => ({ rows: listOf(await authFetch(`/api/method/fieldops.api.mobile_api.get_items${pageQuery(start, size)}`)) }),
    { size: 500, idOf: (it: any) => String(it?.item_code || it?.name || it?.id || ''), onProgress: options?.onProgress },
  );
  return rows.map((it: any) => mapItem(it, getBaseUrl(tenantId || '')));
};

export interface OrderLinePayload {
  itemCode: string;
  itemName?: string;
  /** Quantity in `uom`. */
  qty: number;
  /** The unit `qty` counts in — none means the stock unit, as older app versions send. */
  uom?: string;
  /** Price for one `uom`: the server prices every line itself and ignores this,
   *  but an older backend still saves it. */
  rate: number;
}

/** A line as the server saved it — priced by the server, free goods included. */
export interface SavedOrderLine {
  itemCode: string;
  itemName: string;
  uom?: string;
  /** Quantity in `uom`. */
  qty: number;
  conversionFactor: number;
  /** Quantity in stock units. */
  stockQty: number;
  /** Price for one `uom` (0 for a free line). */
  rate: number;
  amount: number;
  isFree: boolean;
  promotionName?: string;
}

/**
 * One sale/order line from submit_field_sale, submit_sales_order, get_my_sales
 * or get_my_orders. Older backends send no uom / conversion_factor / stock_qty:
 * such a line is in stock units.
 */
const mapSavedLine = (raw: any): SavedOrderLine => {
  const qty = Number(raw?.qty ?? raw?.quantity) || 0;
  const conversionFactor = Number(raw?.conversion_factor) || 1;
  const rate = Number(raw?.rate ?? raw?.unit_price) || 0;
  const itemCode = String(raw?.item_code || raw?.item || raw?.product_id || '');
  return {
    itemCode,
    itemName: raw?.item_name || raw?.product_name || itemCode || 'Item',
    uom: raw?.uom || undefined,
    qty,
    conversionFactor,
    stockQty: Number(raw?.stock_qty) || qty * conversionFactor,
    rate,
    amount: Number(raw?.amount) || rate * qty,
    isFree: Boolean(raw?.is_free),
    promotionName: raw?.promotion_name || undefined,
  };
};

/** The saved lines and total a submit returns — undefined from a backend that doesn't send them. */
const mapSubmitResult = (result: any): { items?: SavedOrderLine[]; totalAmount?: number } => {
  const items = Array.isArray(result?.items) ? result.items.map(mapSavedLine).filter((l: SavedOrderLine) => l.itemCode) : undefined;
  const total = Number(result?.total_amount);
  return {
    items: items && items.length > 0 ? items : undefined,
    totalAmount: items && items.length > 0 && Number.isFinite(total) ? total : undefined,
  };
};

/**
 * The agent's geofence via `get_my_geofence`: the GPS tolerance and their
 * active territories, for checking a sale's location on the phone (offline
 * too). Throws when it can't be loaded; a backend without it means no
 * territory check.
 */
export const getMyGeofence = async (): Promise<GeofenceConfig> => {
  const data = await authFetch('/api/method/fieldops.api.mobile_api.get_my_geofence');
  const body = data?.message ?? data;
  const tolerance = Number(body?.tolerance_m);
  return {
    toleranceM: Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 100,
    territories: (Array.isArray(body?.territories) ? body.territories : [])
      .filter((t: any) => t?.geojson)
      .map((t: any) => ({ name: String(t?.name || 'Territory'), geojson: t.geojson })),
    allowedOutside: !!Number(body?.allowed_outside),
  };
};

/** How the server judged a sale's location (its re-check is the one recorded). */
export interface SaleLocationResult {
  atOutlet: boolean | null;
  distanceM: number | null;
  insideTerritory: boolean | null;
  territory?: string;
}

const yesNoOrNull = (value: any): boolean | null => (value === null || value === undefined ? null : value === true || Number(value) === 1);

const mapSaleLocationResult = (raw: any): SaleLocationResult | undefined =>
  raw && typeof raw === 'object'
    ? {
        atOutlet: yesNoOrNull(raw.at_outlet),
        distanceM: raw.distance_m === null || raw.distance_m === undefined ? null : Number(raw.distance_m),
        insideTerritory: yesNoOrNull(raw.inside_territory),
        territory: raw.territory || undefined,
      }
    : undefined;

/**
 * Submit an immediate, paid transaction via the RPC contract (`submit_field_sale`).
 * There's no payment-method picker on the Sale flow yet, so `payment_type` defaults
 * to "Cash" and `amount_paid` is assumed to equal the cart total (a fully-paid sale).
 *
 * Field names follow the backend's documented "recommended mobile JSON body"
 * (2026-09-07 spec) — `outlet_id`/`campaign_id`, items keyed by `product_id`/
 * `product_name`/`qty`/`unit_price`/`amount`, plus `total_amount`. The older
 * `outlet`/`campaign`/`item`/`item_code`/`quantity`/`rate` aliases are also accepted
 * per that same spec, so they're kept alongside rather than swapped out.
 *
 * `location` is where the sale was recorded: the fix, its accuracy and time,
 * the agent's reason when it was away from the outlet or outside their
 * territory, and capturedOffline for a draft synced later. The server checks
 * it again, records it on the sale, and returns its verdict as `location`.
 */
export const submitFieldSale = async (
  outletId: string,
  campaignId: string,
  lines: OrderLinePayload[],
  amountPaid: number,
  location?: SaleLocation & { capturedOffline?: boolean },
  promoCode?: string,
  meta?: ActionMeta
): Promise<{ ref: string; items?: SavedOrderLine[]; totalAmount?: number; location?: SaleLocationResult }> => {
  const totalAmount = lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
  const body: Record<string, any> = {
    ...stampFields(meta),
    outlet: outletId,
    outlet_id: outletId,
    campaign: campaignId,
    campaign_id: campaignId,
    items: lines.map((l) => ({
      item: l.itemCode,
      item_code: l.itemCode,
      product_id: l.itemCode,
      product_name: l.itemName,
      item_name: l.itemName,
      quantity: l.qty,
      qty: l.qty,
      ...(l.uom ? { uom: l.uom } : {}),
      rate: l.rate,
      unit_price: l.rate,
      amount: l.qty * l.rate,
    })),
    total_amount: totalAmount,
    payment_type: 'Cash',
    amount_paid: amountPaid,
  };
  if (location) {
    if (location.lat !== undefined && location.lng !== undefined) {
      body.latitude = location.lat;
      body.longitude = location.lng;
    }
    if (location.accuracy !== undefined) body.gps_accuracy = location.accuracy;
    if (location.capturedAt) body.location_captured_at = location.capturedAt;
    if (location.outsideReason?.trim()) body.outside_reason = location.outsideReason.trim();
    if (location.capturedOffline) body.captured_offline = 1;
  }
  if (promoCode?.trim()) body.promo_code = promoCode.trim();
  const data = await authFetch('/api/method/fieldops.api.mobile_api.submit_field_sale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = data?.message ?? data?.data ?? data;
  const ref = result?.sale_id || result?.invoice_id || result?.name || result?.id || '';
  return { ref: String(ref), ...mapSubmitResult(result), location: mapSaleLocationResult(result?.location) };
};

/**
 * Submit a pending order via the RPC contract (`submit_sales_order`). There's no
 * delivery-date picker on the Order flow yet, so `delivery_date` defaults to today.
 *
 * `submit_sales_order` now loops over a real `items[]` array (backend fix confirmed
 * 2026-09-07 — previously it only read a single product off the top level, silently
 * dropping every line past the first). Field names follow the same flexible-schema
 * spec documented for `submit_field_sale` — both camelCase and snake_case
 * outlet/campaign keys are accepted, so both are sent for consistency with that
 * endpoint's payload shape.
 */
export const submitSalesOrder = async (
  outletId: string,
  campaignId: string,
  lines: OrderLinePayload[],
  promoCode?: string,
  meta?: ActionMeta
): Promise<{ ref: string; items?: SavedOrderLine[]; totalAmount?: number }> => {
  const totalAmount = lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
  const body: Record<string, any> = {
    ...stampFields(meta),
    outletId,
    outlet_id: outletId,
    campaignId,
    campaign_id: campaignId,
    deliveryDate: localDateStr(),
    items: lines.map((l) => ({
      productId: l.itemCode,
      product_id: l.itemCode,
      product_name: l.itemName,
      qty: l.qty,
      ...(l.uom ? { uom: l.uom } : {}),
      unitPrice: l.rate,
      unit_price: l.rate,
      amount: l.qty * l.rate,
    })),
    total_amount: totalAmount,
  };
  if (promoCode?.trim()) body.promo_code = promoCode.trim();
  const data = await authFetch('/api/method/fieldops.api.mobile_api.submit_sales_order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = data?.message ?? data?.data ?? data;
  const ref = result?.order_id || result?.name || result?.id || '';
  return { ref: String(ref), ...mapSubmitResult(result) };
};

/**
 * `get_my_orders`/`get_my_sales` return one document per order/sale, each with a
 * nested `items` child table — the app's OutletOrder/OutletSale types are flat,
 * one-line-per-record (grouped back into a transaction by ref client-side via
 * `groupOrdersByRef`/`groupSalesByInvoice`, same as locally-created ones), so each
 * doc is flattened into one record per line here, all sharing the doc's ref.
 */
const mapOrderDoc = (raw: any): OutletOrder[] => {
  const ref = String(raw?.name || raw?.order_id || raw?.id || '');
  const outletId = String(raw?.customer || raw?.outlet || '');
  const customerName = raw?.customer_name || raw?.outlet_name || '';
  const timestamp = raw?.delivery_date || raw?.transaction_date || raw?.posting_date || raw?.creation || '';
  const statusRaw = String(raw?.status || raw?.order_status || '').toLowerCase();
  const status: OutletOrder['status'] = statusRaw.includes('deliver')
    ? 'Delivered'
    : statusRaw.includes('confirm')
      ? 'Confirmed'
      : 'Pending';
  const items = Array.isArray(raw?.items) ? raw.items : [];

  // Each line in its own unit, free goods included (a line from an older
  // backend has no uom and is in stock units).
  return items.map(mapSavedLine).map((line: SavedOrderLine, idx: number) => ({
    id: `${ref}-${idx}`,
    outletId,
    campaignId: String(raw?.campaign || ''),
    productId: line.itemCode,
    productName: line.itemName,
    quantity: line.qty,
    uom: line.uom,
    conversionFactor: line.conversionFactor,
    stockQty: line.stockQty,
    unitPrice: line.rate,
    total: line.amount,
    isFree: line.isFree || undefined,
    promotionName: line.promotionName,
    customerId: outletId,
    customerName,
    status,
    timestamp: String(timestamp),
    orderRef: ref,
  }));
};

const mapSaleDoc = (raw: any): OutletSale[] => {
  const ref = String(raw?.name || raw?.sale_id || raw?.invoice_id || raw?.id || '');
  const outletId = String(raw?.outlet || raw?.customer || '');
  const customerName = raw?.outlet_name || raw?.customer_name || '';
  const timestamp = raw?.posting_date || raw?.transaction_date || raw?.creation || '';
  const items = Array.isArray(raw?.items) ? raw.items : [];

  // Each line in its own unit, free goods included (a line from an older
  // backend has no uom and is in stock units).
  return items.map(mapSavedLine).map((line: SavedOrderLine, idx: number) => ({
    id: `${ref}-${idx}`,
    outletId,
    campaignId: String(raw?.campaign || ''),
    productId: line.itemCode,
    productName: line.itemName,
    quantity: line.qty,
    uom: line.uom,
    conversionFactor: line.conversionFactor,
    stockQty: line.stockQty,
    unitPrice: line.rate,
    total: line.amount,
    isFree: line.isFree || undefined,
    promotionName: line.promotionName,
    customerId: outletId,
    customerName,
    timestamp: String(timestamp),
    invoiceRef: ref,
  }));
};

/**
 * A page of the agent's history, newest first: its records (an order or sale is a record
 * per line), and how many documents came, which tells whether there may be more.
 */
export interface HistoryPage<T> {
  records: T[];
  docs: number;
}

/** How much more history "Load more" asks for at a time. */
export const HISTORY_PAGE = 50;

/** The page from `start` (`size` documents), or the backend's first page when none is asked for. */
const historyQuery = (start?: number, size?: number) => (start !== undefined && size ? pageQuery(start, size) : '');

/** A page of this agent's orders via `get_my_orders`; without a page, the newest (the backend's first page, 20). Throws when it can't be loaded. */
export const getMyOrdersPage = async (start?: number, size?: number): Promise<HistoryPage<OutletOrder>> => {
  const list = listOf(await authFetch(`/api/method/fieldops.api.mobile_api.get_my_orders${historyQuery(start, size)}`));
  return { records: list.flatMap(mapOrderDoc), docs: list.length };
};

/** This agent's newest orders (`get_my_orders`). Throws when they can't be loaded, so the copy on the phone is kept. */
export const getMyOrders = async (): Promise<OutletOrder[]> => (await getMyOrdersPage()).records;

/** A page of this agent's field sales via `get_my_sales`; without a page, the newest (the backend's first page, 50). Throws when it can't be loaded. */
export const getMySalesPage = async (start?: number, size?: number): Promise<HistoryPage<OutletSale>> => {
  const list = listOf(await authFetch(`/api/method/fieldops.api.mobile_api.get_my_sales${historyQuery(start, size)}`));
  return { records: list.flatMap(mapSaleDoc), docs: list.length };
};

/** This agent's newest field sales (`get_my_sales`). Throws when they can't be loaded, so the copy on the phone is kept. */
export const getMySales = async (): Promise<OutletSale[]> => (await getMySalesPage()).records;

// ─── Morning download ───────────────────────────────────────────────────────────

/**
 * The outlets the agent may come across (in their territories, in the zone or
 * area of an outlet on their list, or on it) via `get_outlet_directory`, for
 * spotting an outlet that's already onboarded offline. Phone numbers come only
 * as lowercase hex sha256(phoneHashSalt + number), with their last 4 digits.
 * Asked for 1,000 at a time; the backend counts them all (`total`), which
 * decides when they're all in (it keeps its pages to 500). An older backend
 * sends them all at once. Throws when any page can't be loaded.
 */
export const getOutletDirectory = async (options?: ListOptions): Promise<Omit<OutletDirectory, 'savedAt' | 'agentEmail'>> => {
  let body: any = null;
  const { rows } = await fetchAllPages(
    async (start, size) => {
      const data = await authFetch(`/api/method/fieldops.api.mobile_api.get_outlet_directory${pageQuery(start, size)}`);
      const page = data?.message ?? data;
      body = body || page;
      const total = Number(page?.total);
      return { rows: Array.isArray(page?.outlets) ? page.outlets : [], total: page?.total !== undefined && Number.isFinite(total) ? total : undefined };
    },
    { size: 1000, idOf: (o: any) => String(o?.id || ''), onProgress: options?.onProgress },
  );
  const distance = Number(body?.duplicate_distance_m);
  const number = (value: any) => (value === null || value === undefined || value === '' ? null : Number(value));
  return {
    duplicateDistanceM: Number.isFinite(distance) && distance >= 0 ? distance : 50,
    phoneHashSalt: String(body?.phone_hash_salt || ''),
    outlets: rows
      .filter((o: any) => o?.id)
      .map((o: any) => ({
        id: String(o.id),
        name: String(o.name || o.id),
        address: o.address ? String(o.address) : '',
        latitude: number(o.latitude),
        longitude: number(o.longitude),
        phoneHashes: Array.isArray(o.phone_hashes) ? o.phone_hashes.map(String) : [],
        phoneLast4: Array.isArray(o.phone_last4) ? o.phone_last4.map(String) : [],
        onboardedByName: o.onboarded_by_name ? String(o.onboarded_by_name) : undefined,
        onboardedOn: o.onboarded_on ? String(o.onboarded_on) : undefined,
        onMyList: !!o.on_my_list,
      })),
  };
};

/**
 * A fresh access token for the signed-in agent via `renew_access_token`, saved
 * in place of the old one; the app asks after each clock-in so a login never
 * runs out mid-shift. Throws when it can't be had (an older backend doesn't
 * have it: the old token stays).
 */
export const renewAccessToken = async (): Promise<void> => {
  const data = await authFetch('/api/method/fieldops.api.mobile_api.renew_access_token', { method: 'POST' });
  const body = data?.message ?? data;
  const token = body?.access_token || data?.access_token;
  if (!token) throw new Error('No new access token came back.');
  await setAccessToken(String(token));
};

// ─── Stock Requests / Reconciliations API ───────────────────────────────────────

/**
 * Fetch the agent's own held stock via the RPC contract (`get_my_inventory`) — distinct
 * from `get_items` (the full campaign catalog used to pick products on a Sale/Order).
 * Reuses `mapItem` since the two endpoints are expected to describe items the same way,
 * just scoped differently; the result replaces `state.products` the same as `getItems`
 * does, since the app keeps a single flat product list rather than two parallel ones.
 */
export const getMyInventory = async (): Promise<Product[]> => {
  // Every failure is thrown, so My Stock can tell "couldn't load" from "no
  // stock" (an empty list), which isn't an error.
  const [data, tenantId] = await Promise.all([
    authFetch('/api/method/fieldops.api.mobile_api.get_my_inventory'),
    getTenantId(),
  ]);
  const raw = data?.message ?? data?.data ?? data;
  const list = Array.isArray(raw) ? raw : [];
  return flattenInventoryResponse(list, getBaseUrl(tenantId || ""));
};

export interface StockRequestLine {
  itemCode: string;
  itemName?: string;
  qty: number;
  cases?: number;
  units?: number;
}

/**
 * Submit a replenishment request via the RPC contract (`submit_stock_request`).
 *
 * The backend's per-line mapping falls back to the item code as the display name
 * whenever `item_name` isn't sent (`pname = l.get("item_name") or ... or pid`) — the
 * app previously only sent `item_code`/`qty`, so the web approval screen showed the
 * raw item code instead of a readable product name. `item_name` (plus `cases`/`units`,
 * which the backend folds into a per-line note when present) are now sent too.
 */
export const submitStockRequest = async (
  campaignId: string,
  lines: StockRequestLine[],
  purpose?: string,
  meta?: ActionMeta
): Promise<{ ref: string }> => {
  const body = {
    ...stampFields(meta),
    // The documented contract field is `campaign_id` (not `campaign`, which this app
    // uses elsewhere for other endpoints) — sending both since an extra unrecognized
    // key is harmless but a missing required one silently drops the campaign link.
    campaign_id: campaignId,
    campaign: campaignId,
    items: lines.map((l) => ({
      item_code: l.itemCode,
      qty: l.qty,
      item_name: l.itemName,
      cases: l.cases,
      units: l.units,
    })),
    notes: purpose || 'Field Replenishment',
  };
  const data = await authFetch('/api/method/fieldops.api.mobile_api.submit_stock_request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = data?.message ?? data?.data ?? data;
  const ref = result?.request_id || result?.name || result?.id || '';
  return { ref: String(ref) };
};

export interface StockRequestSummary {
  id: string;
  status: string;
  createdAt: string;
  note?: string;
  items: { itemCode: string; itemName: string; qty: number }[];
}

const mapStockRequest = (raw: any): StockRequestSummary => {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return {
    id: raw?.name || raw?.id || '',
    status: raw?.status || 'Pending',
    createdAt: raw?.createdAt || raw?.created_at || raw?.creation || '',
    note: raw?.note || raw?.notes || undefined,
    items: items.map((it: any) => ({
      itemCode: it?.item_code || '',
      itemName: it?.item_name || it?.item_code || 'Item',
      qty: Number(it?.quantity ?? it?.qty) || 0,
    })),
  };
};

/** A page of this agent's stock requests via `get_my_stock_requests`; without a page, the newest (the backend's first page, 50). Throws when it can't be loaded. */
export const getMyStockRequestsPage = async (start?: number, size?: number): Promise<HistoryPage<StockRequestSummary>> => {
  const list = listOf(await authFetch(`/api/method/fieldops.api.mobile_api.get_my_stock_requests${historyQuery(start, size)}`));
  return { records: list.map(mapStockRequest), docs: list.length };
};

/** This agent's newest stock requests and their approval status (`get_my_stock_requests`). */
export const getMyStockRequests = async (): Promise<StockRequestSummary[]> => (await getMyStockRequestsPage()).records;

export interface ReconciliationLine {
  itemCode: string;
  physicalQty: number;
  recordedQty: number;
}

/** Submit a physical-vs-system stock count via the RPC contract (`submit_stock_reconciliation`). */
export const submitStockReconciliation = async (
  campaignId: string,
  lines: ReconciliationLine[]
): Promise<{ ref: string }> => {
  const body = {
    campaign: campaignId,
    items: lines.map((l) => ({
      item_code: l.itemCode,
      physical_qty: l.physicalQty,
      recorded_qty: l.recordedQty,
    })),
  };
  const data = await authFetch('/api/method/fieldops.api.mobile_api.submit_stock_reconciliation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = data?.message ?? data?.data ?? data;
  const ref = result?.reconciliation_id || result?.name || result?.id || '';
  return { ref: String(ref) };
};

// ─── Surveys API ──────────────────────────────────────────────────────────────

export interface SurveyListItem {
  id: string;
  name: string;
  status: string;
  startDate?: string;
  endDate?: string;
  /** The campaign's survey to fill after an outlet is edited. */
  afterOutletEdit: boolean;
  /** Its questions, when they were asked for (includeQuestions) and the backend sends them. */
  detail?: CampaignSurveyConfig;
}

const mapSurveyListItem = (raw: any): SurveyListItem => ({
  id: raw?.name || raw?.id || '',
  name: raw?.survey_name || raw?.name || 'Survey',
  status: raw?.status || '',
  startDate: raw?.start_date || undefined,
  endDate: raw?.end_date || undefined,
  afterOutletEdit: Number(raw?.after_outlet_edit) === 1 || raw?.after_outlet_edit === true,
  detail: raw?.detail && typeof raw.detail === 'object' ? mapSurveyDetail(raw.detail) : undefined,
});

/**
 * List surveys assigned to the agent for a campaign via `get_surveys_for_campaign`:
 * id/name/status/dates, and with includeQuestions each survey's `detail` (what
 * get_survey_detail returns), so the morning download needs one request, not one
 * per survey. An older backend sends no `detail`: call `getSurveyDetail` per survey.
 * Throws when it can't be loaded, so the copy on the phone is kept.
 */
export const getSurveysForCampaign = async (campaignId: string, options?: { includeQuestions?: boolean }): Promise<SurveyListItem[]> => {
  const questions = options?.includeQuestions ? '&include_questions=1' : '';
  const data = await authFetch(`/api/method/fieldops.api.mobile_api.get_surveys_for_campaign?campaign=${encodeURIComponent(campaignId)}${questions}`);
  const raw = data?.message ?? data?.data ?? data;
  const list = Array.isArray(raw) ? raw : [];
  return list.map(mapSurveyListItem);
};

/**
 * The backend sends question_type as a mobile-friendly label (Text/Multiple Choice/
 * Single Choice/Rating/Image/Number) rather than this app's internal QuestionType union.
 * "Single Choice" with exactly ["Yes","No"] options already renders as the yes/no
 * toggle in DynamicSurveyForm — that check lives there (q.type === 'choice' + options),
 * so no separate yes/no QuestionType is needed on this side.
 */
const BACKEND_TO_APP_QUESTION_TYPE: Record<string, QuestionType> = {
  Text: 'text',
  'Multiple Choice': 'multi',
  'Single Choice': 'choice',
  Rating: 'rating',
  Image: 'photo',
  Number: 'number',
};
const APP_TO_BACKEND_QUESTION_TYPE: Record<QuestionType, string> = {
  text: 'Text',
  multi: 'Multiple Choice',
  choice: 'Single Choice',
  rating: 'Rating',
  photo: 'Image',
  select: 'Text',
  number: 'Number',
  gps: 'Text',
};

/**
 * `get_survey_detail` returns one flat `questions[]` array (no sections). This app's
 * survey form/review UI is built around sectioned surveys (see LeadSurveySection), so
 * the flat list is wrapped as a single synthetic section rather than inventing section
 * boundaries the backend never sends.
 *
 * `required` comes as 1 / 0. Older backends always sent 0, so no question is
 * required there and the forms' required checks stay quiet.
 */
const mapSurveyDetail = (raw: any): CampaignSurveyConfig => {
  const questions: DynamicSurveyQuestion[] = Array.isArray(raw?.questions)
    ? raw.questions.map((q: any) => ({
        id: q?.name || q?.id || '',
        type: BACKEND_TO_APP_QUESTION_TYPE[q?.question_type] || 'text',
        question: q?.question || q?.question_text || '',
        required: Number(q?.required) === 1,
        options: Array.isArray(q?.options) && q.options.length > 0 ? q.options : undefined,
      }))
    : [];

  return {
    id: raw?.name || raw?.id || '',
    name: raw?.survey_name || raw?.name || 'Survey',
    module: 'surveys',
    questions,
    sections: [{ id: 'section-1', name: 'Questions', questions }],
    description: raw?.description || undefined,
    durationLabel: questions.length > 0 ? `~${Math.max(1, Math.round(questions.length / 3))} min` : undefined,
    afterOutletEdit: Number(raw?.after_outlet_edit) === 1 || raw?.after_outlet_edit === true,
  };
};

/** Fetch a survey's full question set via `get_survey_detail`; null for a survey that isn't there. Throws when it can't be loaded. */
export const getSurveyDetail = async (surveyId: string): Promise<CampaignSurveyConfig | null> => {
  const data = await authFetch(`/api/method/fieldops.api.mobile_api.get_survey_detail?survey_id=${encodeURIComponent(surveyId)}`);
  const raw = data?.message ?? data?.data ?? data;
  if (!raw || typeof raw !== 'object') return null;
  return mapSurveyDetail(raw);
};

export interface SurveyResponsePayload {
  questionId: string;
  questionType: QuestionType;
  answer: string | string[] | number | null;
}

export interface SurveyRespondent {
  leadId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/**
 * Submit a survey via the RPC contract (`submit_survey_response`), its photos
 * in the same request: the server refuses a survey with any question
 * unanswered, photo questions included (REQUIRED_ANSWERS_MISSING), so a photo
 * can't follow later. With photos (question id -> local file) the request is
 * multipart, each photo a file part named by its question id; the answers go
 * as they do in JSON, a photo question's answer empty, since the device's
 * file path means nothing to the server. A survey without photos is sent as
 * JSON. Resubmitting a survey for the same outlet on the same day updates the
 * agent's earlier response.
 */
export const submitSurveyResponse = async (
  surveyId: string,
  responses: SurveyResponsePayload[],
  coordinates?: { lat: number; lng: number },
  respondent?: SurveyRespondent,
  outletId?: string,
  photos?: Record<string, string>,
  meta?: ActionMeta
): Promise<{ responseId: string }> => {
  const body: Record<string, any> = {
    ...stampFields(meta),
    survey: surveyId,
    responses: responses.map((r) => ({
      question: r.questionId,
      question_type: APP_TO_BACKEND_QUESTION_TYPE[r.questionType] || 'Text',
      // A number goes cleaned ("12." as "12", ".5" as "0.5"); it's kept as typed on the phone.
      answer: r.questionType === 'photo' ? ''
        : r.questionType === 'number' ? cleanNumberAnswer(r.answer)
        : Array.isArray(r.answer) ? r.answer.join(', ') : r.answer,
    })),
  };
  if (coordinates) {
    body.latitude = coordinates.lat;
    body.longitude = coordinates.lng;
  }
  if (respondent?.leadId) body.lead_id = respondent.leadId;
  if (respondent?.firstName) body.first_name = respondent.firstName;
  if (respondent?.lastName) body.last_name = respondent.lastName;
  if (respondent?.phone) body.phone = respondent.phone;
  // Confirmed live: the backend now stores/returns this (outlet/customer/
  // outlet_id/customer_id on get_my_surveys), but only if it's actually sent —
  // this endpoint never included it before, which is why every outlet survey
  // response showed no outlet at all regardless of any backend fix.
  if (outletId) {
    body.outlet = outletId;
    body.customer = outletId;
  }

  const photoParts = Object.entries(photos || {}).filter(([, uri]) => !!uri);
  let data: any;
  if (photoParts.length > 0) {
    const form = new FormData();
    Object.entries(body).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
    // Same part builder as the other photo uploads: throws, before anything
    // is sent, for a photo whose file is no longer on the device.
    photoParts.forEach(([questionId, uri]) => form.append(questionId, buildPhotoPart(uri)));
    data = await authFetch('/api/method/fieldops.api.mobile_api.submit_survey_response', {
      method: 'POST',
      body: form,
    });
  } else {
    data = await authFetch('/api/method/fieldops.api.mobile_api.submit_survey_response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  const result = data?.message ?? data?.data ?? data;
  return { responseId: String(result?.response_id || '') };
};

/**
 * Attaches a photo to a survey response that's already on the server, via
 * `upload_survey_photo` (multipart: response_id, question_id, photo) — the
 * response itself carries an empty answer for the question, see
 * submitSurveyResponse. The file part is built the same way as outlet photos.
 */
export const uploadSurveyPhoto = async (responseId: string, questionId: string, photoUri: string): Promise<{ fileUrl: string }> => {
  const form = new FormData();
  form.append('response_id', responseId);
  form.append('question_id', questionId);
  form.append('photo', buildPhotoPart(photoUri));
  const data = await authFetch('/api/method/fieldops.api.mobile_api.upload_survey_photo', {
    method: 'POST',
    body: form,
  });
  const result = data?.message ?? data?.data ?? data;
  return { fileUrl: String(result?.file_url || '') };
};

export interface MySurveyResponseSummary {
  id: string;
  surveyId: string;
  status: string;
  submissionDate?: string;
  /** Every id the response names its outlet by (outlet, outlet_id, customer, customer_id) — empty from an older backend. */
  outletIds: string[];
  /** The lead it was for (lead_id), where the backend sends it. */
  leadId?: string;
}

const mapMySurveyResponse = (raw: any): MySurveyResponseSummary => ({
  id: raw?.name || raw?.id || '',
  surveyId: raw?.survey || '',
  status: raw?.status || '',
  submissionDate: raw?.submission_date || undefined,
  outletIds: Array.from(new Set([raw?.outlet, raw?.outlet_id, raw?.customer, raw?.customer_id].filter(Boolean).map(String))),
  leadId: raw?.lead_id ? String(raw.lead_id) : undefined,
});

/**
 * Fetch this agent's own submitted survey responses via `get_my_surveys`, optionally scoped to a campaign.
 * Asks for up to 500: the backend's default page is 20, and a survey counts as done per outlet or
 * lead, so an older response left off the page would show its survey as not done.
 */
export const getMySurveys = async (campaignId?: string): Promise<MySurveyResponseSummary[]> => {
  const qs = `?limit_page_length=500${campaignId ? `&campaign=${encodeURIComponent(campaignId)}` : ''}`;
  const data = await authFetch(`/api/method/fieldops.api.mobile_api.get_my_surveys${qs}`);
  const raw = data?.message ?? data?.data ?? data;
  const list = Array.isArray(raw) ? raw : [];
  return list.map(mapMySurveyResponse);
};

// ─── Journey Maps / Beat Plans API ───────────────────────────────────────────────

/**
 * `DayRouteNav` (LeadsScreen/OutletsScreen) only ever reads `routeName` for the
 * selected date — it deliberately does NOT filter leads/outlets by `outletIds`/
 * `leadIds` (a mock-id mismatch bug fixed earlier this session), so those two
 * fields are mapped through for type completeness but nothing currently reads them.
 */
const mapBeat = (raw: any): RouteAssignment => ({
  date: raw?.date || raw?.beat_date || raw?.visit_date || '',
  routeName: raw?.route_name || raw?.beat_name || raw?.name || 'Assigned Route',
  outletIds: Array.isArray(raw?.outlet_ids) ? raw.outlet_ids.map(String) : [],
  leadIds: Array.isArray(raw?.lead_ids) ? raw.lead_ids.map(String) : [],
});

/** Fetch this agent's day-by-day route/beat assignments via `get_agent_beats`. */
export const getAgentBeats = async (): Promise<RouteAssignment[]> => {
  const data = await authFetch('/api/method/fieldops.api.mobile_api.get_agent_beats');
  const raw = data?.message ?? data?.data ?? data;
  const list = Array.isArray(raw) ? raw : [];
  return list.map(mapBeat).filter((a: RouteAssignment) => a.date);
};

// ─── Notifications API ──────────────────────────────────────────────────────────

const NOTIFICATION_TYPE_COLOR: Record<string, string> = {
  assignment: '#6D5BD0',
  stock: '#D4890A',
  geofence: '#1A9E60',
  eod: '#2563EB',
  system: '#64748B',
};

const formatRelativeTime = (iso: string): string => {
  const date = new Date(iso);
  if (!iso || isNaN(date.getTime())) return '';
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const mapNotification = (raw: any): NotificationItem => {
  const type: NotificationItem['type'] = ['assignment', 'geofence', 'stock', 'eod'].includes(raw?.type)
    ? raw.type
    : 'system';
  return {
    id: raw?.name || String(raw?.id || `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    title: raw?.title || raw?.subject || 'Notification',
    body: raw?.body || raw?.message || '',
    time: formatRelativeTime(raw?.creation || raw?.timestamp || raw?.sent_at || ''),
    type,
    color: NOTIFICATION_TYPE_COLOR[type],
    read: Boolean(raw?.read ?? raw?.is_read ?? raw?.seen),
  };
};

/** Fetch this agent's notification feed via `get_notifications`. */
export const getNotifications = async (): Promise<NotificationItem[]> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.get_notifications');
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
    return list.map(mapNotification);
  } catch (e: any) {
    if (e instanceof AuthError || e instanceof NetworkError) throw e;
    return [];
  }
};

/** Fetch the unread notification badge count via `get_unread_notification_count`. */
export const getUnreadNotificationCount = async (): Promise<number> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.get_unread_notification_count');
    const raw = data?.message ?? data?.data ?? data;
    if (typeof raw === 'number') return raw;
    return Number(raw?.count ?? raw?.unread_count ?? 0) || 0;
  } catch (e: any) {
    if (e instanceof AuthError || e instanceof NetworkError) throw e;
    return 0;
  }
};
