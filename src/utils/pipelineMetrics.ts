import { Lead, LeadStage, LeadStageInfo } from '../types';
import { localDateStr } from './timestamp';
import { funnelStages, isConvertedStage, isExitStage, leadStageList, stageProbability } from './leadStages';

/** Leads store value as a formatted string like "₦180,000" — parse back to a number. */
export function parseLeadValue(value: string): number {
  const digits = value.replace(/[^0-9.]/g, '');
  return digits ? parseFloat(digits) : 0;
}

/** Abbreviates a naira amount for compact display: 180000 -> "₦180k", 1250000 -> "₦1.3m". */
export function formatCompactNaira(amount: number): string {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (amount >= 1_000) return `₦${Math.round(amount / 1_000)}k`;
  return `₦${Math.round(amount)}`;
}

export function getTotalPipelineValue(leads: Lead[]): number {
  return leads.reduce((acc, l) => acc + parseLeadValue(l.value), 0);
}

export function getWeightedPipelineValue(leads: Lead[]): number {
  return leads.reduce((acc, l) => acc + parseLeadValue(l.value) * stageProbability(l.stage), 0);
}

/** A lead is overdue when it has a nextActionDate strictly before today. */
export function getOverdueLeads(leads: Lead[], todayIso: string = localDateStr()): Lead[] {
  return leads.filter((l) => l.nextActionDate && l.nextActionDate < todayIso);
}

export function getDaysSince(iso: string | undefined, todayIso: string = localDateStr()): number {
  if (!iso) return 0;
  const start = new Date(iso + 'T00:00:00').getTime();
  const end = new Date(todayIso + 'T00:00:00').getTime();
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

/** Average age (days since createdAt) across all leads — used as the pipeline-wide "Avg Age" stat. */
export function getAvgAgeDays(leads: Lead[]): number {
  if (leads.length === 0) return 0;
  const total = leads.reduce((sum, l) => sum + getDaysSince(l.createdAt), 0);
  return Math.round(total / leads.length);
}

export interface StageBreakdownEntry {
  stage: LeadStage;
  /** Along the funnel rather than out of it (Lost, Archived) or a stage not in the list. */
  inFunnel: boolean;
  count: number;
  value: number;
  avgAgeDays: number;
  pctOfTotal: number;
  pctToNextStage: number;
  leads: Lead[];
}

/**
 * "% to next stage" = share of leads currently at-or-past this stage that have
 * already moved beyond it — i.e. how much of the remaining funnel pool has
 * progressed past this point. Lost and Archived leads are excluded from the
 * funnel pool. Every stage an agent can set is listed; a web-only stage
 * (Customer, Archived) or one not in the list only when a lead is in it.
 */
export function getStageBreakdown(leads: Lead[], listed: LeadStageInfo[] = leadStageList()): StageBreakdownEntry[] {
  const funnel = funnelStages(listed);
  const funnelLeads = leads.filter((l) => !isExitStage(l.stage));
  const stagesShown = [
    ...listed.filter((s) => s.agentCanSet || leads.some((l) => l.stage === s.name)).map((s) => s.name),
    ...Array.from(new Set(leads.map((l) => l.stage))).filter((stage) => !listed.some((s) => s.name === stage)),
  ];

  return stagesShown.map((stage) => {
    const stageLeads = leads.filter((l) => l.stage === stage);
    const avgAgeDays = stageLeads.length
      ? Math.round(stageLeads.reduce((sum, l) => sum + getDaysSince(l.createdAt), 0) / stageLeads.length)
      : 0;

    let pctToNextStage = 0;
    const stageIndex = funnel.indexOf(stage);
    if (stageIndex >= 0) {
      const atOrPast = funnelLeads.filter((l) => funnel.indexOf(l.stage) >= stageIndex).length;
      const past = funnelLeads.filter((l) => funnel.indexOf(l.stage) > stageIndex).length;
      pctToNextStage = atOrPast > 0 ? past / atOrPast : 0;
    }

    return {
      stage,
      inFunnel: stageIndex >= 0,
      count: stageLeads.length,
      value: getTotalPipelineValue(stageLeads),
      avgAgeDays,
      pctOfTotal: leads.length ? stageLeads.length / leads.length : 0,
      pctToNextStage,
      leads: stageLeads,
    };
  });
}

/** Share of leads that are won (or already customers). */
export function getConversionRate(leads: Lead[]): number {
  if (leads.length === 0) return 0;
  const converted = leads.filter((l) => isConvertedStage(l.stage)).length;
  return converted / leads.length;
}
