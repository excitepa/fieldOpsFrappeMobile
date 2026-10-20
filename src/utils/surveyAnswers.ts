import { Alert } from 'react-native';
import { DynamicSurveyQuestion, QuestionType } from '../types';

/** The question types answered by picking from the question's options. */
const PICK_TYPES: QuestionType[] = ['choice', 'multi', 'select'];

/** Shown on a question nobody can answer, until the survey is fixed. */
export const NO_OPTIONS_MESSAGE = 'This question has no options. Ask your supervisor to fix the survey.';

/**
 * Whether an answer counts, the way the server counts it (submit_survey_response
 * refuses a survey with any question unanswered): text that isn't empty once
 * trimmed (the server also reads "null" and "undefined" as blank), a number
 * (0 counts), a picked option, at least one ticked option, a rating star
 * chosen, a photo taken.
 */
export const isAnswered = (value: unknown, type?: QuestionType): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    return text !== '' && text !== 'null' && text !== 'undefined';
  }
  if (Array.isArray(value)) return value.some((v) => isAnswered(v));
  if (typeof value === 'number') return type === 'rating' ? value >= 1 : Number.isFinite(value);
  return true;
};

/** A question nobody can answer: one picked from options, with no options to pick. */
export const cannotBeAnswered = (question: DynamicSurveyQuestion): boolean =>
  PICK_TYPES.includes(question.type) && !(question.options && question.options.length > 0);

/** The questions without an answer, in order. Every question must be answered, whatever `required` says. */
export const unansweredQuestions = (questions: DynamicSurveyQuestion[], answers: Record<string, any>): DynamicSurveyQuestion[] =>
  questions.filter((q) => !isAnswered(answers[q.id], q.type));

/**
 * Every question must be answered before a survey can be submitted; there's
 * no "submit anyway". When some aren't, says how many are left and names them
 * (up to 5), and returns them for the caller to mark on the form. Returns []
 * when the survey is complete.
 */
export function requireAllAnswered(questions: DynamicSurveyQuestion[], answers: Record<string, any>): DynamicSurveyQuestion[] {
  const left = unansweredQuestions(questions, answers);
  if (left.length === 0) return left;
  const listed = left.slice(0, 5).map((q) => `• ${q.question}`).join('\n');
  const more = left.length > 5 ? `\n…and ${left.length - 5} more` : '';
  const broken = left.some(cannotBeAnswered) ? `\n\n${NO_OPTIONS_MESSAGE}` : '';
  Alert.alert(
    `${left.length} question${left.length === 1 ? '' : 's'} left`,
    `Every question must be answered before you can submit.\n\n${listed}${more}${broken}`,
  );
  return left;
}

/** The question ids a REQUIRED_ANSWERS_MISSING refusal names ([] for any other error). */
export const missingQuestionIds = (e: any): string[] =>
  e?.code === 'REQUIRED_ANSWERS_MISSING' && Array.isArray(e?.data?.missing)
    ? e.data.missing.map((m: any) => String(m?.question_id || '')).filter(Boolean)
    : [];

/** What a missing row's reason adds after its question, as the server words it. */
const REASON_TEXT: Record<string, string> = {
  photo_missing: 'no photo',
  photo_invalid: "the photo can't be used",
};

/**
 * What to tell the agent when the server refuses a survey: its message, and
 * for REQUIRED_ANSWERS_MISSING the questions it names (and why, for a photo),
 * unless the message already lists them.
 */
export function surveyRejectionMessage(e: any): string {
  const message = e?.message || 'The server rejected this survey. Please try again.';
  if (e?.code !== 'REQUIRED_ANSWERS_MISSING' || !Array.isArray(e?.data?.missing)) return message;
  const listed = e.data.missing
    .map((m: any) => ({ question: String(m?.question || m?.question_id || '').trim(), reason: REASON_TEXT[m?.reason] }))
    .filter((m: { question: string }) => m.question && !message.includes(m.question))
    .map((m: { question: string; reason?: string }) => `• ${m.question}${m.reason ? ` (${m.reason})` : ''}`);
  return listed.length > 0 ? `${message}\n\n${listed.join('\n')}` : message;
}
