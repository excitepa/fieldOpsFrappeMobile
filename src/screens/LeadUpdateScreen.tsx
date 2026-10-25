import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useFieldStore } from '../store/useFieldStore';
import { getLeads, updateLeadStage, requestLeadRegression, NetworkError } from '../services/api';
import { useLeadStages } from '../hooks/useLeadStages';
import { LOST_STAGE, backwardStages, forwardStages, stageScore } from '../utils/leadStages';
import { localDateStr } from '../utils/timestamp';
import { newStamp } from '../utils/queue';
import { RouteName, Lead, LeadStage, ActionStamp } from '../types';

interface LeadUpdateScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  leadData?: Lead;
  onUpdateLead: (lead: Lead) => void;
}

/** Moving the lead along (or to Lost), or asking a supervisor to move it back. */
type Mode = 'forward' | 'back';

export const LeadUpdateScreen: React.FC<LeadUpdateScreenProps> = ({ onNavigate, leadData, onUpdateLead }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state } = useFieldStore();
  const leadStages = useLeadStages();
  const [mode, setMode] = useState<Mode>('forward');
  const [target, setTarget] = useState<LeadStage>();
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // One-time IDs for this screen's stage change and approval request, from
  // their first try: a second try after one that got no answer is the same one.
  const stageStampRef = useRef<ActionStamp | null>(null);
  const requestStampRef = useRef<ActionStamp | null>(null);

  if (!leadData) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Update Pipeline Stage" onNavigate={onNavigate} />
        <View style={styles.missing}>
          <Text style={styles.missingText}>No lead selected.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // The same rules the backend applies: any later stage the agent can set,
  // or Lost; a move back needs a supervisor.
  const forward = forwardStages(leadData.stage, leadStages);
  const back = backwardStages(leadData.stage, leadStages);
  const isFinalStage = forward.length === 0;
  const choices = mode === 'forward' ? forward : back;
  // The next stage along starts picked; Lost, or a stage to go back to, is
  // always the agent's own pick.
  const picked = target && choices.includes(target)
    ? target
    : mode === 'forward' ? forward.find((s) => s !== LOST_STAGE) : undefined;
  const pending = leadData.pendingStageRequest;

  // The lead as the server now has it, so the screens show what was saved.
  const withServerCopy = async (updated: Lead): Promise<Lead> => {
    try {
      const fresh = (await getLeads(state.activeCampaign?.id || '')).find((l) => l.id === updated.id);
      return fresh ? { ...updated, ...fresh, pendingStageRequest: fresh.pendingStageRequest || updated.pendingStageRequest } : updated;
    } catch {
      return updated;
    }
  };

  const askForApproval = async (stage: LeadStage) => {
    setSubmitting(true);
    const stamp = requestStampRef.current || (requestStampRef.current = newStamp(state.user.email));
    try {
      const request = await requestLeadRegression(leadData.id, stage, reason.trim(), { clientRef: stamp.clientRef, happenedAt: stamp.happenedAt });
      const updated = await withServerCopy({ ...leadData, pendingStageRequest: request });
      setSubmitting(false);
      onUpdateLead(updated);
      Alert.alert(
        'Sent for Approval',
        `A supervisor will review moving ${leadData.name} back to ${stage}. It stays at ${leadData.stage} until then.`,
        [{ text: 'OK', onPress: () => onNavigate('leadDetail', updated) }],
      );
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        Alert.alert('Not Sent', 'No connection, so the request wasn\'t sent. Try again when you\'re back online.');
      } else {
        Alert.alert('Could Not Send', e?.message || 'The server refused this request.');
      }
    }
  };

  const handleSave = async () => {
    if (!picked) {
      Alert.alert('Choose a Stage', mode === 'forward' ? 'Pick the stage to move this lead to.' : 'Pick the stage to move this lead back to.');
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Reason Required', mode === 'forward' ? 'Add a short reason for this stage change.' : 'Add a short reason for moving this lead back.');
      return;
    }
    if (mode === 'back') {
      askForApproval(picked);
      return;
    }

    setSubmitting(true);
    const stamp = stageStampRef.current || (stageStampRef.current = newStamp(state.user.email));
    try {
      // Changed on the device only once the server has it — a save that
      // stayed local is what made leads go back to their old stage.
      await updateLeadStage(leadData.id, picked, reason.trim(), notes.trim() || undefined, { clientRef: stamp.clientRef, happenedAt: stamp.happenedAt });
      const updated = await withServerCopy({
        ...leadData,
        stage: picked,
        score: stageScore(picked, leadStages),
        lastContactDate: localDateStr(),
        notes: notes.trim() ? `${leadData.notes ? leadData.notes + '\n' : ''}${notes.trim()}` : leadData.notes,
      });
      setSubmitting(false);
      onUpdateLead(updated);
      onNavigate('leadDetail', updated);
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        Alert.alert('Not Saved', 'No connection, so the stage change wasn\'t saved. Try again when you\'re back online.');
      } else if (e?.code === 'STAGE_REGRESSION_NEEDS_APPROVAL') {
        Alert.alert('Needs Approval', e.message || 'This move needs a supervisor\'s approval.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Ask for approval', onPress: () => askForApproval(picked) },
        ]);
      } else {
        Alert.alert('Could Not Save', e?.message || 'The server refused this stage change.');
      }
    }
  };

  const showForm = mode === 'back' || !isFinalStage;

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Update Pipeline Stage" subtitle={leadData.name} onNavigate={onNavigate} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.label}>CURRENT STAGE</Text>
          <Text style={styles.currentStage}>{leadData.stage}</Text>
          {pending ? <Text style={styles.pendingText}>Waiting for approval: back to {pending.toStage}</Text> : null}
        </Card>

        {showForm && (
          <View style={styles.stageGroup}>
            <Text style={styles.label}>{mode === 'forward' ? 'MOVE TO' : 'MOVE BACK TO'}</Text>
            <View style={styles.chipRow}>
              {choices.map((stage) => {
                const active = stage === picked;
                return (
                  <Pressable
                    key={stage}
                    onPress={() => setTarget(stage)}
                    style={[styles.chip, active && (stage === LOST_STAGE ? styles.chipLostActive : styles.chipActive)]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{stage}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {showForm && (
          <Input
            label={mode === 'forward' ? 'REASON FOR THE CHANGE' : 'REASON FOR MOVING BACK'}
            value={reason}
            onChangeText={setReason}
            placeholder={mode === 'forward' ? 'Client requested price quotation for 25 cases...' : 'Client withdrew the order...'}
            required
            multiline
          />
        )}

        {showForm && mode === 'forward' && (
          <Input
            label="MEETING / CALL NOTES"
            value={notes}
            onChangeText={setNotes}
            placeholder="Record key conversation points and follow-up requirements..."
            multiline
          />
        )}

        <Button
          // The stage picked is on the chips above; spelling it out here made
          // the label too long for the button.
          title={mode === 'back' ? 'Ask for approval' : isFinalStage ? 'Already at Final Stage' : 'Save progress'}
          onPress={handleSave}
          disabled={(mode === 'forward' && isFinalStage) || submitting}
          loading={submitting}
          size="large"
          iconName="check"
          style={styles.submitBtn}
        />

        {mode === 'forward' && back.length > 0 && !pending && (
          <Pressable onPress={() => { setMode('back'); setTarget(undefined); }} style={styles.linkBtn}>
            <Text style={styles.linkText}>Move back…</Text>
          </Pressable>
        )}
        {mode === 'back' && (
          <Pressable onPress={() => { setMode('forward'); setTarget(undefined); }} style={styles.linkBtn}>
            <Text style={styles.linkText}>Cancel</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 100, gap: theme.spacing.md },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missingText: { fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textMuted },
  card: { gap: theme.spacing.xs },
  label: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  currentStage: { fontFamily: theme.fonts.display, fontSize: 24, color: theme.colors.textDark },
  pendingText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.amber },
  stageGroup: { gap: theme.spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: theme.radius.full, backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder },
  chipActive: { backgroundColor: theme.colors.navy, borderColor: theme.colors.navy },
  chipLostActive: { backgroundColor: theme.colors.red, borderColor: theme.colors.red },
  chipText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textMuted },
  chipTextActive: { color: '#FFFFFF', fontFamily: theme.fonts.bold },
  submitBtn: { marginTop: theme.spacing.sm },
  linkBtn: { alignSelf: 'center', paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
  linkText: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.navy },
});
