import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { RouteName } from '../types';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  const memoryStore = new Map<string, string>();
  AsyncStorage = {
    getItem: async (key: string) => memoryStore.get(key) || null,
    setItem: async (key: string, val: string) => { memoryStore.set(key, val); },
  };
}

const AVATAR_STORAGE_KEY = '@fieldops:avatarUri';

interface ProfileScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  onLogout: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onNavigate, onLogout }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state } = useFieldStore();
  const user = state.user;

  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(AVATAR_STORAGE_KEY).then((saved: string | null) => {
      if (saved) setAvatarUri(saved);
    }).catch(() => {});
  }, []);

  const handleChangeAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Allow photo library access to update your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      setAvatarUri(uri);
      AsyncStorage.setItem(AVATAR_STORAGE_KEY, uri).catch(() => {});
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Settings" back={false} onNavigate={onNavigate} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Compact Profile Banner ──────────────────────────────────── */}
        <View style={styles.profileBanner}>
          <Pressable onPress={handleChangeAvatar} style={styles.avatarWrapper}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.initials}</Text>
              </View>
            )}
          </Pressable>
          <View style={styles.flex1}>
            <Text style={styles.userName}>{user.name.split(' ')[0]}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
          <View style={styles.onlinePill}>
            <Icon name="wifi" size={12} color="#FFFFFF" />
            <Text style={styles.onlinePillText}>Online</Text>
          </View>
        </View>

        {/* ── Theme ────────────────────────────────────────────────────── */}
        <Pressable onPress={theme.toggleMode} style={styles.menuCard}>
          <View style={styles.menuIconBox}>
            <Icon name={theme.mode === 'dark' ? 'moon' : 'sun'} size={18} color={theme.colors.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.menuText}>Theme</Text>
            <Text style={styles.menuSubText}>{theme.mode === 'dark' ? 'Dark' : 'Light'}</Text>
          </View>
          <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
        </Pressable>

        {/* ── Profile ──────────────────────────────────────────────────── */}
        <Pressable onPress={() => onNavigate('profileDetail')} style={styles.menuCard}>
          <View style={styles.menuIconBox}>
            <Icon name="user" size={18} color={theme.colors.primary} />
          </View>
          <Text style={[styles.menuText, styles.flex1]}>Profile</Text>
          <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
        </Pressable>

        {/* ── Dashboard (also reachable from Home's Quick Access — kept
            here too by design, as a shortcut from Settings) ─────────────── */}
        <Pressable onPress={() => onNavigate('dashboard')} style={styles.menuCard}>
          <View style={styles.menuIconBox}>
            <Icon name="bar-chart" size={18} color={theme.colors.primary} />
          </View>
          <Text style={[styles.menuText, styles.flex1]}>Dashboard</Text>
          <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
        </Pressable>

        {/* ── Sign Out ─────────────────────────────────────────────────── */}
        <Pressable
          onPress={() => {
            Alert.alert('Log Out', 'Are you sure you want to sign out of FieldOps?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log Out', style: 'destructive', onPress: onLogout },
            ]);
          }}
          style={styles.logoutCard}
        >
          <Icon name="logout" size={18} color={theme.colors.red} />
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 100, gap: theme.spacing.sm },
  flex1: { flex: 1 },
  profileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { fontFamily: theme.fonts.bold, fontSize: 18, color: '#FFFFFF' },
  userName: { fontFamily: theme.fonts.bold, fontSize: 16, color: '#FFFFFF' },
  userEmail: { fontFamily: theme.fonts.regular, fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  onlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.emerald, borderRadius: theme.radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  onlinePillText: { fontFamily: theme.fonts.bold, fontSize: 11, color: '#FFFFFF' },
  menuCard: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
    backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.lg, padding: theme.spacing.md,
  },
  menuIconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  menuText: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  menuSubText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  logoutCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm,
    padding: theme.spacing.md, borderRadius: theme.radius.full,
    borderWidth: 1.5, borderColor: theme.colors.red, marginTop: theme.spacing.md,
  },
  logoutText: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.red },
});
