import { Alert } from 'react-native';
import { DynamicSurveyQuestion } from '../types';

/** Whether a survey answer counts as answered: blank text and empty lists don't. */
export const isAnswered = (value: unknown): boolean =>
  !(value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0));

/** The questions with no answer. After the required ones are checked, these are the optional ones left blank. */
export const unansweredQuestions = (questions: DynamicSurveyQuestion[], answers: Record<string, any>): DynamicSurveyQuestion[] =>
  questions.filter((q) => !isAnswered(answers[q.id]));

/**
 * Before a survey is submitted: when optional questions are left blank, a
 * prompt listing them with "Go back" and "Submit anyway", so a skipped
 * question is a choice rather than a slip. Submits straight away when every
 * question has an answer.
 */
export function confirmUnanswered(questions: DynamicSurveyQuestion[], answers: Record<string, any>, onSubmit: () => void): void {
  const blank = unansweredQuestions(questions, answers);
  if (blank.length === 0) {
    onSubmit();
    return;
  }
  const listed = blank.slice(0, 5).map((q) => `• ${q.question}`).join('\n');
  const more = blank.length > 5 ? `\n…and ${blank.length - 5} more` : '';
  Alert.alert(
    `${blank.length} question${blank.length === 1 ? '' : 's'} unanswered`,
    `${listed}${more}`,
    [
      { text: 'Go back', style: 'cancel' },
      { text: 'Submit anyway', onPress: onSubmit },
    ],
  );
}

/** The question ids a REQUIRED_ANSWERS_MISSING refusal names ([] for any other error). */
export const missingQuestionIds = (e: any): string[] =>
  e?.code === 'REQUIRED_ANSWERS_MISSING' && Array.isArray(e?.data?.missing)
    ? e.data.missing.map((m: any) => String(m?.question_id || '')).filter(Boolean)
    : [];

/**
 * What to tell the agent when the server refuses a survey: its message, and
 * for REQUIRED_ANSWERS_MISSING the questions it names, unless the message
 * already lists them.
 */
export function surveyRejectionMessage(e: any): string {
  const message = e?.message || 'The server rejected this survey. Please try again.';
  if (e?.code !== 'REQUIRED_ANSWERS_MISSING' || !Array.isArray(e?.data?.missing)) return message;
  const listed = e.data.missing
    .map((m: any) => String(m?.question || m?.question_id || '').trim())
    .filter((q: string) => q && !message.includes(q))
    .map((q: string) => `• ${q}`);
  return listed.length > 0 ? `${message}\n\n${listed.join('\n')}` : message;
}
