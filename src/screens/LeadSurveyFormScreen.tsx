import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { DynamicSurveyForm } from '../components/DynamicSurveyForm';
import { RouteName, Lead, CampaignSurveyConfig } from '../types';

interface LeadSurveyFormScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  routeData?: { lead?: Lead; survey?: CampaignSurveyConfig };
}

export const LeadSurveyFormScreen: React.FC<LeadSurveyFormScreenProps> = ({ onNavigate, routeData }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const lead = routeData?.lead;
  const survey = routeData?.survey;

  const sections = survey?.sections || [];
  const allQuestions = sections.flatMap((s) => s.questions);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [photoUris, setPhotoUris] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const answeredCount = allQuestions.filter((q) => {
    const v = answers[q.id];
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;

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
        const uri = result.assets[0].uri;
        setPhotoUris((prev) => ({ ...prev, [qId]: uri }));
        setAnswer(qId, uri);
      }
    } catch (e) {
      Alert.alert('Camera Error', 'Could not open the camera. Please try again.');
    }
  };

  const handleReview = () => {
    const nextErrors: Record<string, boolean> = {};
    let valid = true;
    allQuestions.forEach((q) => {
      if (q.required) {
        const v = answers[q.id];
        const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
        if (empty) {
          nextErrors[q.id] = true;
          valid = false;
        }
      }
    });
    setErrors(nextErrors);
    if (!valid) {
      Alert.alert('Incomplete Survey', 'Please answer all required questions highlighted in red before continuing.');
      return;
    }
    onNavigate('leadSurveyReview', { lead, survey, answers, photoUris });
  };

  if (!lead || !survey) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Survey" onNavigate={onNavigate} onBackPress={() => onNavigate('leadSurveys', lead)} />
        <View style={styles.missingContainer}>
          <Icon name="alert-circle" size={44} color={theme.colors.amber} />
          <Text style={styles.missingTitle}>This survey could not be loaded.</Text>
          <Button title="Back to Surveys" onPress={() => onNavigate('leadSurveys', lead)} variant="navy" />
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
        onBackPress={() => onNavigate('leadSurveyDetail', { lead, survey })}
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
