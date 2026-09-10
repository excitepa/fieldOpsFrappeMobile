import {
  Campaign, Lead, Outlet, OutletSale, OutletOrder, OutletSurvey, Product,
  AttendanceRecord, DashboardWidgetId, OutletPhotoCapture, Draft,
} from '../types';
import { getConversionRate, getWeightedPipelineValue, getTotalPipelineValue, getStageBreakdown } from './pipelineMetrics';
import { groupSalesByInvoice, groupOrdersByRef } from './transactions';
import { parseAppTimestamp, localDateStr } from './timestamp';

export interface DashboardContext {
  campaign: Campaign;
  leads: Lead[];
  outlets: Outlet[];
  sales: OutletSale[];
  orders: OutletOrder[];
  surveys: OutletSurvey[];
  products: Product[];
  photoCaptures: OutletPhotoCapture[];
  drafts: Draft[];
  attendance: AttendanceRecord[];
}

export function getGreeting(name: string, date: Date = new Date()): string {
  const hour = date.getHours();
  const timeGreeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  return `${timeGreeting}, ${name}!`;
}

/** campaign.target is a free-text display string (e.g. "84 / 200 units") — use its last
 * embedded number as the working denominator for progress bars. */
export function parseNumericTarget(target: string, fallback = 100): number {
  const matches = target.replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) return fallback;
  return parseFloat(matches[matches.length - 1]);
}

function isToday(timestamp: string, today: Date = new Date()): boolean {
  const d = parseAppTimestamp(timestamp);
  if (isNaN(d.getTime())) return false;
  return d.toDateString() === today.toDateString();
}

function isThisMonth(timestamp: string, today: Date = new Date()): boolean {
  const d = parseAppTimestamp(timestamp);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
}

// ─── Today's Performance Overview ──────────────────────────────────────────────
export interface PerformanceRow {
  label: string;
  valueText: string;
  progress: number; // 0–1
}

const isPipelineCampaign = (campaign: Campaign) => campaign.ctaType === 'leads';
const isMerchandisingTemplate = (campaign: Campaign) => campaign.dashboard?.template === 'merchandising';

export function getTodayPerformanceRows(ctx: DashboardContext): PerformanceRow[] {
  const { campaign } = ctx;

  if (isMerchandisingTemplate(campaign)) {
    const merchConfig = (campaign.surveys || []).find((s) => s.module === 'merchandising');
    const audits = ctx.surveys.filter((s) => !s.isDraft && s.surveyConfigId === merchConfig?.id);
    const target = parseNumericTarget(campaign.target, 10);
    const complianceScores = audits.map((a) => computeComplianceScore(a));
    const avgCompliance = complianceScores.length
      ? complianceScores.reduce((sum, v) => sum + v, 0) / complianceScores.length
      : 0;

    return [
      {
        label: 'Outlet Coverage',
        valueText: `${ctx.outlets.filter((o) => o.status === 'visited').length}/${ctx.outlets.length}`,
        progress: ctx.outlets.length ? ctx.outlets.filter((o) => o.status === 'visited').length / ctx.outlets.length : 0,
      },
      { label: 'Completed Audits', valueText: `${audits.length}/${target}`, progress: Math.min(1, audits.length / target) },
      { label: 'Compliance', valueText: `${Math.round(avgCompliance * 100)}%`, progress: avgCompliance },
    ];
  }

  if (isPipelineCampaign(campaign)) {
    const target = parseNumericTarget(campaign.target, 50);
    const submissions = ctx.surveys.length;
    const synced = ctx.surveys.filter((s) => !s.isDraft).length;
    const conversion = getConversionRate(ctx.leads);

    return [
      { label: 'Leads Collection', valueText: `${ctx.leads.length}/${Math.round(target)}`, progress: Math.min(1, ctx.leads.length / target) },
      { label: 'Survey Completion', valueText: `${synced}/${submissions || 1}`, progress: submissions ? synced / submissions : 0 },
      { label: 'Conversion Rate', valueText: `${Math.round(conversion * 100)}%`, progress: conversion },
    ];
  }

  // Non-pipeline execution campaign — every row here is a *daily* figure (hence
  // "Today Performance"), same reset-per-day behavior as Outlet Coverage
  // (which reads live visited-status that resets on every fresh clock-in).
  // "Orders" here means count of sales made today (a plain transaction count,
  // +1 per completed sale regardless of value/customer) — not order records.
  const salesCountTarget = parseNumericTarget(campaign.target, 20);
  const groupedSalesToday = groupSalesByInvoice(ctx.sales.filter((s) => isToday(s.timestamp)));
  const totalSalesValueToday = groupedSalesToday.reduce((sum, t) => sum + t.total, 0);
  const salesTarget = parseNumericTarget(campaign.target, 100000);

  return [
    {
      label: 'Outlet Coverage',
      valueText: `${ctx.outlets.filter((o) => o.status === 'visited').length}/${ctx.outlets.length}`,
      progress: ctx.outlets.length ? ctx.outlets.filter((o) => o.status === 'visited').length / ctx.outlets.length : 0,
    },
    { label: 'Orders', valueText: `${groupedSalesToday.length}/${Math.round(salesCountTarget)}`, progress: Math.min(1, groupedSalesToday.length / salesCountTarget) },
    {
      label: 'Sales Value',
      valueText: `₦${totalSalesValueToday.toLocaleString()}`,
      progress: Math.min(1, totalSalesValueToday / salesTarget),
    },
  ];
}

