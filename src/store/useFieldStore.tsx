import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AppState } from 'react-native';
import {
  Outlet, OutletSale, OutletOrder, OutletSurvey, SkipRecord, Product, Campaign,
  StockMovement, StockMovementType, Draft, LeadDraft, OutletDraft, OutletPhotoCapture, LeadSurveyResponse,
  UserProfile, PendingSurveyPhoto, OutletFormOptions, LeadStageInfo, GeofenceConfig, CampaignSurveyConfig,
  Lead, RouteAssignment, QueuedAction, DayPackStatus, SyncStatus,
} from '../types';
import { mockCampaigns, mockUser } from '../services/mockService';
import { setLeadStageList } from '../utils/leadStages';
import { keepUnsyncedEdit } from '../utils/afterEditSurvey';
import { getUserInfo } from '../services/apiConfig';
import { mapUserInfoToProfile, fetchUserProfile, getMyGeofence, AttendanceStats, StockRequestSummary } from '../services/api';
import { createPersistence, lastDays } from './persistence';
import { remapOutletInState, remapLeadInState, newestFirst } from '../utils/queue';
import { debugLog } from '../utils/logger';

// ─── State Shape ──────────────────────────────────────────────────────────────
export interface FieldState {
  outlets: Outlet[];
  sales: OutletSale[];
  orders: OutletOrder[];
  surveys: OutletSurvey[];
  skipRecords: SkipRecord[];
  products: Product[];
  activeCampaign: Campaign;
  movements: StockMovement[];
  drafts: Draft[];
  photoCaptures: OutletPhotoCapture[];
  leadDrafts: LeadDraft[];
  outletDrafts: OutletDraft[];
  /** Survey photos still to upload for responses that already reached the server. */
  pendingSurveyPhotos: PendingSurveyPhoto[];
  leadSurveyResponses: LeadSurveyResponse[];
  user: UserProfile;
  /** `clockInDate` (YYYY-MM-DD, set whenever clockedIn is set true) is what makes a
   *  resumed "already clocked in" session honest across a day boundary — without it,
   *  an agent who clocked in yesterday and never explicitly clocked out (forgot, or
   *  just killed the app) would still read as clockedIn today and skip straight past
   *  attendance entirely on the next launch, since nothing else here is tied to a
   *  calendar day. Checked against today's date at both App.tsx resume points before
   *  a stored clockedIn:true is trusted. */
  attendanceStatus: { clockedIn: boolean; attendanceId?: string; clockInDate?: string };
  /** True once a real campaign (not the default mock) has been confirmed via a completed clock-in — lets a resumed session skip straight to Attendance for the remembered campaign instead of asking the agent to pick one again every day. */
  campaignSelected: boolean;
  /** Flips true once the AsyncStorage hydration pass (or the first-run check that finds nothing to hydrate) has completed — lets callers wait for a real answer before deciding things like "is the user already clocked in". */
  hydrated: boolean;
  /** ISO timestamp (next local midnight) set on a real End-of-Day submit — while
   *  `Date.now()` is before this, App.tsx / blockIfDayLocked() refuse new activity
   *  (add outlet/lead, stock requests, sales, etc.) until it lifts. Null when not locked. */
  dayLockedUntil: string | null;
  /** Email of the agent `attendanceStatus`/`campaignSelected`/`activeCampaign` currently
   *  belong to. This is a shared/testing device where different agents log in and out —
   *  without this, App.tsx's login flow would resume "already clocked in" using whichever
   *  agent last clocked in on this device, regardless of who just logged in. Compared
   *  against the freshly logged-in user's email before resuming; null after a mismatch
   *  reset (RESET_AGENT_SESSION) until the next real clock-in claims it again. */
  sessionAgentEmail: string | null;
  /** Last real fetch of get_my_attendance_stats — shown instantly on the next
   *  Dashboard mount (that call is slow, ~2s+) while a fresh fetch quietly
   *  refines it, same idea as useCurrentLocation's last-known-fix. Wiped on
   *  RESET_AGENT_SESSION so a different agent never sees a stale cached
   *  attendance card that isn't theirs. */
  cachedAttendanceStats: AttendanceStats | null;
  /** The Add/Edit Outlet pickers' lists as last loaded, so those forms work offline. */
  outletFormOptions: OutletFormOptions;
  /** The backend's lead stages (get_lead_stages) as last loaded; null until then, which means the built-in list. */
  leadStages: LeadStageInfo[] | null;
  /** The agent's geofence (get_my_geofence) as last loaded, so a sale's location is checked offline too; null means no territory check. */
  geofence: GeofenceConfig | null;
  /** Each campaign's surveys with their questions, as last loaded, so a survey opens offline (campaign id -> surveys). */
  campaignSurveys: Record<string, CampaignSurveyConfig[]>;
  /** The agent's leads (get_my_leads) as last loaded, plus ones added on this phone that haven't synced. */
  leads: Lead[];
  /** The agent's day-by-day routes (get_agent_beats) as last loaded. */
  routeAssignments: RouteAssignment[];
  /** The agent's campaigns (/agent/campaigns) as last loaded. */
  campaigns: Campaign[];
  /** The agent's stock requests (get_my_stock_requests) as last loaded. */
  stockRequests: StockRequestSummary[];
  /** Skips, lead stage changes and stock requests made with no connection, still to send. */
  queuedActions: QueuedAction[];
  /** How the morning download last went. */
  dayPack: DayPackStatus;
  /** Where sending the queue stands. */
  syncStatus: SyncStatus;
}

