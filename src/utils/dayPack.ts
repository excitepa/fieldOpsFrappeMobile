import {
  getOutlets, getOutletDirectory, getItems, getMySales, getMyOrders, getMyGeofence, getCampaigns, getAgentBeats,
  getLeads, getLeadStages, getOutletTypes, getOutletChannels, getOutletSubChannels, getMyDistributors,
  getMySurveys, getMyStockRequests, renewAccessToken, isMissingEndpoint, AuthError,
} from '../services/api';
import type { FieldState } from '../store/useFieldStore';
import { DayPackStatus } from '../types';
import { loadCampaignSurveys } from './afterEditSurvey';
import { saveOutletDirectory } from './outletDirectory';
import { localDateStr } from './timestamp';
import { debugLog } from './logger';

/**
 * The day's download: everything the agent works from offline, fetched at
 * clock-in (and again until it has all come in that day). Each part is saved
 * as it arrives; one that fails keeps what the phone already had.
 */

interface PartContext {
  campaignId?: string;
  agentEmail?: string;
  dispatch: (action: any) => void;
  getState: () => FieldState;
}

interface Part {
  key: string;
  /** How it's named when it couldn't be downloaded. */
  label: string;
  run: (ctx: PartContext) => Promise<void>;
}

/** Fine when the backend doesn't have it (an older one): there's nothing to download. */
const optional = async (load: () => Promise<void>) => {
  try {
    await load();
  } catch (e) {
    if (!isMissingEndpoint(e)) throw e;
  }
};

const PARTS: Part[] = [
  {
    key: 'outlets',
    label: 'Outlets',
    run: async ({ campaignId, dispatch }) => {
      if (campaignId) dispatch({ type: 'SET_OUTLETS', outlets: await getOutlets(campaignId) });
    },
  },
  {
    key: 'directory',
    label: 'Outlets in your territory',
    run: ({ agentEmail }) => optional(async () => {
      saveOutletDirectory({ ...(await getOutletDirectory()), agentEmail, savedAt: new Date().toISOString() });
    }),
  },
  {
    key: 'products',
    label: 'Products and stock',
    run: async ({ dispatch, getState }) => {
      const products = await getItems();
      // get_items answers an empty list when it fails, so an empty one never
      // replaces products the phone has.
      if (products.length === 0 && getState().products.length > 0) throw new Error('No products came back.');
      dispatch({ type: 'SET_PRODUCTS', products });
    },
  },
  { key: 'sales', label: 'Sales', run: async ({ dispatch }) => dispatch({ type: 'SET_SALES', sales: await getMySales() }) },
  { key: 'orders', label: 'Orders', run: async ({ dispatch }) => dispatch({ type: 'SET_ORDERS', orders: await getMyOrders() }) },
  {
    key: 'geofence',
    label: 'Your territory',
    run: ({ dispatch }) => optional(async () => dispatch({ type: 'SET_GEOFENCE', geofence: await getMyGeofence() })),
  },
  { key: 'campaigns', label: 'Campaigns', run: async ({ dispatch }) => dispatch({ type: 'SET_CAMPAIGNS', campaigns: await getCampaigns() }) },
  {
    key: 'route',
    label: "Today's route",
    run: async ({ dispatch }) => dispatch({ type: 'SET_ROUTE_ASSIGNMENTS', assignments: await getAgentBeats() }),
  },
  {
    key: 'leads',
    label: 'Leads',
    run: async ({ campaignId, dispatch }) => dispatch({ type: 'SET_LEADS', leads: await getLeads(campaignId || '') }),
  },
  {
    key: 'leadStages',
    label: 'Lead stages',
    run: ({ dispatch }) => optional(async () => dispatch({ type: 'SET_LEAD_STAGES', stages: await getLeadStages() })),
  },
  {
    key: 'outletForms',
    label: 'Outlet types and channels',
    run: async ({ dispatch }) => {
      // One after another: each part holds one request at a time.
      const types = await getOutletTypes();
      const channels = await getOutletChannels();
      const subChannels = await getOutletSubChannels();
      dispatch({ type: 'SET_OUTLET_FORM_OPTIONS', options: { types, channels, subChannels } });
      await optional(async () => {
        const { distributors, defaultId } = await getMyDistributors();
        dispatch({ type: 'SET_OUTLET_FORM_OPTIONS', options: { distributors, defaultDistributorId: defaultId } });
      });
    },
  },
  {
    key: 'surveys',
    label: 'Surveys',
    run: async ({ campaignId, dispatch }) => {
      if (campaignId) await loadCampaignSurveys(campaignId, dispatch, { oneAtATime: true });
    },
  },
  {
    key: 'surveyResponses',
    label: 'Surveys already done',
    run: async ({ campaignId, dispatch }) => dispatch({ type: 'SET_SURVEY_RESPONSES', responses: await getMySurveys(campaignId) }),
  },
  {
    key: 'stockRequests',
    label: 'Stock requests',
    run: async ({ dispatch }) => dispatch({ type: 'SET_STOCK_REQUESTS', requests: await getMyStockRequests() }),
  },
];

