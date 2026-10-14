import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { createLead, getOutlets } from '../services/api';
import { pushLeadDrafts, pushCartDrafts, pushSurveyDrafts, pushOutletDrafts, summariseSyncErrors } from '../utils/offlineSync';
import { getCartTotal } from '../utils/cart';
import { RouteName, LeadDraft } from '../types';

interface DraftsListScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

export const DraftsListScreen: React.FC<DraftsListScreenProps> = ({ onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch, getDraftsList, getLeadDraftsList, getOutletDraftsList } = useFieldStore();
  const [syncing, setSyncing] = useState(false);
  const [retryingLeadId, setRetryingLeadId] = useState<string | null>(null);

  const cartDrafts = getDraftsList();
  const leadDrafts = getLeadDraftsList();
  const surveyDrafts = state.surveys.filter((s) => s.isDraft);
  const outletDrafts = getOutletDraftsList();
  const totalCount = cartDrafts.length + leadDrafts.length + surveyDrafts.length + outletDrafts.length;

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const fallbackCampaignId = state.activeCampaign?.id || '';
      const [leads, carts, surveysRes, outlets] = await Promise.all([
        pushLeadDrafts(leadDrafts, dispatch),
        pushCartDrafts(cartDrafts, dispatch, fallbackCampaignId),
        pushSurveyDrafts(surveyDrafts, dispatch),
        pushOutletDrafts(outletDrafts, dispatch),
      ]);
      if (outlets.synced > 0) {
        // Reconciles optimistic local outlet(s) with their real synced
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
      const syncedCount = leads.synced + carts.synced + surveysRes.synced + outlets.synced;
      const stillPending = leads.failed + carts.failed + surveysRes.failed + outlets.failed;
      const errors = [...leads.errors, ...carts.errors, ...surveysRes.errors, ...outlets.errors];
      // A bare "0 synced, N still pending" gives nobody anything to act on —
      // show the actual reason each item was rejected.
      const lines = [`${syncedCount} item${syncedCount === 1 ? '' : 's'} synced. ${stillPending} item${stillPending === 1 ? '' : 's'} still pending.`];
      if (errors.length > 0) lines.push('', summariseSyncErrors(errors));
      Alert.alert(
        stillPending > 0 && syncedCount === 0 ? 'Nothing Could Be Synced' : 'Synchronization Complete',
        lines.join('\n'),
      );
    } finally {
      setSyncing(false);
    }
  };

  const retryLeadDraft = async (draft: LeadDraft) => {
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

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Drafts" subtitle={`${totalCount} pending sync`} onNavigate={onNavigate} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {totalCount === 0 && (
          <Text style={styles.emptyText}>No drafts saved. Sale/Order carts and incomplete surveys you save for later will show up here.</Text>
        )}

        {totalCount > 0 && (
          <Button
            title={syncing ? 'Syncing...' : 'Sync Pending Items Now'}
            onPress={handleSyncNow}
            loading={syncing}
            variant="primary"
            iconName="refresh"
          />
        )}

        {cartDrafts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SALE / ORDER DRAFTS ({cartDrafts.length})</Text>
            {cartDrafts.map((draft) => (
              <Pressable
                key={draft.id}
                onPress={() => onNavigate('outletActivity', { outletId: draft.outletId, resumeDraftId: draft.id })}
              >
                <Card style={styles.draftCard}>
                  <View style={[styles.modeIcon, { backgroundColor: draft.mode === 'sale' ? theme.colors.primaryBg : theme.colors.tintTeal }]}>
                    <Icon name="shopping-bag" size={18} color={draft.mode === 'sale' ? theme.colors.primaryLight : theme.colors.tintTealIcon} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.draftTitle}>{draft.mode === 'sale' ? 'Sale' : 'Order'} draft · {draft.outletName}</Text>
                    <Text style={styles.draftSub}>
                      {draft.cart.length} item{draft.cart.length === 1 ? '' : 's'} · ₦{getCartTotal(draft.cart).toLocaleString()} · {draft.updatedAt}
                    </Text>
                  </View>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>Pending Sync</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}

        {leadDrafts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LEAD DRAFTS ({leadDrafts.length})</Text>
            {leadDrafts.map((draft) => (
              <Pressable key={draft.id} onPress={() => retryLeadDraft(draft)}>
                <Card style={styles.draftCard}>
                  <View style={[styles.modeIcon, { backgroundColor: theme.colors.tintTeal }]}>
                    <Icon name="users" size={18} color={theme.colors.tintTealIcon} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.draftTitle}>{draft.name} · {draft.company}</Text>
                    <Text style={styles.draftSub}>{draft.phone} · Created {draft.createdAt}</Text>
                  </View>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>Tap to Retry</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}

        {surveyDrafts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SURVEY DRAFTS ({surveyDrafts.length})</Text>
            {surveyDrafts.map((sur) => (
              <Pressable key={sur.id} onPress={() => onNavigate('outletDetail', { outletId: sur.outletId })}>
                <Card style={styles.draftCard}>
                  <View style={[styles.modeIcon, { backgroundColor: theme.colors.tintGold }]}>
                    <Icon name="clipboard-list" size={18} color={theme.colors.tintGoldIcon} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.draftTitle}>{sur.surveyName || 'Field Survey'} draft</Text>
                    <Text style={styles.draftSub}>{sur.answers.length} responses saved · {sur.timestamp}</Text>
                  </View>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>Pending Sync</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}

        {outletDrafts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>OUTLET DRAFTS ({outletDrafts.length})</Text>
            {outletDrafts.map((draft) => (
              <Card key={draft.id} style={styles.draftCard}>
                <View style={[styles.modeIcon, { backgroundColor: theme.colors.tintBlue }]}>
                  <Icon name="map-pin" size={18} color={theme.colors.tintBlueIcon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.draftTitle}>{draft.mode === 'create' ? 'New outlet' : 'Outlet edit'} · {draft.name}</Text>
                  <Text style={styles.draftSub}>{draft.address} · {draft.createdAt}</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>Pending Sync</Text>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.darkBg },
  content: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.md },
  emptyText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.darkMuted, textAlign: 'center', paddingVertical: theme.spacing.xl },
  section: { gap: theme.spacing.xs },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.darkMuted, letterSpacing: 0.8 },
  draftCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, backgroundColor: theme.colors.darkCard, borderColor: theme.colors.darkBorder },
  modeIcon: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  draftTitle: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.darkText },
  draftSub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.darkMuted, marginTop: 2 },
  pendingBadge: { backgroundColor: theme.colors.amberLight, borderRadius: theme.radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  pendingBadgeText: { fontFamily: theme.fonts.bold, fontSize: 9, color: theme.colors.amber },
});