// ─── Actions ──────────────────────────────────────────────────────────────────
type Action =
  | { type: 'SET_ACTIVE_CAMPAIGN'; campaign: Campaign }
  | { type: 'SET_USER'; user: UserProfile }
  | { type: 'SET_ATTENDANCE_STATUS'; clockedIn: boolean; attendanceId?: string; clockInDate?: string }
  | { type: 'SET_CAMPAIGN_SELECTED'; value: boolean }
  | { type: 'SET_OUTLETS'; outlets: Outlet[] }
  | { type: 'RESET_OUTLET_VISIT_STATUS' }
  | { type: 'ADD_OUTLET'; outlet: Outlet }
  | { type: 'UPDATE_OUTLET'; outlet: Outlet }
  | { type: 'MARK_OUTLET_VISITED'; outletId: string }
  | { type: 'SKIP_OUTLET'; outletId: string; skipRecord: SkipRecord }
  | { type: 'SET_PRODUCTS'; products: Product[] }
  | { type: 'SET_ORDERS'; orders: OutletOrder[] }
  | { type: 'SET_SALES'; sales: OutletSale[] }
  | { type: 'ADD_SALE'; sale: OutletSale }
  | { type: 'ADD_ORDER'; order: OutletOrder }
  | { type: 'ADD_SURVEY'; survey: OutletSurvey }
  | { type: 'MARK_SURVEY_SYNCED'; surveyId: string }
  | { type: 'SET_SURVEY_SYNC_ERROR'; surveyId: string; error: string }
  | { type: 'DELETE_SURVEY'; surveyId: string }
  | { type: 'DECREMENT_STOCK'; productId: string; qty: number; outletId?: string }
  | { type: 'ADJUST_STOCK'; productId: string; qtyChange: number; reason: string; movementType: Extract<StockMovementType, 'adjustment' | 'reconciliation'> }
  | { type: 'SAVE_DRAFT'; draft: Draft }
  | { type: 'DELETE_DRAFT'; draftId: string }
  | { type: 'ADD_PHOTO_CAPTURE'; capture: OutletPhotoCapture }
  | { type: 'SAVE_LEAD_DRAFT'; leadDraft: LeadDraft }
  | { type: 'DELETE_LEAD_DRAFT'; draftId: string }
  | { type: 'SAVE_OUTLET_DRAFT'; outletDraft: OutletDraft }
  | { type: 'DELETE_OUTLET_DRAFT'; draftId: string }
  | { type: 'QUEUE_SURVEY_PHOTOS'; photos: PendingSurveyPhoto[] }
  | { type: 'DELETE_SURVEY_PHOTO'; photoId: string }
  | { type: 'ADD_LEAD_SURVEY_RESPONSE'; response: LeadSurveyResponse }
  | { type: 'SET_DAY_LOCK'; until: string | null }
  | { type: 'SET_SESSION_AGENT_EMAIL'; email: string | null }
  | { type: 'SET_CACHED_ATTENDANCE_STATS'; stats: AttendanceStats | null }
  | { type: 'SET_OUTLET_FORM_OPTIONS'; options: Partial<OutletFormOptions> }
  | { type: 'SET_LEAD_STAGES'; stages: LeadStageInfo[] }
  | { type: 'SET_GEOFENCE'; geofence: GeofenceConfig }
  | { type: 'SET_CAMPAIGN_SURVEYS'; campaignId: string; surveys: CampaignSurveyConfig[] }
  | { type: 'SET_LEADS'; leads: Lead[] }
  | { type: 'ADD_LEAD'; lead: Lead }
  | { type: 'UPDATE_LEAD'; lead: Lead }
  | { type: 'SET_ROUTE_ASSIGNMENTS'; assignments: RouteAssignment[] }
  | { type: 'SET_CAMPAIGNS'; campaigns: Campaign[] }
  | { type: 'SET_STOCK_REQUESTS'; requests: StockRequestSummary[] }
  | { type: 'QUEUE_ACTION'; action: QueuedAction }
  | { type: 'DELETE_QUEUED_ACTION'; actionId: string }
  | { type: 'SET_DAY_PACK'; status: Partial<DayPackStatus> }
  | { type: 'SET_SYNC_STATUS'; status: Partial<SyncStatus> }
  | { type: 'ADD_SYNC_NOTICES'; notices: string[] }
  | { type: 'CLEAR_SYNC_NOTICES' }
  /** An outlet made offline reached the server: its id there replaces the temporary one everywhere. */
  | { type: 'REMAP_OUTLET_ID'; from: string; to: string }
  /** A lead made offline reached the server: its id there replaces the temporary one everywhere. */
  | { type: 'REMAP_LEAD_ID'; from: string; to: string; lead?: Lead }
  | { type: 'RESET_AGENT_SESSION' }
  | { type: 'HYDRATE'; state: Partial<FieldState> };

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state: FieldState, action: Action): FieldState {
  switch (action.type) {
    case 'HYDRATE':
      return {
        ...state,
        ...action.state,
        // A sync can't still be running after a restart.
        syncStatus: { ...state.syncStatus, ...action.state.syncStatus, running: false },
        dayPack: { ...state.dayPack, ...action.state.dayPack },
        hydrated: true,
      };

    case 'SET_LEADS': {
      // A lead added on this phone stays until its draft reaches the server.
      const unsynced = new Set(state.leadDrafts.map((d) => d.id));
      const local = state.leads.filter((l) => unsynced.has(l.id) && !action.leads.some((s) => s.id === l.id));
      return { ...state, leads: [...local, ...action.leads] };
    }

    case 'ADD_LEAD':
      return { ...state, leads: [action.lead, ...state.leads.filter((l) => l.id !== action.lead.id)] };

    case 'UPDATE_LEAD':
      return { ...state, leads: state.leads.map((l) => (l.id === action.lead.id ? action.lead : l)) };

    case 'SET_ROUTE_ASSIGNMENTS':
      return { ...state, routeAssignments: action.assignments };

    case 'SET_CAMPAIGNS':
      return { ...state, campaigns: action.campaigns };

    case 'SET_STOCK_REQUESTS':
      return { ...state, stockRequests: action.requests };

    case 'QUEUE_ACTION': {
      const exists = state.queuedActions.some((a) => a.id === action.action.id);
      return {
        ...state,
        queuedActions: exists
          ? state.queuedActions.map((a) => (a.id === action.action.id ? action.action : a))
          : [action.action, ...state.queuedActions],
      };
    }

    case 'DELETE_QUEUED_ACTION':
      return { ...state, queuedActions: state.queuedActions.filter((a) => a.id !== action.actionId) };

    case 'SET_DAY_PACK':
      return {
        ...state,
        dayPack: { ...state.dayPack, ...action.status, parts: { ...state.dayPack.parts, ...action.status.parts } },
      };

    case 'SET_SYNC_STATUS':
      return { ...state, syncStatus: { ...state.syncStatus, ...action.status } };

    case 'ADD_SYNC_NOTICES':
      return action.notices.length > 0
        ? { ...state, syncStatus: { ...state.syncStatus, notices: [...state.syncStatus.notices, ...action.notices].slice(-10) } }
        : state;

    case 'CLEAR_SYNC_NOTICES':
      return { ...state, syncStatus: { ...state.syncStatus, notices: [] } };

    case 'REMAP_OUTLET_ID':
      return remapOutletInState(state, action.from, action.to);

    case 'REMAP_LEAD_ID':
      return remapLeadInState(state, action.from, action.to, action.lead);

    case 'SET_USER':
      return { ...state, user: action.user };

    case 'SET_ACTIVE_CAMPAIGN':
      return { ...state, activeCampaign: action.campaign, campaignSelected: true };

    case 'SET_ATTENDANCE_STATUS':
      return { ...state, attendanceStatus: { clockedIn: action.clockedIn, attendanceId: action.attendanceId, clockInDate: action.clockInDate } };

    case 'SET_CAMPAIGN_SELECTED':
      return { ...state, campaignSelected: action.value };

    case 'SET_DAY_LOCK':
      return { ...state, dayLockedUntil: action.until };

    case 'SET_SESSION_AGENT_EMAIL':
      return { ...state, sessionAgentEmail: action.email };

    case 'SET_CACHED_ATTENDANCE_STATS':
      return { ...state, cachedAttendanceStats: action.stats };

    case 'SET_OUTLET_FORM_OPTIONS':
      return { ...state, outletFormOptions: { ...state.outletFormOptions, ...action.options } };

    case 'SET_LEAD_STAGES':
      return { ...state, leadStages: action.stages.length > 0 ? action.stages : null };

    case 'SET_GEOFENCE':
      return { ...state, geofence: action.geofence };

    case 'SET_CAMPAIGN_SURVEYS':
      return { ...state, campaignSurveys: { ...state.campaignSurveys, [action.campaignId]: action.surveys } };

    // A different agent just logged in than whoever this device's clocked-in/
    // campaign state belongs to (App.tsx compares emails before resuming) —
    // wipe both the identity fields and every fetched-data array. This used to
    // leave outlets/products/sales/etc. alone on the theory that each screen's
    // own fetch-on-mount would "self-correct" it — but almost every one of
    // those fetches only overwrites local state `if (fetched.length > 0)`, a
    // guard meant to protect against a flaky empty response wiping good data.
    // That guard has a real blind spot at exactly this boundary: if the new
    // agent's own real data happens to be empty (a brand-new agent with no
    // stock allocated yet, no outlets assigned yet, ...), the guard means the
    // PREVIOUS agent's still-cached data just sits there looking valid. Wiping
    // everything here closes that gap — an empty result for the new agent then
    // correctly renders as empty instead of silently showing someone else's data.
    case 'RESET_AGENT_SESSION':
      return {
        ...state,
        attendanceStatus: { clockedIn: false },
        campaignSelected: false,
        sessionAgentEmail: null,
        cachedAttendanceStats: null,
        // A previous agent's EOD safe-mode lock must never carry over to whoever
        // logs into this device next — otherwise a brand new agent who never
        // submitted EOD gets blocked from every action by someone else's lock.
        dayLockedUntil: null,
        outlets: [],
        sales: [],
        orders: [],
        // Only the previous agent's real, already-synced survey history is
        // cleared here — a draft (isDraft: true, not yet pushed to the server)
        // is real unsynced field work and must never be silently deleted just
        // because a different agent is now logged in on this device. It stays
        // queued and still shows up on the Sync/Drafts pages regardless of who's
        // currently signed in, until it actually reaches the server.
        surveys: state.surveys.filter((s) => s.isDraft),
        skipRecords: [],
        products: [],
        movements: [],
        // drafts/leadDrafts/outletDrafts are deliberately NOT cleared here for
        // the same reason — see the surveys comment above. This was previously
        // wiping an agent's unsynced sale/order/lead/outlet drafts the instant a
        // different agent logged in on a shared device, which is real data loss,
        // not a privacy/isolation concern worth that cost.
        photoCaptures: [],
        leadSurveyResponses: [],
        // Distributors depend on the agent's warehouse; the outlet types and
        // channels are the same for everyone.
        outletFormOptions: { ...state.outletFormOptions, distributors: undefined, defaultDistributorId: undefined },
        // Territories are the agent's own.
        geofence: null,
        // The previous agent's lists and download. Their queued actions stay,
        // like their drafts: only they can send them.
        leads: [],
        routeAssignments: [],
        campaigns: [],
        stockRequests: [],
        dayPack: { parts: {} },
        syncStatus: { running: false, notices: [] },
      };

    case 'SET_OUTLETS': {
      // The backend's outlet `status` field means Active/Inactive record state, not
      // "visited today" — mapOutlet (api.ts) always maps it to 'pending' since the
      // server never actually sends "Visited"/"Skipped". Refetches happen on almost
      // every screen mount (Dashboard, Customers, Sync), so a blind replace here was
      // silently wiping the agent's own today's-visit/skip progress back to pending
      // every time they navigated away and back — this is what made "Next Stop" and
      // the Customers list look like they were showing the wrong outlets. Preserving
      // any locally-tracked non-pending status across a refetch fixes that; it gets
      // cleared for real on the next clock-in via RESET_OUTLET_VISIT_STATUS.
      const localStatusById = new Map(state.outlets.map((o) => [o.id, o.status]));
      // An edit saved offline hasn't reached the server yet, so the server
      // knows nothing of the survey it made due or the location it sent for
      // approval: the device's record stands until the edit syncs.
      const localById = new Map(state.outlets.map((o) => [o.id, o]));
      const unsyncedEdits = new Set(state.outletDrafts.filter((d) => d.mode === 'edit' && d.outletId).map((d) => d.outletId));
      const merged = action.outlets.map((o) => {
        const localStatus = localStatusById.get(o.id);
        const next = localStatus && localStatus !== 'pending' ? { ...o, status: localStatus } : o;
        const local = localById.get(o.id);
        return local && unsyncedEdits.has(o.id) ? keepUnsyncedEdit(next, local) : next;
      });
      // An outlet onboarded offline isn't on the server yet: it stays on the
      // list until its draft syncs, so the agent can keep working there.
      const unsyncedNew = new Set(state.outletDrafts.filter((d) => d.mode === 'create').map((d) => d.id));
      const offlineOutlets = state.outlets.filter((o) => unsyncedNew.has(o.id) && !action.outlets.some((s) => s.id === o.id));
      return { ...state, outlets: [...offlineOutlets, ...merged] };
    }

    case 'RESET_OUTLET_VISIT_STATUS':
      return { ...state, outlets: state.outlets.map((o) => ({ ...o, status: 'pending' as const })) };

    case 'ADD_OUTLET':
      return { ...state, outlets: [action.outlet, ...state.outlets] };

    case 'UPDATE_OUTLET':
      return {
        ...state,
        outlets: state.outlets.map((o: Outlet) => (o.id === action.outlet.id ? action.outlet : o)),
      };

    case 'MARK_OUTLET_VISITED':
      return {
        ...state,
        outlets: state.outlets.map((o: Outlet) =>
          o.id === action.outletId ? { ...o, status: 'visited' } : o
        ),
      };

    case 'SKIP_OUTLET':
      return {
        ...state,
        outlets: state.outlets.map((o: Outlet) =>
          o.id === action.outletId ? { ...o, status: 'skipped' } : o
        ),
        skipRecords: [action.skipRecord, ...state.skipRecords],
      };

    case 'SET_PRODUCTS':
      return { ...state, products: action.products };

    case 'SET_ORDERS':
      return { ...state, orders: action.orders };

    case 'SET_SALES':
      return { ...state, sales: action.sales };

    case 'ADD_SALE':
      return {
        ...state,
        sales: [action.sale, ...state.sales],
      };

    case 'ADD_ORDER':
      return {
        ...state,
        orders: [action.order, ...state.orders],
      };

    case 'ADD_SURVEY':
      return {
        ...state,
        surveys: [action.survey, ...state.surveys],
      };

    // Flips a locally-queued draft survey to synced once it's actually been
    // pushed to the server (see offlineSync.ts) — the record itself already
    // has real answers, only its isDraft flag needs to change.
    case 'MARK_SURVEY_SYNCED':
      return {
        ...state,
        surveys: state.surveys.map((s) => (s.id === action.surveyId ? { ...s, isDraft: false, syncError: undefined } : s)),
      };

    // A draft the last sync didn't send stays, with the reason.
    case 'SET_SURVEY_SYNC_ERROR':
      return {
        ...state,
        surveys: state.surveys.map((s) => (s.id === action.surveyId ? { ...s, syncError: action.error } : s)),
      };

    // Only for a draft the agent deletes from the Drafts page; its photos are deleted by the caller.
    case 'DELETE_SURVEY':
      return { ...state, surveys: state.surveys.filter((s) => s.id !== action.surveyId) };

    case 'DECREMENT_STOCK': {
      const product = state.products.find((p: Product) => p.id === action.productId);
      // Safety net only — callers must pre-check stock via getStockShortfalls
      // before dispatching. Never floor to 0; a would-go-negative decrement
      // is silently rejected here rather than partially applied.
      if (!product || product.stock < action.qty) {
        return state;
      }
      const outlet = action.outletId ? state.outlets.find((o) => o.id === action.outletId) : undefined;
      const movement: StockMovement = {
        id: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: product.id,
        productName: product.name,
        type: 'sale',
        qtyChange: -action.qty,
        outletId: outlet?.id,
        outletName: outlet?.name,
        timestamp: new Date().toLocaleString('en-US', {
          month: 'numeric', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        }),
      };
      return {
        ...state,
        products: state.products.map((p: Product) =>
          p.id === action.productId ? { ...p, stock: p.stock - action.qty } : p
        ),
        movements: [movement, ...state.movements],
      };
    }

    case 'ADJUST_STOCK': {
      const product = state.products.find((p: Product) => p.id === action.productId);
      if (!product) return state;
      const nextStock = product.stock + action.qtyChange;
      if (nextStock < 0) return state;
      const movement: StockMovement = {
        id: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: product.id,
        productName: product.name,
        type: action.movementType,
        qtyChange: action.qtyChange,
        reason: action.reason,
        timestamp: new Date().toLocaleString('en-US', {
          month: 'numeric', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        }),
      };
      return {
        ...state,
        products: state.products.map((p: Product) =>
          p.id === action.productId ? { ...p, stock: nextStock } : p
        ),
        movements: [movement, ...state.movements],
      };
    }

    case 'SAVE_DRAFT': {
      const exists = state.drafts.some((d) => d.id === action.draft.id);
      return {
        ...state,
        drafts: exists
          ? state.drafts.map((d) => (d.id === action.draft.id ? action.draft : d))
          : [action.draft, ...state.drafts],
      };
    }

    case 'DELETE_DRAFT':
      return {
        ...state,
        drafts: state.drafts.filter((d) => d.id !== action.draftId),
      };

    case 'ADD_PHOTO_CAPTURE':
      return {
        ...state,
        photoCaptures: [action.capture, ...state.photoCaptures],
      };

    case 'SAVE_LEAD_DRAFT': {
      const exists = state.leadDrafts.some((d) => d.id === action.leadDraft.id);
      return {
        ...state,
        leadDrafts: exists
          ? state.leadDrafts.map((d) => (d.id === action.leadDraft.id ? action.leadDraft : d))
          : [action.leadDraft, ...state.leadDrafts],
      };
    }

    case 'DELETE_LEAD_DRAFT':
      return {
        ...state,
        leadDrafts: state.leadDrafts.filter((d) => d.id !== action.draftId),
      };

    case 'SAVE_OUTLET_DRAFT': {
      const exists = state.outletDrafts.some((d) => d.id === action.outletDraft.id);
      return {
        ...state,
        outletDrafts: exists
          ? state.outletDrafts.map((d) => (d.id === action.outletDraft.id ? action.outletDraft : d))
          : [action.outletDraft, ...state.outletDrafts],
      };
    }

    case 'DELETE_OUTLET_DRAFT':
      return {
        ...state,
        outletDrafts: state.outletDrafts.filter((d) => d.id !== action.draftId),
      };

    case 'QUEUE_SURVEY_PHOTOS':
      return {
        ...state,
        pendingSurveyPhotos: [...action.photos, ...state.pendingSurveyPhotos],
      };

    case 'DELETE_SURVEY_PHOTO':
      return {
        ...state,
        pendingSurveyPhotos: state.pendingSurveyPhotos.filter((p) => p.id !== action.photoId),
      };

    case 'ADD_LEAD_SURVEY_RESPONSE':
      return {
        ...state,
        leadSurveyResponses: [action.response, ...state.leadSurveyResponses],
      };

    default:
      return state;
  }
}

