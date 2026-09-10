import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Pressable, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { DayRouteNav } from '../components/DayRouteNav';
import { getLeads, getAgentBeats } from '../services/api';
import { useFieldStore } from '../store/useFieldStore';
import { getInitials, getStageColor, formatShortDate } from '../utils/leadDisplay';
import { formatCompactNaira, parseLeadValue } from '../utils/pipelineMetrics';
import { localDateStr } from '../utils/timestamp';
import { RouteName, Lead, RouteAssignment } from '../types';

interface LeadsScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  /** Passed from App.tsx — used as initial data and kept in sync after add/update */
  leadsList?: Lead[];
}

const todayIso = () => localDateStr();

type FilterId = 'all' | 'hot' | 'warm' | 'converted';
const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hot', label: 'Hot' },
  { id: 'warm', label: 'Warm' },
  { id: 'converted', label: 'Converted' },
];

export const LeadsScreen: React.FC<LeadsScreenProps> = ({ onNavigate, leadsList = [] }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state } = useFieldStore();
  const activeCampaign = state.activeCampaign;

  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');

  // Live data from backend — initialise from the prop (mock or parent state)
  const [liveLeads, setLiveLeads] = useState<Lead[]>(leadsList);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchLeads = useCallback(async (silent = false) => {
    if (!activeCampaign?.id) return; // no campaign yet — use prop data
    if (!silent) setLoading(true);
    setFetchError('');
    try {
      const fetched = await getLeads(activeCampaign.id);
      // Always reflects exactly what the server just said, including a real
      // empty list — never leaves a previous (possibly stale, possibly
      // another agent's) lead list sitting there looking current. The merge
      // effect below still re-adds any lead created locally this session.
      setLiveLeads(fetched);
      if (fetched.length === 0 && !silent) setFetchError('No leads are currently assigned to you.');
    } catch (e: any) {
      if (!silent) setFetchError(e?.message || 'Could not load leads.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCampaign?.id]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeads(true);
  };

  // Keep in sync when the parent adds/updates a lead locally
  useEffect(() => {
    setLiveLeads((prev) => {
      const mergeMap = new Map(prev.map((l) => [l.id, l]));
      leadsList.forEach((l) => { if (!mergeMap.has(l.id)) mergeMap.set(l.id, l); });
      return Array.from(mergeMap.values());
    });
  }, [leadsList]);

  // get_agent_beats only feeds DayRouteNav's routeName label for the selected date —
  // it deliberately does NOT filter leads by outletIds/leadIds (that caused every real
  // lead to vanish behind the date picker when this ran on mock ids earlier).
  const [routeAssignments, setRouteAssignments] = useState<RouteAssignment[]>([]);
  useEffect(() => {
    getAgentBeats().then(setRouteAssignments).catch(() => {});
  }, []);

  const query = search.trim().toLowerCase();
  const searched = query
    ? liveLeads.filter((l) =>
        l.name.toLowerCase().includes(query) ||
        l.company.toLowerCase().includes(query) ||
        l.stage.toLowerCase().includes(query)
      )
    : liveLeads;

  const visibleLeads = searched.filter((l) => {
    if (filter === 'hot') return l.score >= 70;
    if (filter === 'warm') return l.score >= 40 && l.score < 70;
    if (filter === 'converted') return l.stage === 'Converted';
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Leads"
        subtitle={`${liveLeads.length} in pipeline`}
        onNavigate={onNavigate}
        variant="navy"
        onSubtitlePress={() => onNavigate('pipelineOverview')}
        rightAction={
          <Pressable onPress={() => onNavigate('leadForm')} style={styles.addBtn}>
            <Icon name="user-plus" size={18} color="#FFFFFF" />
          </Pressable>
        }
      />
      {selectedDate === todayIso() && (
        <View style={styles.todayBanner}>
          <Text style={styles.todayBannerText}>Today</Text>
        </View>
      )}

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.navy} />
          <Text style={styles.loadingText}>Loading leads…</Text>
        </View>
      )}
      {!loading && fetchError !== '' && (
        <View style={styles.errorRow}>
          <Icon name="alert-circle" size={14} color={theme.colors.red} />
          <Text style={styles.errorText}>{fetchError}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.navy} />}
      >
        <DayRouteNav selectedDate={selectedDate} onSelectDate={setSelectedDate} assignments={routeAssignments} />

        <View style={styles.searchBox}>
          <Icon name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, outlet, stage..."
            placeholderTextColor={theme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = f.id === filter;
            return (
              <Pressable key={f.id} onPress={() => setFilter(f.id)} style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Lead List Cards */}
        {visibleLeads.length === 0 && !loading && (
          <Text style={styles.emptyText}>No leads match this view.</Text>
        )}
        {visibleLeads.map((lead) => {
          const stageColor = getStageColor(lead.stage, theme);
          return (
            <Card key={lead.id} style={styles.leadCard} onPress={() => onNavigate('leadDetail', lead)}>
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(lead.name)}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.leadName}>{lead.name}</Text>
                  <Text style={styles.leadCompany}>{lead.company}</Text>
                  <Text style={[styles.leadStage, { color: stageColor }]}>{lead.stage}</Text>
                </View>
                <View style={styles.rightCol}>
                  {lead.value ? (
                    <Text style={styles.leadValue}>{formatCompactNaira(parseLeadValue(lead.value))}</Text>
                  ) : null}
                  <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 100, gap: theme.spacing.sm },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  todayBanner: { backgroundColor: theme.colors.emeraldLight, paddingVertical: 6, alignItems: 'center' },
  todayBannerText: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.emerald, letterSpacing: 0.4 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: 8, backgroundColor: theme.colors.primaryBg },
  loadingText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.navy },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.lg, paddingVertical: 8, backgroundColor: theme.colors.redLight },
  errorText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.red, flex: 1 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.fieldFill, borderWidth: 1, borderColor: theme.colors.fieldFill,
    borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.md, height: 44,
  },
  searchInput: { flex: 1, fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textDark },
  filterRow: { flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: theme.radius.full, backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder },
  filterChipActive: { backgroundColor: theme.colors.navy, borderColor: theme.colors.navy },
  filterChipText: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.textMuted },
  filterChipTextActive: { color: '#FFFFFF', fontFamily: theme.fonts.bold },
  emptyText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: theme.spacing.xl },
  leadCard: { gap: theme.spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.navy },
  info: { flex: 1 },
  leadName: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  leadCompany: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  leadStage: { fontFamily: theme.fonts.semibold, fontSize: 11, marginTop: 2 },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  leadValue: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
});
