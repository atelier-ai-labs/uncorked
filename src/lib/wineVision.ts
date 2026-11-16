import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';
import { ExtractedWineProfile, WineLog } from '../types/database';

export interface CompressedPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

const MAX_BASE64_LENGTH = 4_000_000; // ~3 MB max
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET_MARKER = '/bottle-photos/';

/**
 * Resize and compress a camera/gallery photo to ~1024px width JPEG (0.75 quality).
 * Strips EXIF location/device metadata and keeps payload well under size limits.
 */
export async function compressBottlePhoto(uri: string): Promise<CompressedPhoto> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    {
      compress: 0.75,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  if (!manipulated.base64) {
    throw new Error('Failed to encode bottle photo.');
  }

  if (manipulated.base64.length > MAX_BASE64_LENGTH) {
    throw new Error('Compressed image exceeds the 3 MB security limit.');
  }

  return {
    uri: manipulated.uri,
    base64: manipulated.base64,
    mimeType: 'image/jpeg',
  };
}

/**
 * Analyze a wine bottle label strictly via the authenticated Supabase Edge Function
 * (`analyze-wine-label`). Returns a proposed wine profile for user review/confirmation.
 */
export async function analyzeWineLabel(
  photo: CompressedPhoto
): Promise<{ wine: ExtractedWineProfile; cached: boolean }> {
  if (photo.base64.length > MAX_BASE64_LENGTH) {
    throw new Error('Image exceeds the maximum allowed size.');
  }

  const { data, error } = await supabase.functions.invoke('analyze-wine-label', {
    body: {
      imageBase64: photo.base64,
      mimeType: photo.mimeType,
    },
  });

  if (!error && data?.wine) {
    return {
      wine: data.wine as ExtractedWineProfile,
      cached: Boolean(data.cached),
    };
  }

  const errMsg =
    data?.error ||
    error?.message ||
    'Unable to analyze wine label right now. Please try again.';
  throw new Error(errMsg);
}

/**
 * Upload compressed JPEG to private Supabase Storage bucket `bottle-photos/{userId}/{timestamp}.jpg`
 */
export async function uploadBottlePhoto(
  userId: string,
  photo: CompressedPhoto
): Promise<string | null> {
  try {
    if (!UUID_REGEX.test(userId)) {
      throw new Error('Invalid user ID for storage path.');
    }

    const filePath = `${userId}/${Date.now()}.jpg`;
    const binaryString = atob(photo.base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const { error } = await supabase.storage
      .from('bottle-photos')
      .upload(filePath, bytes.buffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) {
      console.warn('Photo upload warning:', error.message);
      return null;
    }

    // Store canonical bucket reference URL (validated by DB CHECK constraint);
    // since the bucket is private, resolveSignedBottlePhotoUrls() exchanges it for a short-lived signed URL on read.
    const { data } = supabase.storage.from('bottle-photos').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err) {
    console.warn('Photo upload skipped:', err);
    return null;
  }
}

/**
 * Extract private storage object paths from wine logs and batch-resolve short-lived signed URLs (1 hour TTL).
 */
export async function resolveSignedBottlePhotoUrls(
  logs: WineLog[]
): Promise<WineLog[]> {
  const pathEntries: { index: number; objectPath: string }[] = [];

  logs.forEach((log, idx) => {
    if (!log.photo_url) return;
    const markerIdx = log.photo_url.indexOf(BUCKET_MARKER);
    if (markerIdx !== -1) {
      const rawPath = log.photo_url
        .slice(markerIdx + BUCKET_MARKER.length)
        .split('?')[0];
      if (rawPath) {
        pathEntries.push({ index: idx, objectPath: rawPath });
      }
    }
  });

  if (pathEntries.length === 0) {
    return logs;
  }

  const { data: signedList, error } = await supabase.storage
    .from('bottle-photos')
    .createSignedUrls(
      pathEntries.map((e) => e.objectPath),
      3600
    );

  if (error || !signedList) {
    return logs;
  }

  const nextLogs = [...logs];
  signedList.forEach((item, i) => {
    if (item.signedUrl) {
      const logIdx = pathEntries[i].index;
      nextLogs[logIdx] = {
        ...nextLogs[logIdx],
        photo_url: item.signedUrl,
      };
    }
  });

  return nextLogs;
}
