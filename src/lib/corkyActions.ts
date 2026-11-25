import { supabase } from './supabase';
import {
  CorkyProposedAction,
  WineLogStatus,
  WineType,
} from '../types/database';

const VALID_WINE_TYPES = new Set<WineType>([
  'red',
  'white',
  'rose',
  'sparkling',
  'dessert',
  'fortified',
  'orange',
]);

const VALID_STATUSES = new Set<WineLogStatus>(['cellar', 'tasted', 'wishlist']);

function asWineType(val: unknown): WineType {
  if (typeof val === 'string') {
    const lower = val.toLowerCase() as WineType;
    if (VALID_WINE_TYPES.has(lower)) return lower;
  }
  return 'red';
}

function asStatus(val: unknown, fallback: WineLogStatus): WineLogStatus {
  if (typeof val === 'string' && VALID_STATUSES.has(val as WineLogStatus)) {
    return val as WineLogStatus;
  }
  return fallback;
}

function asOptionalText(val: unknown, maxLen: number): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

function asPositiveInt(val: unknown): number | null {
  if (typeof val !== 'number' || !Number.isInteger(val) || val <= 0) {
    return null;
  }
  return val;
}

function asVintage(val: unknown): number | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  const rounded = Math.round(val);
  return rounded >= 1800 && rounded <= 2100 ? rounded : null;
}

function asRating(val: unknown): number | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  if (val < 0 || val > 5) return null;
  return Math.round(val * 10) / 10;
}

function asPrice(val: unknown): number | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  if (val < 0 || val > 1_000_000) return null;
  return Math.round(val * 100) / 100;
}