// ─── Initial State ────────────────────────────────────────────────────────────
const initialState: FieldState = {
  // Was seeded with mockOutlets/mockProducts — meaning a screen rendered before
  // the real fetch resolved (or one that legitimately came back empty) showed
  // fake placeholder outlets/products with no visual distinction from real
  // data. Starting empty is honest: a genuinely empty list now looks empty,
  // and real data only ever appears once a real fetch actually returns it.
  outlets: [],
  sales: [],
  orders: [],
  surveys: [],
  skipRecords: [],
  products: [],
  // Renmoney Personal Loan Promo (mockCampaigns[0]) is the campaign every
  // "new ui" reference screenshot is built around — it must be the default,
  // not the merchandising campaign, or every screen that reads
  // state.activeCampaign (Dashboard widgets, Home's Next Stop card, etc.)
  // renders the wrong content out of the box.
  activeCampaign: mockCampaigns[0],
  movements: [],
  drafts: [],
  leadDrafts: [],
  outletDrafts: [],
  pendingSurveyPhotos: [],
  photoCaptures: [],
  leadSurveyResponses: [],
  user: mockUser,
  attendanceStatus: { clockedIn: false },
  campaignSelected: false,
  hydrated: false,
  dayLockedUntil: null,
  sessionAgentEmail: null,
  cachedAttendanceStats: null,
  outletFormOptions: {},
  leadStages: null,
  geofence: null,
  campaignSurveys: {},
  leads: [],
  routeAssignments: [],
  campaigns: [],
  stockRequests: [],
  queuedActions: [],
  dayPack: { parts: {} },
  syncStatus: { running: false, notices: [] },
};

