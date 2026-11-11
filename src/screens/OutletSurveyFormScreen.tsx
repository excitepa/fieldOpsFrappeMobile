import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { DynamicSurveyForm } from '../components/DynamicSurveyForm';
import { useFieldStore } from '../store/useFieldStore';
import { keepSurveyPhoto, discardSurveyPhoto } from '../utils/surveyPhotos';
import { isAnswered, requireAllAnswered } from '../utils/surveyAnswers';
import { RouteName, CampaignSurveyConfig } from '../types';

interface OutletSurveyFormScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  routeData?: {
    outletId?: string;
    survey?: CampaignSurveyConfig;
    /** Coming back from review: the answers and photos so far, and the questions to mark. */
    answers?: Record<string, any>;
    photoUris?: Record<string, string>;
    missingIds?: string[];
  };
}

export const OutletSurveyFormScreen: React.FC<OutletSurveyFormScreenProps> = ({ onNavigate, routeData }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state } = useFieldStore();
  const outletId = routeData?.outletId || state.outlets[0]?.id;
  const outlet = state.outlets.find((o) => o.id === outletId);
  const survey = routeData?.survey;

  const sections = survey?.sections || [];
  const allQuestions = sections.flatMap((s) => s.questions);

  // Back from review (Edit Answers, or a refusal to fix) the form starts from
  // the answers and photos it had, with any questions the server named marked.
  const [answers, setAnswers] = useState<Record<string, any>>(routeData?.answers || {});
  const [photoUris, setPhotoUris] = useState<Record<string, string>>(routeData?.photoUris || {});
  const [errors, setErrors] = useState<Record<string, boolean>>(
    () => Object.fromEntries((routeData?.missingIds || []).map((id) => [id, true]))
  );

  const answeredCount = allQuestions.filter((q) => isAnswered(answers[q.id], q.type)).length;

  const setAnswer = (qId: string, val: any) => {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
    if (errors[qId]) setErrors((prev) => ({ ...prev, [qId]: false }));
  };

  const handleCapturePhoto = async (qId: string) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission Needed', 'Enable camera access to capture this photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        // Shrunk and kept in the app's documents folder until it's uploaded
        // after submit — see keepSurveyPhoto. A retake replaces the old copy.
        const uri = await keepSurveyPhoto(result.assets[0].uri, result.assets[0].width);
        discardSurveyPhoto(photoUris[qId]);
        setPhotoUris((prev) => ({ ...prev, [qId]: uri }));
        setAnswer(qId, uri);
      }
    } catch (e) {
      Alert.alert('Camera Error', 'Could not open the camera. Please try again.');
    }
  };

  // Every question must be answered, whatever the survey marks as required:
  // the unanswered ones are marked and the agent stays on the form.
  const handleReview = () => {
    const left = requireAllAnswered(allQuestions, answers);
    setErrors(Object.fromEntries(left.map((q) => [q.id, true])));
    if (left.length > 0) return;
    onNavigate('outletSurveyReview', { outletId: outlet?.id, survey, answers, photoUris });
  };

  if (!outlet || !survey) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Survey" onNavigate={onNavigate} onBackPress={() => onNavigate('outletSurveys', { outletId })} />
        <View style={styles.missingContainer}>
          <Icon name="alert-circle" size={44} color={theme.colors.amber} />
          <Text style={styles.missingTitle}>This survey could not be loaded.</Text>
          <Button title="Back to Surveys" onPress={() => onNavigate('outletSurveys', { outletId })} variant="navy" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={survey.name}
        subtitle={`${answeredCount} of ${allQuestions.length} answered`}
        onNavigate={onNavigate}
        onBackPress={() => onNavigate('outletSurveys', { outletId: outlet.id })}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <DynamicSurveyForm
          description={survey.description || survey.name}
          sections={sections}
          answers={answers}
          photoUris={photoUris}
          errors={errors}
          answeredCount={answeredCount}
          totalCount={allQuestions.length}
          onAnswerChange={setAnswer}
          onCapturePhoto={handleCapturePhoto}
          onSubmit={handleReview}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.sm },
  missingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  missingTitle: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark, textAlign: 'center' },
});
