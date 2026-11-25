import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { compressBottlePhoto, CompressedPhoto } from '../lib/wineVision';
import { findMentionedLogs } from '../lib/corkyBottleMatch';
import {
  executeCorkyAction,
  normalizeProposedActions,
} from '../lib/corkyActions';
import {
  CorkyActionStatus,
  CorkyMessage,
  CorkyProposedAction,
  WineLog,
} from '../types/database';
import { CorkyActionCard } from './CorkyActionCard';

interface CorkyChatDrawerProps {
  visible: boolean;
  userId: string;
  logs: WineLog[];
  onClose: () => void;
  onOpenBottle: (log: WineLog) => void;
  onCellarChanged?: () => void;
}

const QUICK_PROMPTS = [
  {
    label: '🧬 Analyze my palate',
    prompt:
      'Analyze my wine ratings and cellar so far. What patterns do you notice in my palate, and what styles should I explore next?',
  },
  {
    label: '🥩 Steak dinner pairing',
    prompt:
      "We're having steak tonight. Search my cellar and tell me which bottle I should open!",
  },
  {
    label: '🍕 Pizza / pasta night',
    prompt:
      "We're having Italian food tonight. Which bottle from my collection would pair best?",
  },
  {
    label: '⚖️ Compare my wines',
    prompt:
      'Compare the bottles in my cellar and explain what makes their grape varietals and regions different.',
  },
];