// ─── Saved on the phone ───────────────────────────────────────────────────────
/** Sales, orders and surveys older than this aren't kept on the phone. */
const HISTORY_DAYS = 30;

const persistence = createPersistence({
  defaults: initialState,
  parts: {
    session: {
      fields: [
        'user', 'attendanceStatus', 'campaignSelected', 'activeCampaign', 'dayLockedUntil',
        'sessionAgentEmail', 'cachedAttendanceStats', 'dayPack', 'syncStatus',
      ],
    },
    outlets: { fields: ['outlets'], debounceMs: 1000 },
    products: { fields: ['products', 'movements'], debounceMs: 1000 },
    sales: { fields: ['sales'], debounceMs: 1000, prepare: (s) => ({ sales: lastDays(s.sales, HISTORY_DAYS) }) },
    orders: { fields: ['orders'], debounceMs: 1000, prepare: (s) => ({ orders: lastDays(s.orders, HISTORY_DAYS) }) },
    surveys: {
      fields: ['surveys', 'leadSurveyResponses'],
      debounceMs: 1000,
      // The unsent ones are saved with the rest of the unsent work.
      prepare: (s) => ({
        surveys: lastDays((s.surveys || []).filter((x: OutletSurvey) => !x.isDraft), HISTORY_DAYS),
        leadSurveyResponses: s.leadSurveyResponses,
      }),
    },
    leads: { fields: ['leads'], debounceMs: 1000 },
    route: { fields: ['routeAssignments'], debounceMs: 1000 },
    campaigns: { fields: ['campaigns'], debounceMs: 1000 },
    stockRequests: { fields: ['stockRequests'], debounceMs: 1000 },
    forms: { fields: ['outletFormOptions', 'leadStages', 'geofence', 'campaignSurveys'], debounceMs: 1000 },
    visits: { fields: ['skipRecords', 'photoCaptures'], debounceMs: 1000 },
  },
  // Everything not yet sent, one value per item.
  queue: [
    { kind: 'draft', field: 'drafts', items: (s) => s.drafts || [] },
    { kind: 'lead', field: 'leadDrafts', items: (s) => s.leadDrafts || [] },
    { kind: 'outlet', field: 'outletDrafts', items: (s) => s.outletDrafts || [] },
    { kind: 'survey', field: 'surveys', items: (s) => (s.surveys || []).filter((x: OutletSurvey) => x.isDraft) },
    { kind: 'photo', field: 'pendingSurveyPhotos', items: (s) => s.pendingSurveyPhotos || [] },
    { kind: 'action', field: 'queuedActions', items: (s) => s.queuedActions || [] },
  ],
});

