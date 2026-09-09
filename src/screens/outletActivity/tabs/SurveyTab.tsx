import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useTheme } from '../../../theme/ThemeContext';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { Icon } from '../../../components/Icon';
import { OptionPickerSheet } from '../../../components/OptionPickerSheet';
import { useFieldStore } from '../../../store/useFieldStore';
import { submitSurveyResponse, NetworkError } from '../../../services/api';
import { blockIfDayLocked } from '../../../utils/dayLock';
import { CampaignSurveyConfig, DynamicSurveyQuestion, SurveyAnswer, OutletSurvey } from '../../../types';

interface SurveyTabProps {
  outletId: string;
  campaignId: string;
  surveyConfig: CampaignSurveyConfig;
  onSubmitted?: () => void;
}

// Mirrors the compliance heuristic in src/utils/dashboardMetrics.ts's computeComplianceScore
// (kept in sync by convention, not imported — that function scores historical submitted
// surveys; this scores the in-progress form for the live "COMPLIANCE SCORE" card).
const BEST_KEYWORDS = ['yes, complete', 'excellent'];
const isBestAnswer = (val: any) => typeof val === 'string' && BEST_KEYWORDS.some((k) => val.toLowerCase().includes(k));

export const SurveyTab: React.FC<SurveyTabProps> = ({ outletId, campaignId, surveyConfig, onSubmitted }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const questions: DynamicSurveyQuestion[] = surveyConfig.questions;
  const isMerchandising = surveyConfig.module === 'merchandising';

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [photoUris, setPhotoUris] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [pickerQuestion, setPickerQuestion] = useState<DynamicSurveyQuestion | null>(null);

  const handleAnswerChange = (qId: string, val: any) => {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
    if (validationErrors[qId]) setValidationErrors((prev) => ({ ...prev, [qId]: false }));
  };

  // ── Merchandising checklist helpers (shelf audit rows toggle through the
  // question's real options — same handleAnswerChange path as everything else) ──
  const checklistQuestions = questions.filter((q) => q.type !== 'photo' && q.type !== 'text');
  const passedCount = checklistQuestions.filter((q) => isBestAnswer(answers[q.id])).length;
  const compliancePct = checklistQuestions.length ? passedCount / checklistQuestions.length : 0;

  const handleChecklistToggle = (q: DynamicSurveyQuestion) => {
    const opts = q.options || [];
    if (opts.length === 0) return;
    const idx = opts.indexOf(answers[q.id]);
    handleAnswerChange(q.id, opts[(idx + 1) % opts.length]);
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
        handleAnswerChange(qId, uri);
      }
    } catch (e) {
      Alert.alert('Camera Error', 'Could not open the camera. Please try again.');
    }
  };

  const handleRemovePhoto = (qId: string) => {
    setPhotoUris((prev) => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
    handleAnswerChange(qId, null);
  };

  const validate = (): boolean => {
    const errors: Record<string, boolean> = {};
    let valid = true;
    questions.forEach((q) => {
      if (q.required) {
        const val = answers[q.id];
        const empty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
        if (empty) {
          errors[q.id] = true;
          valid = false;
        }
      }
    });
    setValidationErrors(errors);
    return valid;
  };

  const handleSubmit = async (isDraft = false) => {
    if (!isDraft && !validate()) {
      Alert.alert('Incomplete Survey', 'Please answer all required questions highlighted in red before submitting.');
      return;
    }
    if (!isDraft && blockIfDayLocked(state.dayLockedUntil)) return;

    setSubmitting(true);

    const nowStr = new Date().toLocaleString('en-US', {
      month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });

    const surveyAnswers: SurveyAnswer[] = questions.map((q) => ({
      questionId: q.id,
      question: q.question,
      answer: answers[q.id] ?? null,
    }));

    const newSurvey: OutletSurvey = {
      id: `surv-${Date.now()}`,
      outletId,
      campaignId,
      surveyConfigId: surveyConfig.id,
      surveyName: surveyConfig.name,
      answers: surveyAnswers,
      isDraft,
      timestamp: nowStr,
    };

    if (isDraft) {
      // Drafts are local-only by design (nothing to submit yet) — same as
      // OutletSurveyReviewScreen's draft handling elsewhere in the app.
      dispatch({ type: 'ADD_SURVEY', survey: newSurvey });
      setSubmitting(false);
      Alert.alert('Draft Saved', 'Your survey draft has been saved locally.');
      return;
    }

    // A real submit must actually reach the server — this previously only
    // dispatched local state and showed a fake "Submitted" alert without
    // ever calling submitSurveyResponse, so shelf-audit answers never left
    // the device even though the agent was told it worked.
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let coordinates: { lat: number; lng: number } | undefined;
      if (status === 'granted') {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coordinates = { lat: position.coords.latitude, lng: position.coords.longitude };
      }

      await submitSurveyResponse(
        surveyConfig.id,
        questions.map((q) => ({ questionId: q.id, questionType: q.type, answer: answers[q.id] ?? null })),
        coordinates
      );

      dispatch({ type: 'ADD_SURVEY', survey: newSurvey });
      dispatch({ type: 'MARK_OUTLET_VISITED', outletId });

      setSubmitting(false);
      Alert.alert('Survey Submitted', `${surveyConfig.name} recorded for this visit.`);
      setAnswers({});
      setPhotoUris({});
      onSubmitted?.();
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        Alert.alert('No Connection', 'Could not reach the server. Check your connection and try again.');
      } else {
        Alert.alert('Could Not Submit', e?.message || 'The server rejected this survey. Please try again.');
      }
    }
  };

  if (isMerchandising) {
    const photoQuestions = questions.filter((q) => q.type === 'photo');
    const noteQuestions = questions.filter((q) => q.type === 'text');

    return (
      <View style={styles.container}>
        <Text style={styles.surveyName}>{surveyConfig.name}</Text>

        <Card style={styles.complianceCard}>
          <Text style={styles.complianceLabel}>COMPLIANCE SCORE</Text>
          <Text style={styles.complianceScore}>{Math.round(compliancePct * 100)}%</Text>
          <Text style={styles.complianceSub}>{passedCount} of {checklistQuestions.length} checks passed</Text>
        </Card>

        {checklistQuestions.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>SHELF AUDIT</Text>
            {checklistQuestions.map((q) => {
              const passed = isBestAnswer(answers[q.id]);
              return (
                <Pressable
                  key={q.id}
                  onPress={() => handleChecklistToggle(q)}
                  style={[styles.checklistRow, passed && styles.checklistRowPassed]}
                >
                  <Text style={styles.checklistText}>{q.question}</Text>
                  <Icon name={passed ? 'check-circle' : 'circle'} size={22} color={passed ? theme.colors.teal : theme.colors.textMuted} />
                </Pressable>
              );
            })}
          </>
        )}

        {photoQuestions.map((q) => (
          <Pressable key={q.id} onPress={() => handleCapturePhoto(q.id)} style={styles.shelfPhotoBox}>
            <Icon name="camera" size={16} color={theme.colors.textDark} />
            <Text style={styles.shelfPhotoText}>
              {photoUris[q.id] ? '1 shelf photo(s) captured' : 'Capture shelf photo'}
            </Text>
          </Pressable>
        ))}

        {noteQuestions.map((q) => (
          <View key={q.id} style={styles.notesBlock}>
            <Text style={styles.notesLabel}>NOTES</Text>
            <TextInput
              style={styles.notesInput}
              placeholder={q.question}
              placeholderTextColor={theme.colors.textMuted}
              value={answers[q.id] || ''}
              onChangeText={(val) => handleAnswerChange(q.id, val)}
              multiline
              numberOfLines={3}
            />
          </View>
        ))}

        <Button
          title={submitting ? 'Submitting...' : 'Submit Activity'}
          onPress={() => handleSubmit(false)}
          variant="navy"
          loading={submitting}
          style={{ marginTop: 4 }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.surveyName}>{surveyConfig.name}</Text>

      {questions.map((q, idx) => {
        const hasError = validationErrors[q.id];
        return (
          <Card key={q.id} style={[styles.questionCard, hasError && styles.questionCardError]}>
            <View style={styles.qHeader}>
              <Text style={styles.qNum}>Q{idx + 1}</Text>
              <Text style={styles.qText}>
                {q.question} {q.required ? <Text style={styles.reqAsterisk}>*</Text> : null}
              </Text>
            </View>

            {q.type === 'choice' && q.options && (
              <View style={styles.optionsList}>
                {q.options.map((opt) => {
                  const isSelected = answers[q.id] === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => handleAnswerChange(q.id, opt)}
                      style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                    >
                      <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {(q.type === 'select' || q.type === 'multi') && q.options && (
              <Pressable onPress={() => setPickerQuestion(q)} style={styles.pickerTrigger}>
                <Text style={styles.pickerTriggerText}>
                  {(() => {
                    const val = answers[q.id];
                    if (q.type === 'multi') {
                      return Array.isArray(val) && val.length > 0 ? val.join(', ') : `Select options (multiple)`;
                    }
                    return val || 'Tap to select';
                  })()}
                </Text>
                <Icon name="chevron-down" size={18} color={theme.colors.darkMuted} />
              </Pressable>
            )}

            {q.type === 'rating' && (
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((star) => {
                  const isSelected = answers[q.id] === star;
                  return (
                    <Pressable
                      key={star}
                      onPress={() => handleAnswerChange(q.id, star)}
                      style={[styles.ratingBtn, isSelected && styles.ratingBtnSelected]}
                    >
                      <Text style={[styles.ratingNum, isSelected && styles.ratingNumSelected]}>{star}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {q.type === 'text' && (
              <TextInput
                style={styles.textInput}
                placeholder="Type your observations..."
                placeholderTextColor={theme.colors.darkMuted}
                value={answers[q.id] || ''}
                onChangeText={(val) => handleAnswerChange(q.id, val)}
                multiline
                numberOfLines={2}
              />
            )}

            {q.type === 'number' && (
              <TextInput
                style={styles.textInput}
                placeholder="Enter numeric quantity"
                placeholderTextColor={theme.colors.darkMuted}
                value={answers[q.id]?.toString() || ''}
                onChangeText={(val) => handleAnswerChange(q.id, val)}
                keyboardType="numeric"
              />
            )}

            {q.type === 'photo' && (
              <View style={styles.photoSection}>
                {photoUris[q.id] ? (
                  <View style={styles.photoPreviewBox}>
                    <Image source={{ uri: photoUris[q.id] }} style={styles.photoPreview} />
                    <View style={styles.photoActionsRow}>
                      <Pressable onPress={() => handleCapturePhoto(q.id)} style={styles.retakePill}>
                        <Icon name="camera" size={12} color="#FFF" />
                        <Text style={styles.retakeText}>Retake</Text>
                      </Pressable>
                      <Pressable onPress={() => handleRemovePhoto(q.id)} style={[styles.retakePill, styles.removePill]}>
                        <Icon name="x" size={12} color="#FFF" />
                        <Text style={styles.retakeText}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable onPress={() => handleCapturePhoto(q.id)} style={styles.photoBox}>
                    <Icon name="camera" size={24} color={theme.colors.amber} />
                    <Text style={styles.photoBoxText}>Tap to take photo</Text>
                  </Pressable>
                )}
              </View>
            )}

            {hasError && <Text style={styles.errorText}>* This question is required</Text>}
          </Card>
        );
      })}

      <View style={styles.actionButtonsRow}>
        <Button title="Save Local Draft" onPress={() => handleSubmit(true)} variant="outline" style={styles.draftBtn} />
        <Button
          title={submitting ? 'Submitting...' : 'Submit Survey'}
          onPress={() => handleSubmit(false)}
          variant="primary"
          loading={submitting}
          style={styles.submitBtn}
        />
      </View>

      <OptionPickerSheet
        visible={!!pickerQuestion}
        title={pickerQuestion?.question || ''}
        options={pickerQuestion?.options || []}
        selected={pickerQuestion ? (answers[pickerQuestion.id] ?? (pickerQuestion.type === 'multi' ? [] : null)) : null}
        multiple={pickerQuestion?.type === 'multi'}
        required={pickerQuestion?.required}
        onConfirm={(val) => pickerQuestion && handleAnswerChange(pickerQuestion.id, val)}
        onClose={() => setPickerQuestion(null)}
      />
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { gap: theme.spacing.md },
  surveyName: { fontFamily: theme.fonts.display, fontSize: 18, color: theme.colors.darkText },
  complianceCard: { backgroundColor: theme.colors.teal, borderColor: theme.colors.teal, gap: 4 },
  complianceLabel: { fontFamily: theme.fonts.bold, fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8 },
  complianceScore: { fontFamily: theme.fonts.display, fontSize: 32, color: '#FFFFFF' },
  complianceSub: { fontFamily: theme.fonts.regular, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  sectionLabel: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8, marginTop: 4 },
  checklistRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm,
    backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, paddingVertical: 14,
  },
  checklistRowPassed: { borderColor: theme.colors.teal, backgroundColor: theme.colors.tealLight },
  checklistText: { flex: 1, fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textDark },
  shelfPhotoBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52,
    borderRadius: theme.radius.md, backgroundColor: theme.colors.fieldFill,
  },
  shelfPhotoText: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  notesBlock: { gap: 6 },
  notesLabel: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  notesInput: {
    backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.md, padding: theme.spacing.md,
    fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textDark, minHeight: 90, textAlignVertical: 'top',
  },
  questionCard: { backgroundColor: theme.colors.darkCard, borderColor: theme.colors.darkBorder, gap: theme.spacing.sm, padding: theme.spacing.lg },
  questionCardError: { borderColor: theme.colors.red },
  qHeader: { flexDirection: 'row', gap: theme.spacing.xs },
  qNum: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.amber },
  qText: { flex: 1, fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.darkText, lineHeight: 20 },
  reqAsterisk: { color: theme.colors.red },
  optionsList: { gap: theme.spacing.xs, marginTop: 4 },
  optionItem: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
    backgroundColor: theme.colors.darkSurface, borderWidth: 1, borderColor: theme.colors.darkBorder,
    borderRadius: theme.radius.md, padding: theme.spacing.md,
  },
  optionItemSelected: { borderColor: theme.colors.amber, backgroundColor: theme.colors.tintGold },
  radioCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: theme.colors.darkMuted, alignItems: 'center', justifyContent: 'center' },
  radioCircleSelected: { borderColor: theme.colors.amber },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.amber },
  optionText: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.darkText },
  optionTextSelected: { color: theme.colors.amber, fontFamily: theme.fonts.bold },
  pickerTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.darkSurface, borderWidth: 1, borderColor: theme.colors.darkBorder,
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, paddingVertical: 14, marginTop: 4,
  },
  pickerTriggerText: { flex: 1, fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.darkText },
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.xs, marginTop: 4 },
  ratingBtn: { flex: 1, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.colors.darkSurface, borderWidth: 1, borderColor: theme.colors.darkBorder, alignItems: 'center', justifyContent: 'center' },
  ratingBtnSelected: { backgroundColor: theme.colors.amber, borderColor: theme.colors.amber },
  ratingNum: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.darkText },
  ratingNumSelected: { color: '#000' },
  textInput: {
    backgroundColor: theme.colors.darkInputBg, borderWidth: 1, borderColor: theme.colors.darkBorder,
    borderRadius: theme.radius.md, padding: theme.spacing.md, fontFamily: theme.fonts.regular,
    fontSize: 14, color: theme.colors.darkText, marginTop: 4,
  },
  photoSection: { marginTop: 4 },
  photoBox: { height: 100, borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.colors.darkBorder, borderStyle: 'dashed', backgroundColor: theme.colors.darkSurface, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoBoxText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.darkText },
  photoPreviewBox: { position: 'relative', width: '100%', height: 140, borderRadius: theme.radius.md, overflow: 'hidden' },
  photoPreview: { width: '100%', height: '100%' },
  photoActionsRow: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', gap: 6 },
  retakePill: { backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.full, flexDirection: 'row', alignItems: 'center', gap: 4 },
  removePill: { backgroundColor: theme.colors.red },
  retakeText: { fontFamily: theme.fonts.bold, fontSize: 11, color: '#FFF' },
  errorText: { fontFamily: theme.fonts.semibold, fontSize: 11, color: theme.colors.red, marginTop: 2 },
  actionButtonsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  draftBtn: { flex: 1 },
  submitBtn: { flex: 1.5 },
});
