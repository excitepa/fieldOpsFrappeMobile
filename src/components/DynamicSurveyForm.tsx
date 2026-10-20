import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Image } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Card } from './Card';
import { Button } from './Button';
import { Icon } from './Icon';
import { OptionPickerSheet } from './OptionPickerSheet';
import { cannotBeAnswered, NO_OPTIONS_MESSAGE } from '../utils/surveyAnswers';
import { LeadSurveySection, DynamicSurveyQuestion } from '../types';

interface DynamicSurveyFormProps {
  /** Intro card body text — the "SURVEY" kicker card description. */
  description: string;
  sections: LeadSurveySection[];
  answers: Record<string, any>;
  photoUris: Record<string, string>;
  errors: Record<string, boolean>;
  answeredCount: number;
  totalCount: number;
  onAnswerChange: (qId: string, val: any) => void;
  onCapturePhoto: (qId: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
}

/**
 * Shared question-rendering UI for the dynamic, sectioned survey form screens
 * (Lead surveys and Outlet surveys) — matches new ui/runsurvey1.png-9.png:
 * an intro "SURVEY" card with progress bar, then "SECTION N" groups of
 * numbered question cards (yes/no, single/multi choice, rating, select sheet,
 * number+unit, text area, photo capture), and a full-width "Review answers" CTA.
 * Every question must be answered, which the intro card says once.
 *
 * Intended to be rendered inside the caller's own <ScrollView> (this component
 * renders no SafeAreaView/Header/ScrollView of its own).
 */
export const DynamicSurveyForm: React.FC<DynamicSurveyFormProps> = ({
  description,
  sections,
  answers,
  photoUris,
  errors,
  answeredCount,
  totalCount,
  onAnswerChange,
  onCapturePhoto,
  onSubmit,
  submitLabel = 'Review answers',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [pickerQuestion, setPickerQuestion] = useState<DynamicSurveyQuestion | null>(null);
  const progress = totalCount > 0 ? Math.min(1, answeredCount / totalCount) : 0;

  let questionNumber = 0;

  return (
    <>
      <Card style={styles.introCard}>
        <Text style={styles.introKicker}>SURVEY</Text>
        <Text style={styles.introDesc}>{description}</Text>
        <Text style={styles.introRule}>Every question must be answered before you can submit.</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </Card>

      {sections.map((section, sIdx) => (
        <View key={section.id} style={styles.section}>
          <Text style={styles.sectionLabel}>SECTION {sIdx + 1}</Text>
          <Text style={styles.sectionName}>{section.name}</Text>
          {section.description ? <Text style={styles.sectionDesc}>{section.description}</Text> : null}

          {section.questions.map((q) => {
            questionNumber += 1;
            const num = questionNumber;
            const hasError = errors[q.id];
            const isYesNo = q.type === 'choice' && q.options?.length === 2 && q.options[0] === 'Yes' && q.options[1] === 'No';
            const hasSelectVal = q.type === 'select' && answers[q.id];

            return (
              <Card key={q.id} style={[styles.qCard, hasError && styles.qCardError]}>
                <View style={styles.qHeaderRow}>
                  <View style={styles.qNumBadge}>
                    <Text style={styles.qNumText}>{num}</Text>
                  </View>
                  <Text style={styles.qText}>{q.question}</Text>
                </View>

                {cannotBeAnswered(q) && <Text style={styles.noOptionsText}>{NO_OPTIONS_MESSAGE}</Text>}

                {q.type === 'choice' && q.options && isYesNo && (
                  <View style={styles.yesNoRow}>
                    {q.options.map((opt) => {
                      const selected = answers[q.id] === opt;
                      return (
                        <Pressable key={opt} onPress={() => onAnswerChange(q.id, opt)} style={[styles.yesNoBtn, selected && styles.yesNoBtnActive]}>
                          <Text style={[styles.yesNoText, selected && styles.yesNoTextActive]}>{opt}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {q.type === 'choice' && q.options && !isYesNo && (
                  <View style={styles.optionsList}>
                    {q.options.map((opt) => {
                      const selected = answers[q.id] === opt;
                      return (
                        <Pressable key={opt} onPress={() => onAnswerChange(q.id, opt)} style={[styles.optionRow, selected && styles.optionRowActive]}>
                          <View style={[styles.radioCircle, selected && styles.radioCircleActive]}>
                            {selected && <View style={styles.radioDot} />}
                          </View>
                          <Text style={[styles.optionText, selected && styles.optionTextActive]}>{opt}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {q.type === 'multi' && q.options && (
                  <View style={styles.optionsList}>
                    {q.options.map((opt) => {
                      const list: string[] = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                      const selected = list.includes(opt);
                      return (
                        <Pressable
                          key={opt}
                          onPress={() => onAnswerChange(q.id, selected ? list.filter((o) => o !== opt) : [...list, opt])}
                          style={[styles.optionRow, selected && styles.optionRowActive]}
                        >
                          <View style={[styles.checkbox, selected && styles.checkboxActive]}>
                            {selected && <Icon name="check" size={12} color="#FFFFFF" />}
                          </View>
                          <Text style={[styles.optionText, selected && styles.optionTextActive]}>{opt}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {q.type === 'rating' && (
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Pressable key={star} onPress={() => onAnswerChange(q.id, star)}>
                        <Icon
                          name="star"
                          size={28}
                          color={(answers[q.id] || 0) >= star ? theme.colors.amber : theme.colors.cardBorder}
                        />
                      </Pressable>
                    ))}
                  </View>
                )}

                {q.type === 'select' && q.options && (
                  <Pressable onPress={() => setPickerQuestion(q)} style={styles.selectTrigger}>
                    <Text style={[styles.selectTriggerText, !hasSelectVal && styles.selectPlaceholder]}>
                      {answers[q.id] || q.placeholder || `Select ${q.question.toLowerCase()}`}
                    </Text>
                    <Icon name="chevron-down" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                )}

                {q.type === 'number' && (
                  <View style={styles.numberInputWrapper}>
                    <TextInput
                      style={styles.numberInput}
                      value={answers[q.id]?.toString() || ''}
                      onChangeText={(t) => onAnswerChange(q.id, t.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={theme.colors.textLight}
                    />
                    <View style={styles.numberSpinner}>
                      <View style={styles.spinnerUp}>
                        <Icon name="chevron-down" size={11} color={theme.colors.textMuted} />
                      </View>
                      <Icon name="chevron-down" size={11} color={theme.colors.textMuted} />
                    </View>
                    {q.unit ? <Text style={styles.unitSuffix}>{q.unit}</Text> : null}
                  </View>
                )}

                {q.type === 'text' && (
                  <TextInput
                    style={styles.textInput}
                    value={answers[q.id] || ''}
                    onChangeText={(t) => onAnswerChange(q.id, t)}
                    placeholder={q.placeholder || 'Type your answer...'}
                    placeholderTextColor={theme.colors.textLight}
                    multiline
                  />
                )}

                {q.type === 'photo' && (
                  photoUris[q.id] ? (
                    <View style={styles.photoPreviewBox}>
                      <Image source={{ uri: photoUris[q.id] }} style={styles.photoPreview} resizeMode="cover" />
                      <Pressable onPress={() => onCapturePhoto(q.id)} style={styles.retakePill}>
                        <Icon name="camera" size={12} color="#FFF" />
                        <Text style={styles.retakeText}>Retake</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => onCapturePhoto(q.id)} style={styles.photoBox}>
                      <Icon name="camera" size={20} color={theme.colors.textMuted} />
                      <Text style={styles.photoBoxText}>Capture photo</Text>
                    </Pressable>
                  )
                )}

                {hasError && <Text style={styles.errorText}>Answer this question</Text>}
              </Card>
            );
          })}
        </View>
      ))}

      <Button title={submitLabel} onPress={onSubmit} variant="navy" size="large" style={styles.reviewBtn} />

      <OptionPickerSheet
        visible={!!pickerQuestion}
        title={pickerQuestion?.question || ''}
        options={pickerQuestion?.options || []}
        selected={pickerQuestion ? answers[pickerQuestion.id] ?? null : null}
        required={pickerQuestion?.required}
        onConfirm={(val) => pickerQuestion && onAnswerChange(pickerQuestion.id, val)}
        onClose={() => setPickerQuestion(null)}
      />
    </>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  introCard: { gap: 6 },
  introKicker: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.primary, letterSpacing: 0.8 },
  introDesc: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textDark, lineHeight: 20 },
  introRule: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: theme.colors.fieldFill, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: theme.colors.navy },
  section: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
  sectionLabel: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  sectionName: { fontFamily: theme.fonts.display, fontSize: 19, color: theme.colors.textDark, marginTop: 1 },
  sectionDesc: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  qCard: { gap: theme.spacing.sm },
  qCardError: { borderColor: theme.colors.red },
  qHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  qNumBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.tintBlue, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  qNumText: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.navy },
  qText: { flex: 1, fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark, lineHeight: 21 },
  noOptionsText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.red, lineHeight: 18 },
  yesNoRow: { flexDirection: 'row', gap: theme.spacing.sm },
  yesNoBtn: { flex: 1, height: 48, borderRadius: theme.radius.md, backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center' },
  yesNoBtnActive: { backgroundColor: theme.colors.navy },
  yesNoText: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  yesNoTextActive: { color: '#FFFFFF' },
  optionsList: { gap: theme.spacing.xs },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.md, padding: theme.spacing.md },
  optionRowActive: { backgroundColor: theme.colors.tintBlue },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.textLight, alignItems: 'center', justifyContent: 'center' },
  radioCircleActive: { borderColor: theme.colors.navy },
  radioDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: theme.colors.navy },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: theme.colors.textLight, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: theme.colors.navy, borderColor: theme.colors.navy },
  optionText: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textDark },
  optionTextActive: { color: theme.colors.navy, fontFamily: theme.fonts.bold },
  starsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  selectTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, paddingVertical: 14 },
  selectTriggerText: { flex: 1, fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textDark },
  selectPlaceholder: { color: theme.colors.textMuted, fontFamily: theme.fonts.regular },
  numberInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, gap: 6 },
  numberInput: { flex: 1, fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark, paddingVertical: 14 },
  numberSpinner: { gap: 1 },
  spinnerUp: { transform: [{ rotate: '180deg' }] },
  unitSuffix: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textMuted },
  textInput: { backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.md, padding: theme.spacing.md, fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textDark, minHeight: 90, textAlignVertical: 'top' },
  photoBox: { height: 110, borderRadius: theme.radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.cardBorder, backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoBoxText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textMuted },
  photoPreviewBox: { position: 'relative', width: '100%', height: 140, borderRadius: theme.radius.md, overflow: 'hidden' },
  photoPreview: { width: '100%', height: '100%' },
  retakePill: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.full, flexDirection: 'row', alignItems: 'center', gap: 4 },
  retakeText: { fontFamily: theme.fonts.bold, fontSize: 11, color: '#FFF' },
  errorText: { fontFamily: theme.fonts.semibold, fontSize: 11, color: theme.colors.red },
  reviewBtn: { marginTop: theme.spacing.md },
});
