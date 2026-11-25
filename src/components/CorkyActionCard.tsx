import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CorkyActionStatus,
  CorkyProposedAction,
  WineLogStatus,
} from '../types/database';
import { formatBottleDisplayTitle } from '../lib/corkyActions';

interface CorkyActionCardProps {
  action: CorkyProposedAction;
  status: CorkyActionStatus;
  onConfirm: (action: CorkyProposedAction) => Promise<void>;
  onCancel: (action: CorkyProposedAction) => void;
}

function formatStatusLabel(status: WineLogStatus): string {
  if (status === 'cellar') return 'In Cellar';
  if (status === 'wishlist') return 'Wishlist';
  return 'Tasted';
}

export function CorkyActionCard({
  action,
  status,
  onConfirm,
  onCancel,
}: CorkyActionCardProps) {
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const title = formatBottleDisplayTitle(
    action.producer,
    action.name,
    action.vintage
  );

  const handleConfirmPress = async () => {
    if (saving || status !== 'pending') return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await onConfirm(action);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not save this change right now.'
      );
    } finally {
      setSaving(false);
    }
  };

  const badgeLabel =
    action.type === 'uncork_bottle'
      ? '🍾 UNCORK & LOG TASTING'
      : action.type === 'add_to_wishlist'
      ? '🔖 ADD TO WISHLIST'
      : '📦 UPDATE CELLAR STOCK';

  const confirmedLabel =
    action.type === 'uncork_bottle'
      ? '✓ Saved tasting & updated cellar'
      : action.type === 'add_to_wishlist'
      ? '✓ Added to your Wishlist'
      : '✓ Updated cellar stock';

  return (
    <View
      style={[
        styles.card,
        status === 'confirmed' && styles.cardConfirmed,
        status === 'cancelled' && styles.cardCancelled,
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.badgeText}>{badgeLabel}</Text>
        <Text style={styles.wineTypePill}>{action.wineType.toUpperCase()}</Text>
      </View>

      <Text style={styles.title}>{title}</Text>

      {action.type === 'uncork_bottle' && (
        <View style={styles.detailsBlock}>
          {action.region ? (
            <Text style={styles.metaText}>{action.region}</Text>
          ) : null}

          <View style={styles.summaryRow}>
            <Text style={styles.stockText}>
              {action.currentBottlesOnHand > 1
                ? `Stock: ${action.currentBottlesOnHand} → ${action.nextBottlesOnHand} on hand`
                : action.currentBottlesOnHand === 1
                ? 'Last bottle: 1 → 0 • moves to Tasted'
                : 'Logs tasting today • 0 on hand'}
            </Text>
            {action.rating != null && (
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingBadgeText}>
                  ★ {action.rating.toFixed(1)}
                </Text>
              </View>
            )}
          </View>

          {action.flavorTags.length > 0 && (
            <View style={styles.tagsRow}>
              {action.flavorTags.map((tag, idx) => (
                <View key={`${tag}-${idx}`} style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {action.tastingNotes ? (
            <Text style={styles.notesText}>“{action.tastingNotes}”</Text>
          ) : null}
        </View>
      )}

      {action.type === 'add_to_wishlist' && (
        <View style={styles.detailsBlock}>
          {[action.region || action.country, action.varietals[0]]
            .filter(Boolean)
            .length > 0 && (
            <Text style={styles.metaText}>
              {[action.region || action.country, action.varietals[0]]
                .filter(Boolean)
                .join(' • ')}
            </Text>
          )}

          {(action.pricePaid != null || action.purchaseLocation) && (
            <Text style={styles.stockText}>
              {[
                action.pricePaid != null
                  ? `Seen price: $${action.pricePaid.toFixed(2)}`
                  : null,
                action.purchaseLocation
                  ? `Spotted at ${action.purchaseLocation}`
                  : null,
              ]
                .filter(Boolean)
                .join(' • ')}
            </Text>
          )}

          {action.notes ? (
            <Text style={styles.notesText}>“{action.notes}”</Text>
          ) : null}
        </View>
      )}

      {action.type === 'update_stock' && (
        <View style={styles.detailsBlock}>
          {action.region ? (
            <Text style={styles.metaText}>{action.region}</Text>
          ) : null}

          <Text style={styles.stockText}>
            Stock: {action.currentBottlesOnHand} → {action.nextBottlesOnHand}{' '}
            {action.nextBottlesOnHand === 1 ? 'bottle' : 'bottles'} on hand
            {action.delta !== 0
              ? ` (${action.delta > 0 ? `+${action.delta}` : action.delta})`
              : ''}
          </Text>

          {action.currentStatus !== action.nextStatus && (
            <Text style={styles.statusTransitionText}>
              Status: {formatStatusLabel(action.currentStatus)} →{' '}
              {formatStatusLabel(action.nextStatus)}
            </Text>
          )}

          {action.reason ? (
            <Text style={styles.notesText}>{action.reason}</Text>
          ) : null}
        </View>
      )}

      {errorMsg && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {status === 'pending' && (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.cancelButton, saving && styles.buttonDisabled]}
            onPress={() => onCancel(action)}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.confirmButton, saving && styles.buttonDisabled]}
            onPress={handleConfirmPress}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Confirm & Save"
          >
            {saving ? (
              <ActivityIndicator color="#FFF8F5" size="small" />
            ) : (
              <Text style={styles.confirmButtonText}>Confirm & Save</Text>
            )}
          </Pressable>
        </View>
      )}

      {status === 'confirmed' && (
        <View style={styles.confirmedFooter}>
          <Text style={styles.confirmedText}>{confirmedLabel}</Text>
        </View>
      )}

      {status === 'cancelled' && (
        <View style={styles.cancelledFooter}>
          <Text style={styles.cancelledText}>Cancelled — no changes made</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    minWidth: 260,
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#24131B',
    borderWidth: 1,
    borderColor: '#6B4230',
  },
  cardConfirmed: {
    borderColor: '#3B6E4C',
    backgroundColor: '#19221C',
  },
  cardCancelled: {
    opacity: 0.65,
    borderColor: '#382028',
    backgroundColor: '#1A0F14',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  badgeText: {
    color: '#E5A93C',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  wineTypePill: {
    color: '#D49B6A',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#341A24',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  title: {
    color: '#FAF3F0',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  detailsBlock: {
    marginTop: 6,
    gap: 6,
  },
  metaText: {
    color: '#B89FA5',
    fontSize: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  stockText: {
    color: '#F2D9C2',
    fontSize: 12,
    fontWeight: '700',
  },
  statusTransitionText: {
    color: '#D49B6A',
    fontSize: 12,
    fontWeight: '600',
  },
  ratingBadge: {
    backgroundColor: '#381B25',
    borderWidth: 1,
    borderColor: '#E5A93C',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ratingBadgeText: {
    color: '#E5A93C',
    fontSize: 12,
    fontWeight: '800',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    backgroundColor: '#2E1E16',
    borderWidth: 1,
    borderColor: '#8C6239',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagPillText: {
    color: '#F3D299',
    fontSize: 11,
    fontWeight: '700',
  },
  notesText: {
    color: '#D8C3C8',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  errorBox: {
    marginTop: 8,
    backgroundColor: 'rgba(220, 62, 72, 0.16)',
    borderWidth: 1,
    borderColor: '#DC3E48',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  errorText: {
    color: '#FFD9DC',
    fontSize: 12,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1A0E12',
    borderWidth: 1,
    borderColor: '#4A2833',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#C8AEB5',
    fontSize: 13,
    fontWeight: '700',
  },
  confirmButton: {
    flex: 1.5,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#9E2A3A',
    borderWidth: 1,
    borderColor: '#D65A6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#FFF8F5',
    fontSize: 13,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  confirmedFooter: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2B4A35',
  },
  confirmedText: {
    color: '#8CE0A7',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelledFooter: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2E1820',
  },
  cancelledText: {
    color: '#8E727A',
    fontSize: 12,
    fontWeight: '600',
  },
});
