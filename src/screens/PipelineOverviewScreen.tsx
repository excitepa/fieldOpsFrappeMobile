import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { getLeads } from '../services/api';
import { useFieldStore } from '../store/useFieldStore';
import { RouteName, Lead } from '../types';
import { formatShortDate } from '../utils/leadDisplay';
import {
  getWeightedPipelineValue, getOverdueLeads, getStageBreakdown, getConversionRate,
  getAvgAgeDays, formatCompactNaira, FUNNEL_STAGES,
} from '../utils/pipelineMetrics';

interface PipelineOverviewScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  leadsList?: Lead[];
}

export const PipelineOverviewScreen: React.FC<PipelineOverviewScreenProps> = ({ onNavigate, leadsList = [] }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state } = useFieldStore();
  const activeCampaign = state.activeCampaign;

  const [liveLeads, setLiveLeads] = useState<Lead[]>(leadsList);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeads = useCallback(async (silent = false) => {
    if (!activeCampaign?.id) return;
    if (!silent) setLoading(true);
    try {
      const fetched = await getLeads(activeCampaign.id);
      // Always reflects exactly what the server just said, including a real
      // empty list — never leaves a previous (possibly stale, possibly
      // another agent's) lead list sitting there looking current.
      setLiveLeads(fetched);
    } catch {
      // Non-fatal: keep showing existing data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCampaign?.id]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Keep in sync when parent adds a lead
  useEffect(() => {
    setLiveLeads((prev) => {
      const mergeMap = new Map(prev.map((l) => [l.id, l]));
      leadsList.forEach((l) => { if (!mergeMap.has(l.id)) mergeMap.set(l.id, l); });
      return Array.from(mergeMap.values());
    });
  }, [leadsList]);

  const weightedValue = getWeightedPipelineValue(liveLeads);
  const overdue = getOverdueLeads(liveLeads);
  const stages = getStageBreakdown(liveLeads);
  const conversionRate = getConversionRate(liveLeads);
  const avgAge = getAvgAgeDays(liveLeads);

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Lead Pipeline" subtitle={`${liveLeads.length} leads`} onNavigate={onNavigate} />

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.navy} />
          <Text style={styles.loadingText}>Refreshing pipeline…</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLeads(true); }} tintColor={theme.colors.navy} />}
      >
        {/* Weighted Value Card */}
        <Card style={styles.weightedCard}>
          <Text style={styles.weightedLabel}>WEIGHTED PIPELINE VALUE</Text>
          <Text style={styles.weightedValue}>{formatCompactNaira(weightedValue)}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Icon name="trending-up" size={13} color="#FFFFFF" />
              <View>
                <Text style={styles.statPillLabel}>Conversion</Text>
                <Text style={styles.statPillVal}>{Math.round(conversionRate * 100)}%</Text>
              </View>
            </View>
            <View style={styles.statPill}>
              <Icon name="clock" size={13} color="#FFFFFF" />
              <View>
                <Text style={styles.statPillLabel}>Avg Age</Text>
                <Text style={styles.statPillVal}>{avgAge}d</Text>
              </View>
            </View>
            <View style={styles.statPill}>
              <Icon name="alert-circle" size={13} color="#FFFFFF" />
              <View>
                <Text style={styles.statPillLabel}>Overdue</Text>
                <Text style={styles.statPillVal}>{overdue.length}</Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Overdue Follow-ups */}
        {overdue.length > 0 && (
          <Card style={styles.overdueSection}>
            <Text style={styles.overdueSectionTitle}>OVERDUE FOLLOW-UPS</Text>
            {overdue.map((lead) => (
              <Pressable key={lead.id} onPress={() => onNavigate('leadDetail', lead)} style={styles.overdueRow}>
                <View style={styles.flex1}>
                  <Text style={styles.overdueName}>{lead.name}</Text>
                  <Text style={styles.overdueDue}>Due {formatShortDate(lead.nextActionDate)}</Text>
                </View>
                <Icon name="chevron-right" size={16} color={theme.colors.red} />
              </Pressable>
            ))}
          </Card>
        )}

        {/* Pipeline Stages */}
        {stages.map((s) => {
          const isFunnelStage = FUNNEL_STAGES.includes(s.stage);
          return (
            <Card key={s.stage} style={styles.stageCard}>
              <View style={styles.stageTopRow}>
                <Text style={styles.stageName}>{s.stage}</Text>
                {isFunnelStage && (
                  <Text style={styles.stagePctToNext}>{Math.round(s.pctToNextStage * 100)}% to next stage</Text>
                )}
              </View>
              <Text style={styles.stageMeta}>
                {s.count} LEAD{s.count === 1 ? '' : 'S'} · {Math.round(s.pctOfTotal * 100)}% OF TOTAL · AVG {s.avgAgeDays}D IN STAGE
              </Text>

              {isFunnelStage && (
                <View style={styles.stageTrack}>
                  <View style={[styles.stageFill, { width: `${Math.round(s.pctToNextStage * 100)}%` }]} />
                </View>
              )}

              {s.leads.length === 0 ? (
                <Text style={styles.noLeadsText}>No leads in this stage.</Text>
              ) : (
                s.leads.map((lead) => (
                  <Pressable key={lead.id} onPress={() => onNavigate('leadDetail', lead)} style={styles.stageLeadRow}>
                    <View style={styles.flex1}>
                      <Text style={styles.stageLeadName}>{lead.name}</Text>
                      <Text style={styles.stageLeadCompany}>{lead.company}</Text>
                    </View>
                    <Icon name="chevron-right" size={16} color={theme.colors.textMuted} />
                  </Pressable>
                ))
              )}
            </Card>
          );
        })}

        {stages.length === 0 && !loading && (
          <Text style={styles.noLeadsText}>No pipeline data yet. Start capturing leads!</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.md },
  flex1: { flex: 1 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: 8, backgroundColor: theme.colors.primaryBg },
  loadingText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.navy },
  weightedCard: { backgroundColor: theme.colors.navy, borderColor: theme.colors.navy, gap: 4 },
  weightedLabel: { fontFamily: theme.fonts.bold, fontSize: 10, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.8 },
  weightedValue: { fontFamily: theme.fonts.display, fontSize: 30, color: '#FFFFFF', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  statPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: theme.radius.md, padding: 8,
  },
  statPillLabel: { fontFamily: theme.fonts.regular, fontSize: 9, color: 'rgba(255,255,255,0.8)' },
  statPillVal: { fontFamily: theme.fonts.bold, fontSize: 13, color: '#FFFFFF' },
  overdueSection: { backgroundColor: theme.colors.redLight, borderColor: theme.colors.red, gap: theme.spacing.xs },
  overdueSectionTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.red, letterSpacing: 0.8, marginBottom: 2 },
  overdueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  overdueName: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  overdueDue: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.red, marginTop: 1 },
  stageCard: { gap: 6 },
  stageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stageName: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  stagePctToNext: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.navy },
  stageMeta: { fontFamily: theme.fonts.semibold, fontSize: 10, color: theme.colors.textMuted, letterSpacing: 0.3 },
  stageTrack: { height: 6, backgroundColor: theme.colors.cardBorder, borderRadius: 3, overflow: 'hidden', marginTop: 2 },
  stageFill: { height: '100%', backgroundColor: theme.colors.navy, borderRadius: 3 },
  noLeadsText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.amber, marginTop: 4 },
  stageLeadRow: { flexDirection: 'row', alignItems: 'center', paddingTop: theme.spacing.sm, marginTop: 4, borderTopWidth: 1, borderTopColor: theme.colors.cardBorder },
  stageLeadName: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.textDark },
  stageLeadCompany: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
});
