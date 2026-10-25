import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { pushLeadDrafts, queuedActionLabel, summariseSyncErrors, syncNow } from '../utils/offlineSync';
import { getCartTotal } from '../utils/cart';
import { discardKeptPhoto, discardSurveyPhoto } from '../utils/surveyPhotos';
import { formatServerDateTime } from '../utils/timestamp';
import { RouteName, LeadDraft, OutletSurvey, Draft, OutletDraft, QueuedAction } from '../types';

interface DraftsListScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

export const DraftsListScreen: React.FC<DraftsListScreenProps> = ({ onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch, getDraftsList, getLeadDraftsList, getOutletDraftsList } = useFieldStore();
  const stateRef = useRef(state);
  stateRef.current = state;
  const [syncing, setSyncing] = useState(false);
  const [retryingLeadId, setRetryingLeadId] = useState<string | null>(null);

  const cartDrafts = getDraftsList();
  const leadDrafts = getLeadDraftsList();
  const surveyDrafts = state.surveys.filter((s) => s.isDraft);
  const outletDrafts = getOutletDraftsList();
  const queuedActions = state.queuedActions;
  const totalCount = cartDrafts.length + leadDrafts.length + surveyDrafts.length + outletDrafts.length + queuedActions.length;

  // Everything waiting, refused items and carts saved for later included, by
  // the same routine that sends on its own.
  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const outcome = await syncNow({ getState: () => stateRef.current, dispatch, manual: true, refresh: true });
      if (outcome.needsSignIn) {
        Alert.alert('Sign In Again', 'Your login has expired. Sign in again to send your work: it stays saved on this phone.');
        return;
      }
      // A bare "0 synced, N still pending" gives nobody anything to act on —
      // show the actual reason each item was rejected.
      const lines = [`${outcome.sent} item${outcome.sent === 1 ? '' : 's'} synced. ${outcome.failed} item${outcome.failed === 1 ? '' : 's'} still pending.`];
      if (outcome.notices.length > 0) lines.push('', ...outcome.notices);
      if (outcome.errors.length > 0) lines.push('', summariseSyncErrors(outcome.errors));
      Alert.alert(
        outcome.failed > 0 && outcome.sent === 0 ? 'Nothing Could Be Synced' : 'Synchronization Complete',
        lines.join('\n'),
      );
    } finally {
      setSyncing(false);
    }
  };

  // A survey draft that can't be sent (not complete, a photo gone, or refused)
  // can only be dropped: it can't be reopened to finish.
  const deleteSurveyDraft = (sur: OutletSurvey) => {
    Alert.alert('Delete Survey Draft?', `${sur.surveyName || 'This survey'} and its photos will be removed from this device. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // A photo answer holds the kept photo's path (drafts from older builds have no questionType).
          sur.answers.forEach((a) => {
            if (typeof a.answer === 'string' && (a.questionType === 'photo' || a.answer.startsWith('file://'))) discardSurveyPhoto(a.answer);
          });
          dispatch({ type: 'DELETE_SURVEY', surveyId: sur.id });
        },
      },
    ]);
  };

  // Any unsent item can be deleted: one the server refused has to be fixed or
  // deleted before the day can be closed.
  const confirmDelete = (title: string, body: string, onDelete: () => void) => {
    Alert.alert(title, `${body} This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  const deleteCartDraft = (draft: Draft) =>
    confirmDelete(`Delete ${draft.mode === 'sale' ? 'Sale' : 'Order'}?`, `The ${draft.mode} at ${draft.outletName} will be removed from this device.`, () =>
      dispatch({ type: 'DELETE_DRAFT', draftId: draft.id }));

  const deleteLeadDraft = (draft: LeadDraft) =>
    confirmDelete('Delete Lead?', `${draft.name} will be removed from this device.`, () =>
      dispatch({ type: 'DELETE_LEAD_DRAFT', draftId: draft.id }));

  const deleteQueuedAction = (action: QueuedAction) =>
    confirmDelete('Delete?', `"${queuedActionLabel(action)}" will be removed from this device.`, () =>
      dispatch({ type: 'DELETE_QUEUED_ACTION', actionId: action.id }));

  // A new outlet that's deleted takes what was recorded there with it: it
  // could never be sent without the outlet.
  const deleteOutletDraft = (draft: OutletDraft) => {
    const recordedThere = draft.mode === 'create'
      ? [
          ...cartDrafts.filter((d) => d.outletId === draft.id).map((d) => () => dispatch({ type: 'DELETE_DRAFT', draftId: d.id })),
          ...surveyDrafts.filter((d) => d.outletId === draft.id).map((d) => () => dispatch({ type: 'DELETE_SURVEY', surveyId: d.id })),
          ...queuedActions.filter((a) => a.kind === 'skip' && a.outletId === draft.id).map((a) => () => dispatch({ type: 'DELETE_QUEUED_ACTION', actionId: a.id })),
        ]
      : [];
    const also = recordedThere.length > 0 ? ` So will the ${recordedThere.length} item${recordedThere.length === 1 ? '' : 's'} recorded there.` : '';
    confirmDelete(draft.mode === 'create' ? 'Delete New Outlet?' : 'Delete Outlet Edit?', `${draft.name} will be removed from this device.${also}`, () => {
      recordedThere.forEach((remove) => remove());
      discardKeptPhoto(draft.photoUri);
      dispatch({ type: 'DELETE_OUTLET_DRAFT', draftId: draft.id });
      if (draft.mode === 'create') dispatch({ type: 'REMOVE_OUTLET', outletId: draft.id });
    });
  };

  const retryLeadDraft = async (draft: LeadDraft) => {
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
                    {draft.syncError ? <Text style={styles.draftError}>Not sent: {draft.syncError}</Text> : null}
                  </View>
                  <Pressable onPress={() => deleteCartDraft(draft)} hitSlop={8} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
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
                    {draft.syncError ? <Text style={styles.draftError}>Not sent: {draft.syncError}</Text> : null}
                  </View>
                  {draft.syncError ? (
                    <Pressable onPress={() => deleteLeadDraft(draft)} hitSlop={8} style={styles.deleteBtn}>
                      <Text style={styles.deleteBtnText}>Delete</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>{retryingLeadId === draft.id ? 'Sending…' : 'Tap to Retry'}</Text>
                    </View>
                  )}
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
                    {sur.syncError ? <Text style={styles.draftError}>Not sent: {sur.syncError}</Text> : null}
                  </View>
                  {sur.syncError ? (
                    <Pressable onPress={() => deleteSurveyDraft(sur)} hitSlop={8} style={styles.deleteBtn}>
                      <Text style={styles.deleteBtnText}>Delete</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Pending Sync</Text>
                    </View>
                  )}
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
                  {draft.syncError ? <Text style={styles.draftError}>Not sent: {draft.syncError}</Text> : null}
                </View>
                <Pressable onPress={() => deleteOutletDraft(draft)} hitSlop={8} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              </Card>
            ))}
          </View>
        )}

        {queuedActions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SKIPS, STAGE CHANGES AND STOCK REQUESTS ({queuedActions.length})</Text>
            {queuedActions.map((action) => (
              <Card key={action.id} style={styles.draftCard}>
                <View style={[styles.modeIcon, { backgroundColor: theme.colors.tintPeach }]}>
                  <Icon name={action.kind === 'skip' ? 'x' : action.kind === 'stockRequest' ? 'package' : 'trending-up'} size={18} color={theme.colors.tintPeachIcon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.draftTitle}>{queuedActionLabel(action)}</Text>
                  <Text style={styles.draftSub}>{action.happenedAt ? formatServerDateTime(action.happenedAt) : 'Not sent yet'}</Text>
                  {action.syncError ? <Text style={styles.draftError}>Not sent: {action.syncError}</Text> : null}
                </View>
                <Pressable onPress={() => deleteQueuedAction(action)} hitSlop={8} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
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
  draftError: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.red, marginTop: 4 },
  pendingBadge: { backgroundColor: theme.colors.amberLight, borderRadius: theme.radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  pendingBadgeText: { fontFamily: theme.fonts.bold, fontSize: 9, color: theme.colors.amber },
  deleteBtn: { backgroundColor: theme.colors.redLight, borderRadius: theme.radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  deleteBtnText: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.red },
});
