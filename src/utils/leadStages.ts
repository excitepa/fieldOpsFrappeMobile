import { LeadStage, LeadStageInfo } from '../types';

/**
 * The backend owns the stage list (get_lead_stages). This is the same list,
 * for a backend without that endpoint. Won and Lost are final; Customer and
 * Archived are set on the web only.
 */
export const DEFAULT_LEAD_STAGES: LeadStageInfo[] = [
  { name: 'Prospect', order: 1, isFinal: false, agentCanSet: true },
  { name: 'Qualified', order: 2, isFinal: false, agentCanSet: true },
  { name: 'Opportunity', order: 3, isFinal: false, agentCanSet: true },
  { name: 'Proposal', order: 4, isFinal: false, agentCanSet: true },
  { name: 'Won', order: 5, isFinal: true, agentCanSet: true },
  { name: 'Lost', order: 6, isFinal: true, agentCanSet: true },
  { name: 'Customer', order: 7, isFinal: true, agentCanSet: false },
  { name: 'Archived', order: 8, isFinal: true, agentCanSet: false },
];

/** Reachable from any stage that isn't final. */
export const LOST_STAGE: LeadStage = 'Lost';
/** Stages a lead leaves the funnel by, rather than moving along it. */
const EXIT_STAGES: LeadStage[] = ['Lost', 'Archived'];
/** Stages that count as converted, as the reports count them. */
const CONVERTED_STAGES: LeadStage[] = ['Won', 'Customer'];

/** The app's old stage names, converted the way the backend's patch converts them. */
const LEGACY_STAGES: Record<string, LeadStage> = {
  new: 'Prospect',
  contacted: 'Prospect',
  'proposal sent': 'Proposal',
  negotiation: 'Proposal',
  converted: 'Won',
  'closed won': 'Won',
  'closed lost': 'Lost',
};

let current: LeadStageInfo[] = DEFAULT_LEAD_STAGES;

/** The stage list in order: the backend's once it has loaded (kept on the device), else the built-in one. */
export const leadStageList = (): LeadStageInfo[] => current;

/** Switches to the backend's list; null or empty goes back to the built-in one. The store calls this. */
export const setLeadStageList = (stages: LeadStageInfo[] | null | undefined): void => {
  current = stages && stages.length > 0 ? [...stages].sort((a, b) => a.order - b.order) : DEFAULT_LEAD_STAGES;
};

/**
 * A stage as the backend sent it: a name in the list (in its spelling), an
 * old app name converted, blank as the first stage, and any other name kept
 * as it is — never shown as a stage it isn't.
 */
export const normalizeStage = (raw: unknown, stages: LeadStageInfo[] = current): LeadStage => {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) return firstStage(stages);
  const known = stages.find((s) => s.name.toLowerCase() === name.toLowerCase());
  return known ? known.name : LEGACY_STAGES[name.toLowerCase()] || name;
};

/** Where a new lead starts. */
export const firstStage = (stages: LeadStageInfo[] = current): LeadStage => stages[0]?.name || 'Prospect';

export const isConvertedStage = (stage: LeadStage): boolean => CONVERTED_STAGES.includes(stage);
export const isExitStage = (stage: LeadStage): boolean => EXIT_STAGES.includes(stage);

/** The funnel in order: every stage but the exits (Lost, Archived). */
export const funnelStages = (stages: LeadStageInfo[] = current): LeadStage[] =>
  stages.filter((s) => !isExitStage(s.name)).map((s) => s.name);

/**
 * Where the agent can move a lead on their own: any later stage they're
 * allowed to set (skipping is fine), or Lost; nothing out of a final stage.
 * The backend applies the same rule. A stage not in the list counts as
 * before the first.
 */
export const forwardStages = (stage: LeadStage, stages: LeadStageInfo[] = current): LeadStage[] => {
  const info = stages.find((s) => s.name === stage);
  if (info?.isFinal) return [];
  const order = info?.order ?? Number.NEGATIVE_INFINITY;
  return stages
    .filter((s) => s.agentCanSet && s.name !== stage && (s.name === LOST_STAGE || (!isExitStage(s.name) && s.order > order)))
    .map((s) => s.name);
};

/**
 * Where a "Move back..." request can ask for: an earlier stage the agent can
 * set, or out of Won or Lost, any of them. Nothing for a web-only stage.
 */
export const backwardStages = (stage: LeadStage, stages: LeadStageInfo[] = current): LeadStage[] => {
  const info = stages.find((s) => s.name === stage);
  if (!info || !info.agentCanSet) return [];
  return stages
    .filter((s) => s.agentCanSet && !isExitStage(s.name) && s.name !== stage && (info.isFinal || s.order < info.order))
    .map((s) => s.name);
};

/**
 * 0-100 by how far along the funnel a stage is: the first stage 20, rising
 * to 80 at the last one before Won; converted 100; Lost and Archived 0. Any
 * other stage 20.
 */
export const stageScore = (stage: LeadStage, stages: LeadStageInfo[] = current): number => {
  if (isConvertedStage(stage)) return 100;
  if (isExitStage(stage)) return 0;
  const open = funnelStages(stages).filter((s) => !isConvertedStage(s));
  const index = open.indexOf(stage);
  if (index < 0 || open.length < 2) return 20;
  return Math.round(20 + (60 * index) / (open.length - 1));
};

/** The chance a lead at this stage converts, for the weighted pipeline value. */
export const stageProbability = (stage: LeadStage, stages: LeadStageInfo[] = current): number => stageScore(stage, stages) / 100;
