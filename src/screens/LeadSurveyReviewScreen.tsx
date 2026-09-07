import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { submitSurveyResponse, NetworkError } from '../services/api';
import { RouteName, Lead, CampaignSurveyConfig, LeadSurveyAnswer } from '../types';

interface LeadSurveyReviewScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  routeData?: {
    lead?: Lead;
    survey?: CampaignSurveyConfig;
    answers?: Record<string, any>;
    photoUris?: Record<string, string>;
  };
}

function formatAnswer(val: any): string {
  if (val === undefined || val === null || val === '') return 'Not answered';
  if (Array.isArray(val)) return val.length ? val.join(', ') : 'Not answered';
  return String(val);
}

export const LeadSurveyReviewScreen: React.FC<LeadSurveyReviewScreenProps> = ({ onNavigate, routeData }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { dispatch } = useFieldStore();
  const lead = routeData?.lead;
  const survey = routeData?.survey;
  const answers = routeData?.answers || {};
  const photoUris = routeData?.photoUris || {};
  const [submitting, setSubmitting] = useState(false);

  const allQuestions = (survey?.sections || []).flatMap((s) => s.questions);

  const handleSubmit = async () => {
    if (!lead || !survey) return;
    setSubmitting(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let coordinates: { lat: number; lng: number } | undefined;
      if (status === 'granted') {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coordinates = { lat: position.coords.latitude, lng: position.coords.longitude };
      }

      const nameParts = lead.name.trim().split(/\s+/);
      const firstName = nameParts[0] || undefined;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

      await submitSurveyResponse(
        survey.id,
        allQuestions.map((q) => ({ questionId: q.id, questionType: q.type, answer: answers[q.id] ?? null })),
        coordinates,
        { leadId: lead.id, firstName, lastName, phone: lead.phone || undefined }
      );

      const surveyAnswers: LeadSurveyAnswer[] = allQuestions.map((q) => ({
        questionId: q.id,
        question: q.question,
        answer: answers[q.id] ?? null,
      }));

      dispatch({
        type: 'ADD_LEAD_SURVEY_RESPONSE',
        response: {
          id: `lsr-${Date.now()}`,
          leadId: lead.id,
          surveyConfigId: survey.id,
          answers: surveyAnswers,
          submittedAt: new Date().toISOString(),
        },
      });
      setSubmitting(false);
      Alert.alert('Survey Submitted', `${survey.name} has been recorded for ${lead.name}.`, [
        { text: 'OK', onPress: () => onNavigate('leadSurveys', lead) },
      ]);
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        Alert.alert('No Connection', 'Could not reach the server. Check your connection and try again.');
      } else {
        Alert.alert('Could Not Submit', e?.message || 'The server rejected this survey. Please try again.');
      }
    }
  };

  if (!lead || !survey) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Review Answers" onNavigate={onNavigate} onBackPress={() => onNavigate('leadSurveys', lead)} />
        <View style={styles.missingContainer}>
          <Icon name="alert-circle" size={44} color={theme.colors.amber} />
          <Text style={styles.missingTitle}>Nothing to review.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Review Answers"
        subtitle={survey.name}
        onNavigate={onNavigate}
        onBackPress={() => onNavigate('leadSurveyForm', { lead, survey })}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {allQuestions.map((q, idx) => (
          <Card key={q.id} style={styles.qCard}>
            <Text style={styles.qText}>{idx + 1}. {q.question}</Text>
            {q.type === 'photo' && photoUris[q.id] ? (
              <Image source={{ uri: photoUris[q.id] }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <Text style={styles.answerText}>{formatAnswer(answers[q.id])}{q.unit && answers[q.id] ? ` ${q.unit}` : ''}</Text>
            )}
          </Card>
        ))}

        <View style={styles.actionsRow}>
          <Button title="Edit Answers" onPress={() => onNavigate('leadSurveyForm', { lead, survey })} variant="outline" style={styles.editBtn} />
          <Button
            title={submitting ? 'Submitting...' : 'Submit Survey'}
            onPress={handleSubmit}
            variant="navy"
            loading={submitting}
            disabled={submitting}
            style={styles.submitBtn}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.sm },
  missingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  missingTitle: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark, textAlign: 'center' },
  qCard: { gap: 6 },
  qText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textMuted },
  answerText: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  photoPreview: { width: '100%', height: 140, borderRadius: theme.radius.md },
  actionsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  editBtn: { flex: 1 },
  submitBtn: { flex: 1.4 },
});
