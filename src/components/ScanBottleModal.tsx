import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  analyzeWineLabel,
  compressBottlePhoto,
  CompressedPhoto,
  uploadBottlePhoto,
} from '../lib/wineVision';
import { supabase } from '../lib/supabase';
import { ExtractedWineProfile, WineType } from '../types/database';
import { StarRatingInput } from './StarRatingInput';

interface ScanBottleModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

const WINE_TYPES: { value: WineType; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'white', label: 'White' },
  { value: 'rose', label: 'Rosé' },
  { value: 'sparkling', label: 'Sparkling' },
  { value: 'orange', label: 'Orange' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'fortified', label: 'Fortified' },
];

export function ScanBottleModal({
  visible,
  userId,
  onClose,
  onSaved,
}: ScanBottleModalProps) {
  const [photo, setPhoto] = useState<CompressedPhoto | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cachedCatalogHit, setCachedCatalogHit] = useState(false);

  // Extracted / Editable Wine Details
  const [wineId, setWineId] = useState<number | undefined>(undefined);
  const [producer, setProducer] = useState('');
  const [name, setName] = useState('');
  const [vintage, setVintage] = useState('');
  const [wineType, setWineType] = useState<WineType>('red');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [appellation, setAppellation] = useState('');
  const [varietals, setVarietals] = useState('');
  const [abv, setAbv] = useState('');
  const [profile, setProfile] = useState<ExtractedWineProfile | null>(null);

  // Personal Tasting Log Fields
  const [rating, setRating] = useState(4.2);
  const [pricePaid, setPricePaid] = useState('');
  const [purchaseLocation, setPurchaseLocation] = useState('');
  const [personalNotes, setPersonalNotes] = useState('');

  const resetForm = () => {
    setPhoto(null);
    setAnalyzing(false);
    setSaving(false);
    setErrorMsg(null);
    setCachedCatalogHit(false);
    setWineId(undefined);
    setProducer('');
    setName('');
    setVintage('');
    setWineType('red');
    setRegion('');
    setCountry('');
    setAppellation('');
    setVarietals('');
    setAbv('');
    setProfile(null);
    setRating(4.2);
    setPricePaid('');
    setPurchaseLocation('');
    setPersonalNotes('');
  };

  const applyExtractedWine = (w: ExtractedWineProfile, cached: boolean) => {
    setProfile(w);
    setCachedCatalogHit(cached);
    setWineId(w.id);
    setProducer(w.producer || '');
    setName(w.name || '');
    setVintage(w.vintage ? String(w.vintage) : '');
    setWineType(w.wine_type || 'red');
    setRegion([w.sub_region, w.region].filter(Boolean).join(', '));
    setCountry(w.country || '');
    setAppellation(w.appellation || '');
    setVarietals((w.varietals || []).join(', '));
    setAbv(w.abv ? String(w.abv) : '');
  };

  const handlePickImage = async (useCamera: boolean) => {
    setErrorMsg(null);

    try {
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setErrorMsg('Camera permission is required to scan a wine bottle.');
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setErrorMsg('Photo library permission is required to select a bottle image.');
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
          });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      setAnalyzing(true);
      const compressed = await compressBottlePhoto(result.assets[0].uri);
      setPhoto(compressed);

      const { wine, cached } = await analyzeWineLabel(compressed);
      applyExtractedWine(wine, cached);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not analyze label automatically. You can still fill in the details below.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveLog = async () => {
    if (!producer.trim() || !name.trim()) {
      setErrorMsg('Please enter at least the Producer and Wine Name.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      let finalWineId = wineId;

      if (!finalWineId) {
        const parsedVintage = vintage.trim() ? parseInt(vintage.trim(), 10) : null;
        const parsedAbv = abv.trim() ? parseFloat(abv.trim()) : null;
        const parsedVarietals = varietals
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        const { data: insertedWine, error: wineErr } = await supabase
          .from('wines')
          .insert({
            producer: producer.trim(),
            name: name.trim(),
            vintage: Number.isNaN(parsedVintage) ? null : parsedVintage,
            wine_type: wineType,
            region: region.trim() || null,
            country: country.trim() || null,
            appellation: appellation.trim() || null,
            varietals: parsedVarietals,
            abv: Number.isNaN(parsedAbv) ? null : parsedAbv,
            body: profile?.body || null,
            tannin: profile?.tannin || null,
            acidity: profile?.acidity || null,
            sweetness: profile?.sweetness || null,
            tasting_notes: profile?.tasting_notes || [],
            summary: profile?.summary || null,
            food_pairings: profile?.food_pairings || [],
            serving_temp: profile?.serving_temp || null,
            decant_time: profile?.decant_time || null,
            drinking_window: profile?.drinking_window || null,
            created_by: userId,
          })
          .select('id')
          .single();

        if (wineErr) throw wineErr;
        finalWineId = insertedWine.id;
      }

      let uploadedPhotoUrl: string | null = null;
      if (photo) {
        uploadedPhotoUrl = await uploadBottlePhoto(userId, photo);
      }

      const parsedPrice = pricePaid.trim() ? parseFloat(pricePaid.trim()) : null;

      const { error: logErr } = await supabase.from('wine_logs').insert({
        user_id: userId,
        wine_id: finalWineId,
        rating,
        price_paid: Number.isNaN(parsedPrice) ? null : parsedPrice,
        purchase_location: purchaseLocation.trim() || null,
        tasting_notes: personalNotes.trim() || null,
        photo_url: uploadedPhotoUrl,
      });

      if (logErr) throw logErr;

      resetForm();
      onSaved();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save wine log.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              resetForm();
              onClose();
            }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Scan & Log Bottle</Text>
          <Pressable onPress={handleSaveLog} disabled={saving || analyzing}>
            <Text
              style={[
                styles.saveText,
                (saving || analyzing) && { opacity: 0.4 },
              ]}
            >
              {saving ? 'Saving...' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Step 1: Camera / Photo Picker */}
          <View style={styles.scanSection}>
            {photo ? (
              <View style={styles.photoPreviewWrapper}>
                <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                <View style={styles.retakeOverlay}>
                  <Pressable
                    style={styles.retakeButton}
                    onPress={() => handlePickImage(true)}
                  >
                    <Text style={styles.retakeButtonText}>Retake Photo</Text>
                  </Pressable>
                  <Pressable
                    style={styles.retakeButton}
                    onPress={() => handlePickImage(false)}
                  >
                    <Text style={styles.retakeButtonText}>Choose Another</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.scanButtonsRow}>
                <Pressable
                  style={styles.cameraButton}
                  onPress={() => handlePickImage(true)}
                >
                  <Text style={styles.cameraIcon}>📷</Text>
                  <Text style={styles.cameraButtonTitle}>Snap Wine Label</Text>
                  <Text style={styles.cameraButtonSub}>
                    AI reads bottle & sommelier profile
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.galleryButton}
                  onPress={() => handlePickImage(false)}
                >
                  <Text style={styles.cameraIcon}>🖼️</Text>
                  <Text style={styles.galleryButtonTitle}>From Library</Text>
                  <Text style={styles.cameraButtonSub}>Import existing photo</Text>
                </Pressable>
              </View>
            )}

            {analyzing && (
              <View style={styles.analyzingCard}>
                <ActivityIndicator color="#D49B6A" size="small" />
                <Text style={styles.analyzingText}>
                  Sommelier AI is reading the label & tasting profile...
                </Text>
              </View>
            )}

            {errorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorMsg}</Text>
              </View>
            )}
          </View>

          {/* Step 2: AI Sommelier Insights Card (if extracted) */}
          {profile && (
            <View style={styles.sommCard}>
              <View style={styles.sommHeaderRow}>
                <Text style={styles.sommBadge}>SOMMELIER AI BRIEF</Text>
                {cachedCatalogHit && (
                  <Text style={styles.cachedPill}>⚡ Instant Catalog Match</Text>
                )}
              </View>

              {profile.summary && (
                <Text style={styles.sommSummary}>{profile.summary}</Text>
              )}

              <View style={styles.structureGrid}>
                {profile.body && (
                  <View style={styles.structureItem}>
                    <Text style={styles.structureLabel}>BODY</Text>
                    <Text style={styles.structureValue}>{profile.body}</Text>
                  </View>
                )}
                {profile.tannin && (
                  <View style={styles.structureItem}>
                    <Text style={styles.structureLabel}>TANNIN</Text>
                    <Text style={styles.structureValue}>{profile.tannin}</Text>
                  </View>
                )}
                {profile.acidity && (
                  <View style={styles.structureItem}>
                    <Text style={styles.structureLabel}>ACIDITY</Text>
                    <Text style={styles.structureValue}>{profile.acidity}</Text>
                  </View>
                )}
                {profile.sweetness && (
                  <View style={styles.structureItem}>
                    <Text style={styles.structureLabel}>SWEETNESS</Text>
                    <Text style={styles.structureValue}>{profile.sweetness}</Text>
                  </View>
                )}
              </View>

              {profile.tasting_notes?.length > 0 && (
                <View style={styles.tagsBlock}>
                  <Text style={styles.tagsBlockTitle}>AROMA & PALATE NOTES</Text>
                  <View style={styles.tagsRow}>
                    {profile.tasting_notes.map((note, idx) => (
                      <View key={idx} style={styles.notePill}>
                        <Text style={styles.notePillText}>{note}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {profile.food_pairings?.length > 0 && (
                <View style={styles.tagsBlock}>
                  <Text style={styles.tagsBlockTitle}>PAIRING SUGGESTIONS</Text>
                  <View style={styles.tagsRow}>
                    {profile.food_pairings.map((food, idx) => (
                      <View key={idx} style={styles.pairingPill}>
                        <Text style={styles.pairingPillText}>🍽️ {food}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.serviceRow}>
                {profile.serving_temp && (
                  <Text style={styles.serviceMeta}>🌡️ {profile.serving_temp}</Text>
                )}
                {profile.decant_time && (
                  <Text style={styles.serviceMeta}>⏳ {profile.decant_time}</Text>
                )}
                {profile.drinking_window && (
                  <Text style={styles.serviceMeta}>📅 {profile.drinking_window}</Text>
                )}
              </View>
            </View>
          )}

          {/* Step 3: Your Rating & Tasting Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Rating & Notes</Text>
            <StarRatingInput value={rating} onChange={setRating} />

            <View style={styles.twoColRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Price Paid ($)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="28.00"
                  placeholderTextColor="#6E555C"
                  keyboardType="decimal-pad"
                  value={pricePaid}
                  onChangeText={setPricePaid}
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1.3 }]}>
                <Text style={styles.label}>Where Bought / Drank</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Total Wine, Bistro..."
                  placeholderTextColor="#6E555C"
                  value={purchaseLocation}
                  onChangeText={setPurchaseLocation}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Personal Tasting Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="What did you think? Velvety finish, great with steak..."
                placeholderTextColor="#6E555C"
                multiline
                value={personalNotes}
                onChangeText={setPersonalNotes}
              />
            </View>
          </View>

          {/* Step 4: Bottle Details (Pre-filled by Gemini Vision or Manual) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bottle Details</Text>

            <View style={styles.typeChipsRow}>
              {WINE_TYPES.map((t) => {
                const active = wineType === t.value;
                return (
                  <Pressable
                    key={t.value}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => setWineType(t.value)}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        active && styles.typeChipTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Producer / Winery *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Ridge Vineyards, Château Margaux"
                placeholderTextColor="#6E555C"
                value={producer}
                onChangeText={(v) => {
                  setProducer(v);
                  setWineId(undefined);
                }}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Wine Name / Cuvée *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Three Valleys, Estate Cabernet"
                placeholderTextColor="#6E555C"
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setWineId(undefined);
                }}
              />
            </View>

            <View style={styles.twoColRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Vintage</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2021 (or NV)"
                  placeholderTextColor="#6E555C"
                  keyboardType="number-pad"
                  maxLength={4}
                  value={vintage}
                  onChangeText={(v) => {
                    setVintage(v);
                    setWineId(undefined);
                  }}
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>ABV (%)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="13.5"
                  placeholderTextColor="#6E555C"
                  keyboardType="decimal-pad"
                  value={abv}
                  onChangeText={setAbv}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Grape Varietals (comma-separated)</Text>
              <TextInput
                style={styles.input}
                placeholder="Cabernet Sauvignon, Merlot"
                placeholderTextColor="#6E555C"
                value={varietals}
                onChangeText={setVarietals}
              />
            </View>

            <View style={styles.twoColRow}>
              <View style={[styles.fieldGroup, { flex: 1.2 }]}>
                <Text style={styles.label}>Region / Appellation</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Sonoma County, Pauillac"
                  placeholderTextColor="#6E555C"
                  value={region}
                  onChangeText={setRegion}
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Country</Text>
                <TextInput
                  style={styles.input}
                  placeholder="USA, France, Italy"
                  placeholderTextColor="#6E555C"
                  value={country}
                  onChangeText={setCountry}
                />
              </View>
            </View>
          </View>
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
  saveText: {
    color: '#E5A93C',
    fontSize: 16,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 56,
  },
  scanSection: {
    marginBottom: 20,
  },
  scanButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cameraButton: {
    flex: 1.3,
    backgroundColor: '#29131B',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#7A2535',
    alignItems: 'center',
  },
  galleryButton: {
    flex: 1,
    backgroundColor: '#1C1014',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#382028',
    alignItems: 'center',
  },
  cameraIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  cameraButtonTitle: {
    color: '#FAF3F0',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  galleryButtonTitle: {
    color: '#E6C5AC',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  cameraButtonSub: {
    color: '#9C7E86',
    fontSize: 11,
    textAlign: 'center',
  },
  photoPreviewWrapper: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#4A2833',
  },
  photoPreview: {
    width: '100%',
    height: 220,
    resizeMode: 'cover',
  },
  retakeOverlay: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    padding: 10,
    backgroundColor: '#1B0E13',
  },
  retakeButton: {
    backgroundColor: '#2E1820',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  retakeButtonText: {
    color: '#E6C5AC',
    fontSize: 12,
    fontWeight: '600',
  },
  analyzingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#221319',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#4A2833',
  },
  analyzingText: {
    color: '#E6C5AC',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  errorBanner: {
    backgroundColor: 'rgba(220, 62, 72, 0.16)',
    borderWidth: 1,
    borderColor: '#DC3E48',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  errorBannerText: {
    color: '#FFD9DC',
    fontSize: 13,
    lineHeight: 18,
  },
  sommCard: {
    backgroundColor: '#1E1116',
    borderRadius: 20,
    padding: 18,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#4F2B37',
  },
  sommHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sommBadge: {
    color: '#E5A93C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  cachedPill: {
    color: '#7CE3B3',
    fontSize: 11,
    fontWeight: '700',
  },
  sommSummary: {
    color: '#EFE3E6',
    fontSize: 14,
    lineHeight: 20,
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
    marginBottom: 2,
  },
  structureValue: {
    color: '#FAF3F0',
    fontSize: 13,
    fontWeight: '700',
  },
  tagsBlock: {
    marginBottom: 12,
  },
  tagsBlockTitle: {
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
    borderWidth: 1,
    borderColor: '#522635',
  },
  notePillText: {
    color: '#F5D0D8',
    fontSize: 12,
    fontWeight: '600',
  },
  pairingPill: {
    backgroundColor: '#1D1814',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A3B2C',
  },
  pairingPillText: {
    color: '#EED5B7',
    fontSize: 12,
    fontWeight: '600',
  },
  serviceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2E1820',
  },
  serviceMeta: {
    color: '#C8AEB5',
    fontSize: 12,
    fontWeight: '600',
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
  typeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeChip: {
    backgroundColor: '#140B0E',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#382028',
  },
  typeChipActive: {
    backgroundColor: '#9E2A3A',
    borderColor: '#C94A5B',
  },
  typeChipText: {
    color: '#B89FA5',
    fontSize: 13,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: '#FFF8F5',
    fontWeight: '700',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  fieldGroup: {
    marginTop: 12,
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
});
