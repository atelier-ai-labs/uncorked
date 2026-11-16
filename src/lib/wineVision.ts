import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';
import { ExtractedWineProfile } from '../types/database';

export interface CompressedPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

/**
 * Resize and compress a camera/gallery photo to ~1024px width JPEG (0.75 quality).
 * This cuts Gemini Vision token cost and Supabase Storage size by ~90% while keeping label text sharp.
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
    throw new Error('Failed to encode bottle photo as base64.');
  }

  return {
    uri: manipulated.uri,
    base64: manipulated.base64,
    mimeType: 'image/jpeg',
  };
}

/**
 * Analyze a wine bottle label using either:
 * 1. The deployed Supabase Edge Function `analyze-wine-label` (recommended, keeps GEMINI_API_KEY on server + checks shared catalog)
 * 2. Direct client-side Gemini Flash call if `EXPO_PUBLIC_GEMINI_API_KEY` is provided in `.env`
 */
export async function analyzeWineLabel(
  photo: CompressedPhoto
): Promise<{ wine: ExtractedWineProfile; cached: boolean }> {
  // First try the Supabase Edge Function
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

  // Fallback to EXPO_PUBLIC_GEMINI_API_KEY if configured locally
  const localGeminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!localGeminiKey) {
    const errMsg =
      data?.error ||
      error?.message ||
      'Gemini API key not configured. Add GEMINI_API_KEY to Supabase Edge Function secrets or EXPO_PUBLIC_GEMINI_API_KEY in .env.';
    throw new Error(errMsg);
  }

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${localGeminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: 'You are an expert Master Sommelier. Inspect this wine bottle label carefully. Extract the exact producer, wine name, vintage, region, sub_region, country, appellation, and ABV from the label. Infer the grape varietals, wine_type (red, white, rose, sparkling, dessert, fortified, orange), tasting profile (body, tannin, acidity, sweetness, tasting_notes), concise sommelier summary, food_pairings, serving_temp, decant_time, and drinking_window. Return strict JSON.',
              },
              {
                inlineData: {
                  mimeType: photo.mimeType,
                  data: photo.base64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    throw new Error(`Gemini API failed: ${errText}`);
  }

  const json = await geminiRes.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Could not read wine label from photo.');
  }

  const parsed: ExtractedWineProfile = JSON.parse(rawText);
  return { wine: parsed, cached: false };
}

/**
 * Upload compressed JPEG to Supabase Storage `bottle-photos/{userId}/{timestamp}.jpg`
 */
export async function uploadBottlePhoto(
  userId: string,
  photo: CompressedPhoto
): Promise<string | null> {
  try {
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

    const { data } = supabase.storage.from('bottle-photos').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err) {
    console.warn('Photo upload skipped:', err);
    return null;
  }
}
