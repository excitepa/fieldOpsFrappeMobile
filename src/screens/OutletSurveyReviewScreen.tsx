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
import { blockIfDayLocked } from '../utils/dayLock';
import { uploadSurveyPhotos, photosNotUploadedMessage } from '../utils/surveyPhotos';
import { RouteName, CampaignSurveyConfig, SurveyAnswer, OutletSurvey } from '../types';

interface OutletSurveyReviewScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  routeData?: {
    outletId?: string;
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

export const OutletSurveyReviewScreen: React.FC<OutletSurveyReviewScreenProps> = ({ onNavigate, routeData }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const outletId = routeData?.outletId || state.outlets[0]?.id;
  const outlet = state.outlets.find((o) => o.id === outletId);
  const survey = routeData?.survey;
  const answers = routeData?.answers || {};
  const photoUris = routeData?.photoUris || {};
  const [submitting, setSubmitting] = useState(false);

  const allQuestions = (survey?.sections || []).flatMap((s) => s.questions);

  const handleSubmit = async () => {
    if (!outlet || !survey) return;
    if (blockIfDayLocked(state.dayLockedUntil)) return;
    setSubmitting(true);

    // Built up-front (not just on success) so a genuine offline failure below
    // can still save a real, resubmittable local copy instead of losing the
    // agent's answers entirely.
    const surveyAnswers: SurveyAnswer[] = allQuestions.map((q) => ({
      questionId: q.id,
      question: q.question,
      questionType: q.type,
      answer: answers[q.id] ?? null,
    }));
    const nowStr = new Date().toLocaleString('en-US', {
      month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let coordinates: { lat: number; lng: number } | undefined;
      if (status === 'granted') {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coordinates = { lat: position.coords.latitude, lng: position.coords.longitude };
      }

      const { responseId } = await submitSurveyResponse(
        survey.id,
        allQuestions.map((q) => ({ questionId: q.id, questionType: q.type, answer: answers[q.id] ?? null })),
        coordinates,
        undefined,
        outlet.id
      );

      const newSurvey: OutletSurvey = {
        id: `surv-${Date.now()}`,
        outletId: outlet.id,
        campaignId: state.activeCampaign?.id || 'c2',
        surveyConfigId: survey.id,
        surveyName: survey.name,
        answers: surveyAnswers,
        isDraft: false,
        timestamp: nowStr,
      };

      dispatch({ type: 'ADD_SURVEY', survey: newSurvey });
      dispatch({ type: 'MARK_OUTLET_VISITED', outletId: outlet.id });

      // The response is in — its photos go up against it now. One that still
      // won't upload is queued for the Sync page; never throws, so it can't
      // land in the offline-draft path below and resubmit the survey.
      const { failed: photosLeft, reason } = await uploadSurveyPhotos(responseId, photoUris, survey.name);
      if (photosLeft.length > 0) dispatch({ type: 'QUEUE_SURVEY_PHOTOS', photos: photosLeft });

      setSubmitting(false);
      if (photosLeft.length > 0) {
        Alert.alert(
          'Survey Saved — Photo Not Uploaded',
          photosNotUploadedMessage(photosLeft.length, reason),
          [{ text: 'OK', onPress: () => onNavigate('surveySuccess', { survey: newSurvey, outletId: outlet.id }) }]
        );
        return;
      }
      onNavigate('surveySuccess', { survey: newSurvey, outletId: outlet.id });
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        // Genuine connectivity failure, not a rejection — save a real local
        // copy (isDraft: true, same record shape a synced survey would have)
        // so the agent's answers aren't lost, and it can be pushed for real
        // from the Sync page once back online.
        const draftSurvey: OutletSurvey = {
          id: `surv-${Date.now()}`,
          outletId: outlet.id,
          campaignId: state.activeCampaign?.id || 'c2',
          surveyConfigId: survey.id,
          surveyName: survey.name,
          answers: surveyAnswers,
          isDraft: true,
          timestamp: nowStr,
        };
        dispatch({ type: 'ADD_SURVEY', survey: draftSurvey });
        Alert.alert(
          'Saved Locally',
          'No connection — this survey has been saved on this device and will upload automatically from the Sync page once you\'re back online.',
        );
        onNavigate('outletDetail', { outletId: outlet.id });
      } else {
        // The request reached the server and was rejected — this will never
        // succeed on retry, so don't disguise it as an offline save.
        Alert.alert('Could Not Submit', e?.message || 'The server rejected this survey. Please try again.');
      }
    }
  };

  if (!outlet || !survey) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Review Answers" onNavigate={onNavigate} onBackPress={() => onNavigate('outletSurveys', { outletId })} />
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
        onBackPress={() => onNavigate('outletSurveyForm', { outletId: outlet.id, survey })}
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
          <Button title="Edit Answers" onPress={() => onNavigate('outletSurveyForm', { outletId: outlet.id, survey })} variant="outline" style={styles.editBtn} />
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