// ─── Context ──────────────────────────────────────────────────────────────────
interface FieldContextValue {
  state: FieldState;
  dispatch: React.Dispatch<Action>;
  getSalesForOutlet: (outletId: string) => OutletSale[];
  getOrdersForOutlet: (outletId: string) => OutletOrder[];
  getSurveysForOutlet: (outletId: string) => OutletSurvey[];
  getSkipForOutlet: (outletId: string) => SkipRecord | undefined;
  getOutlet: (outletId: string) => Outlet | undefined;
  getMovementsForProduct: (productId: string) => StockMovement[];
  getDraftsList: () => Draft[];
  getPhotoCapturesForOutlet: (outletId: string) => OutletPhotoCapture[];
  getLeadDraftsList: () => LeadDraft[];
  getOutletDraftsList: () => OutletDraft[];
  getLeadSurveyResponse: (leadId: string, surveyConfigId: string) => LeadSurveyResponse | undefined;
}

const FieldContext = createContext<FieldContextValue | null>(null);

// Bump this whenever the seed/mock data in mockService.ts changes shape or
// content in a way that should override a device's previously saved lists —
// otherwise HYDRATE below silently shadows the new seed data with whatever was
// saved during an earlier session/build. Unsent work is always kept.
const SEED_VERSION = 2;
const SEED_VERSION_KEY = '@fieldops:seedVersion';

