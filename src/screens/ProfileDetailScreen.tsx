import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
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

interface ProfileDetailScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

export const ProfileDetailScreen: React.FC<ProfileDetailScreenProps> = ({ onNavigate }) => {
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
      <Header title="Profile" subtitle="Your account details" onNavigate={onNavigate} onBackPress={() => onNavigate('profile')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          <Pressable onPress={handleChangeAvatar} style={styles.avatarWrapper}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.initials}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Icon name="camera" size={14} color="#FFFFFF" />
            </View>
          </Pressable>
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.avatarHint}>Tap your photo to update it — other profile details are managed by your admin.</Text>
        </View>

        <Card style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue}>{user.email}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Role</Text>
            <Text style={styles.detailValue}>{user.role}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Territory</Text>
            <Text style={styles.detailValue}>{user.territory}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Leaderboard Rank</Text>
            <Text style={styles.detailValue}>#{user.rank} of {user.totalAgents}</Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 100, gap: theme.spacing.lg },
  avatarSection: { alignItems: 'center', gap: 6, marginTop: theme.spacing.sm },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 84, height: 84, borderRadius: 42 },
  avatarText: { fontFamily: theme.fonts.bold, fontSize: 28, color: '#FFFFFF' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.cardWhite,
  },
  userName: { fontFamily: theme.fonts.bold, fontSize: 19, color: theme.colors.textDark, marginTop: 6 },
  avatarHint: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 16, paddingHorizontal: theme.spacing.lg },
  detailsCard: { gap: theme.spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailLabel: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted },
  detailValue: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
});
