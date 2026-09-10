import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { mockDelay } from '../services/mockService';
import { FUNNEL_STAGES } from '../utils/pipelineMetrics';
import { localDateStr } from '../utils/timestamp';
import { RouteName, Lead } from '../types';

interface LeadUpdateScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  leadData?: Lead;
  onUpdateLead: (lead: Lead) => void;
}

export const LeadUpdateScreen: React.FC<LeadUpdateScreenProps> = ({ onNavigate, leadData, onUpdateLead }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  const currentIndex = FUNNEL_STAGES.indexOf(leadData.stage);
  const isFinalStage = currentIndex === -1 || currentIndex === FUNNEL_STAGES.length - 1;
  const nextStage = isFinalStage ? leadData.stage : FUNNEL_STAGES[currentIndex + 1];

  const handleSave = async () => {
    if (!reason.trim()) {
      Alert.alert('Reason Required', 'Add a short reason for this stage progression.');
      return;
    }
    setSubmitting(true);
    await mockDelay(400);
    setSubmitting(false);

    const updated: Lead = {
      ...leadData,
      stage: nextStage,
      lastContactDate: localDateStr(),
      notes: notes.trim() ? `${leadData.notes ? leadData.notes + '\n' : ''}${notes.trim()}` : leadData.notes,
    };
    onUpdateLead(updated);
    onNavigate('leadDetail', updated);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Update Pipeline Stage" subtitle={leadData.name} onNavigate={onNavigate} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.label}>CURRENT STAGE</Text>
          <Text style={styles.currentStage}>{leadData.stage}</Text>
          {!isFinalStage && <Pill color={theme.colors.primary}>{`Next: ${nextStage}`}</Pill>}
        </Card>

        <Input
          label="STAGE PROGRESSION REASON"
          value={reason}
          onChangeText={setReason}
          placeholder="Client requested price quotation for 25 cases..."
          required
          multiline
        />

        <Input
          label="MEETING / CALL NOTES"
          value={notes}
          onChangeText={setNotes}
          placeholder="Record key conversation points and follow-up requirements..."
          multiline
        />

        <Button
          title={isFinalStage ? 'Already at Final Stage' : `Save Stage Progression → ${nextStage}`}
          onPress={handleSave}
          disabled={isFinalStage || submitting}
          loading={submitting}
          size="large"
          iconName="check"
          style={styles.submitBtn}
        />
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
  submitBtn: { marginTop: theme.spacing.sm },
});
