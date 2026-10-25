import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon, IconName } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { clockOut, submitEodReport, getLeads, getMySales, getMyOrders, NetworkError } from '../services/api';
import { parseAppTimestamp, localDateStr } from '../utils/timestamp';
import { getOutletIdsVisitedToday } from '../utils/outletVisits';
import { queueState, queuedActionLabel, syncNow } from '../utils/offlineSync';
import { isMine } from '../utils/queue';
import { RouteName, Lead } from '../types';

interface EODSummaryScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  leadsList?: Lead[];
  /** Called instead of navigating home after a successful EOD submit — the agent is
   *  done for the day, so this logs them out and locks the app until midnight rather
   *  than returning them to a normal, still-usable Home screen. */
  onDayComplete?: () => void;
}

const isToday = (timestamp: string) => {
  const d = parseAppTimestamp(timestamp);
  if (isNaN(d.getTime())) return false;
  return d.toDateString() === new Date().toDateString();
};

export const EODSummaryScreen: React.FC<EODSummaryScreenProps> = ({ onNavigate, leadsList = [], onDayComplete }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const stateRef = useRef(state);
  stateRef.current = state;
  const isClockedIn = !!state.attendanceStatus?.clockedIn;

  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // "Outlets visited" is derived from real sales/orders (see outletVisits.ts),
  // which this screen may otherwise never have fetched if EOD is reached
  // without visiting Home/Orders first this session.
  useEffect(() => {
    getMySales().then((sales) => dispatch({ type: 'SET_SALES', sales })).catch(() => {});
    getMyOrders().then((orders) => dispatch({ type: 'SET_ORDERS', orders })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The agent's leads, saved on the phone and brought up to date here, so
  // "Leads created today" counts today's whichever device they were made on.
  const liveLeads = state.leads;
  const fetchLeads = useCallback(async () => {
    if (!state.activeCampaign?.id) return;
    try {
      dispatch({ type: 'SET_LEADS', leads: await getLeads(state.activeCampaign.id) });
    } catch {
      // Non-fatal: keep showing whatever's already there rather than blocking EOD.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeCampaign?.id]);
  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const todayIso = localDateStr();
  // Real, server-derived visited-today set — see outletVisits.ts.
  const visitedTodayIds = getOutletIdsVisitedToday(state.sales, state.orders, state.drafts);
  const outletsVisited = state.outlets.filter((o) => visitedTodayIds.has(o.id)).length;
  const salesToday = state.sales.filter((s) => isToday(s.timestamp));
  const salesTotal = salesToday.reduce((sum, s) => sum + s.total, 0);
  const leadsToday = liveLeads.filter((l) => l.createdAt === todayIso).length;
  const surveysToday = state.surveys.filter((s) => !s.isDraft && isToday(s.timestamp)).length;

  const rows: { icon: IconName; label: string; value: string; tint: string; tintIcon: string }[] = [
    { icon: 'map-pin', label: 'Outlets visited', value: `${outletsVisited}`, tint: theme.colors.tintBlue, tintIcon: theme.colors.tintBlueIcon },
    { icon: 'shopping-bag', label: 'Sales recorded', value: `₦${salesTotal.toLocaleString()}`, tint: theme.colors.tintGold, tintIcon: theme.colors.tintGoldIcon },
    { icon: 'users', label: 'Leads created today', value: `${leadsToday}`, tint: theme.colors.tintPurple, tintIcon: theme.colors.tintPurpleIcon },
    { icon: 'clipboard-list', label: 'Surveys completed', value: `${surveysToday}`, tint: theme.colors.tintGray, tintIcon: theme.colors.tintGrayIcon },
  ];

  // What this agent still has on the phone that isn't on the server, a line each.
  const whatsLeft = (): string[] => {
    const s = stateRef.current;
    const mine = <T extends { agentEmail?: string }>(items: T[]) => items.filter((i) => isMine(i, s.user.email));
    const why = (error?: string) => (error ? `: ${error}` : '');
    return [
      ...mine(s.outletDrafts).map((d) => `${d.mode === 'create' ? 'New outlet' : 'Outlet edit'} ${d.name}${why(d.syncError)}`),
      ...mine(s.drafts).map((d) => `${d.mode === 'sale' ? 'Sale' : 'Order'} at ${d.outletName}${d.syncError ? why(d.syncError) : d.ready ? '' : ' (saved to finish later)'}`),
      ...mine(s.surveys.filter((x) => x.isDraft)).map((x) => `Survey ${x.surveyName || ''}${why(x.syncError)}`.trim()),
      ...mine(s.leadDrafts).map((d) => `Lead ${d.name}${why(d.syncError)}`),
      ...mine(s.queuedActions).map((a) => `${queuedActionLabel(a)}${why(a.syncError)}`),
      ...(s.pendingSurveyPhotos.length > 0 ? [`${s.pendingSurveyPhotos.length} survey photo${s.pendingSurveyPhotos.length === 1 ? '' : 's'}`] : []),
    ];
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    // The day closes only once everything is on the server: what's waiting
    // goes first, and anything that can't (no connection, refused by the
    // server, or a cart saved to finish later) keeps the day open.
    await syncNow({ getState: () => stateRef.current, dispatch }).catch(() => null);
    // The sync's changes reach the screen on its next render.
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (queueState(stateRef.current).waiting > 0) {
      setSubmitting(false);
      const left = whatsLeft();
      const listed = left.slice(0, 8).map((l) => `• ${l}`).join('\n');
      const more = left.length > 8 ? `\n…and ${left.length - 8} more` : '';
      Alert.alert(
        "Your Day Can't Close Yet",
        `These haven't reached the server. Connect to send them; one that was refused has to be fixed, turned into an order, or deleted on the Drafts page.\n\n${listed}${more}`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Drafts', onPress: () => onNavigate('draftsList') },
        ],
      );
      return;
    }

    if (isClockedIn) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('Location permission is required to clock out.');
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await clockOut(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          state.attendanceStatus?.attendanceId,
          note || undefined
        );
        dispatch({ type: 'SET_ATTENDANCE_STATUS', clockedIn: false });
      } catch (e: any) {
        setSubmitting(false);
        Alert.alert('Clock Out Failed', e?.message || 'Could not clock out. Your end-of-day summary was not submitted — please try again.');
        return;
      }
    }

    try {
      await submitEodReport(todayIso, note || 'No summary notes provided.');
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        Alert.alert('No Connection', 'Could not reach the server. Check your connection and try again.');
      } else {
        Alert.alert('Could Not Submit', e?.message || 'The server rejected this end-of-day report. Please try again.');
      }
      return;
    }

    setSubmitting(false);
    Alert.alert(
      'End of Day Submitted',
      'Your daily summary has been recorded. You\'re done for today — the app will lock until 12:00 AM tomorrow.',
      [{ text: 'OK', onPress: () => onDayComplete?.() }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="End of Day" subtitle="Review and submit your day" onNavigate={onNavigate} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {rows.map((row) => (
          <Card key={row.label} style={styles.statCard}>
            <View style={styles.statRow}>
              <View style={[styles.statIconBox, { backgroundColor: row.tint }]}>
                <Icon name={row.icon} size={18} color={row.tintIcon} />
              </View>
              <Text style={[styles.statLabel, { color: row.tintIcon }]}>{row.label}</Text>
              <Text style={styles.statValue}>{row.value}</Text>
            </View>
          </Card>
        ))}

        <Card style={styles.noteCard}>
          <Text style={styles.noteTitle}>Summary note</Text>
          <Text style={styles.noteSub}>Anything notable from today?</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Type your notes here..."
            placeholderTextColor={theme.colors.textMuted}
            value={note}
            onChangeText={(t) => t.length <= 500 && setNote(t)}
            multiline
            numberOfLines={4}
          />
          <Text style={styles.charCount}>{note.length}/500</Text>
        </Card>

        <Button
          title={submitting ? 'Submitting...' : (isClockedIn ? 'Submit & Clock Out' : 'Submit End of Day')}
          onPress={handleSubmit}
          loading={submitting}
          size="large"
          style={styles.submitBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 100, gap: theme.spacing.sm },
  statCard: { padding: theme.spacing.md },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  statIconBox: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  statLabel: { flex: 1, fontFamily: theme.fonts.bold, fontSize: 14 },
  statValue: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  noteCard: { gap: 4, marginTop: theme.spacing.xs },
  noteTitle: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.primary },
  noteSub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginBottom: theme.spacing.sm },
  noteInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.textDark,
    textAlignVertical: 'top',
  },
  charCount: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted, alignSelf: 'flex-end', marginTop: 4 },
  submitBtn: { marginTop: theme.spacing.sm },
});
