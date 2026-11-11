import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Icon, IconName } from '../components/Icon';
import { Card } from '../components/Card';
import { useFieldStore } from '../store/useFieldStore';
import { getOutlets, getItems, getLeads, getMyOrders, getMySales, OUTLETS_CAP } from '../services/api';
import {
  pushLeadDrafts, pushCartDrafts, pushSurveyDrafts, pushOutletDrafts, pushSurveyPhotos, pushQueuedActions, pushAllDrafts,
  pullServerData as pullServerDataShared, summariseSyncErrors, syncNow, queueState, syncStatusText,
  DownloadList, DownloadProgress,
} from '../utils/offlineSync';
import { isMine } from '../utils/queue';
import { RouteName, LeadDraft } from '../types';

interface SyncScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

/** Rows that pull the agent's current server-side data — no "pending" concept, just a refresh. */
interface ServerDataSet {
  id: 'outlets' | 'products' | 'leads' | 'orders' | 'sales';
  label: string;
  icon: IconName;
  total: number;
}

/** What a list that comes down a page at a time is called while it does ("Outlets: 400…"). */
const DOWNLOAD_NAMES: Record<DownloadList, string> = { outlets: 'Outlets', products: 'Products', leads: 'Leads' };

/** Rows for data captured on-device that hasn't reached the backend yet. */
interface PendingUploadSet {
  id: 'leadDrafts' | 'cartDrafts' | 'surveyDrafts' | 'outletDrafts' | 'surveyPhotos' | 'queuedActions';
  label: string;
  icon: IconName;
  pending: number;
}

