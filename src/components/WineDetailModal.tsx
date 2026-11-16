import React, { useState } from 'react';
import {
  Image,
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
import { StarRatingInput } from './StarRatingInput';

interface WineDetailModalProps {
  log: WineLog | null;
  onClose: () => void;
  onUpdated: () => void;
}

export function WineDetailModal({
  log,
  onClose,
  onUpdated,
}: WineDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(log?.rating ?? 4.0);
  const [notes, setNotes] = useState(log?.tasting_notes ?? '');
  const [price, setPrice] = useState(
    log?.price_paid != null ? String(log.price_paid) : ''
  );
  const [bottlesOnHand, setBottlesOnHand] = useState(log?.bottles_on_hand ?? 0);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (log) {
      setEditing(false);
      setRating(log.rating ?? 4.0);
      setNotes(log.tasting_notes ?? '');
      setPrice(log.price_paid != null ? String(log.price_paid) : '');
      setBottlesOnHand(log.bottles_on_hand ?? 0);
    }
  }, [log]);

  if (!log) return null;
  const wine = log.wines;

  const handleUpdate = async () => {
    setSaving(true);
    try {
      const parsedPrice = price.trim() ? parseFloat(price.trim()) : null;
      const { error } = await supabase
        .from('wine_logs')
        .update({
          rating,
          tasting_notes: notes.trim() || null,
          price_paid: Number.isNaN(parsedPrice) ? null : parsedPrice,
          bottles_on_hand: bottlesOnHand,
          updated_at: new Date().toISOString(),
        })
        .eq('id', log.id);

      if (!error) {
        setEditing(false);
        onUpdated();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('wine_logs').delete().eq('id', log.id);
      if (!error) {
        onUpdated();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={Boolean(log)} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Bottle Profile</Text>
          <Pressable
            onPress={() => (editing ? handleUpdate() : setEditing(true))}
            disabled={saving}
          >
            <Text style={styles.editText}>
              {editing ? (saving ? 'Saving...' : 'Save') : 'Edit'}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {log.photo_url && (
            <Image source={{ uri: log.photo_url }} style={styles.heroImage} />
          )}

          <View style={styles.titleCard}>
            <View style={styles.badgeRow}>
              <Text style={styles.wineTypeBadge}>
                {wine.wine_type.toUpperCase()}
              </Text>
              {wine.vintage && (
                <Text style={styles.vintageBadge}>{wine.vintage}</Text>
              )}
              {wine.abv && <Text style={styles.abvBadge}>{wine.abv}% ABV</Text>}
            </View>

            <Text style={styles.producer}>{wine.producer}</Text>
            <Text style={styles.wineName}>{wine.name}</Text>

            {(wine.region || wine.country) && (
              <Text style={styles.originText}>
                📍 {[wine.sub_region, wine.region, wine.country]
                  .filter(Boolean)
                  .join(' • ')}
              </Text>
            )}

            {wine.varietals?.length > 0 && (
              <Text style={styles.varietalText}>
                🍇 {wine.varietals.join(', ')}
              </Text>
            )}
          </View>

          {/* Personal Tasting Log */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Tasting Log</Text>

            {editing ? (
              <View style={{ gap: 12 }}>
                <StarRatingInput value={rating} onChange={setRating} />
                <View>
                  <Text style={styles.label}>Price Paid ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    placeholder="28.00"
                    placeholderTextColor="#6E555C"
                  />
                </View>
                <View>
                  <Text style={styles.label}>Your Tasting Notes</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 80 }]}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    placeholder="Add your thoughts..."
                    placeholderTextColor="#6E555C"
                  />
                </View>
              </View>
            ) : (
              <>
                <View style={styles.ratingSummaryRow}>
                  <View style={styles.bigRatingPill}>
                    <Text style={styles.bigRatingStar}>★</Text>
                    <Text style={styles.bigRatingValue}>
                      {log.rating != null ? Number(log.rating).toFixed(1) : '—'}
                    </Text>
                    <Text style={styles.bigRatingMax}>/ 5.0</Text>
                  </View>

                  {log.price_paid != null && (
                    <View style={styles.metaBox}>
                      <Text style={styles.metaLabel}>PRICE PAID</Text>
                      <Text style={styles.metaValue}>
                        ${Number(log.price_paid).toFixed(2)}
                      </Text>
                    </View>
                  )}

                  <View style={styles.metaBox}>
                    <Text style={styles.metaLabel}>IN CELLAR</Text>
                    <Text style={styles.metaValue}>
                      {log.bottles_on_hand ?? 0} on hand
                    </Text>
                  </View>

                  <View style={styles.metaBox}>
                    <Text style={styles.metaLabel}>LOGGED ON</Text>
                    <Text style={styles.metaValue}>{log.drank_at}</Text>
                  </View>
                </View>

                {log.tasting_notes ? (
                  <Text style={styles.personalNotesText}>
                    “{log.tasting_notes}”
                  </Text>
                ) : (
                  <Text style={styles.emptyNotesText}>
                    No personal tasting notes added yet. Tap Edit to add yours!
                  </Text>
                )}
              </>
            )}
          </View>

          {/* Sommelier Knowledge Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sommelier Profile</Text>
            {wine.summary && (
              <Text style={styles.summaryText}>{wine.summary}</Text>
            )}

            <View style={styles.structureGrid}>
              {wine.body && (
                <View style={styles.structureItem}>
                  <Text style={styles.structureLabel}>BODY</Text>
                  <Text style={styles.structureValue}>{wine.body}</Text>
                </View>
              )}
              {wine.tannin && (
                <View style={styles.structureItem}>
                  <Text style={styles.structureLabel}>TANNIN</Text>
                  <Text style={styles.structureValue}>{wine.tannin}</Text>
                </View>
              )}
              {wine.acidity && (
                <View style={styles.structureItem}>
                  <Text style={styles.structureLabel}>ACIDITY</Text>
                  <Text style={styles.structureValue}>{wine.acidity}</Text>
                </View>
              )}
              {wine.sweetness && (
                <View style={styles.structureItem}>
                  <Text style={styles.structureLabel}>SWEETNESS</Text>
                  <Text style={styles.structureValue}>{wine.sweetness}</Text>
                </View>
              )}
            </View>

            {wine.tasting_notes?.length > 0 && (
              <View style={styles.tagsSection}>
                <Text style={styles.subHeader}>TYPICAL AROMAS & FLAVORS</Text>
                <View style={styles.tagsRow}>
                  {wine.tasting_notes.map((n, i) => (
                    <View key={i} style={styles.notePill}>
                      <Text style={styles.notePillText}>{n}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {wine.food_pairings?.length > 0 && (
              <View style={styles.tagsSection}>
                <Text style={styles.subHeader}>FOOD PAIRINGS</Text>
                <View style={styles.tagsRow}>
                  {wine.food_pairings.map((p, i) => (
                    <View key={i} style={styles.pairingPill}>
                      <Text style={styles.pairingPillText}>🍽️ {p}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.serviceFooter}>
              {wine.serving_temp && (
                <Text style={styles.serviceItem}>
                  🌡️ Serve: {wine.serving_temp}
                </Text>
              )}
              {wine.decant_time && (
                <Text style={styles.serviceItem}>
                  ⏳ Decant: {wine.decant_time}
                </Text>
              )}
              {wine.drinking_window && (
                <Text style={styles.serviceItem}>
                  📅 Window: {wine.drinking_window}
                </Text>
              )}
            </View>
          </View>

          <Pressable
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={saving}
          >
            <Text style={styles.deleteButtonText}>Remove from My Cellar</Text>
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
  closeText: {
    color: '#B89FA5',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#FAF3F0',
    fontSize: 17,
    fontWeight: '700',
  },
  editText: {
    color: '#E5A93C',
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  heroImage: {
    width: '100%',
    height: 250,
    borderRadius: 20,
    marginBottom: 16,
    resizeMode: 'cover',
  },
  titleCard: {
    backgroundColor: '#1E1116',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#382028',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  wineTypeBadge: {
    backgroundColor: '#9E2A3A',
    color: '#FFF8F5',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    letterSpacing: 1,
  },
  vintageBadge: {
    backgroundColor: '#2D1921',
    color: '#E5A93C',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  abvBadge: {
    backgroundColor: '#23141A',
    color: '#B89FA5',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  producer: {
    color: '#D49B6A',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  wineName: {
    color: '#FAF3F0',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 10,
  },
  originText: {
    color: '#D8C3C8',
    fontSize: 13,
    marginBottom: 4,
  },
  varietalText: {
    color: '#B89FA5',
    fontSize: 13,
  },
  card: {
    backgroundColor: '#1A0E12',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2E1820',
  },
  cardTitle: {
    color: '#FAF3F0',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  ratingSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
  },
  bigRatingPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#29151D',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#522635',
  },
  bigRatingStar: {
    color: '#E5A93C',
    fontSize: 20,
    marginRight: 6,
  },
  bigRatingValue: {
    color: '#FAF3F0',
    fontSize: 22,
    fontWeight: '800',
  },
  bigRatingMax: {
    color: '#9C7E86',
    fontSize: 12,
    marginLeft: 3,
  },
  metaBox: {
    backgroundColor: '#140B0E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2B171E',
  },
  metaLabel: {
    color: '#8E727A',
    fontSize: 10,
    fontWeight: '700',
  },
  metaValue: {
    color: '#FAF3F0',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  personalNotesText: {
    color: '#F2E5E8',
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  emptyNotesText: {
    color: '#7A6268',
    fontSize: 13,
  },
  summaryText: {
    color: '#E6D6DA',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  structureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  structureItem: {
    backgroundColor: '#140B0E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#321B22',
    minWidth: '22%',
  },
  structureLabel: {
    color: '#8E727A',
    fontSize: 10,
    fontWeight: '700',
  },
  structureValue: {
    color: '#FAF3F0',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  tagsSection: {
    marginBottom: 12,
  },
  subHeader: {
    color: '#9C7E86',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  notePill: {
    backgroundColor: '#2D161F',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  notePillText: {
    color: '#F5D0D8',
    fontSize: 12,
    fontWeight: '600',
  },
  pairingPill: {
    backgroundColor: '#241B15',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  pairingPillText: {
    color: '#EED5B7',
    fontSize: 12,
    fontWeight: '600',
  },
  serviceFooter: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2B171E',
    gap: 6,
  },
  serviceItem: {
    color: '#C8AEB5',
    fontSize: 13,
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
  deleteButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#5C232C',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#E06C75',
    fontSize: 14,
    fontWeight: '700',
  },
});
