import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Icon, IconName } from '../components/Icon';
import { Card } from '../components/Card';
import { useFieldStore } from '../store/useFieldStore';
import { createLead, getOutlets, getItems, getMyOrders, getMySales } from '../services/api';
import { RouteName, LeadDraft } from '../types';

interface SyncScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

/** Rows that pull the agent's current server-side data — no "pending" concept, just a refresh. */
interface ServerDataSet {
  id: 'outlets' | 'products' | 'orders' | 'sales';
  label: string;
  icon: IconName;
  total: number;
}

/** Rows for data captured on-device that hasn't reached the backend yet. */
interface PendingUploadSet {
  id: 'leadDrafts' | 'cartDrafts' | 'surveyDrafts';
  label: string;
  icon: IconName;
  pending: number;
}

export const SyncScreen: React.FC<SyncScreenProps> = ({ onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const [online, setOnline] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [retryingLeadId, setRetryingLeadId] = useState<string | null>(null);

  const cartDraftsPending = state.drafts.length;
  const leadDraftsPending = state.leadDrafts.length;
  const surveyDraftsPending = state.surveys.filter((s) => s.isDraft).length;
  const pendingTotal = cartDraftsPending + leadDraftsPending + surveyDraftsPending;

  const pendingUploadSets: PendingUploadSet[] = [
    { id: 'leadDrafts', label: 'Lead Drafts', icon: 'users', pending: leadDraftsPending },
    { id: 'cartDrafts', label: 'Sale / Order Drafts', icon: 'shopping-bag', pending: cartDraftsPending },
    { id: 'surveyDrafts', label: 'Survey Drafts', icon: 'clipboard-list', pending: surveyDraftsPending },
  ];

  const serverDataSets: ServerDataSet[] = [
    { id: 'outlets', label: 'Outlets / Customers', icon: 'map-pin', total: state.outlets.length },
    { id: 'products', label: 'Products & Inventory', icon: 'package', total: state.products.length },
    { id: 'orders', label: 'Orders', icon: 'shopping-bag', total: state.orders.length },
    { id: 'sales', label: 'Sales', icon: 'target', total: state.sales.length },
  ];

  const done = !syncingAll && pendingTotal === 0;
  const progressPct = online && done ? 100 : Math.max(15, 100 - pendingTotal * 12);

  // Pushes every queued lead draft to the server. Cart and survey drafts
  // can't be pushed blind — a sale/order moves real money and stock, and a
  // survey needs its answers reviewed — so those stay "tap to review" only.
  const pushLeadDrafts = async (): Promise<{ synced: number; failed: number }> => {
    let synced = 0;
    let failed = 0;
    for (const draft of state.leadDrafts) {
      try {
        await createLead(draft.campaignId, {
          name: draft.name,
          company: draft.company,
          phone: draft.phone,
          email: draft.email,
          address: draft.address,
          source: draft.source,
          notes: draft.notes,
        });
        dispatch({ type: 'DELETE_LEAD_DRAFT', draftId: draft.id });
        synced++;
      } catch {
        failed++;
      }
    }
    return { synced, failed };
  };

  const pullServerData = async () => {
    const campaignId = state.activeCampaign?.id;
    const [outletsRes, productsRes, ordersRes, salesRes] = await Promise.allSettled([
      campaignId ? getOutlets(campaignId) : Promise.resolve([]),
      getItems(),
      getMyOrders(),
      getMySales(),
    ]);
    // Always reflects exactly what the server just said for each dataset that
    // actually came back (a rejected promise is a real failure — leave that
    // one alone), including a real empty list — never leaves a previous
    // (possibly stale) dataset sitting there looking current.
    if (outletsRes.status === 'fulfilled') {
      dispatch({ type: 'SET_OUTLETS', outlets: outletsRes.value });
    }
    if (productsRes.status === 'fulfilled') {
      dispatch({ type: 'SET_PRODUCTS', products: productsRes.value });
    }
    if (ordersRes.status === 'fulfilled') {
      dispatch({ type: 'SET_ORDERS', orders: ordersRes.value });
    }
    if (salesRes.status === 'fulfilled') {
      dispatch({ type: 'SET_SALES', sales: salesRes.value });
    }
  };

  const handleSyncAll = async () => {
    if (!online || syncingAll) return;
    setSyncingAll(true);
    try {
      const { synced, failed } = await pushLeadDrafts();
      await pullServerData();
      const parts: string[] = [];
      if (synced > 0) parts.push(`${synced} lead${synced === 1 ? '' : 's'} uploaded`);
      if (failed > 0) parts.push(`${failed} lead${failed === 1 ? '' : 's'} still pending`);
      parts.push('server data refreshed');
      Alert.alert('Sync Complete', parts.join(' · '));
    } catch (e: any) {
      Alert.alert('Sync Failed', e?.message || 'Could not reach the server. Please try again.');
    } finally {
      setSyncingAll(false);
    }
  };

  const runServerSync = async (id: ServerDataSet['id']) => {
    if (!online || syncingId) return;
    setSyncingId(id);
    try {
      // Always reflects exactly what the server just said, including a real
      // empty list — a manual "sync now" that comes back empty should say so,
      // not silently leave the previous (possibly stale) data in place.
      if (id === 'outlets') {
        const campaignId = state.activeCampaign?.id;
        if (campaignId) {
          const fetched = await getOutlets(campaignId);
          dispatch({ type: 'SET_OUTLETS', outlets: fetched });
        }
      } else if (id === 'products') {
        const fetched = await getItems();
        dispatch({ type: 'SET_PRODUCTS', products: fetched });
      } else if (id === 'orders') {
        const fetched = await getMyOrders();
        dispatch({ type: 'SET_ORDERS', orders: fetched });
      } else if (id === 'sales') {
        const fetched = await getMySales();
        dispatch({ type: 'SET_SALES', sales: fetched });
      }
    } catch (e: any) {
      Alert.alert('Refresh Failed', e?.message || 'Could not refresh this data.');
    } finally {
      setSyncingId(null);
    }
  };

  const runLeadDraftSync = async () => {
    if (!online || syncingId) return;
    setSyncingId('leadDrafts');
    try {
      const { synced, failed } = await pushLeadDrafts();
      if (synced > 0 || failed > 0) {
        Alert.alert('Lead Drafts Synced', `${synced} uploaded${failed > 0 ? `, ${failed} still pending` : ''}.`);
      }
    } finally {
      setSyncingId(null);
    }
  };

  const retryLeadDraft = async (draft: LeadDraft) => {
    if (!online) return;
    setRetryingLeadId(draft.id);
    try {
      await createLead(draft.campaignId, {
        name: draft.name,
        company: draft.company,
        phone: draft.phone,
        email: draft.email,
        address: draft.address,
        source: draft.source,
        notes: draft.notes,
      });
      dispatch({ type: 'DELETE_LEAD_DRAFT', draftId: draft.id });
      Alert.alert('Synced', `Lead "${draft.name}" uploaded successfully.`);
    } catch (e: any) {
      Alert.alert('Retry Failed', e?.message || 'Could not sync this lead. Will try again later.');
    } finally {
      setRetryingLeadId(null);
    }
  };

  const heroIcon: IconName = !online ? 'wifi' : done ? 'check-circle' : 'refresh';
  const heroTint = !online ? theme.colors.amber : done ? theme.colors.emerald : theme.colors.navy;
  const heroBg = !online ? theme.colors.amberLight : done ? theme.colors.emeraldLight : theme.colors.tintTeal;
  const heroText = !online
    ? `Offline · ${pendingTotal} queued`
    : syncingAll
    ? 'Syncing…'
    : done
    ? 'All up to date'
    : `${pendingTotal} item${pendingTotal === 1 ? '' : 's'} pending upload`;

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Synchronization" subtitle="Offline queue and server upload" onNavigate={onNavigate} onBackPress={() => onNavigate('home')} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={[styles.heroIconBox, { backgroundColor: heroBg }]}>
            <Icon name={heroIcon} size={30} color={heroTint} />
          </View>
          <Text style={styles.heroText}>{heroText}</Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>

          <Pressable
            onPress={handleSyncAll}
            disabled={syncingAll || !online}
            style={[styles.syncAllBtn, (syncingAll || !online) && styles.syncAllBtnDisabled]}
          >
            <Text style={styles.syncAllBtnText}>{syncingAll ? 'Please wait' : 'Sync all'}</Text>
          </Pressable>

          <Pressable onPress={() => setOnline((v) => !v)} style={styles.offlineToggle}>
            <Icon name="wifi" size={16} color={theme.colors.textDark} />
            <Text style={styles.offlineToggleText}>{online ? 'Simulate going offline' : 'Restore connectivity'}</Text>
          </Pressable>
        </View>

        {/* Lead Drafts — the only draft type that can be safely pushed automatically */}
        {leadDraftsPending > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LEAD DRAFTS ({leadDraftsPending})</Text>
            {state.leadDrafts.map((draft) => (
              <Card key={draft.id} style={styles.draftCard}>
                <View style={[styles.draftIcon, { backgroundColor: theme.colors.tintTeal }]}>
                  <Icon name="users" size={18} color={theme.colors.tintTealIcon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.draftTitle}>{draft.name} · {draft.company}</Text>
                  <Text style={styles.draftSub}>{draft.phone} · Created {draft.createdAt}</Text>
                </View>
                <Pressable
                  onPress={() => retryLeadDraft(draft)}
                  disabled={!online || retryingLeadId === draft.id}
                  style={styles.retryBtn}
                >
                  <Icon name="refresh" size={14} color={online ? theme.colors.navy : theme.colors.textMuted} />
                  <Text style={[styles.retryBtnText, !online && { color: theme.colors.textMuted }]}> Retry</Text>
                </Pressable>
              </Card>
            ))}
          </View>
        )}

        <Text style={styles.sectionLabel}>PENDING UPLOAD</Text>
        <View style={styles.list}>
          {pendingUploadSets.map((ds) => {
            const isSyncing = syncingId === ds.id;
            const hasPending = ds.pending > 0;
            // Cart and survey drafts need the agent to review/finish them —
            // tapping takes them to that screen instead of auto-submitting.
            const goToDrafts = () => onNavigate('draftsList');
            const onPress = ds.id === 'leadDrafts' ? runLeadDraftSync : goToDrafts;
            return (
              <View key={ds.id} style={styles.dsCard}>
                <View style={styles.dsRow}>
                  <View style={styles.dsIconBox}>
                    <Icon name={ds.icon} size={16} color={theme.colors.navy} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.dsLabel}>{ds.label}</Text>
                    <Text style={styles.dsMeta}>{ds.pending} pending</Text>
                  </View>
                  <Pressable
                    onPress={onPress}
                    disabled={isSyncing || !hasPending}
                    style={styles.dsRefreshBtn}
                  >
                    <Icon
                      name={ds.id === 'leadDrafts' ? 'refresh' : 'chevron-right'}
                      size={15}
                      color={isSyncing ? theme.colors.navy : theme.colors.textMuted}
                    />
                  </Pressable>
                </View>
                <View style={[styles.dsBar, hasPending ? styles.dsBarPending : styles.dsBarDone]}>
                  <View style={[styles.dsBarFill, hasPending ? styles.dsBarFillPending : styles.dsBarFillDone, isSyncing && styles.dsBarFillSyncing]} />
                </View>
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>SERVER DATA</Text>
        <View style={styles.list}>
          {serverDataSets.map((ds) => {
            const isSyncing = syncingId === ds.id;
            return (
              <View key={ds.id} style={styles.dsCard}>
                <View style={styles.dsRow}>
                  <View style={styles.dsIconBox}>
                    <Icon name={ds.icon} size={16} color={theme.colors.navy} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.dsLabel}>{ds.label}</Text>
                    <Text style={styles.dsMeta}>{ds.total} records loaded</Text>
                  </View>
                  <Pressable
                    onPress={() => runServerSync(ds.id)}
                    disabled={isSyncing || !online}
                    style={styles.dsRefreshBtn}
                  >
                    <Icon name="refresh" size={15} color={isSyncing ? theme.colors.navy : theme.colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  scroll: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.lg },
  flex1: { flex: 1 },

  heroCard: {
    backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.xl, padding: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.sm,
  },
  heroIconBox: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  heroText: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark, marginTop: 4 },
  progressTrack: { width: '100%', height: 8, borderRadius: 4, backgroundColor: theme.colors.fieldFill, overflow: 'hidden', marginTop: theme.spacing.sm },
  progressFill: { height: '100%', backgroundColor: theme.colors.navy, borderRadius: 4 },
  syncAllBtn: {
    marginTop: theme.spacing.md, height: 48, paddingHorizontal: theme.spacing.xl, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.navy, alignItems: 'center', justifyContent: 'center',
  },
  syncAllBtnDisabled: { backgroundColor: theme.colors.fieldFill },
  syncAllBtnText: { fontFamily: theme.fonts.bold, fontSize: 14, color: '#FFFFFF' },
  offlineToggle: {
    marginTop: theme.spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 44, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.fieldFill, borderWidth: 1, borderColor: theme.colors.fieldBorder,
  },
  offlineToggleText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },

  sectionLabel: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  list: { gap: theme.spacing.sm, marginTop: -theme.spacing.sm },
  dsCard: {
    backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.lg, padding: theme.spacing.md,
  },
  dsRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dsIconBox: { width: 34, height: 34, borderRadius: theme.radius.sm, backgroundColor: theme.colors.tintTeal, alignItems: 'center', justifyContent: 'center' },
  dsLabel: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  dsMeta: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  dsRefreshBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center' },
  dsBar: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: theme.spacing.sm },
  dsBarPending: { backgroundColor: theme.colors.amberLight },
  dsBarDone: { backgroundColor: theme.colors.emeraldLight },
  dsBarFill: { height: '100%', width: '100%', borderRadius: 3 },
  dsBarFillPending: { backgroundColor: theme.colors.amber },
  dsBarFillDone: { backgroundColor: theme.colors.emerald },
  dsBarFillSyncing: { backgroundColor: theme.colors.navy },
  section: { gap: theme.spacing.xs },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  draftCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.radius.lg, padding: theme.spacing.md },
  draftIcon: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  draftTitle: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  draftSub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.tintTeal, borderRadius: theme.radius.full, paddingHorizontal: 12, paddingVertical: 8 },
  retryBtnText: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.navy },
});