export const SyncScreen: React.FC<SyncScreenProps> = ({ onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const stateRef = useRef(state);
  stateRef.current = state;
  const queue = queueState(state);
  const [online, setOnline] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [retryingLeadId, setRetryingLeadId] = useState<string | null>(null);
  // How many of each paged list have come down so far, while they're coming.
  const [downloaded, setDownloaded] = useState<Partial<Record<DownloadList, number>>>({});
  const onProgress: DownloadProgress = (list, count) => setDownloaded((d) => ({ ...d, [list]: count }));
  const downloadText = (Object.keys(downloaded) as DownloadList[])
    .map((list) => `${DOWNLOAD_NAMES[list]}: ${downloaded[list]!.toLocaleString()}`)
    .join(' · ');

  const cartDraftsPending = state.drafts.length;
  const refusedCartDrafts = state.drafts.filter((d) => d.syncError);
  const unsentSurveyDrafts = state.surveys.filter((s) => s.isDraft && s.syncError);
  const leadDraftsPending = state.leadDrafts.length;
  const surveyDraftsList = state.surveys.filter((s) => s.isDraft);
  const surveyDraftsPending = surveyDraftsList.length;
  const outletDraftsPending = state.outletDrafts.length;
  const surveyPhotosPending = state.pendingSurveyPhotos.length;
  const queuedActionsPending = state.queuedActions.length;
  const pendingTotal = cartDraftsPending + leadDraftsPending + surveyDraftsPending + outletDraftsPending + surveyPhotosPending + queuedActionsPending;

  const pendingUploadSets: PendingUploadSet[] = [
    { id: 'leadDrafts', label: 'Lead Drafts', icon: 'users', pending: leadDraftsPending },
    { id: 'cartDrafts', label: 'Sale / Order Drafts', icon: 'shopping-bag', pending: cartDraftsPending },
    { id: 'surveyDrafts', label: 'Survey Drafts', icon: 'clipboard-list', pending: surveyDraftsPending },
    { id: 'outletDrafts', label: 'Outlet Drafts', icon: 'map-pin', pending: outletDraftsPending },
    { id: 'surveyPhotos', label: 'Survey Photos', icon: 'camera', pending: surveyPhotosPending },
    { id: 'queuedActions', label: 'Skips, Stage Changes & Stock Requests', icon: 'clock', pending: queuedActionsPending },
  ];

  const serverDataSets: ServerDataSet[] = [
    { id: 'outlets', label: 'Outlets / Customers', icon: 'map-pin', total: state.outlets.length },
    { id: 'products', label: 'Products & Inventory', icon: 'package', total: state.products.length },
    { id: 'leads', label: 'Leads', icon: 'users', total: state.leads.length },
    { id: 'orders', label: 'Orders', icon: 'shopping-bag', total: state.orders.length },
    { id: 'sales', label: 'Sales', icon: 'target', total: state.sales.length },
  ];

  const done = !syncingAll && pendingTotal === 0;
  const progressPct = online && done ? 100 : Math.max(15, 100 - pendingTotal * 12);

  const pullServerData = () => pullServerDataShared(state.activeCampaign?.id, dispatch);

  // Everything this agent has waiting, refused items and carts saved for
  // later included (sending on its own leaves those), then the lists refreshed.
  // The same routine that runs on its own, so the two never overlap.
  const handleSyncAll = async () => {
    if (!online || syncingAll) return;
    setSyncingAll(true);
    try {
      const outcome = await syncNow({ getState: () => stateRef.current, dispatch, manual: true, refresh: true, onProgress });
      if (outcome.needsSignIn) {
        Alert.alert('Sign In Again', 'Your login has expired. Sign in again to send your work: it stays saved on this phone.');
        return;
      }
      const parts: string[] = [];
      if (outcome.sent > 0) parts.push(`${outcome.sent} item${outcome.sent === 1 ? '' : 's'} uploaded`);
      if (outcome.failed > 0) parts.push(`${outcome.failed} item${outcome.failed === 1 ? '' : 's'} still pending`);
      if (!outcome.offline) parts.push('server data refreshed');
      // Show why anything was rejected rather than just a count.
      const lines = [parts.join(' · ')];
      if (outcome.notices.length > 0) lines.push('', ...outcome.notices);
      if (outcome.errors.length > 0) lines.push('', summariseSyncErrors(outcome.errors));
      Alert.alert(outcome.failed > 0 && outcome.sent === 0 ? 'Nothing Could Be Synced' : 'Sync Complete', lines.join('\n'));
    } catch (e: any) {
      Alert.alert('Sync Failed', e?.message || 'Could not reach the server. Please try again.');
    } finally {
      setSyncingAll(false);
      setDownloaded({});
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
          const fetched = await getOutlets(campaignId, { onProgress: (count) => onProgress('outlets', count) });
          dispatch({ type: 'SET_OUTLETS', outlets: fetched });
        }
      } else if (id === 'products') {
        const fetched = await getItems({ onProgress: (count) => onProgress('products', count) });
        dispatch({ type: 'SET_PRODUCTS', products: fetched });
      } else if (id === 'leads') {
        const fetched = await getLeads(state.activeCampaign?.id || '', { onProgress: (count) => onProgress('leads', count) });
        dispatch({ type: 'SET_LEADS', leads: fetched });
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
      setDownloaded({});
    }
  };

  // One real push per category — every pending-upload row can now sync itself
  // directly, not just Lead Drafts.
  const runDraftSync = async (id: PendingUploadSet['id']) => {
    if (!online || syncingId) return;
    setSyncingId(id);
    try {
      const fallbackCampaignId = state.activeCampaign?.id || '';
      // Only what this agent made: another agent's items wait for them.
      const mine = <T extends { agentEmail?: string }>(items: T[]) => items.filter((i) => isMine(i, state.user.email));
      // A survey can follow an outlet edit that hasn't synced: the edit goes
      // first, so the survey it made due isn't left due.
      if (id === 'surveyDrafts' && state.outletDrafts.length > 0) await pushOutletDrafts(mine(state.outletDrafts), dispatch);
      const result = id === 'leadDrafts' ? await pushLeadDrafts(mine(state.leadDrafts), dispatch)
        : id === 'cartDrafts' ? await pushCartDrafts(mine(state.drafts), dispatch, fallbackCampaignId, state.products)
        : id === 'surveyDrafts' ? await pushSurveyDrafts(mine(surveyDraftsList), dispatch)
        : id === 'surveyPhotos' ? await pushSurveyPhotos(state.pendingSurveyPhotos, dispatch)
        : id === 'queuedActions' ? await pushQueuedActions(mine(state.queuedActions), dispatch)
        : await pushOutletDrafts(mine(state.outletDrafts), dispatch);
      if (result.synced > 0 || result.failed > 0) {
        const lines = [`${result.synced} uploaded${result.failed > 0 ? `, ${result.failed} still pending` : ''}.`];
        if (result.errors.length > 0) lines.push('', summariseSyncErrors(result.errors));
        // A free item the server gave in place of the one chosen.
        const notices = id === 'cartDrafts' ? (result as { notices?: string[] }).notices || [] : [];
        if (notices.length > 0) lines.push('', ...notices);
        Alert.alert(
          result.failed > 0 && result.synced === 0 ? 'Nothing Could Be Synced' : 'Synced',
          lines.join('\n'),
        );
      }
      if (id === 'outletDrafts' && result.synced > 0) {
        // Reconciles the optimistic local outlet(s) with their real synced
        // versions rather than leaving temp-id duplicates in the list.
        // Non-essential: a failure here must not surface as an error, the
        // drafts themselves already went up fine.
        try {
          const campaignId = state.activeCampaign?.id;
          if (campaignId) {
            const fetched = await getOutlets(campaignId);
            dispatch({ type: 'SET_OUTLETS', outlets: fetched });
          }
        } catch {
          // Keeps whatever's already local.
        }
      }
    } finally {
      setSyncingId(null);
    }
  };

  const retryLeadDraft = async (draft: LeadDraft) => {
    // Another agent's lead goes only when they sign in.
    if (!online || !isMine(draft, state.user.email)) return;
    setRetryingLeadId(draft.id);
    try {
      // The same send as a full sync: with the draft's one-time ID.
      const result = await pushLeadDrafts([draft], dispatch);
      if (result.synced > 0) Alert.alert('Synced', `Lead "${draft.name}" uploaded successfully.`);
      else Alert.alert('Retry Failed', summariseSyncErrors(result.errors) || 'Could not sync this lead. Will try again later.');
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
    ? (downloadText ? `${downloadText}…` : 'Sending…')
    : syncStatusText(queue, state.syncStatus);

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Synchronization" subtitle="Offline queue and server upload" onNavigate={onNavigate} onBackPress={() => onNavigate('home')} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={[styles.heroIconBox, { backgroundColor: heroBg }]}>
            <Icon name={heroIcon} size={30} color={heroTint} />
          </View>
          <Text style={styles.heroText}>{heroText}</Text>
          {queue.fromEarlierDay && (
            <Text style={styles.heroWarning}>Yesterday's work hasn't been sent. Connect to send it.</Text>
          )}
          {queue.refused > 0 && (
            <Text style={styles.heroWarning}>{queue.refused} item{queue.refused === 1 ? '' : 's'} couldn't be sent: fix or delete {queue.refused === 1 ? 'it' : 'them'} on the Drafts page.</Text>
          )}
          <Text style={styles.heroNote}>Your work is sent on its own whenever there's a connection.</Text>
          {queue.othersWaiting > 0 && (
            <Text style={styles.heroNote}>{queue.othersWaiting} item{queue.othersWaiting === 1 ? ' was' : 's were'} made by another agent on this phone. They go when that agent signs in.</Text>
          )}

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
                  {!isMine(draft, state.user.email) && <Text style={styles.dsError}>Made by {draft.agentEmail}. Sign in as them to send.</Text>}
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
            return (
              <View key={ds.id} style={styles.dsCard}>
                <View style={styles.dsRow}>
                  <View style={styles.dsIconBox}>
                    <Icon name={ds.icon} size={16} color={theme.colors.navy} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.dsLabel}>{ds.label}</Text>
                    <Text style={styles.dsMeta}>{ds.pending} pending</Text>
                    {ds.id === 'cartDrafts' && refusedCartDrafts.map((d) => (
                      <Text key={d.id} style={styles.dsError}>
                        {d.mode === 'sale' ? 'Sale' : 'Order'} at {d.outletName}: {d.syncError}
                      </Text>
                    ))}
                    {ds.id === 'surveyDrafts' && unsentSurveyDrafts.map((s) => (
                      <Text key={s.id} style={styles.dsError}>
                        {s.surveyName || 'Survey'}: {s.syncError}
                      </Text>
                    ))}
                  </View>
                  <Pressable
                    onPress={() => runDraftSync(ds.id)}
                    disabled={isSyncing || !hasPending || !online}
                    style={styles.dsRefreshBtn}
                  >
                    <Icon
                      name="refresh"
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
            const coming = ds.id === 'outlets' || ds.id === 'products' || ds.id === 'leads' ? downloaded[ds.id] : undefined;
            const meta = coming !== undefined
              ? `${DOWNLOAD_NAMES[ds.id as DownloadList]}: ${coming.toLocaleString()}…`
              : ds.id === 'outlets' && state.outletsCapped
              ? `The first ${OUTLETS_CAP.toLocaleString()} loaded · search finds the others`
              : `${ds.total} records loaded`;
            return (
              <View key={ds.id} style={styles.dsCard}>
                <View style={styles.dsRow}>
                  <View style={styles.dsIconBox}>
                    <Icon name={ds.icon} size={16} color={theme.colors.navy} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.dsLabel}>{ds.label}</Text>
                    <Text style={styles.dsMeta}>{meta}</Text>
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
  heroWarning: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.red, textAlign: 'center' },
  heroNote: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, textAlign: 'center' },
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
  dsError: { fontFamily: theme.fonts.semibold, fontSize: 11, color: theme.colors.red, marginTop: 3 },
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
