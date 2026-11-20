import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { WineLog } from '../types/database';
import { FlavorTagPicker } from './FlavorTagPicker';
import { StarRatingInput } from './StarRatingInput';

interface UncorkTastingModalProps {
  log: WineLog | null;
  onClose: () => void;
  onUncorked: () => void;
}

export function UncorkTastingModal({
  log,
  onClose,
  onUncorked,
}: UncorkTastingModalProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [flavorTags, setFlavorTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (log) {
      setRating(log.rating ?? null);
      setFlavorTags(log.flavor_tags ?? []);
      setNotes(log.tasting_notes ?? '');
      setSaving(false);
      setErrorMsg(null);
    }
  }, [log]);

  if (!log) return null;

  const wine = log.wines;
  const onHand = log.bottles_on_hand ?? 0;
  const inventoryPreview =
    onHand > 1
      ? `Opening 1 bottle • ${onHand - 1} will remain in your cellar`
      : 'Opening your last bottle • will move to Tasted history';

  const handleConfirm = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.rpc('uncork_bottle', {
        p_log_id: log.id,
        p_rating: rating,
        p_flavor_tags: flavorTags,
        p_tasting_notes: notes.trim() || null,
      });

      if (error) throw error;

      onUncorked();
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not uncork bottle right now.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={Boolean(log)}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} disabled={saving}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Uncork Bottle</Text>
          <Pressable onPress={handleConfirm} disabled={saving}>
            <Text style={[styles.confirmText, saving && { opacity: 0.4 }]}>
              {saving ? 'Saving...' : 'Confirm'}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.contextBanner}>
            <Text style={styles.bannerTitle}>
              {wine.vintage ? `${wine.vintage} ` : ''}
              {wine.producer} — {wine.name}
            </Text>
            <Text style={styles.bannerSubtitle}>{inventoryPreview}</Text>
          </View>

          {errorMsg && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorMsg}</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Score This Pour</Text>
            <StarRatingInput value={rating} onChange={setRating} />

            <FlavorTagPicker
              wineType={wine.wine_type}
              selected={flavorTags}
              suggested={wine.tasting_notes}
              onChange={setFlavorTags}
            />

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Personal Tasting Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="How is it drinking tonight? Great with food?"
                placeholderTextColor="#6E555C"
                multiline
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </View>

          <Pressable
            style={[styles.ctaButton, saving && { opacity: 0.6 }]}
            onPress={handleConfirm}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF8F5" />
            ) : (
              <Text style={styles.ctaButtonText}>🍾 Uncork & Save Tasting</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12090C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2B171E',
    backgroundColor: '#190D11',
  },
  cancelText: {
    color: '#B89FA5',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#FAF3F0',
    fontSize: 17,
    fontWeight: '700',
  },
  confirmText: {
    color: '#E5A93C',
    fontSize: 16,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  contextBanner: {
    backgroundColor: '#1E1116',
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#4F2B37',
  },
  bannerTitle: {
    color: '#FAF3F0',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 5,
  },
  bannerSubtitle: {
    color: '#E5A93C',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: 'rgba(220, 62, 72, 0.16)',
    borderWidth: 1,
    borderColor: '#DC3E48',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#FFD9DC',
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    backgroundColor: '#1A0E12',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2E1820',
  },
  sectionTitle: {
    color: '#FAF3F0',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  fieldGroup: {
    marginTop: 14,
  },
  label: {
    color: '#C8AEB5',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#12090C',
    borderWidth: 1,
    borderColor: '#341D25',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: '#FAF3F0',
    fontSize: 15,
  },
  textArea: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  ctaButton: {
    backgroundColor: '#9E2A3A',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D65A6B',
  },
  ctaButtonText: {
    color: '#FFF8F5',
    fontSize: 16,
    fontWeight: '800',
  },
});
