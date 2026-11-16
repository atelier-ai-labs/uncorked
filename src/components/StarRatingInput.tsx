import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface StarRatingInputProps {
  value: number | null;
  onChange: (nextValue: number | null) => void;
}

/**
 * Interactive 5.0-star wine rating picker with tenth-of-a-point (0.1) precision
 * and an explicit "Unrated" state for bottles you haven't tasted yet.
 */
export function StarRatingInput({ value, onChange }: StarRatingInputProps) {
  const clamp = (num: number) =>
    Math.max(0, Math.min(5, Math.round(num * 10) / 10));

  const handleStep = (delta: number) => {
    const base = value ?? 4.0;
    onChange(clamp(base + delta));
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => {
            const filled = value !== null && value >= star - 0.2;
            const half = value !== null && !filled && value >= star - 0.7;
            return (
              <Pressable
                key={star}
                onPress={() => onChange(star)}
                style={styles.starButton}
              >
                <Text
                  style={[
                    styles.starIcon,
                    filled
                      ? styles.starFilled
                      : half
                      ? styles.starHalf
                      : styles.starEmpty,
                  ]}
                >
                  ★
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.scoreBadge}>
          {value !== null ? (
            <>
              <Text style={styles.scoreNumber}>{value.toFixed(1)}</Text>
              <Text style={styles.scoreMax}>/ 5.0</Text>
            </>
          ) : (
            <Text style={styles.unratedText}>Unrated</Text>
          )}
        </View>
      </View>

      <View style={styles.fineTuneRow}>
        <Pressable style={styles.stepButton} onPress={() => handleStep(-0.5)}>
          <Text style={styles.stepButtonText}>-0.5</Text>
        </Pressable>
        <Pressable style={styles.stepButton} onPress={() => handleStep(-0.1)}>
          <Text style={styles.stepButtonText}>-0.1</Text>
        </Pressable>

        {value !== null ? (
          <Pressable
            style={styles.clearRatingButton}
            onPress={() => onChange(null)}
          >
            <Text style={styles.clearRatingText}>Clear (Unrated)</Text>
          </Pressable>
        ) : (
          <Text style={styles.fineTuneHint}>Tap a star once tasted</Text>
        )}

        <Pressable style={styles.stepButton} onPress={() => handleStep(0.1)}>
          <Text style={styles.stepButtonText}>+0.1</Text>
        </Pressable>
        <Pressable style={styles.stepButton} onPress={() => handleStep(0.5)}>
          <Text style={styles.stepButtonText}>+0.5</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#140B0E',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#382028',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  starButton: {
    padding: 4,
  },
  starIcon: {
    fontSize: 30,
  },
  starFilled: {
    color: '#E5A93C',
  },
  starHalf: {
    color: '#B57C28',
  },
  starEmpty: {
    color: '#3F272F',
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#25141A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4A2833',
  },
  scoreNumber: {
    color: '#FAF3F0',
    fontSize: 22,
    fontWeight: '800',
  },
  scoreMax: {
    color: '#9C7E86',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  unratedText: {
    color: '#9C7E86',
    fontSize: 14,
    fontWeight: '700',
  },
  fineTuneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stepButton: {
    backgroundColor: '#25141A',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#3D222B',
  },
  stepButtonText: {
    color: '#E6C5AC',
    fontSize: 13,
    fontWeight: '700',
  },
  fineTuneHint: {
    color: '#8E727A',
    fontSize: 11,
    fontWeight: '500',
  },
  clearRatingButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearRatingText: {
    color: '#B89FA5',
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