export function CorkyChatDrawer({
  visible,
  userId,
  logs,
  onClose,
  onOpenBottle,
  onCellarChanged,
}: CorkyChatDrawerProps) {
  const [messages, setMessages] = useState<CorkyMessage[]>([]);
  const [actionStatuses, setActionStatuses] = useState<
    Record<string, CorkyActionStatus>
  >({});
  const [input, setInput] = useState('');
  const [attachedPhoto, setAttachedPhoto] = useState<CompressedPhoto | null>(
    null
  );
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<FlatList<CorkyMessage>>(null);

  useEffect(() => {
    if (visible && userId) {
      loadConversation();
    }
  }, [visible, userId]);

  const loadConversation = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('corky_messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(60);

      if (!error && data) {
        setMessages(data as CorkyMessage[]);
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleClearChat = async () => {
    setMessages([]);
    setActionStatuses({});
    await supabase.from('corky_messages').delete().eq('user_id', userId);
  };

  const handleConfirmAction = async (action: CorkyProposedAction) => {
    await executeCorkyAction(action, userId);
    setActionStatuses((prev) => ({
      ...prev,
      [action.id]: 'confirmed',
    }));
    onCellarChanged?.();
  };

  const handleCancelAction = (action: CorkyProposedAction) => {
    setActionStatuses((prev) => ({
      ...prev,
      [action.id]: 'cancelled',
    }));
  };

  const handleAttachPhoto = async (useCamera: boolean) => {
    try {
      const perm = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;

      const res = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          });

      if (!res.canceled && res.assets?.[0]?.uri) {
        const compressed = await compressBottlePhoto(res.assets[0].uri);
        setAttachedPhoto(compressed);
      }
    } catch {
      // ignore picker errors
    }
  };

  const sendMessage = async (customText?: string) => {
    const textToSend = (customText ?? input).trim();
    if ((!textToSend && !attachedPhoto) || thinking) return;

    const photoToSend = attachedPhoto;
    setInput('');
    setAttachedPhoto(null);

    const optimisticUserMsg: CorkyMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: textToSend || '📷 Sent a wine bottle photo',
      tools_used: [],
      created_at: new Date().toISOString(),
    };

    const updatedHistory = [...messages, optimisticUserMsg];
    setMessages(updatedHistory);
    setThinking(true);

    try {
      const { data, error } = await supabase.functions.invoke('corky-agent', {
        body: {
          message:
            textToSend ||
            'Please inspect this wine bottle photo and check my cellar. If the bottle looks empty or finished and is in my cellar, prepare an uncork confirmation card; if any key label details are unclear, ask me to clarify rather than guessing.',
          imageBase64: photoToSend?.base64,
          mimeType: photoToSend?.mimeType,
          history: messages.slice(-8).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
      });

      if (error || data?.error) {
        const errText =
          data?.error || error?.message || 'Corky could not respond right now.';
        setMessages((prev) => [
          ...prev,
          {
            id: `temp-err-${Date.now()}`,
            role: 'assistant',
            content: `⚠️ ${errText}`,
            tools_used: [],
            created_at: new Date().toISOString(),
          },
        ]);
        return;
      }

      const proposedActions = normalizeProposedActions(data?.proposedActions);

      const assistantMsg: CorkyMessage = {
        id: `temp-assistant-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        tools_used: Array.isArray(data.toolsUsed) ? data.toolsUsed : [],
        created_at: new Date().toISOString(),
        proposed_actions: proposedActions.length > 0 ? proposedActions : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-err-${Date.now()}`,
          role: 'assistant',
          content:
            err instanceof Error
              ? `⚠️ ${err.message}`
              : '⚠️ Could not reach Corky.',
          tools_used: [],
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.drawer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Drawer Handle & Header */}
          <View style={styles.drawerHeader}>
            <View style={styles.titleRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarEmoji}>🍷</Text>
              </View>
              <View>
                <Text style={styles.corkyTitle}>Corky</Text>
                <Text style={styles.corkySubtitle}>
                  Personal AI Sommelier • Knows Your Cellar
                </Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              {messages.length > 0 && (
                <Pressable onPress={handleClearChat} style={styles.clearButton}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </Pressable>
              )}
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Done</Text>
              </Pressable>
            </View>
          </View>

          {/* Quick Action Chips */}
          <View style={styles.quickPromptsContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickPromptsScroll}
            >
              {QUICK_PROMPTS.map((item, idx) => (
                <Pressable
                  key={idx}
                  style={styles.quickChip}
                  onPress={() => sendMessage(item.prompt)}
                  disabled={thinking}
                >
                  <Text style={styles.quickChipText}>{item.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Messages List */}
          {loadingHistory ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color="#E5A93C" />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() =>
                listRef.current?.scrollToEnd({ animated: true })
              }
              ListEmptyComponent={
                <View style={styles.welcomeCard}>
                  <Text style={styles.welcomeTitle}>
                    Hey there! I’m Corky 🍷
                  </Text>
                  <Text style={styles.welcomeBody}>
                    I have direct access to your Uncorked cellar, ratings, and
                    tasting notes. Ask me what bottle to open for dinner, tell
                    me when you finish a bottle (or snap the empty label) to log
                    it, add a wine to your wishlist, or update your bottle
                    count!
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isUser = item.role === 'user';
                const proposedActions = isUser
                  ? []
                  : item.proposed_actions || [];
                const actionLogIds = new Set<number>(
                  proposedActions
                    .filter(
                      (
                        a
                      ): a is Extract<
                        CorkyProposedAction,
                        { type: 'uncork_bottle' | 'update_stock' }
                      > =>
                        a.type === 'uncork_bottle' || a.type === 'update_stock'
                    )
                    .map((a) => a.logId)
                );
                const mentioned = isUser
                  ? []
                  : findMentionedLogs(item.content, logs).filter(
                      (l) => !actionLogIds.has(l.id)
                    );
                return (
                  <View
                    style={[
                      styles.messageBubbleWrapper,
                      isUser ? styles.alignRight : styles.alignLeft,
                    ]}
                  >
                    {!isUser && item.tools_used?.length > 0 && (
                      <View style={styles.toolsBadgeRow}>
                        {item.tools_used.map((badge, i) => (
                          <View key={i} style={styles.toolBadge}>
                            <Text style={styles.toolBadgeText}>{badge}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <View
                      style={[
                        styles.messageBubble,
                        isUser ? styles.userBubble : styles.assistantBubble,
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          isUser ? styles.userText : styles.assistantText,
                        ]}
                      >
                        {item.content}
                      </Text>
                    </View>

                    {proposedActions.map((action) => (
                      <CorkyActionCard
                        key={action.id}
                        action={action}
                        status={actionStatuses[action.id] ?? 'pending'}
                        onConfirm={handleConfirmAction}
                        onCancel={handleCancelAction}
                      />
                    ))}

                    {mentioned.map((log) => (
                      <Pressable
                        key={log.id}
                        style={styles.bottleCard}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${log.wines.producer} ${log.wines.name}`}
                        onPress={() => onOpenBottle(log)}
                      >
                        <Text style={styles.bottleCardEmoji}>🍾</Text>
                        <View style={styles.bottleCardBody}>
                          <Text style={styles.bottleCardTitle} numberOfLines={1}>
                            {log.wines.producer} {log.wines.name}
                            {log.wines.vintage ? ` ${log.wines.vintage}` : ''}
                          </Text>
                          <Text style={styles.bottleCardMeta} numberOfLines={1}>
                            {[
                              log.wines.wine_type,
                              log.wines.region,
                              (log.bottles_on_hand ?? 0) > 0
                                ? `${log.bottles_on_hand} on hand`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </Text>
                        </View>
                        <Text style={styles.bottleCardChevron}>›</Text>
                      </Pressable>
                    ))}
                  </View>
                );
              }}
            />
          )}

          {thinking && (
            <View style={styles.thinkingRow}>
              <ActivityIndicator color="#E5A93C" size="small" />
              <Text style={styles.thinkingText}>
                Corky is checking your cellar...
              </Text>
            </View>
          )}

          {/* Attached Photo Preview */}
          {attachedPhoto && (
            <View style={styles.attachmentBar}>
              <Image
                source={{ uri: attachedPhoto.uri }}
                style={styles.attachmentThumb}
              />
              <Text style={styles.attachmentLabel}>
                Wine photo attached for Corky to inspect
              </Text>
              <Pressable onPress={() => setAttachedPhoto(null)}>
                <Text style={styles.removeAttachment}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* Input Bar */}
          <View style={styles.inputBar}>
            <Pressable
              style={styles.iconButton}
              onPress={() => handleAttachPhoto(true)}
              disabled={thinking}
            >
              <Text style={styles.iconButtonEmoji}>📷</Text>
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => handleAttachPhoto(false)}
              disabled={thinking}
            >
              <Text style={styles.iconButtonEmoji}>🖼️</Text>
            </Pressable>

            <TextInput
              style={styles.textInput}
              placeholder="Ask Corky about pairings, your palate, or a bottle..."
              placeholderTextColor="#7A6268"
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={1500}
            />

            <Pressable
              style={[
                styles.sendButton,
                (!input.trim() && !attachedPhoto) || thinking
                  ? styles.sendButtonDisabled
                  : null,
              ]}
              onPress={() => sendMessage()}
              disabled={(!input.trim() && !attachedPhoto) || thinking}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 3, 5, 0.72)',
    justifyContent: 'flex-end',
  },
  drawer: {
    height: '86%',
    backgroundColor: '#140B0E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: '#4A2833',
    overflow: 'hidden',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#1C0F14',
    borderBottomWidth: 1,
    borderBottomColor: '#2E1820',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#381822',
    borderWidth: 1,
    borderColor: '#E5A93C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 19,
  },
  corkyTitle: {
    color: '#FAF3F0',
    fontSize: 18,
    fontWeight: '800',
  },
  corkySubtitle: {
    color: '#D49B6A',
    fontSize: 11,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clearButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#241319',
  },
  clearButtonText: {
    color: '#B89FA5',
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#2E1820',
  },
  closeButtonText: {
    color: '#E5A93C',
    fontSize: 13,
    fontWeight: '700',
  },
  quickPromptsContainer: {
    backgroundColor: '#180D11',
    borderBottomWidth: 1,
    borderBottomColor: '#26141B',
  },
  quickPromptsScroll: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  quickChip: {
    backgroundColor: '#25131A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#472531',
  },
  quickChipText: {
    color: '#F2D9C2',
    fontSize: 12,
    fontWeight: '600',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 24,
  },
  welcomeCard: {
    backgroundColor: '#1E1116',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#3D222B',
    marginTop: 8,
  },
  welcomeTitle: {
    color: '#FAF3F0',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  welcomeBody: {
    color: '#C8AEB5',
    fontSize: 13,
    lineHeight: 20,
  },
  messageBubbleWrapper: {
    marginBottom: 14,
    maxWidth: '88%',
  },
  alignRight: {
    alignSelf: 'flex-end',
  },
  alignLeft: {
    alignSelf: 'flex-start',
  },
  toolsBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 5,
  },
  toolBadge: {
    backgroundColor: '#241813',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#573F28',
  },
  toolBadgeText: {
    color: '#E5A93C',
    fontSize: 10,
    fontWeight: '700',
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  userBubble: {
    backgroundColor: '#9E2A3A',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#211218',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#382028',
  },
  bottleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#2A1620',
    borderWidth: 1,
    borderColor: '#573F28',
  },
  bottleCardEmoji: {
    fontSize: 22,
  },
  bottleCardBody: {
    flex: 1,
  },
  bottleCardTitle: {
    color: '#FAF3F0',
    fontSize: 13,
    fontWeight: '700',
  },
  bottleCardMeta: {
    color: '#D49B6A',
    fontSize: 11,
    marginTop: 2,
  },
  bottleCardChevron: {
    color: '#E5A93C',
    fontSize: 22,
    fontWeight: '700',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 21,
  },
  userText: {
    color: '#FFF8F5',
  },
  assistantText: {
    color: '#F5EAEC',
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  thinkingText: {
    color: '#D49B6A',
    fontSize: 12,
    fontWeight: '600',
  },
  attachmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#211218',
    borderTopWidth: 1,
    borderTopColor: '#382028',
  },
  attachmentThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  attachmentLabel: {
    flex: 1,
    color: '#E6C5AC',
    fontSize: 12,
  },
  removeAttachment: {
    color: '#E06C75',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1C0F14',
    borderTopWidth: 1,
    borderTopColor: '#2E1820',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#28151D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3D222B',
  },
  iconButtonEmoji: {
    fontSize: 16,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#12090C',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#FAF3F0',
    fontSize: 14,
    maxHeight: 90,
    borderWidth: 1,
    borderColor: '#341D25',
  },
  sendButton: {
    backgroundColor: '#E5A93C',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: '#190D11',
    fontSize: 14,
    fontWeight: '800',
  },
});