// ─── MTD Performance Overview ──────────────────────────────────────────────────
// A real 0% ("visited 0 of 20 outlets") and "no outlets to measure at all" both
// compute to pct: 0 — indistinguishable on the gauge unless the label itself says
// which one it is, so a genuine 0% doesn't read as a broken/empty widget.
export function getMtdRingPct(ctx: DashboardContext): { label: string; pct: number } {
  if (isPipelineCampaign(ctx.campaign)) {
    if (ctx.leads.length === 0) return { label: 'No leads yet', pct: 0 };
    return { label: 'Customer Performance', pct: getConversionRate(ctx.leads) };
  }
  const total = ctx.outlets.length;
  const visited = ctx.outlets.filter((o) => o.status === 'visited').length;
  if (total === 0) return { label: 'No outlets yet', pct: 0 };
  return { label: 'Outlet Performance', pct: visited / total };
}

const WORKING_DAYS_PER_MONTH = 22;

export interface AttendanceBreakdown {
  present: number;
  absent: number;
  late: number;
  halfDay: number;
}

export function getAttendanceBreakdown(records: AttendanceRecord[]): AttendanceBreakdown {
  const present = records.filter((r) => r.status === 'present').length;
  const late = records.filter((r) => r.status === 'late').length;
  const halfDay = records.filter((r) => r.status === 'half-day').length;
  const recorded = records.length;
  const absent = Math.max(0, WORKING_DAYS_PER_MONTH - recorded);
  return { present, absent, late, halfDay };
}

// ─── Sales / Lead Activity Chart ───────────────────────────────────────────────
export type ChartRange = 'all' | 'mtd' | 'week' | 'today';

export interface ChartPoint {
  label: string;
  value: number;
}

function dayLabel(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export function getActivityChartData(ctx: DashboardContext, range: ChartRange): ChartPoint[] {
  const today = new Date();
  const pipeline = isPipelineCampaign(ctx.campaign);

  const source: { timestamp: string; amount: number }[] = pipeline
    // Leads have no per-lead timestamp field — bucket by nextActionDate as the closest proxy for activity date.
    ? ctx.leads.filter((l) => l.nextActionDate).map((l) => ({ timestamp: l.nextActionDate as string, amount: parseFloat(l.value.replace(/[^0-9.]/g, '')) || 0 }))
    : ctx.sales.map((s) => ({ timestamp: s.timestamp, amount: s.total }));

  const withinRange = (ts: string) => {
    const d = parseAppTimestamp(ts);
    if (isNaN(d.getTime())) return range === 'all';
    if (range === 'all') return true;
    if (range === 'today') return d.toDateString() === today.toDateString();
    if (range === 'week') {
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 6);
      return d >= weekAgo && d <= today;
    }
    // mtd
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  };

  const buckets = new Map<string, number>();
  source.forEach(({ timestamp, amount }) => {
    if (!withinRange(timestamp)) return;
    const d = parseAppTimestamp(timestamp);
    const key = isNaN(d.getTime()) ? timestamp.slice(0, 10) : localDateStr(d);
    buckets.set(key, (buckets.get(key) || 0) + amount);
  });

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, value]) => ({ label: dayLabel(iso), value }));
}

