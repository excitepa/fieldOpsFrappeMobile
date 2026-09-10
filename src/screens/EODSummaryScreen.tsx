import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon, IconName } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { clockOut, submitEodReport, getLeads, NetworkError } from '../services/api';
import { parseAppTimestamp, localDateStr } from '../utils/timestamp';
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
  const isClockedIn = !!state.attendanceStatus?.clockedIn;

  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // App.tsx's `leadsList` prop is only ever appended to locally right after a lead
  // is created in THIS session — it's never persisted or re-fetched, so it reads
  // empty on a fresh app launch even though real leads exist on the server. This
  // fetches the real list directly (same as Pipeline's own leads fetch) so "Leads
  // created today" reflects what actually happened today, not just this session.
  const [liveLeads, setLiveLeads] = useState<Lead[]>(leadsList);
  const fetchLeads = useCallback(async () => {
    if (!state.activeCampaign?.id) return;
    try {
      const fetched = await getLeads(state.activeCampaign.id);
      setLiveLeads(fetched);
    } catch {
      // Non-fatal: keep showing whatever's already there rather than blocking EOD.
    }
  }, [state.activeCampaign?.id]);
  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => {
    setLiveLeads((prev) => {
      const mergeMap = new Map(prev.map((l) => [l.id, l]));
      leadsList.forEach((l) => { if (!mergeMap.has(l.id)) mergeMap.set(l.id, l); });
      return Array.from(mergeMap.values());
    });
  }, [leadsList]);

  const todayIso = localDateStr();
  const outletsVisited = state.outlets.filter((o) => o.status === 'visited').length;
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

  const handleSubmit = async () => {
    setSubmitting(true);

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
