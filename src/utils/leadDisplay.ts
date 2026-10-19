import { LeadStage } from '../types';
import { Theme } from '../theme/theme';

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getStageColor(stage: LeadStage, theme: Theme): string {
  switch (stage) {
    case 'Prospect': return theme.colors.primary;
    case 'Qualified': return theme.colors.tintPurpleIcon;
    case 'Opportunity': return theme.colors.amber;
    case 'Proposal': return theme.colors.teal;
    case 'Won':
    case 'Customer': return theme.colors.emerald;
    case 'Lost': return theme.colors.red;
    case 'Archived': return theme.colors.textMuted;
    default: return theme.colors.primary;
  }
}

export function formatShortDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}
