import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { DayRouteNav } from '../components/DayRouteNav';
import { useFieldStore } from '../store/useFieldStore';
import { getOutlets, getAgentBeats } from '../services/api';
import { RouteName, OutletStatus, RouteAssignment } from '../types';

interface OutletsScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const OutletsScreen: React.FC<OutletsScreenProps> = ({ onNavigate }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const activeCampaign = state.activeCampaign;
  const [selectedDate, setSelectedDate] = useState(todayIso());
  // get_agent_beats only feeds DayRouteNav's routeName label for the selected date —
  // it deliberately does NOT filter outlets by outletIds/leadIds (that caused every
  // real outlet to vanish behind the date picker when this ran on mock ids earlier).
  const [routeAssignments, setRouteAssignments] = useState<RouteAssignment[]>([]);
  useEffect(() => {
    getAgentBeats().then(setRouteAssignments).catch(() => {});
  }, []);
  const outlets = state.outlets;
  const isToday = selectedDate === todayIso();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchOutlets = useCallback(async (silent = false) => {
    if (!activeCampaign?.id) return;
    if (!silent) setLoading(true);
    setFetchError('');
    try {
      const fetched = await getOutlets(activeCampaign.id);
      // Always reflects exactly what the server just said, including a real
      // empty list — never leaves a previous (possibly stale, possibly
      // another agent's) outlet list sitting there looking current.
      dispatch({ type: 'SET_OUTLETS', outlets: fetched });
      if (fetched.length === 0 && !silent) setFetchError('No outlets are currently assigned to you.');
    } catch (e: any) {
      if (!silent) setFetchError(e?.message || 'Could not load outlets.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCampaign?.id, dispatch]);

  useEffect(() => { fetchOutlets(); }, [fetchOutlets]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOutlets(true);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'today' | 'pending' | 'visited' | 'skipped'>('all');
  const [sortAlpha, setSortAlpha] = useState(true);

  // Counts
  const totalCount = outlets.length;
  const visitedCount = outlets.filter((o) => o.status === 'visited').length;
  const pendingCount = outlets.filter((o) => o.status === 'pending').length;
  const skippedCount = outlets.filter((o) => o.status === 'skipped').length;
  const scheduledTodayCount = outlets.filter((o) => o.isScheduledToday).length;

  // Filtered outlets
  let filtered = outlets.filter((o) => {
    const matchesSearch =
      o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.type.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (activeFilter === 'all') return true;
    if (activeFilter === 'today') return !!o.isScheduledToday;
    return o.status === activeFilter;
  });

  if (activeFilter === 'today') {
    // Web-planned visit order for today's beat, when the backend sent one.
    filtered = [...filtered].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  } else if (sortAlpha) {
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }

  const visitedLabel = (status: OutletStatus) => {
    switch (status) {
      case 'visited':
        return { label: 'Visited', color: theme.colors.visitedText };
      case 'skipped':
        return { label: 'Skipped', color: theme.colors.skippedText };
      default:
        return { label: 'Not visited yet', color: theme.colors.textMuted };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Customers"
        onNavigate={onNavigate}
        rightAction={
          <Pressable onPress={() => setShowSearch((v) => !v)} style={styles.searchIconBtn}>
            <Icon name="search" size={18} color={theme.colors.textDark} />
          </Pressable>
        }
      />

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.navy} />
          <Text style={styles.loadingText}>Loading outlets…</Text>
        </View>
      )}
      {!loading && fetchError !== '' && (
        <View style={styles.errorRow}>
          <Icon name="alert-circle" size={14} color={theme.colors.red} />
          <Text style={styles.errorText}>{fetchError}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.navy} />}
      >
        {isToday && (
          <View style={styles.todayBanner}>
            <Text style={styles.todayBannerText}>Today</Text>
          </View>
        )}

        <DayRouteNav selectedDate={selectedDate} onSelectDate={setSelectedDate} assignments={routeAssignments} />

        {/* Search Bar — hidden until the header search icon is tapped */}
        {showSearch && (
          <View style={styles.searchBox}>
            <Icon name="search" size={18} color={theme.colors.textMuted} />
            <TextInput
              autoFocus
              style={styles.searchInput}
              placeholder="Search outlet by name"
              placeholderTextColor={theme.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')}>
                <Icon name="x" size={16} color={theme.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        )}

        {/* Filter Pills Row */}
        <View style={styles.filterRow}>
          <View style={styles.filterIconBox}>
            <Icon name="filter" size={16} color={theme.colors.textMuted} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
            <Pressable
              onPress={() => setActiveFilter('all')}
              style={[styles.pill, activeFilter === 'all' && styles.pillActive]}
            >
              <Text style={[styles.pillText, activeFilter === 'all' && styles.pillTextActive]}>
                All
              </Text>
            </Pressable>

            {scheduledTodayCount > 0 && (
              <Pressable
                onPress={() => setActiveFilter('today')}
                style={[styles.pill, activeFilter === 'today' && styles.pillActive]}
              >
                <Text style={[styles.pillText, activeFilter === 'today' && styles.pillTextActive]}>
                  On Today's Beat ({scheduledTodayCount})
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => setActiveFilter('pending')}
              style={[styles.pill, activeFilter === 'pending' && styles.pillActive]}
            >
              <Text style={[styles.pillText, activeFilter === 'pending' && styles.pillTextActive]}>
                Pending ({pendingCount})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveFilter('visited')}
              style={[styles.pill, activeFilter === 'visited' && styles.pillActive]}
            >
              <Text style={[styles.pillText, activeFilter === 'visited' && styles.pillTextActive]}>
                Visited ({visitedCount})
              </Text>
            </Pressable>

            {skippedCount > 0 && (
              <Pressable
                onPress={() => setActiveFilter('skipped')}
                style={[styles.pill, activeFilter === 'skipped' && styles.pillActive]}
              >
                <Text style={[styles.pillText, activeFilter === 'skipped' && styles.pillTextActive]}>
                  Skipped ({skippedCount})
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>

        {/* Sort + Add Outlet Row */}
        <View style={styles.sortRow}>
          <Pressable onPress={() => setSortAlpha(!sortAlpha)} style={styles.sortToggle}>
            <Icon name="sliders" size={14} color={theme.colors.textMuted} />
            <Text style={styles.sortText}>
              {sortAlpha ? 'Alphabetical' : 'Default Sort'}
            </Text>
          </Pressable>

          <Button
            title="Add Outlet"
            onPress={() => onNavigate('addOutlet')}
            variant="navy"
            size="small"
            iconName="store"
          />
        </View>

        {/* Outlets List */}
        {filtered.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Icon name="store" size={32} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>No Outlets Found</Text>
            <Text style={styles.emptySub}>No outlets match your search or selected filter.</Text>
          </Card>
        ) : (
          <View style={styles.list}>
            {filtered.map((item) => {
              const visited = visitedLabel(item.status);

              return (
                <Card
                  key={item.id}
                  style={styles.outletCard}
                  onPress={() => onNavigate('outletDetail', { outletId: item.id })}
                >
                  <View style={styles.cardContent}>
                    <View style={styles.storeIconCircle}>
                      <Icon name="store" size={20} color={theme.colors.navy} />
                    </View>

                    <View style={styles.outletInfo}>
                      <View style={styles.outletNameRow}>
                        <Text style={styles.outletName} numberOfLines={1}>{item.name}</Text>
                        {item.isScheduledToday && (
                          <View style={styles.todayPill}>
                            <Text style={styles.todayPillText}>Today</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.outletSub} numberOfLines={1}>{item.area} · {item.type}</Text>
                    </View>

                    <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
                  </View>

                  <View style={styles.statusRow}>
                    <Text style={styles.statusText}>{item.isOpen ? 'Open' : 'Closed'}</Text>
                    <Text style={[styles.statusText, { color: visited.color }]}>{visited.label}</Text>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  scroll: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: 100, gap: theme.spacing.md },
  searchIconBtn: {
    width: 40, height: 40, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center',
  },
  todayBanner: { backgroundColor: theme.colors.visitedBg, borderRadius: theme.radius.sm, paddingVertical: 6, alignItems: 'center' },
  todayBannerText: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.visitedText },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: 8, backgroundColor: theme.colors.primaryBg },
  loadingText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.navy },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.lg, paddingVertical: 8, backgroundColor: theme.colors.redLight },
  errorText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.red, flex: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.fieldFill,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.textDark,
  },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  filterIconBox: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center' },
  pillsContainer: { flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center' },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.full, backgroundColor: theme.colors.fieldFill },
  pillActive: { backgroundColor: theme.colors.navy },
  pillText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textMuted },
  pillTextActive: { color: '#FFFFFF', fontFamily: theme.fonts.bold },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  list: { gap: theme.spacing.sm },
  outletCard: { backgroundColor: theme.colors.cardWhite, borderColor: theme.colors.cardBorder, padding: theme.spacing.md, gap: theme.spacing.sm },
  cardContent: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  storeIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center' },
  outletInfo: { flex: 1, gap: 2 },
  outletNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  todayPill: { backgroundColor: theme.colors.visitedBg, borderRadius: theme.radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  todayPillText: { fontFamily: theme.fonts.bold, fontSize: 9, color: theme.colors.visitedText },
  outletName: { flexShrink: 1, fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark },
  outletSub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.cardBorder, paddingTop: theme.spacing.sm },
  statusText: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.textMuted },
  emptyCard: { alignItems: 'center', paddingVertical: 40, gap: theme.spacing.sm, backgroundColor: theme.colors.cardWhite, borderColor: theme.colors.cardBorder },
  emptyTitle: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark },
  emptySub: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
});
