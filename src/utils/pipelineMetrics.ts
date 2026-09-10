import { Lead, LeadStage } from '../types';
import { localDateStr } from './timestamp';

export const STAGE_PROBABILITY: Record<LeadStage, number> = {
  New: 0.1,
  Contacted: 0.25,
  Qualified: 0.5,
  'Proposal Sent': 0.6,
  Negotiation: 0.8,
  Converted: 1.0,
  Lost: 0,
};

/** Ordered funnel — "Lost" is a terminal exit, not a forward step, so it's excluded from ordering/progression math. */
export const FUNNEL_STAGES: LeadStage[] = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Converted'];
export const PIPELINE_STAGES: LeadStage[] = [...FUNNEL_STAGES, 'Lost'];

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
  return leads.reduce((acc, l) => acc + parseLeadValue(l.value) * STAGE_PROBABILITY[l.stage], 0);
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
 * progressed past this point. Lost leads are excluded from the funnel pool.
 */
export function getStageBreakdown(leads: Lead[]): StageBreakdownEntry[] {
  const funnelLeads = leads.filter((l) => l.stage !== 'Lost');

  return PIPELINE_STAGES.map((stage) => {
    const stageLeads = leads.filter((l) => l.stage === stage);
    const avgAgeDays = stageLeads.length
      ? Math.round(stageLeads.reduce((sum, l) => sum + getDaysSince(l.createdAt), 0) / stageLeads.length)
      : 0;

    let pctToNextStage = 0;
    const stageIndex = FUNNEL_STAGES.indexOf(stage);
    if (stageIndex >= 0) {
      const atOrPast = funnelLeads.filter((l) => FUNNEL_STAGES.indexOf(l.stage) >= stageIndex).length;
      const past = funnelLeads.filter((l) => FUNNEL_STAGES.indexOf(l.stage) > stageIndex).length;
      pctToNextStage = atOrPast > 0 ? past / atOrPast : 0;
    }

    return {
      stage,
      count: stageLeads.length,
      value: getTotalPipelineValue(stageLeads),
      avgAgeDays,
      pctOfTotal: leads.length ? stageLeads.length / leads.length : 0,
      pctToNextStage,
      leads: stageLeads,
    };
  });
}

/** Share of leads that have reached Converted. */
export function getConversionRate(leads: Lead[]): number {
  if (leads.length === 0) return 0;
  const converted = leads.filter((l) => l.stage === 'Converted').length;
  return converted / leads.length;
}
