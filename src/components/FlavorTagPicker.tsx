import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WineType } from '../types/database';

interface FlavorTagPickerProps {
  wineType: WineType;
  selected: string[];
  suggested?: string[];
  onChange: (next: string[]) => void;
  maxTags?: number;
}

const RED_FRUIT_TAGS = [
  'Cherry',
  'Blackberry',
  'Plum',
  'Raspberry',
  'Blackcurrant',
  'Jammy',
];

const LIGHT_FRUIT_TAGS = [
  'Citrus',
  'Green Apple',
  'Pear',
  'Peach',
  'Tropical',
  'Strawberry',
  'Floral',
  'Brioche',
];

const EARTH_OAK_TAGS = [
  'Oak',
  'Vanilla',
  'Cedar',
  'Peppery',
  'Baking Spice',
  'Earthy',
  'Leather',
  'Mineral',
  'Smoky',
  'Chocolate',
  'Herbal',
];

const STYLE_TAGS = [
  'Dry',
  'Crisp',
  'Smooth',
  'Velvety',
  'Bold',
  'Grippy Tannins',
  'Bright Acidity',
  'Easy Drinking',
  'Long Finish',
];

export function FlavorTagPicker({
  wineType,
  selected,
  suggested = [],
  onChange,
  maxTags = 12,
}: FlavorTagPickerProps) {
  const dedupedSuggested = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const raw of suggested) {
      const cleaned = raw.trim();
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push(cleaned);
      }
    }
    return list;
  }, [suggested]);

  const orderedGroups = useMemo(() => {
    const isDarkStyle = wineType === 'red' || wineType === 'fortified';
    const fruitTags = isDarkStyle
      ? [...RED_FRUIT_TAGS, ...LIGHT_FRUIT_TAGS]
      : [...LIGHT_FRUIT_TAGS, ...RED_FRUIT_TAGS];

    return [
      { title: 'FRUIT & AROMA', tags: fruitTags },
      { title: 'OAK, SPICE & EARTH', tags: EARTH_OAK_TAGS },
      { title: 'BODY & STYLE', tags: STYLE_TAGS },
    ];
  }, [wineType]);

  const isSelected = (tag: string) =>
    selected.some((item) => item.toLowerCase() === tag.toLowerCase());

  const toggleTag = (tag: string) => {
    const existingIdx = selected.findIndex(
      (item) => item.toLowerCase() === tag.toLowerCase()
    );
    if (existingIdx !== -1) {
      const next = [...selected];
      next.splice(existingIdx, 1);
      onChange(next);
      return;
    }
    if (selected.length >= maxTags) {
      return;
    }
    onChange([...selected, tag]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Quick Flavor & Style Chips</Text>
        <View style={styles.headerRight}>
          <Text style={styles.countText}>
            {selected.length}/{maxTags} selected
          </Text>
          {selected.length > 0 && (
            <Pressable onPress={() => onChange([])}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          )}
        </View>
      </View>

      {dedupedSuggested.length > 0 && (
        <View style={styles.groupBlock}>
          <Text style={styles.groupTitle}>SUGGESTED FOR THIS BOTTLE</Text>
          <View style={styles.chipsRow}>
            {dedupedSuggested.map((tag) => {
              const active = isSelected(tag);
              return (
                <Pressable
                  key={`sug-${tag}`}
                  style={[
                    styles.chip,
                    styles.suggestedChip,
                    active && styles.chipActive,
                  ]}
                  onPress={() => toggleTag(tag)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                  >
                    {active ? '✓ ' : '+ '}
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {orderedGroups.map((group) => (
        <View key={group.title} style={styles.groupBlock}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <View style={styles.chipsRow}>
            {group.tags.map((tag) => {
              const active = isSelected(tag);
              return (
                <Pressable
                  key={tag}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleTag(tag)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                  >
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 14,
    backgroundColor: '#12090C',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#321B22',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    color: '#FAF3F0',
    fontSize: 13,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countText: {
    color: '#8E727A',
    fontSize: 11,
    fontWeight: '600',
  },
  clearText: {
    color: '#E5A93C',
    fontSize: 11,
    fontWeight: '700',
  },
  groupBlock: {
    marginTop: 8,
  },
  groupTitle: {
    color: '#8E727A',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    backgroundColor: '#140B0E',
    borderWidth: 1,
    borderColor: '#382028',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  suggestedChip: {
    borderColor: '#5B4028',
    backgroundColor: '#1B130F',
  },
  chipActive: {
    backgroundColor: '#9E2A3A',
    borderColor: '#D65A6B',
  },
  chipText: {
    color: '#C8AEB5',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFF8F5',
    fontWeight: '700',
  },
});