function asStringArray(val: unknown, maxItems = 20, maxLen = 80): string[] {
  if (!Array.isArray(val)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of val) {
    const text = asOptionalText(item, maxLen);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

/**
 * Formats a bottle's display title without repeating the producer when the
 * wine name already starts with it.
 */
export function formatBottleDisplayTitle(
  producer: string,
  name: string,
  vintage: number | null
): string {
  const cleanProducer = producer.trim();
  const cleanName = name.trim();
  const yearPrefix = vintage ? `${vintage} ` : '';
  if (
    cleanProducer &&
    cleanName.toLowerCase().startsWith(cleanProducer.toLowerCase())
  ) {
    return `${yearPrefix}${cleanName}`;
  }
  return `${yearPrefix}${cleanProducer} — ${cleanName}`;
}

/**
 * Validates and normalizes `proposedActions` returned by the `corky-agent`
 * Edge Function so malformed payloads can never crash the UI or write bad data.
 */
export function normalizeProposedActions(raw: unknown): CorkyProposedAction[] {
  if (!Array.isArray(raw)) return [];
  const actions: CorkyProposedAction[] = [];

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const id = asOptionalText(obj.id, 120) || `corky-action-${Date.now()}-${i}`;
    const type = obj.type;

    if (type === 'uncork_bottle') {
      const logId = asPositiveInt(obj.logId);
      const wineId = asPositiveInt(obj.wineId);
      const producer = asOptionalText(obj.producer, 200);
      const name = asOptionalText(obj.name, 200);
      if (!logId || !wineId || !producer || !name) continue;

      const currentBottlesOnHand =
        typeof obj.currentBottlesOnHand === 'number' &&
        Number.isFinite(obj.currentBottlesOnHand)
          ? Math.max(0, Math.min(1000, Math.round(obj.currentBottlesOnHand)))
          : 0;
      const nextBottlesOnHand = Math.max(currentBottlesOnHand - 1, 0);
      const nextStatus: WineLogStatus =
        currentBottlesOnHand <= 1 ? 'tasted' : 'cellar';

      actions.push({
        id,
        type: 'uncork_bottle',
        logId,
        wineId,
        producer,
        name,
        vintage: asVintage(obj.vintage),
        wineType: asWineType(obj.wineType),
        region: asOptionalText(obj.region, 200),
        currentBottlesOnHand,
        nextBottlesOnHand,
        nextStatus,
        rating: asRating(obj.rating),
        flavorTags: asStringArray(obj.flavorTags, 20, 60),
        tastingNotes: asOptionalText(obj.tastingNotes, 4000),
      });
    } else if (type === 'add_to_wishlist') {
      const producer = asOptionalText(obj.producer, 200);
      const name = asOptionalText(obj.name, 200);
      if (!producer || !name) continue;

      actions.push({
        id,
        type: 'add_to_wishlist',
        wineId: asPositiveInt(obj.wineId),
        producer,
        name,
        vintage: asVintage(obj.vintage),
        wineType: asWineType(obj.wineType),
        region: asOptionalText(obj.region, 200),
        country: asOptionalText(obj.country, 100),
        varietals: asStringArray(obj.varietals, 20, 80),
        pricePaid: asPrice(obj.pricePaid),
        purchaseLocation: asOptionalText(obj.purchaseLocation, 200),
        notes: asOptionalText(obj.notes, 4000),
      });
    } else if (type === 'update_stock') {
      const logId = asPositiveInt(obj.logId);
      const wineId = asPositiveInt(obj.wineId);
      const producer = asOptionalText(obj.producer, 200);
      const name = asOptionalText(obj.name, 200);
      if (!logId || !wineId || !producer || !name) continue;

      const currentBottlesOnHand =
        typeof obj.currentBottlesOnHand === 'number' &&
        Number.isFinite(obj.currentBottlesOnHand)
          ? Math.max(0, Math.min(1000, Math.round(obj.currentBottlesOnHand)))
          : 0;
      const nextBottlesOnHand =
        typeof obj.nextBottlesOnHand === 'number' &&
        Number.isFinite(obj.nextBottlesOnHand)
          ? Math.max(0, Math.min(1000, Math.round(obj.nextBottlesOnHand)))
          : currentBottlesOnHand;
      const currentStatus = asStatus(
        obj.currentStatus,
        currentBottlesOnHand > 0 ? 'cellar' : 'tasted'
      );
      const nextStatus: WineLogStatus =
        nextBottlesOnHand > 0
          ? 'cellar'
          : currentStatus === 'wishlist'
          ? 'wishlist'
          : 'tasted';

      actions.push({
        id,
        type: 'update_stock',
        logId,
        wineId,
        producer,
        name,
        vintage: asVintage(obj.vintage),
        wineType: asWineType(obj.wineType),
        region: asOptionalText(obj.region, 200),
        currentBottlesOnHand,
        nextBottlesOnHand,
        currentStatus,
        nextStatus,
        delta: nextBottlesOnHand - currentBottlesOnHand,
        reason: asOptionalText(obj.reason, 200),
      });
    }
  }

  return actions;
}

/**
 * Executes a user-confirmed Corky action against Supabase.
 * Only called after the user explicitly taps "Confirm & Save".
 */
export async function executeCorkyAction(
  action: CorkyProposedAction,
  userId: string
): Promise<void> {
  if (action.type === 'uncork_bottle') {
    const { error } = await supabase.rpc('uncork_bottle', {
      p_log_id: action.logId,
      p_rating: action.rating,
      p_flavor_tags:
        action.flavorTags.length > 0 ? action.flavorTags.slice(0, 20) : null,
      p_tasting_notes: action.tastingNotes?.trim() || null,
    });
    if (error) throw error;
    return;
  }

  if (action.type === 'add_to_wishlist') {
    const { data: logId, error: saveErr } = await supabase.rpc(
      'save_confirmed_wine_and_log',
      {
        p_wine_id: action.wineId ?? null,
        p_producer: action.producer.trim(),
        p_name: action.name.trim(),
        p_vintage: action.vintage,
        p_wine_type: action.wineType,
        p_region: action.region,
        p_sub_region: null,
        p_country: action.country,
        p_appellation: null,
        p_varietals: action.varietals.slice(0, 20),
        p_abv: null,
        p_body: null,
        p_tannin: null,
        p_acidity: null,
        p_sweetness: null,
        p_tasting_notes: [],
        p_summary: null,
        p_food_pairings: [],
        p_serving_temp: null,
        p_decant_time: null,
        p_drinking_window: null,
        p_rating: null,
        p_price_paid: action.pricePaid,
        p_purchase_location: action.purchaseLocation,
        p_bottles_on_hand: 0,
        p_personal_notes: action.notes,
        p_photo_url: null,
      }
    );

    if (saveErr) throw saveErr;

    if (logId) {
      const { error: patchErr } = await supabase
        .from('wine_logs')
        .update({
          status: 'wishlist',
          bottles_on_hand: 0,
          flavor_tags: [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', logId)
        .eq('user_id', userId);
      if (patchErr) throw patchErr;
    }
    return;
  }

  if (action.type === 'update_stock') {
    const clampedCount = Math.max(
      0,
      Math.min(1000, Math.round(action.nextBottlesOnHand))
    );
    const nextStatus: WineLogStatus =
      clampedCount > 0
        ? 'cellar'
        : action.currentStatus === 'wishlist'
        ? 'wishlist'
        : 'tasted';

    const { error } = await supabase
      .from('wine_logs')
      .update({
        status: nextStatus,
        bottles_on_hand: clampedCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', action.logId)
      .eq('user_id', userId);

    if (error) throw error;
  }
}
