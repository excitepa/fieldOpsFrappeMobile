import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { createLead } from '../services/api';
import { getCartTotal } from '../utils/cart';
import { mockDelay } from '../services/mockService';
import { RouteName, LeadDraft } from '../types';

interface DraftsListScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

export const DraftsListScreen: React.FC<DraftsListScreenProps> = ({ onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, getDraftsList, getLeadDraftsList, dispatch } = useFieldStore();
  const [syncing, setSyncing] = useState(false);
  const [retryingLeadId, setRetryingLeadId] = useState<string | null>(null);

  const cartDrafts = getDraftsList();
  const leadDrafts = getLeadDraftsList();
  const surveyDrafts = state.surveys.filter((s) => s.isDraft);
  const totalCount = cartDrafts.length + leadDrafts.length + surveyDrafts.length;

  const handleSyncNow = async () => {
    setSyncing(true);
    // Retry all lead drafts
    let syncedCount = 0;
    for (const draft of leadDrafts) {
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
        syncedCount++;
      } catch {
        // Will remain in queue
      }
    }
    await mockDelay(900);
    setSyncing(false);
    Alert.alert('Synchronization Complete', `${syncedCount} lead${syncedCount === 1 ? '' : 's'} synced. ${totalCount - syncedCount} item${totalCount - syncedCount === 1 ? '' : 's'} still pending.`);
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
