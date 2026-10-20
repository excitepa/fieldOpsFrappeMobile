import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { DynamicSurveyQuestion } from '../types';
import { debugLog } from './logger';

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.6;

/**
 * Shrinks a just-captured survey photo (~1280px wide, JPEG 0.6) and keeps it in
 * the app's documents folder until the survey is accepted. Camera and resize output live
 * in the cache folder, which the OS can clear first — the app has hit "photo
 * file is no longer on this device" that way before. If shrinking or keeping
 * fails, the photo is used as-is rather than lost.
 */
export const keepSurveyPhoto = async (uri: string, width?: number): Promise<string> => {
  let source = uri;
  try {
    const context = ImageManipulator.manipulate(uri);
    if (!width || width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
    const image = await context.renderAsync();
    source = (await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG })).uri;
  } catch (e) {
    debugLog('[surveyPhotos] could not shrink photo, keeping the original', e);
  }
  try {
    const dir = new Directory(Paths.document, 'survey-photos');
    dir.create({ idempotent: true });
    const ext = source.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
    const kept = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
    new File(source).copySync(kept);
    return kept.uri;
  } catch (e) {
    debugLog('[surveyPhotos] could not keep photo in documents, using it in place', e);
    return source;
  }
};

export const surveyPhotoExists = (uri?: string | null): boolean => {
  if (!uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
};

/** Deletes a kept survey photo once it's no longer needed (accepted with its survey, retaken or removed). */
export const discardSurveyPhoto = (uri?: string | null) => {
  if (!surveyPhotoExists(uri)) return;
  try {
    new File(uri as string).delete();
  } catch (e) {
    debugLog('[surveyPhotos] could not delete photo', uri, e);
  }
};

/**
 * A survey's photos, sent with it in one request (question id -> the kept
 * file). The server only accepts a survey that carries a photo for every
 * photo question.
 */
export const surveyPhotoFiles = (questions: DynamicSurveyQuestion[], photoUris: Record<string, string>): Record<string, string> =>
  Object.fromEntries(questions.filter((q) => q.type === 'photo').map((q) => [q.id, photoUris[q.id] || '']));

/** The photo questions whose photo isn't on this device (any more), so it has to be taken again. */
export const lostSurveyPhotos = (questions: DynamicSurveyQuestion[], files: Record<string, string>): DynamicSurveyQuestion[] =>
  questions.filter((q) => q.type === 'photo' && !surveyPhotoExists(files[q.id]));

/** What to tell the agent about photos that are gone. */
export const lostPhotosMessage = (lost: DynamicSurveyQuestion[]): string =>
  `The photo for ${lost.map((q) => `"${q.question}"`).join(', ')} is no longer on this device. Take it again.`;

/** Deletes a survey's kept photos once the survey with them is accepted. */
export const discardSurveyPhotos = (files: Record<string, string>) => {
  Object.values(files).forEach(discardSurveyPhoto);
};
