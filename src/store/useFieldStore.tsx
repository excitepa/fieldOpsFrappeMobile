import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import {
  Outlet, OutletSale, OutletOrder, OutletSurvey, SkipRecord, Product, Campaign,
  StockMovement, StockMovementType, Draft, LeadDraft, OutletPhotoCapture, LeadSurveyResponse,
  UserProfile,
} from '../types';
import { mockOutlets, mockProducts, mockCampaigns, mockUser } from '../services/mockService';
import { getUserInfo } from '../services/apiConfig';
import { mapUserInfoToProfile, fetchUserProfile } from '../services/api';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  const memoryStore = new Map<string, string>();
  AsyncStorage = {
    getItem: async (key: string) => memoryStore.get(key) || null,
    setItem: async (key: string, val: string) => { memoryStore.set(key, val); },
  };
}

// ─── State Shape ──────────────────────────────────────────────────────────────
interface FieldState {
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
  leadSurveyResponses: LeadSurveyResponse[];
  user: UserProfile;
  attendanceStatus: { clockedIn: boolean; attendanceId?: string };
  /** True once a real campaign (not the default mock) has been confirmed via a completed clock-in — lets a resumed session skip straight to Attendance for the remembered campaign instead of asking the agent to pick one again every day. */
  campaignSelected: boolean;
  /** Flips true once the AsyncStorage hydration pass (or the first-run check that finds nothing to hydrate) has completed — lets callers wait for a real answer before deciding things like "is the user already clocked in". */
  hydrated: boolean;
}

// ─── Actions ──────────────────────────────────────────────────────────────────
type Action =
  | { type: 'SET_ACTIVE_CAMPAIGN'; campaign: Campaign }
  | { type: 'SET_USER'; user: UserProfile }
  | { type: 'SET_ATTENDANCE_STATUS'; clockedIn: boolean; attendanceId?: string }
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
  | { type: 'DECREMENT_STOCK'; productId: string; qty: number; outletId?: string }
  | { type: 'ADJUST_STOCK'; productId: string; qtyChange: number; reason: string; movementType: Extract<StockMovementType, 'adjustment' | 'reconciliation'> }
  | { type: 'SAVE_DRAFT'; draft: Draft }
  | { type: 'DELETE_DRAFT'; draftId: string }
  | { type: 'ADD_PHOTO_CAPTURE'; capture: OutletPhotoCapture }
  | { type: 'SAVE_LEAD_DRAFT'; leadDraft: LeadDraft }
  | { type: 'DELETE_LEAD_DRAFT'; draftId: string }
  | { type: 'ADD_LEAD_SURVEY_RESPONSE'; response: LeadSurveyResponse }
  | { type: 'HYDRATE'; state: Partial<FieldState> };

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state: FieldState, action: Action): FieldState {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, ...action.state, hydrated: true };

    case 'SET_USER':
      return { ...state, user: action.user };

    case 'SET_ACTIVE_CAMPAIGN':
      return { ...state, activeCampaign: action.campaign, campaignSelected: true };

    case 'SET_ATTENDANCE_STATUS':
      return { ...state, attendanceStatus: { clockedIn: action.clockedIn, attendanceId: action.attendanceId } };

    case 'SET_CAMPAIGN_SELECTED':
      return { ...state, campaignSelected: action.value };

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
      const merged = action.outlets.map((o) => {
        const localStatus = localStatusById.get(o.id);
        return localStatus && localStatus !== 'pending' ? { ...o, status: localStatus } : o;
      });
      return { ...state, outlets: merged };
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
  outlets: mockOutlets,
  sales: [],
  orders: [],
  surveys: [],
  skipRecords: [],
  products: mockProducts,
  // Renmoney Personal Loan Promo (mockCampaigns[0]) is the campaign every
  // "new ui" reference screenshot is built around — it must be the default,
  // not the merchandising campaign, or every screen that reads
  // state.activeCampaign (Dashboard widgets, Home's Next Stop card, etc.)
  // renders the wrong content out of the box.
  activeCampaign: mockCampaigns[0],
  movements: [],
  drafts: [],
  leadDrafts: [],
  photoCaptures: [],
  leadSurveyResponses: [],
  user: mockUser,
  attendanceStatus: { clockedIn: false },
  campaignSelected: false,
  hydrated: false,
};

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
  getLeadSurveyResponse: (leadId: string, surveyConfigId: string) => LeadSurveyResponse | undefined;
}

const FieldContext = createContext<FieldContextValue | null>(null);

const STORAGE_KEY = '@fieldops:state';
// Bump this whenever the seed/mock data in mockService.ts changes shape or
// content in a way that should override a device's previously persisted
// state — otherwise HYDRATE below silently shadows the new seed data with
// whatever was saved during an earlier session/build.
const SEED_VERSION = 2;
const SEED_VERSION_KEY = '@fieldops:seedVersion';

// ─── Provider ─────────────────────────────────────────────────────────────────
export const FieldProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Hydrate from AsyncStorage on mount — but only if the saved data was
  // written by this same seed version. A mismatch (or first run) means the
  // on-device snapshot predates the current mock data, so it's discarded in
  // favor of the fresh initialState built from mockService.ts.
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
    // `state.hydrated` and would otherwise hang forever on a first run or a
    // seed-version bump.
    (async () => {
      let toRestore: Partial<FieldState> = {};
      try {
        const savedVersion = await AsyncStorage.getItem(SEED_VERSION_KEY);
        if (Number(savedVersion) !== SEED_VERSION) {
          await AsyncStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION)).catch(() => {});
        } else {
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw) {
            try {
              toRestore = JSON.parse(raw);
            } catch (_) {
              // ignore parse errors — fall through with an empty restore
            }
          }
        }
      } catch (_) {
        // ignore storage errors — fall through with an empty restore
      }
      dispatch({ type: 'HYDRATE', state: toRestore });
    })();
  }, []);

  // Persist on state change — gated on `hydrated` so this doesn't fire on the
  // very first render (still holding default initialState) and clobber the
  // real saved data with defaults before the hydration read above ever gets
  // to it. That race silently wiped clockedIn/activeCampaign/etc. on every
  // launch.
  useEffect(() => {
    if (!state.hydrated) return;
    if (AsyncStorage?.setItem) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
    }
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

  const getLeadSurveyResponse = (leadId: string, surveyConfigId: string) =>
    state.leadSurveyResponses.find((r) => r.leadId === leadId && r.surveyConfigId === surveyConfigId);

  return (
    <FieldContext.Provider
      value={{
        state, dispatch, getSalesForOutlet, getOrdersForOutlet, getSurveysForOutlet,
        getSkipForOutlet, getOutlet, getMovementsForProduct, getDraftsList,        getPhotoCapturesForOutlet,
        getLeadDraftsList,
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
