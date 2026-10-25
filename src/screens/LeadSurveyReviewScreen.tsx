import React, { useRef, useState } from 'react';
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
import { blockIfDayLocked } from '../utils/dayLock';
import { discardSurveyPhotos, lostPhotosMessage, lostSurveyPhotos, surveyPhotoFiles } from '../utils/surveyPhotos';
import { missingQuestionIds, requireAllAnswered, surveyRejectionMessage } from '../utils/surveyAnswers';
import { newStamp } from '../utils/queue';
import { RouteName, Lead, CampaignSurveyConfig, LeadSurveyAnswer, ActionStamp } from '../types';

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
  const { state, dispatch } = useFieldStore();
  const lead = routeData?.lead;
  const survey = routeData?.survey;
  const answers = routeData?.answers || {};
  const photoUris = routeData?.photoUris || {};
  const [submitting, setSubmitting] = useState(false);
  // This survey's one-time ID and when it was filled in, from the first
  // Submit: a second Submit after one that got no answer is the same survey.
  const stampRef = useRef<ActionStamp | null>(null);

  const allQuestions = (survey?.sections || []).flatMap((s) => s.questions);

  // Back to the form with the answers and photos as they are; missingIds are
  // the questions to mark there, and retakeIds photos to take again.
  const editAnswers = (missingIds?: string[], retakeIds: string[] = []) => {
    const keep = ([id]: [string, unknown]) => !retakeIds.includes(id);
    onNavigate('leadSurveyForm', {
      lead,
      survey,
      answers: Object.fromEntries(Object.entries(answers).filter(keep)),
      photoUris: Object.fromEntries(Object.entries(photoUris).filter(keep)),
      missingIds,
    });
  };

  const handleSubmit = async () => {
    if (!lead || !survey) return;
    if (blockIfDayLocked(state.dayLockedUntil)) return;
    // Only a complete survey reaches review; checked again, since nothing
    // incomplete may be sent.
    const left = requireAllAnswered(allQuestions, answers);
    if (left.length > 0) {
      editAnswers(left.map((q) => q.id));
      return;
    }
    // The photos go up with the survey, so each must still be on the phone.
    const photos = surveyPhotoFiles(allQuestions, photoUris);
    const lost = lostSurveyPhotos(allQuestions, photos);
    if (lost.length > 0) {
      Alert.alert('Take the Photo Again', lostPhotosMessage(lost));
      editAnswers(lost.map((q) => q.id), lost.map((q) => q.id));
      return;
    }
    setSubmitting(true);
    const stamp = stampRef.current || (stampRef.current = newStamp(state.user.email));

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
        { leadId: lead.id, firstName, lastName, phone: lead.phone || undefined },
        undefined,
        photos,
        { clientRef: stamp.clientRef, happenedAt: stamp.happenedAt }
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

      // Accepted with its photos, so the phone's copies can go.
      discardSurveyPhotos(photos);

      setSubmitting(false);
      Alert.alert('Survey Submitted', `${survey.name} has been recorded for ${lead.name}.`, [
        { text: 'OK', onPress: () => onNavigate('leadSurveys', lead) },
      ]);
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        Alert.alert('No Connection', 'Could not reach the server. Check your connection and try again.');
      } else {
        const missing = missingQuestionIds(e);
        Alert.alert(
          'Could Not Submit',
          surveyRejectionMessage(e),
          missing.length > 0 ? [{ text: 'Fix answers', onPress: () => editAnswers(missing) }] : undefined,
        );
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
        onBackPress={() => editAnswers()}
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
          <Button title="Edit Answers" onPress={() => editAnswers()} variant="outline" style={styles.editBtn} />
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