export const DAY_PACK_SIZE = PARTS.length;

/** How many requests go at once (a part sends its own one after another): the server is shared with every agent clocking in. */
const AT_A_TIME = 3;

export interface DayPackProgress {
  done: number;
  total: number;
}

export interface DayPackResult {
  /** Every part came in. */
  ok: boolean;
  /** The parts that didn't, by name. */
  failed: string[];
  /** The login has expired: the agent has to sign in again. */
  needsSignIn: boolean;
}

let running: Promise<DayPackResult> | null = null;

/**
 * Downloads the day, at most three requests at a time, then renews the
 * login (skipped quietly on a backend without it). Records when each part,
 * and the whole download, last came in. A download already running is
 * joined rather than started again.
 */
export function downloadDay(
  ctx: PartContext & { onProgress?: (progress: DayPackProgress) => void },
): Promise<DayPackResult> {
  if (running) return running;
  running = (async () => {
    const failed: string[] = [];
    let needsSignIn = false;
    let done = 0;
    const queue = [...PARTS];
    ctx.onProgress?.({ done, total: PARTS.length });

    const worker = async () => {
      for (let part = queue.shift(); part; part = queue.shift()) {
        try {
          await part.run(ctx);
          ctx.dispatch({ type: 'SET_DAY_PACK', status: { parts: { [part.key]: new Date().toISOString() } } });
        } catch (e) {
          debugLog('[dayPack] could not download', part.key, e);
          if (e instanceof AuthError) needsSignIn = true;
          failed.push(part.label);
        }
        done++;
        ctx.onProgress?.({ done, total: PARTS.length });
      }
    };
    await Promise.all(Array.from({ length: AT_A_TIME }, worker));

    if (!needsSignIn) {
      try {
        await renewAccessToken();
      } catch (e) {
        // An older backend can't renew it, or there's no connection: the
        // login there is goes on.
        if (e instanceof AuthError) needsSignIn = true;
        debugLog('[dayPack] could not renew the login', e);
      }
    }
    const ok = failed.length === 0 && !needsSignIn;
    ctx.dispatch({
      type: 'SET_DAY_PACK',
      status: { agentEmail: ctx.agentEmail, ...(ok ? { completedAt: new Date().toISOString() } : {}) },
    });
    return { ok, failed, needsSignIn };
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Whether today's download has all come in, for this agent. */
export const isDayPackDone = (status: DayPackStatus, agentEmail?: string): boolean =>
  !!status.completedAt
  && localDateStr(new Date(status.completedAt)) === localDateStr()
  && (!status.agentEmail || !agentEmail || status.agentEmail === agentEmail.trim().toLowerCase());

/** When the phone's data was last brought up to date: the last full download, else the latest part. */
export const lastUpdatedAt = (status: DayPackStatus): string | undefined =>
  status.completedAt || Object.values(status.parts || {}).sort().pop();

/** "today 9:15 am", "yesterday 6:40 pm", "Oct 23, 6:40 pm". */
export function formatLastUpdated(iso?: string, now: Date = new Date()): string {
  if (!iso) return 'never';
  const at = new Date(iso);
  if (isNaN(at.getTime())) return 'never';
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  const day = localDateStr(at);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day === localDateStr(now)) return `today ${time}`;
  if (day === localDateStr(yesterday)) return `yesterday ${time}`;
  return `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}
