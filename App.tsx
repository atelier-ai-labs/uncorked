import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { resolveSignedBottlePhotoUrls } from './src/lib/wineVision';
import { WineLog, WineType } from './src/types/database';
import { AuthScreen } from './src/components/AuthScreen';
import { CorkyChatDrawer } from './src/components/CorkyChatDrawer';
import { ScanBottleModal } from './src/components/ScanBottleModal';
import { WineDetailModal } from './src/components/WineDetailModal';

const FILTER_TABS: { key: 'all' | WineType; label: string }[] = [
  { key: 'all', label: 'All Bottles' },
  { key: 'red', label: '🍷 Red' },
  { key: 'white', label: '🥂 White' },
  { key: 'rose', label: '🌸 Rosé' },
  { key: 'sparkling', label: '🍾 Sparkling' },
  { key: 'orange', label: '🍊 Orange' },
  { key: 'dessert', label: '🍯 Dessert' },
];

type SortOption = 'recent' | 'rating' | 'price';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [logs, setLogs] = useState<WineLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | WineType>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [corkyDrawerOpen, setCorkyDrawerOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<WineLog | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchCellarLogs = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('wine_logs')
        .select('*, wines(*)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const withSignedPhotos = await resolveSignedBottlePhotoUrls(
          data as unknown as WineLog[]
        );
        setLogs(withSignedPhotos);
      }
    } finally {
      setLoadingLogs(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchCellarLogs();
    }
  }, [session?.user?.id, fetchCellarLogs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs
      .filter((item) => {
        if (selectedType !== 'all' && item.wines?.wine_type !== selectedType) {
          return false;
        }
        if (!q) return true;
        const w = item.wines;
        const haystack = [
          w?.producer,
          w?.name,
          w?.region,
          w?.country,
          ...(w?.varietals || []),
          item.tasting_notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        if (sortBy === 'rating') {
          return (Number(b.rating) || 0) - (Number(a.rating) || 0);
        }
        if (sortBy === 'price') {
          return (Number(b.price_paid) || 0) - (Number(a.price_paid) || 0);
        }
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
  }, [logs, searchQuery, selectedType, sortBy]);

  const stats = useMemo(() => {
    const total = logs.length;
    const rated = logs.filter((l) => l.rating != null);
    const avgRating =
      rated.length > 0
        ? (
            rated.reduce((sum, l) => sum + Number(l.rating || 0), 0) /
            rated.length
          ).toFixed(1)
        : '—';
    const topVarietalMap = new Map<string, number>();
    logs.forEach((l) => {
      (l.wines?.varietals || []).forEach((v) => {
        topVarietalMap.set(v, (topVarietalMap.get(v) || 0) + 1);
      });
    });
    let topVarietal = '—';
    let maxCount = 0;
    topVarietalMap.forEach((count, varietal) => {
      if (count > maxCount) {
        maxCount = count;
        topVarietal = varietal;
      }
    });
    return { total, avgRating, topVarietal };
  }, [logs]);

  if (authLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#E5A93C" size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <AuthScreen />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandSubtitle}>MY WINE JOURNAL</Text>
          <Text style={styles.brandTitle}>Uncorked</Text>
        </View>
        <Pressable
          style={styles.signOutButton}
          onPress={() => supabase.auth.signOut()}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>

      {/* Cellar Summary Stats */}
      <View style={styles.statsBar}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.total}</Text>
          <Text style={styles.statLabel}>Bottles Logged</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>★ {stats.avgRating}</Text>
          <Text style={styles.statLabel}>Avg Score</Text>
        </View>
        <View style={[styles.statCard, { flex: 1.3 }]}>
          <Text style={styles.statVarietal} numberOfLines={1}>
            {stats.topVarietal}
          </Text>
          <Text style={styles.statLabel}>Top Varietal</Text>
        </View>
      </View>

      {/* Search & Filters */}
      <View style={styles.controlsSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search producer, grape, region, notes..."
          placeholderTextColor="#7A6268"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterTabsRow}
        >
          {FILTER_TABS.map((tab) => {
            const active = selectedType === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedType(tab.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>
            Showing {filteredLogs.length} bottle
            {filteredLogs.length === 1 ? '' : 's'}
          </Text>
          <View style={styles.sortPills}>
            {(['recent', 'rating', 'price'] as SortOption[]).map((option) => (
              <Pressable
                key={option}
                onPress={() => setSortBy(option)}
                style={[
                  styles.sortPill,
                  sortBy === option && styles.sortPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.sortPillText,
                    sortBy === option && styles.sortPillTextActive,
                  ]}
                >
                  {option === 'recent'
                    ? 'Recent'
                    : option === 'rating'
                    ? 'Top Rated'
                    : 'Price'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Cellar Bottle List */}
      <FlatList
        data={filteredLogs}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loadingLogs}
            onRefresh={fetchCellarLogs}
            tintColor="#E5A93C"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🍷</Text>
            <Text style={styles.emptyTitle}>Your cellar awaits</Text>
            <Text style={styles.emptySubtitle}>
              Tap “Scan Bottle” below to snap a photo of a wine label. Gemini
              Vision will extract the producer, vintage, grape varietals, and
              sommelier tasting profile automatically.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const w = item.wines;
          return (
            <Pressable
              style={styles.bottleCard}
              onPress={() => setSelectedLog(item)}
            >
              {item.photo_url ? (
                <Image
                  source={{ uri: item.photo_url }}
                  style={styles.bottleThumb}
                />
              ) : (
                <View style={styles.bottlePlaceholder}>
                  <Text style={styles.bottlePlaceholderEmoji}>🍾</Text>
                </View>
              )}

              <View style={styles.bottleCardBody}>
                <View style={styles.bottleTopLine}>
                  <Text style={styles.bottleProducer} numberOfLines={1}>
                    {w?.producer}
                  </Text>
                  {item.rating != null && (
                    <View style={styles.ratingBadge}>
                      <Text style={styles.ratingBadgeText}>
                        ★ {Number(item.rating).toFixed(1)}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.bottleName} numberOfLines={1}>
                  {w?.vintage ? `${w.vintage} ` : ''}
                  {w?.name}
                </Text>

                <Text style={styles.bottleMeta} numberOfLines={1}>
                  {[
                    w?.wine_type?.toUpperCase(),
                    w?.region || w?.country,
                    w?.varietals?.[0],
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </Text>

                {item.tasting_notes ? (
                  <Text style={styles.bottleNotes} numberOfLines={2}>
                    “{item.tasting_notes}”
                  </Text>
                ) : w?.tasting_notes?.length ? (
                  <View style={styles.miniTagsRow}>
                    {w.tasting_notes.slice(0, 3).map((note, idx) => (
                      <View key={idx} style={styles.miniTag}>
                        <Text style={styles.miniTagText}>{note}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />

      {/* Floating Action Bar: Scan Bottle + Ask Corky */}
      <View style={styles.fabRow}>
        <Pressable
          style={styles.fab}
          onPress={() => setScanModalOpen(true)}
        >
          <Text style={styles.fabIcon}>📷</Text>
          <Text style={styles.fabText}>Scan Bottle</Text>
        </Pressable>

        <Pressable
          style={styles.corkyFab}
          onPress={() => setCorkyDrawerOpen(true)}
        >
          <Text style={styles.fabIcon}>🍷</Text>
          <Text style={styles.corkyFabText}>Ask Corky</Text>
        </Pressable>
      </View>

      <ScanBottleModal
        visible={scanModalOpen}
        userId={session.user.id}
        onClose={() => setScanModalOpen(false)}
        onSaved={fetchCellarLogs}
      />

      <CorkyChatDrawer
        visible={corkyDrawerOpen}
        userId={session.user.id}
        onClose={() => setCorkyDrawerOpen(false)}
      />

      <WineDetailModal
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
        onUpdated={() => {
          fetchCellarLogs();
          setSelectedLog(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#12090C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#12090C',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  brandSubtitle: {
    color: '#D49B6A',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  brandTitle: {
    color: '#FAF3F0',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  signOutButton: {
    backgroundColor: '#1E1116',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#382028',
  },
  signOutText: {
    color: '#B89FA5',
    fontSize: 12,
    fontWeight: '600',
  },
  statsBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A0E12',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2E1820',
  },
  statNumber: {
    color: '#FAF3F0',
    fontSize: 19,
    fontWeight: '800',
  },
  statVarietal: {
    color: '#E5A93C',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  statLabel: {
    color: '#8E727A',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  controlsSection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: '#1A0E12',
    borderWidth: 1,
    borderColor: '#321B22',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#FAF3F0',
    fontSize: 14,
    marginBottom: 10,
  },
  filterTabsRow: {
    gap: 8,
    paddingBottom: 10,
  },
  filterChip: {
    backgroundColor: '#1A0E12',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#321B22',
  },
  filterChipActive: {
    backgroundColor: '#9E2A3A',
    borderColor: '#C94A5B',
  },
  filterChipText: {
    color: '#B89FA5',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFF8F5',
    fontWeight: '700',
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  sortLabel: {
    color: '#8E727A',
    fontSize: 12,
    fontWeight: '600',
  },
  sortPills: {
    flexDirection: 'row',
    gap: 6,
  },
  sortPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#1A0E12',
  },
  sortPillActive: {
    backgroundColor: '#2D161F',
  },
  sortPillText: {
    color: '#8E727A',
    fontSize: 11,
    fontWeight: '600',
  },
  sortPillTextActive: {
    color: '#E5A93C',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 110,
  },
  emptyState: {
    backgroundColor: '#1A0E12',
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#2E1820',
  },
  emptyEmoji: {
    fontSize: 42,
    marginBottom: 10,
  },
  emptyTitle: {
    color: '#FAF3F0',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#9C7E86',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  bottleCard: {
    flexDirection: 'row',
    backgroundColor: '#1A0E12',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2E1820',
    gap: 12,
  },
  bottleThumb: {
    width: 72,
    height: 92,
    borderRadius: 12,
    backgroundColor: '#12090C',
  },
  bottlePlaceholder: {
    width: 72,
    height: 92,
    borderRadius: 12,
    backgroundColor: '#241219',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottlePlaceholderEmoji: {
    fontSize: 28,
  },
  bottleCardBody: {
    flex: 1,
    justifyContent: 'center',
  },
  bottleTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  bottleProducer: {
    color: '#D49B6A',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
    marginRight: 8,
  },
  ratingBadge: {
    backgroundColor: '#29151D',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#522635',
  },
  ratingBadgeText: {
    color: '#E5A93C',
    fontSize: 12,
    fontWeight: '800',
  },
  bottleName: {
    color: '#FAF3F0',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 3,
  },
  bottleMeta: {
    color: '#9C7E86',
    fontSize: 12,
    marginBottom: 6,
  },
  bottleNotes: {
    color: '#D8C3C8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  miniTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  miniTag: {
    backgroundColor: '#25131A',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniTagText: {
    color: '#E6C5AC',
    fontSize: 10,
    fontWeight: '600',
  },
  fabRow: {
    position: 'absolute',
    bottom: 26,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#9E2A3A',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#D65A6B',
    elevation: 6,
  },
  corkyFab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#24141B',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: '#E5A93C',
    elevation: 6,
  },
  fabIcon: {
    fontSize: 18,
  },
  fabText: {
    color: '#FFF8F5',
    fontSize: 15,
    fontWeight: '800',
  },
  corkyFabText: {
    color: '#E5A93C',
    fontSize: 15,
    fontWeight: '800',
  },
});
