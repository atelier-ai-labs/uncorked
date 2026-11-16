import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

export function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(
    null
  );

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setMessage({ text: 'Please enter both email and password.', isError: true });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.user && !data.session) {
          setMessage({
            text: 'Check your email to confirm your account, then sign in!',
            isError: false,
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Authentication failed',
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.badge}>POCKET SOMMELIER & CELLAR</Text>
        <Text style={styles.title}>Uncorked</Text>
        <Text style={styles.subtitle}>
          Snap any wine label to uncover its grape varietals, tasting profile, food
          pairings, and log your personal ratings.
        </Text>

        {message && (
          <View
            style={[
              styles.banner,
              message.isError ? styles.bannerError : styles.bannerSuccess,
            ]}
          >
            <Text style={styles.bannerText}>{message.text}</Text>
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#7A6268"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#7A6268"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <Pressable
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF8F5" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isSignUp ? 'Create Cellar Account' : 'Sign In to Cellar'}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={styles.switchButton}
          onPress={() => {
            setIsSignUp(!isSignUp);
            setMessage(null);
          }}
        >
          <Text style={styles.switchText}>
            {isSignUp
              ? 'Already have an account? Sign In'
              : 'New to Uncorked? Create an account'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12090C',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1E1116',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#382028',
  },
  badge: {
    color: '#D49B6A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: {
    color: '#FAF3F0',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    color: '#B89FA5',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  banner: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  bannerError: {
    backgroundColor: 'rgba(220, 62, 72, 0.18)',
    borderWidth: 1,
    borderColor: '#DC3E48',
  },
  bannerSuccess: {
    backgroundColor: 'rgba(67, 160, 110, 0.18)',
    borderWidth: 1,
    borderColor: '#43A06E',
  },
  bannerText: {
    color: '#FAF3F0',
    fontSize: 13,
    lineHeight: 18,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#D8C3C8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#140B0E',
    borderWidth: 1,
    borderColor: '#382028',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FAF3F0',
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: '#9E2A3A',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFF8F5',
    fontSize: 16,
    fontWeight: '700',
  },
  switchButton: {
    marginTop: 18,
    alignItems: 'center',
  },
  switchText: {
    color: '#D49B6A',
    fontSize: 13,
    fontWeight: '600',
  },
});
