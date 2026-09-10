import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/Card';
import { MiniBarChart } from '../../components/MiniBarChart';
import { useFieldStore } from '../../store/useFieldStore';
import { mockAttendanceRecords } from '../../services/mockService';
import { Lead } from '../../types';
import {
  DashboardContext, getGreeting, getTodayPerformanceRows,
  getActivityChartData, ChartRange,
} from '../../utils/dashboardMetrics';

interface PerformanceDashboardViewProps {
  leadsList: Lead[];
}

const RANGE_OPTIONS: { id: ChartRange; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'mtd', label: 'MTD' },
  { id: 'week', label: 'This week' },
  { id: 'today', label: 'Today' },
];

export const PerformanceDashboardView: React.FC<PerformanceDashboardViewProps> = ({ leadsList }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state } = useFieldStore();
  const user = state.user;
  const [range, setRange] = useState<ChartRange>('mtd');

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
    attendance: mockAttendanceRecords,
  };

  const todayRows = getTodayPerformanceRows(ctx);
  const chartData = getActivityChartData(ctx, range);
  const isPipeline = campaign.ctaType === 'leads';

  return (
    <View style={styles.container}>
      {/* Greeting */}
      <View style={styles.greetingBlock}>
        <Text style={styles.greetingTitle}>{getGreeting(user.name.split(' ')[0])}</Text>
        <Text style={styles.greetingSub}>{user.territory} · {campaign.name}</Text>
      </View>

      {/* Today's Performance Overview */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>TODAY'S PERFORMANCE OVERVIEW</Text>
        {todayRows.map((row) => (
          <View key={row.label} style={styles.perfRow}>
            <View style={styles.perfRowHeader}>
              <Text style={styles.perfLabel}>{row.label}</Text>
              <Text style={styles.perfValue}>{row.valueText}</Text>
            </View>
            {row.progress !== undefined && (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(row.progress * 100)}%` }]} />
              </View>
            )}
          </View>
        ))}
      </Card>

      {/* Sales / Lead Activity Chart */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{isPipeline ? 'LEAD SALES' : 'SALES VOLUME'}</Text>
        <View style={styles.filterRow}>
          {RANGE_OPTIONS.map((opt) => {
            const active = opt.id === range;
            return (
              <Pressable key={opt.id} onPress={() => setRange(opt.id)} style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <MiniBarChart data={chartData} valuePrefix={isPipeline ? '₦' : '₦'} />
      </Card>
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { gap: theme.spacing.md },
  greetingBlock: { gap: 2 },
  greetingTitle: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.textDark },
  greetingSub: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted },
  sectionCard: { backgroundColor: theme.colors.cardWhite, borderColor: theme.colors.cardBorder, gap: theme.spacing.sm },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  perfRow: { gap: 4 },
  perfRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  perfLabel: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
  perfValue: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.textDark },
  track: { height: 6, backgroundColor: theme.colors.fieldFill, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: theme.colors.navy, borderRadius: 3 },
  filterRow: { flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.full, backgroundColor: theme.colors.fieldFill, borderWidth: 1, borderColor: theme.colors.fieldFill },
  filterChipActive: { backgroundColor: theme.colors.navy, borderColor: theme.colors.navy },
  filterChipText: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.textMuted },
  filterChipTextActive: { color: '#FFFFFF', fontFamily: theme.fonts.bold },
});
