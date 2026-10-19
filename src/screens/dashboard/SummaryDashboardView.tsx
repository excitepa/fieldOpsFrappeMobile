import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/Card';
import { useFieldStore } from '../../store/useFieldStore';
import { Lead } from '../../types';
import { DashboardContext, getWidgetData, getStageBreakdown } from '../../utils/dashboardMetrics';
import { useLeadStages } from '../../hooks/useLeadStages';

interface SummaryDashboardViewProps {
  leadsList: Lead[];
}

export const SummaryDashboardView: React.FC<SummaryDashboardViewProps> = ({ leadsList }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state } = useFieldStore();
  const leadStages = useLeadStages();

  const campaign = state.activeCampaign;
  const ctx: DashboardContext = {
    campaign,
    leads: leadsList,
    outlets: state.outlets,
    sales: state.sales,
    orders: state.orders,
    surveys: state.surveys,
    products: state.products,
    photoCaptures: state.photoCaptures,
    drafts: state.drafts,
    attendance: [],
  };

  const widgetIds = campaign.dashboard?.widgets || [];

  if (widgetIds.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>This campaign has no configured Summary widgets yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {widgetIds.map((id) => {
        if (id === 'leads-by-stage') {
          const stages = getStageBreakdown(leadsList, leadStages);
          const maxCount = Math.max(1, ...stages.map((s) => s.count));
          return (
            <Card key={id} style={styles.widgetCard}>
              <Text style={styles.widgetTitle}>Leads by Stage</Text>
              {stages.map((s) => (
                <View key={s.stage} style={styles.stageRow}>
                  <View style={styles.stageHeaderRow}>
                    <Text style={styles.stageName}>{s.stage}</Text>
                    <Text style={styles.stageCount}>{s.count} · {leadsList.length ? Math.round((s.count / leadsList.length) * 100) : 0}%</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${(s.count / maxCount) * 100}%` }]} />
                  </View>
                </View>
              ))}
            </Card>
          );
        }

        const widget = getWidgetData(id, ctx);
        if (!widget) return null;

        return (
          <Card key={id} style={styles.widgetCard}>
            <Text style={styles.widgetTitle}>{widget.title}</Text>
            <Text style={styles.widgetValue}>{widget.value}</Text>
            <Text style={styles.widgetSupporting}>{widget.supportingText}</Text>
            {widget.progress !== undefined && (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(Math.min(1, widget.progress) * 100)}%` }]} />
              </View>
            )}
          </Card>
        );
      })}
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { gap: theme.spacing.sm },
  emptyBox: { paddingVertical: theme.spacing.xl, alignItems: 'center' },
  emptyText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
  widgetCard: { backgroundColor: theme.colors.cardWhite, borderColor: theme.colors.cardBorder, gap: 6 },
  widgetTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  widgetValue: { fontFamily: theme.fonts.display, fontSize: 24, color: theme.colors.textDark },
  widgetSupporting: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  track: { height: 6, backgroundColor: theme.colors.fieldFill, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', backgroundColor: theme.colors.navy, borderRadius: 3 },
  stageRow: { gap: 4, marginTop: 4 },
  stageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stageName: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
  stageCount: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
});
