import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { uploadSurveyPhoto } from '../services/api';
import { PendingSurveyPhoto } from '../types';
import { debugLog } from './logger';

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.6;

/**
 * Shrinks a just-captured survey photo (~1280px wide, JPEG 0.6) and keeps it in
 * the app's documents folder until it's uploaded. Camera and resize output live
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

/** Deletes a kept survey photo once it's no longer needed (uploaded, retaken or removed). */
export const discardSurveyPhoto = (uri?: string | null) => {
  if (!surveyPhotoExists(uri)) return;
  try {
    new File(uri as string).delete();
  } catch (e) {
    debugLog('[surveyPhotos] could not delete photo', uri, e);
  }
};

/**
 * Uploads the captured photos (question id -> local uri) of a survey response
 * that just reached the server, trying each twice and deleting its local copy
 * once it's up. Never throws — the response itself already went through, so a
 * photo that didn't must not be treated as a failed or offline survey. Returns
 * the photos still to upload, ready to queue for the Sync page.
 */
export const uploadSurveyPhotos = async (
  responseId: string,
  photoUris: Record<string, string>,
  surveyName?: string
): Promise<{ failed: PendingSurveyPhoto[]; reason?: string }> => {
  const failed: PendingSurveyPhoto[] = [];
  let reason: string | undefined;
  for (const [questionId, photoUri] of Object.entries(photoUris)) {
    if (!photoUri) continue;
    let uploaded = false;
    for (let attempt = 1; attempt <= 2 && !uploaded; attempt++) {
      try {
        await uploadSurveyPhoto(responseId, questionId, photoUri);
        uploaded = true;
      } catch (e: any) {
        reason = e?.message || 'The photo upload failed for an unknown reason.';
        debugLog(`[surveyPhotos] response ${responseId} photo for ${questionId} failed (attempt ${attempt}/2) ->`, reason);
      }
    }
    if (uploaded) {
      discardSurveyPhoto(photoUri);
    } else {
      failed.push({
        id: `sp_${Date.now()}_${questionId}`,
        responseId,
        questionId,
        photoUri,
        surveyName,
        createdAt: new Date().toISOString(),
      });
    }
  }
  return { failed, reason };
};

/** Alert body for a survey that was saved while some of its photos weren't — same shape as the outlet photo alert. */
export const photosNotUploadedMessage = (count: number, reason?: string): string =>
  [
    `The survey was saved, but ${count === 1 ? 'its photo' : `${count} of its photos`} could not be uploaded yet.`,
    reason ? `\nReason: ${reason}` : '',
    `\n${count === 1 ? 'It has' : 'They have'} been queued and will upload from the Sync page.`,
  ].join('');
