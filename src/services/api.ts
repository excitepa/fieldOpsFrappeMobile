import * as FileSystem from 'expo-file-system/legacy';
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
import { Campaign, CampaignCategory, CampaignModule, UserProfile, Lead, LeadStage, Outlet, OutletStatus, Product, OutletOrder, OutletSale, RouteAssignment, NotificationItem, CampaignSurveyConfig, DynamicSurveyQuestion, QuestionType } from '../types';

/** Thrown by authFetch when the stored session is missing or the server rejects the token (401). */
export class AuthError extends Error {}

/** Thrown by authFetch only when the device couldn't reach the server at all (no response received) — distinct from a request that reached the server and was rejected, which should never be treated as "offline". */
export class NetworkError extends Error {}

export interface LoginResult {
  success: boolean;
  message?: string;
  accessToken?: string;
  user?: UserProfile;
}

/** Attaches the stored bearer token and tenant base URL to a request against a protected `/agent/*` or `/api/*` route. */
const authFetch = async (path: string, options: RequestInit = {}): Promise<any> => {
  const [token, tenantId] = await Promise.all([getAccessToken(), getTenantId()]);
  if (!token || !tenantId) {
    throw new AuthError('Your session has expired. Please sign in again.');
  }

  const url = `${getBaseUrl(tenantId)}${path}`;
  const method = options.method || 'GET';
  console.log('[FieldOps API]', method, url, options.body instanceof FormData ? '(form-data)' : options.body ?? '');

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  } catch (err: any) {
    console.log('[FieldOps API]', method, url, '-> NETWORK ERROR', err?.message || err);
    throw new NetworkError('Could not reach the server. Check your connection and try again.');
  }

  const rawText = await response.text();
  console.log('[FieldOps API]', method, url, '->', response.status, rawText);

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Server returned an unexpected response (HTTP ${response.status}).`);
  }

  if (response.status === 401) {
    throw new AuthError(data?.message || 'Your session has expired. Please sign in again.');
  }
  if (!response.ok || data?.status === 'error') {
    throw new Error(data?.message || `Request failed (HTTP ${response.status}).`);
  }

  return data;
};

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

  console.log('[FieldOps API] POST', url, {
    ...body,
    email: JSON.stringify(email),
    password: `<${password.length} chars, starts "${password[0] ?? ''}", ends "${password[password.length - 1] ?? ''}">`,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  console.log('[FieldOps API] login response', response.status, rawText);

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (err) {
    console.log('[FieldOps API] login response was not valid JSON', err);
    return { success: false, message: `Server returned an unexpected response (HTTP ${response.status}).` };
  }

  // Contract specifies the token may be at any of these three locations.
  const token = data?.access_token || data?.data?.access_token || data?.message?.access_token;

  if (!token) {
    const message = typeof data?.message === 'string' ? data.message : data?.error || 'Login failed. Please check your credentials.';
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
    target: '',
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
    if (e instanceof AuthError) throw e;
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
    if (e instanceof AuthError) throw e;
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
): Promise<{ attendanceId?: string }> => {
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

  const data = await authFetch('/api/method/fieldops.api.mobile_api.check_in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = data?.message ?? data?.data ?? data;
  const attendanceId = result?.attendance_id || result?.name || result?.id;
  return { attendanceId };
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
}

/** Fetch the homepage attendance KPI breakdown via the RPC contract (`get_my_attendance_stats`). */
export const getAttendanceStats = async (): Promise<AttendanceStats | null> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.get_my_attendance_stats');
    const raw = data?.message ?? data?.data ?? data;
    if (!raw || typeof raw !== 'object') return null;
    return {
      presentDays: Number(raw.present_days) || 0,
      absentDays: Number(raw.absent_days) || 0,
      lateDays: Number(raw.late_days) || 0,
      onTimeDays: Number(raw.on_time_days) || 0,
      totalWorkingDays: Number(raw.total_working_days) || 0,
      attendancePercentage: Number(raw.attendance_percentage) || 0,
      streakDays: Number(raw.streak_days) || 0,
      todayStatus: raw.today_status || '',
    };
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return null;
  }
};

// ─── Leads API ─────────────────────────────────────────────────────────────────

const STAGE_SCORE: Record<string, number> = {
  New: 20,
  Contacted: 40,
  Qualified: 60,
  'Proposal Sent': 70,
  Negotiation: 80,
  Converted: 100,
  Lost: 0,
};

const VALID_STAGES: LeadStage[] = [
  'New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Converted', 'Lost',
];

const mapLead = (raw: any): Lead => {
  const stage: LeadStage = VALID_STAGES.includes(raw?.funnel_stage) ? raw.funnel_stage : 'New';
  return {
    id: raw?.name || String(raw?.id || ''),
    name: raw?.lead_name || raw?.name || 'Unknown',
    company: raw?.company_name || '',
    phone: raw?.phone || '',
    email: raw?.email || undefined,
    position: raw?.position || undefined,
    address: raw?.address || undefined,
    stage,
    score: STAGE_SCORE[stage] ?? 20,
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
  };
};

/**
 * Fetch leads for the active campaign via the RPC contract (`get_my_leads`). The old
 * campaign-nested REST route (`/agent/campaigns/{id}/leads`) no longer exists — get_my_leads
 * returns leads across all of the agent's campaigns, so results are narrowed to campaignId
 * client-side whenever the response actually carries a campaign field. Falls back to an
 * empty array on error.
 */
export const getLeads = async (campaignId: string): Promise<Lead[]> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.get_my_leads');
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
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
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
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

/**
 * Submit a new lead via the RPC contract (`submit_lead`). The v3 contract added outlet/
 * address/source/notes fields, so the values collected on the lead form are sent again.
 * `outlet_id` (a real linked Outlet record) and `latitude`/`longitude` are left out — the
 * app has no outlet-picker or GPS capture on this form yet, so there's no real value to send.
 */
export const createLead = async (campaignId: string, payload: CreateLeadPayload): Promise<Lead> => {
  const body: Record<string, any> = {
    lead_name: payload.name,
    contact_person: payload.name,
    phone_number: payload.phone,
    email_address: payload.email,
    campaign: campaignId,
    outlet: payload.company,
    address: payload.address,
    source: payload.source,
    notes: payload.notes,
    value: payload.value,
  };

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
    funnel_stage: 'New',
    source: payload.source,
    address: payload.address,
    notes: payload.notes,
    annual_revenue: payload.value,
    creation: new Date().toISOString(),
  });
};

/**
 * Update the funnel stage of a lead via the RPC contract (`update_lead_stage`). The old
 * campaign-nested REST route (`/agent/campaigns/{id}/leads/{id}/stage`) no longer exists.
 */
export const updateLeadStage = async (leadId: string, stage: LeadStage, remarks?: string): Promise<void> => {
  await authFetch('/api/method/fieldops.api.mobile_api.update_lead_stage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId, stage, remarks }),
  });
};

// ─── Outlets API ───────────────────────────────────────────────────────────────

/**
 * `campaignId` is stamped onto the mapped Outlet purely for local bookkeeping (the Outlet
 * type requires it) — the v3 contract's `submit_outlet`/`get_outlets` bodies have no
 * campaign field at all, so outlets aren't campaign-scoped server-side the way leads are.
 */
const mapOutlet = (raw: any, campaignId: string): Outlet => {
  const status: OutletStatus = raw?.status === 'Visited' || raw?.status === 'visited'
    ? 'visited'
    : raw?.status === 'Skipped' || raw?.status === 'skipped'
      ? 'skipped'
      : 'pending';

  const images = Array.isArray(raw?.images) ? raw.images : Array.isArray(raw?.image_urls) ? raw.image_urls : [];

  return {
    id: raw?.name || String(raw?.id || ''),
    name: raw?.outlet_name || raw?.name || 'Unknown Outlet',
    type: raw?.outlet_type || '',
    category: raw?.sub_channel || raw?.category || undefined,
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
    photoUri: raw?.image || raw?.photo || raw?.photo_url || raw?.image_url || images[0] || undefined,
    campaignId,
    isScheduledToday: !!raw?.is_scheduled_today,
    scheduledDate: raw?.scheduled_date || undefined,
    beatName: raw?.beat_name || undefined,
    sequence: raw?.sequence !== undefined && raw?.sequence !== null ? Number(raw.sequence) : undefined,
  };
};

/** Fetch outlets via the RPC contract (`get_outlets`). Falls back to an empty array on error. */
export const getOutlets = async (campaignId: string): Promise<Outlet[]> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.get_outlets');
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
    return list.map((o: any) => mapOutlet(o, campaignId));
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
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

/** Fetch the master list of outlet channels via `get_outlet_channels`. */
export const getOutletChannels = async (): Promise<string[]> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.master_data.get_outlet_channels');
    return unwrapMasterDataList(data).map((r: any) => r?.name).filter(Boolean);
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
};

/** Fetch the master list of outlet sub-channels via `get_outlet_sub_channels`. */
export const getOutletSubChannels = async (): Promise<string[]> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.master_data.get_outlet_sub_channels');
    return unwrapMasterDataList(data).map((r: any) => r?.name).filter(Boolean);
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
};

export interface CreateOutletPayload {
  name: string;
  type: string;
  /**
   * Sent as `category` — the one free-text field `submit_outlet` actually stores
   * (`outlet_doc.category = outlet_data.get("category") or ...`), unlike `type`
   * which the backend force-matches into just Retail/Wholesale/Distributor/Other
   * (substring match — most real channel names collapse to "Other" server-side,
   * a backend-side limitation, not something fixable from here).
   */
  subChannel?: string;
  address: string;
  phone?: string;
  ownerName?: string;
  ownerPhone?: string;
  photoUri?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Submit a new outlet via the RPC contract (`submit_outlet`). When a photo was captured,
 * the request goes as multipart form-data (per the backend's images[]/photo/image upload
 * support) instead of JSON — fetch sets the multipart boundary header automatically as
 * long as we don't set Content-Type ourselves.
 */
export const createOutlet = async (campaignId: string, payload: CreateOutletPayload): Promise<Outlet> => {
  const fields: Record<string, any> = {
    outlet_name: payload.name,
    outlet_type: payload.type,
    address: payload.address,
    phone_number: payload.phone,
    owner_name: payload.ownerName,
    owner_phone: payload.ownerPhone,
  };
  if (payload.subChannel) fields.category = payload.subChannel;
  if (payload.latitude !== undefined) fields.latitude = payload.latitude;
  if (payload.longitude !== undefined) fields.longitude = payload.longitude;

  let data: any;
  if (payload.photoUri) {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.append(key, String(value));
    });
    const filename = payload.photoUri.split('/').pop() || 'outlet.jpg';
    form.append('image', { uri: payload.photoUri, name: filename, type: 'image/jpeg' } as any);
    data = await authFetch('/api/method/fieldops.api.mobile_api.submit_outlet', {
      method: 'POST',
      body: form,
    });
  } else {
    data = await authFetch('/api/method/fieldops.api.mobile_api.submit_outlet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
  }

  const result = data?.message ?? data?.data ?? data;
  const outletId = result?.outlet_id || result?.name || result?.id;

  // Return a rich Outlet object immediately so the UI can update optimistically
  return mapOutlet({
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
  }, campaignId);
};

export interface UpdateOutletPayload {
  name?: string;
  type?: string;
  subChannel?: string;
  address?: string;
  phone?: string;
  ownerName?: string;
  ownerPhone?: string;
  notes?: string;
  photoUri?: string;
  latitude?: number;
  longitude?: number;
}

/** Update an existing outlet via the RPC contract (`update_outlet`). */
export const updateOutlet = async (outletId: string, payload: UpdateOutletPayload): Promise<void> => {
  const fields: Record<string, any> = {
    // Identity key naming isn't confirmed against a real device log yet — sending both
    // `outlet` and `outlet_id` since those are the two conventions used elsewhere in
    // this contract (record_outlet_visit uses `outlet`, update_lead_stage uses `lead_id`).
    outlet: outletId,
    outlet_id: outletId,
  };
  if (payload.name !== undefined) fields.outlet_name = payload.name;
  if (payload.type !== undefined) fields.outlet_type = payload.type;
  // NOTE: as of the branch this was checked against, update_outlet's Outlet-record
  // branch never actually reads/persists `category` (unlike submit_outlet, which
  // does) — sending it anyway in case that's added server-side later, but editing
  // an existing outlet's sub-channel currently has no effect.
  if (payload.subChannel !== undefined) fields.category = payload.subChannel;
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

  if (payload.photoUri) {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.append(key, String(value));
    });
    const filename = payload.photoUri.split('/').pop() || 'outlet.jpg';
    form.append('image', { uri: payload.photoUri, name: filename, type: 'image/jpeg' } as any);
    await authFetch('/api/method/fieldops.api.mobile_api.update_outlet', {
      method: 'POST',
      body: form,
    });
  } else {
    await authFetch('/api/method/fieldops.api.mobile_api.update_outlet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
  }
};

/** Skip an outlet visit via the RPC contract (`skip_outlet_visit`). */
export const skipOutletVisit = async (outletId: string, campaignId: string, reason: string): Promise<void> => {
  await authFetch('/api/method/fieldops.api.mobile_api.skip_outlet_visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outlet: outletId, outlet_id: outletId, campaign: campaignId, reason, skip_reason: reason }),
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
 * Frappe returns item images as a site-relative path (e.g. "/files/product.png"),
 * not an absolute URL — React Native's <Image> can't resolve that (no host/scheme)
 * and just renders blank, so it needs the current tenant's origin prefixed on.
 * Already-absolute URLs (http/https, or a data: URI) are passed through untouched.
 */
const resolveImageUrl = (raw: string | undefined, baseUrl: string): string | undefined => {
  if (!raw) return undefined;
  if (/^(https?:)?\/\//.test(raw) || raw.startsWith('data:')) return raw;
  return `${baseUrl}${raw.startsWith('/') ? '' : '/'}${raw}`;
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

/** Fetch the product catalog via the RPC contract (`get_items`). Falls back to an empty array on error. */
export const getItems = async (): Promise<Product[]> => {
  try {
    const [data, tenantId] = await Promise.all([
      authFetch('/api/method/fieldops.api.mobile_api.get_items'),
      getTenantId(),
    ]);
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
    return list.map((it: any) => mapItem(it, getBaseUrl(tenantId || "")));
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
};

export interface OrderLinePayload {
  itemCode: string;
  itemName?: string;
  qty: number;
  rate: number;
}

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
 */
export const submitFieldSale = async (
  outletId: string,
  campaignId: string,
  lines: OrderLinePayload[],
  amountPaid: number,
  coordinates?: { lat: number; lng: number }
): Promise<{ ref: string }> => {
  const totalAmount = lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
  const body: Record<string, any> = {
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
      rate: l.rate,
      unit_price: l.rate,
      amount: l.qty * l.rate,
    })),
    total_amount: totalAmount,
    payment_type: 'Cash',
    amount_paid: amountPaid,
  };
  if (coordinates) {
    body.latitude = coordinates.lat;
    body.longitude = coordinates.lng;
  }
  const data = await authFetch('/api/method/fieldops.api.mobile_api.submit_field_sale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = data?.message ?? data?.data ?? data;
  const ref = result?.sale_id || result?.invoice_id || result?.name || result?.id || '';
  return { ref: String(ref) };
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
  lines: OrderLinePayload[]
): Promise<{ ref: string }> => {
  const totalAmount = lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
  const body = {
    outletId,
    outlet_id: outletId,
    campaignId,
    campaign_id: campaignId,
    deliveryDate: new Date().toISOString().slice(0, 10),
    items: lines.map((l) => ({
      productId: l.itemCode,
      product_id: l.itemCode,
      product_name: l.itemName,
      qty: l.qty,
      unitPrice: l.rate,
      unit_price: l.rate,
      amount: l.qty * l.rate,
    })),
    total_amount: totalAmount,
  };
  const data = await authFetch('/api/method/fieldops.api.mobile_api.submit_sales_order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = data?.message ?? data?.data ?? data;
  const ref = result?.order_id || result?.name || result?.id || '';
  return { ref: String(ref) };
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

  return items.map((item: any, idx: number) => {
    const qty = Number(item?.qty) || 0;
    const unitPrice = Number(item?.rate) || 0;
    return {
      id: `${ref}-${item?.item_code || idx}`,
      outletId,
      campaignId: String(raw?.campaign || ''),
      productId: item?.item_code || '',
      productName: item?.item_name || item?.item_code || 'Item',
      quantity: qty,
      unitPrice,
      discount: 0,
      total: Number(item?.amount) || unitPrice * qty,
      customerId: outletId,
      customerName,
      status,
      timestamp: String(timestamp),
      orderRef: ref,
    };
  });
};

const mapSaleDoc = (raw: any): OutletSale[] => {
  const ref = String(raw?.name || raw?.sale_id || raw?.invoice_id || raw?.id || '');
  const outletId = String(raw?.outlet || raw?.customer || '');
  const customerName = raw?.outlet_name || raw?.customer_name || '';
  const timestamp = raw?.posting_date || raw?.transaction_date || raw?.creation || '';
  const items = Array.isArray(raw?.items) ? raw.items : [];

  return items.map((item: any, idx: number) => {
    const qty = Number(item?.qty) || 0;
    const unitPrice = Number(item?.rate) || 0;
    return {
      id: `${ref}-${item?.item_code || idx}`,
      outletId,
      campaignId: String(raw?.campaign || ''),
      productId: item?.item_code || '',
      productName: item?.item_name || item?.item_code || 'Item',
      quantity: qty,
      unitPrice,
      discount: 0,
      total: Number(item?.amount) || unitPrice * qty,
      customerId: outletId,
      customerName,
      timestamp: String(timestamp),
      invoiceRef: ref,
    };
  });
};

/** Fetch this agent's orders via the RPC contract (`get_my_orders`). Falls back to an empty array on error. */
export const getMyOrders = async (): Promise<OutletOrder[]> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.get_my_orders');
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
    return list.flatMap(mapOrderDoc);
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
};

/** Fetch this agent's field sales via the RPC contract (`get_my_sales`). Falls back to an empty array on error. */
export const getMySales = async (): Promise<OutletSale[]> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.get_my_sales');
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
    return list.flatMap(mapSaleDoc);
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
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
  try {
    const [data, tenantId] = await Promise.all([
      authFetch('/api/method/fieldops.api.mobile_api.get_my_inventory'),
      getTenantId(),
    ]);
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
    return flattenInventoryResponse(list, getBaseUrl(tenantId || ""));
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
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
  purpose?: string
): Promise<{ ref: string }> => {
  const body = {
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

/** Fetch this agent's submitted stock requests and their approval status via `get_my_stock_requests`. */
export const getMyStockRequests = async (): Promise<StockRequestSummary[]> => {
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.get_my_stock_requests');
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
    return list.map(mapStockRequest);
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
};

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
}

const mapSurveyListItem = (raw: any): SurveyListItem => ({
  id: raw?.name || raw?.id || '',
  name: raw?.survey_name || raw?.name || 'Survey',
  status: raw?.status || '',
  startDate: raw?.start_date || undefined,
  endDate: raw?.end_date || undefined,
});

/**
 * List surveys assigned to the agent for a campaign via `get_surveys_for_campaign`.
 * Only returns id/name/status/dates (no questions) — call `getSurveyDetail` per survey
 * for the actual form.
 */
export const getSurveysForCampaign = async (campaignId: string): Promise<SurveyListItem[]> => {
  try {
    const data = await authFetch(`/api/method/fieldops.api.mobile_api.get_surveys_for_campaign?campaign=${encodeURIComponent(campaignId)}`);
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
    return list.map(mapSurveyListItem);
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
};

/**
 * The backend sends question_type as a mobile-friendly label (Text/Multiple Choice/
 * Single Choice/Rating/Image) rather than this app's internal QuestionType union.
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
};
const APP_TO_BACKEND_QUESTION_TYPE: Record<QuestionType, string> = {
  text: 'Text',
  multi: 'Multiple Choice',
  choice: 'Single Choice',
  rating: 'Rating',
  photo: 'Image',
  select: 'Text',
  number: 'Text',
  gps: 'Text',
};

/**
 * `get_survey_detail` returns one flat `questions[]` array (no sections). This app's
 * survey form/review UI is built around sectioned surveys (see LeadSurveySection), so
 * the flat list is wrapped as a single synthetic section rather than inventing section
 * boundaries the backend never sends.
 *
 * Note: as of the branch this was checked against, the backend's `required` field on
 * each question is hardcoded to 0 server-side regardless of how the question was
 * configured (not a client mapping choice) — so client-side required-question
 * validation on these forms won't currently trigger for any fetched survey. Passed
 * through as-is rather than guessed at; flagged to the backend team separately.
 */
const mapSurveyDetail = (raw: any): CampaignSurveyConfig => {
  const questions: DynamicSurveyQuestion[] = Array.isArray(raw?.questions)
    ? raw.questions.map((q: any) => ({
        id: q?.name || q?.id || '',
        type: BACKEND_TO_APP_QUESTION_TYPE[q?.question_type] || 'text',
        question: q?.question || q?.question_text || '',
        required: !!q?.required,
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
  };
};

/** Fetch a survey's full question set via `get_survey_detail`. */
export const getSurveyDetail = async (surveyId: string): Promise<CampaignSurveyConfig | null> => {
  try {
    const data = await authFetch(`/api/method/fieldops.api.mobile_api.get_survey_detail?survey_id=${encodeURIComponent(surveyId)}`);
    const raw = data?.message ?? data?.data ?? data;
    if (!raw || typeof raw !== 'object') return null;
    return mapSurveyDetail(raw);
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return null;
  }
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
 * Submit answers via the RPC contract (`submit_survey_response`).
 *
 * IMPORTANT (flagged, not silently worked around): the backend dedupes an existing
 * response by `{survey, agent, status in [Draft, Submitted]}` only — there is no
 * outlet dimension. So submitting the same survey for a second outlet on the same day
 * updates/overwrites the agent's one existing response for that survey rather than
 * creating a second record. This app still tracks completion per-outlet locally
 * (OutletSurvey.outletId) for UI purposes, but that per-outlet distinction is NOT
 * preserved server-side under this contract — needs backend confirmation if outlet-
 * scoped survey responses are actually required.
 *
 * Also: 'photo' (Image) question answers are sent as the local file URI string since
 * this endpoint has no documented multipart/file-upload path — the photo itself is not
 * confirmed to reach the server through this call.
 */
export const submitSurveyResponse = async (
  surveyId: string,
  responses: SurveyResponsePayload[],
  coordinates?: { lat: number; lng: number },
  respondent?: SurveyRespondent
): Promise<{ responseId: string }> => {
  const body: Record<string, any> = {
    survey: surveyId,
    responses: responses.map((r) => ({
      question: r.questionId,
      question_type: APP_TO_BACKEND_QUESTION_TYPE[r.questionType] || 'Text',
      answer: Array.isArray(r.answer) ? r.answer.join(', ') : r.answer,
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

  const data = await authFetch('/api/method/fieldops.api.mobile_api.submit_survey_response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = data?.message ?? data?.data ?? data;
  return { responseId: String(result?.response_id || '') };
};

export interface MySurveyResponseSummary {
  id: string;
  surveyId: string;
  status: string;
  submissionDate?: string;
}

const mapMySurveyResponse = (raw: any): MySurveyResponseSummary => ({
  id: raw?.name || raw?.id || '',
  surveyId: raw?.survey || '',
  status: raw?.status || '',
  submissionDate: raw?.submission_date || undefined,
});

/** Fetch this agent's own submitted survey responses via `get_my_surveys`, optionally scoped to a campaign. */
export const getMySurveys = async (campaignId?: string): Promise<MySurveyResponseSummary[]> => {
  try {
    const qs = campaignId ? `?campaign=${encodeURIComponent(campaignId)}` : '';
    const data = await authFetch(`/api/method/fieldops.api.mobile_api.get_my_surveys${qs}`);
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
    return list.map(mapMySurveyResponse);
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
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
  try {
    const data = await authFetch('/api/method/fieldops.api.mobile_api.get_agent_beats');
    const raw = data?.message ?? data?.data ?? data;
    const list = Array.isArray(raw) ? raw : [];
    return list.map(mapBeat).filter((a: RouteAssignment) => a.date);
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    return [];
  }
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
    if (e instanceof AuthError) throw e;
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
    if (e instanceof AuthError) throw e;
    return 0;
  }
};