// ─── Provider ─────────────────────────────────────────────────────────────────
export const FieldProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Restore what's saved on the phone (see persistence.ts): the lists only if
  // they were saved by this same seed version, the unsent work always.
  useEffect(() => {
    // Load logged-in user profile from storage
    getUserInfo().then((info) => {
      if (info) {
        dispatch({ type: 'SET_USER', user: mapUserInfoToProfile(info) });
      }
    }).catch(() => {});

    // Refresh profile in background from server if logged in
    fetchUserProfile().then((profile) => {
      if (profile && profile.name && profile.name !== 'Field Agent') {
        dispatch({ type: 'SET_USER', user: profile });
      }
    }).catch(() => {});

    // Always dispatch HYDRATE exactly once, even when there is nothing to
    // restore — callers (e.g. App.tsx resuming a session on launch) wait on
    // `state.hydrated` and would otherwise hang forever on a first run.
    (async () => {
      let toRestore: Partial<FieldState> = {};
      try {
        const { restored, queued, unreadable } = await persistence.load(SEED_VERSION_KEY, SEED_VERSION);
        if (unreadable.length > 0) debugLog('[store] left as they are, unreadable:', unreadable);
        const syncedSurveys: OutletSurvey[] = (restored.surveys || []).filter((s: OutletSurvey) => !s.isDraft);
        const draftSurveys: OutletSurvey[] = newestFirst(queued.survey);
        toRestore = {
          ...restored,
          drafts: newestFirst(queued.draft),
          leadDrafts: newestFirst(queued.lead),
          outletDrafts: newestFirst(queued.outlet),
          pendingSurveyPhotos: newestFirst(queued.photo),
          queuedActions: newestFirst(queued.action),
          surveys: [...draftSurveys, ...syncedSurveys.filter((s) => !draftSurveys.some((d) => d.id === s.id))],
        };
      } catch (e) {
        debugLog('[store] could not restore saved data', e);
      }
      dispatch({ type: 'HYDRATE', state: toRestore });
    })();
  }, []);

  // Anything still waiting to be written goes before the app is backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') persistence.flush();
    });
    return () => sub.remove();
  }, []);

  // The agent's geofence, refreshed once the saved state is back (so the
  // restore can't overwrite it); the sale screen and the Sync page refresh it
  // too. Kept from last time when this fails, offline included.
  useEffect(() => {
    if (!state.hydrated) return;
    getMyGeofence().then((geofence) => dispatch({ type: 'SET_GEOFENCE', geofence })).catch(() => {});
  }, [state.hydrated]);

  // Lead stages are read by plain functions too (mapLead, the pipeline
  // metrics), so the list they use follows the store's.
  useEffect(() => {
    setLeadStageList(state.leadStages);
  }, [state.leadStages]);

  // Saves what changed — gated on `hydrated` so the very first render (still
  // holding the default initialState) never writes defaults over the real
  // saved data before the restore above has read it.
  useEffect(() => {
    if (!state.hydrated) return;
    persistence.save(state);
  }, [state]);

  const getSalesForOutlet = (outletId: string) =>
    state.sales.filter((s: OutletSale) => s.outletId === outletId);

  const getOrdersForOutlet = (outletId: string) =>
    state.orders.filter((o: OutletOrder) => o.outletId === outletId);

  const getSurveysForOutlet = (outletId: string) =>
    state.surveys.filter((s: OutletSurvey) => s.outletId === outletId && !s.isDraft);

  const getSkipForOutlet = (outletId: string) =>
    state.skipRecords.find((s: SkipRecord) => s.outletId === outletId);

  const getOutlet = (outletId: string) =>
    state.outlets.find((o: Outlet) => o.id === outletId);

  const getMovementsForProduct = (productId: string) =>
    state.movements.filter((m: StockMovement) => m.productId === productId);

  const getDraftsList = () => state.drafts;  const getPhotoCapturesForOutlet = (outletId: string) => state.photoCaptures.filter((c: OutletPhotoCapture) => c.outletId === outletId);

  const getLeadDraftsList = () => state.leadDrafts;
  const getOutletDraftsList = () => state.outletDrafts;

  const getLeadSurveyResponse = (leadId: string, surveyConfigId: string) =>
    state.leadSurveyResponses.find((r) => r.leadId === leadId && r.surveyConfigId === surveyConfigId);

  return (
    <FieldContext.Provider
      value={{
        state, dispatch, getSalesForOutlet, getOrdersForOutlet, getSurveysForOutlet,
        getSkipForOutlet, getOutlet, getMovementsForProduct, getDraftsList,        getPhotoCapturesForOutlet,
        getLeadDraftsList, getOutletDraftsList,
        getLeadSurveyResponse,
      }}
    >
      {children}
    </FieldContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useFieldStore = (): FieldContextValue => {
  const ctx = useContext(FieldContext);
  if (!ctx) throw new Error('useFieldStore must be used inside <FieldProvider>');
  return ctx;
};