// ─── Merchandising compliance heuristic ────────────────────────────────────────
// Scores a merchandising survey response by how close each choice/select answer is
// to the first (best) option in its question's option list.
function computeComplianceScore(survey: OutletSurvey): number {
  const scored = survey.answers.filter((a) => typeof a.answer === 'string');
  if (scored.length === 0) return 0;
  // Without the question's option list at hand here, treat the first-listed option
  // convention (mockMerchandisingQuestions always orders "best → worst") as an index
  // proxy: an exact string match to a "best-sounding" keyword scores 1, otherwise 0.5.
  const bestKeywords = ['yes, complete', 'excellent'];
  const worstKeywords = ['not present', 'non-compliant'];
  const scores: number[] = scored.map((a) => {
    const val = (a.answer as string).toLowerCase();
    if (bestKeywords.some((k) => val.includes(k))) return 1;
    if (worstKeywords.some((k) => val.includes(k))) return 0;
    return 0.6;
  });
  return scores.reduce((sum, v) => sum + v, 0) / scores.length;
}

// ─── Summary Dashboard Widgets ──────────────────────────────────────────────────
export interface WidgetData {
  id: DashboardWidgetId;
  title: string;
  value: string;
  supportingText: string;
  progress?: number;
}

export function getWidgetData(id: DashboardWidgetId, ctx: DashboardContext): WidgetData | null {
  const { campaign, leads, outlets, sales, orders, surveys, products, photoCaptures, drafts } = ctx;
  const groupedSales = groupSalesByInvoice(sales);
  const groupedOrders = groupOrdersByRef(orders);
  // Sales Value/Count are daily, same as Outlet Coverage (which is effectively
  // "today" too, since visited status resets on every fresh clock-in) — matches
  // the Sales Today figure on the Next Stop card rather than a campaign total.
  const groupedSalesToday = groupSalesByInvoice(sales.filter((s) => isToday(s.timestamp)));

  switch (id) {
    case 'total-leads':
      return { id, title: 'Total Leads', value: `${leads.length}`, supportingText: 'All leads captured under this campaign' };

    case 'new-leads':
      return { id, title: 'New Leads', value: `${leads.filter((l) => l.stage === 'New').length}`, supportingText: 'Awaiting first contact' };

    case 'conversion-rate': {
      const rate = getConversionRate(leads);
      const converted = leads.filter((l) => l.stage === 'Converted').length;
      return { id, title: 'Conversion Rate', value: `${Math.round(rate * 100)}%`, supportingText: `${converted} converted of ${leads.length}`, progress: rate };
    }

    case 'pipeline-value':
      return {
        id, title: 'Pipeline Value',
        value: `₦${Math.round(getWeightedPipelineValue(leads)).toLocaleString()}`,
        supportingText: `Weighted · ₦${getTotalPipelineValue(leads).toLocaleString()} gross`,
      };

    case 'agent-performance': {
      const target = parseNumericTarget(campaign.target, 50);
      const activities = leads.length + groupedSales.length + surveys.filter((s) => !s.isDraft).length;
      const pct = Math.min(1, activities / target);
      return {
        id, title: 'Agent Performance', value: `${Math.round(pct * 100)}%`,
        supportingText: `${activities}/${Math.round(target)} activities`, progress: pct,
      };
    }

    case 'outlets-visited':
    case 'outlet-visits': {
      const visited = outlets.filter((o) => o.status === 'visited').length;
      return {
        id, title: id === 'outlet-visits' ? 'Outlet Visits' : 'Outlets Visited',
        value: `${visited}/${outlets.length}`,
        supportingText: `${outlets.length ? Math.round((visited / outlets.length) * 100) : 0}% route coverage`,
        progress: outlets.length ? visited / outlets.length : 0,
      };
    }

    case 'orders-created': {
      const totalValue = groupedOrders.reduce((sum, t) => sum + t.total, 0);
      return { id, title: 'Orders Created', value: `${groupedOrders.length}`, supportingText: `₦${totalValue.toLocaleString()}` };
    }

    case 'sales-value': {
      const totalValue = groupedSalesToday.reduce((sum, t) => sum + t.total, 0);
      return { id, title: 'Sales Value', value: `₦${totalValue.toLocaleString()}`, supportingText: `${groupedSalesToday.length} sale(s) today` };
    }

    case 'sales-count': {
      // Plain transaction count — every completed sale today is +1 regardless of
      // its ₦ value or which outlet/customer it was to, distinct from Sales Value (₦).
      const totalValue = groupedSalesToday.reduce((sum, t) => sum + t.total, 0);
      return { id, title: 'Sales Count', value: `${groupedSalesToday.length}`, supportingText: `₦${totalValue.toLocaleString()} today` };
    }

    case 'products-sold': {
      const units = sales.reduce((sum, s) => sum + s.quantity, 0);
      return { id, title: 'Products Sold', value: `${units}`, supportingText: 'Units moved this campaign' };
    }

    case 'target-achievement': {
      const target = parseNumericTarget(campaign.target, 20);
      const achieved = groupedSales.length + groupedOrders.length;
      const pct = Math.min(1, achieved / target);
      return {
        id, title: 'Target Achievement', value: `${Math.round(pct * 100)}%`,
        supportingText: `${achieved}/${Math.round(target)} transactions`, progress: pct,
      };
    }

    case 'completed-audits': {
      const merchConfig = (campaign.surveys || []).find((s) => s.module === 'merchandising');
      const target = parseNumericTarget(campaign.target, 10);
      const audits = surveys.filter((s) => !s.isDraft && s.surveyConfigId === merchConfig?.id);
      return {
        id, title: 'Completed Audits', value: `${audits.length}/${Math.round(target)}`,
        supportingText: 'Merchandising records submitted', progress: Math.min(1, audits.length / target),
      };
    }

    case 'compliance': {
      const merchConfig = (campaign.surveys || []).find((s) => s.module === 'merchandising');
      const audits = surveys.filter((s) => !s.isDraft && s.surveyConfigId === merchConfig?.id);
      const avg = audits.length ? audits.map(computeComplianceScore).reduce((s, v) => s + v, 0) / audits.length : 0;
      return { id, title: 'Compliance', value: `${Math.round(avg * 100)}%`, supportingText: 'Average planogram score', progress: avg };
    }

    case 'shelf-availability': {
      const merchConfig = (campaign.surveys || []).find((s) => s.module === 'merchandising');
      const audits = surveys.filter((s) => !s.isDraft && s.surveyConfigId === merchConfig?.id);
      const passed = audits.filter((a) => {
        const shelfAnswer = a.answers[0]?.answer;
        return typeof shelfAnswer === 'string' && shelfAnswer.toLowerCase().includes('yes, complete');
      }).length;
      const pct = audits.length ? passed / audits.length : 0;
      return { id, title: 'Shelf Availability', value: `${Math.round(pct * 100)}%`, supportingText: `${passed}/${audits.length} outlets with shelf share`, progress: pct };
    }

    case 'photo-captures':
      return { id, title: 'Photo Captures', value: `${photoCaptures.length}`, supportingText: 'Shelf evidence uploaded' };

    case 'pending-activities': {
      const pendingOutlets = outlets.filter((o) => o.status === 'pending').length;
      return { id, title: 'Pending Activities', value: `${pendingOutlets}`, supportingText: 'Outlets left + queued submissions' };
    }

    case 'leads-by-stage':
      // Rendered as a dedicated stage list, not a scalar metric card — see getStageBreakdown.
      return null;

    default:
      return null;
  }
}

export { getStageBreakdown };
