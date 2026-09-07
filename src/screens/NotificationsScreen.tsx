import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Icon, IconName } from '../components/Icon';
import { getNotifications, getUnreadNotificationCount } from '../services/api';
import { NotificationItem, RouteName } from '../types';

interface NotificationsScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ onNavigate }) => {
const theme = useTheme();  const styles = createStyles(theme);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setFetchError('');
    try {
      const [list, count] = await Promise.all([getNotifications(), getUnreadNotificationCount()]);
      setNotifications(list);
      setUnreadCount(count);
    } catch (e: any) {
      if (!silent) setFetchError(e?.message || 'Could not load notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications(true);
  };

  const getIconName = (type: string): IconName => {
    switch (type) {
      case 'assignment':
        return 'clipboard-list';
      case 'stock':
        return 'package';
      case 'geofence':
        return 'compass';
      case 'eod':
        return 'clock';
      default:
        return 'bell';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Notifications"
        subtitle={`${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}`}
        onNavigate={onNavigate}
      />
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.navy} />
          <Text style={styles.loadingText}>Loading notifications…</Text>
        </View>
      )}
      {!loading && fetchError !== '' && (
        <View style={styles.errorRow}>
          <Icon name="alert-circle" size={14} color={theme.colors.red} />
          <Text style={styles.errorText}>{fetchError}</Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.navy} />}
      >
        {notifications.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIconBox}>
              <Icon name="bell" size={28} color={theme.colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptySub}>You are all caught up with your daily territory alerts.</Text>
          </Card>
        ) : (
          notifications.map((item) => (
            <Card key={item.id} style={styles.noticeCard}>
              <View style={styles.row}>
                <View style={[styles.iconBox, { backgroundColor: `${item.color}18` }]}>
                  <Icon name={getIconName(item.type)} size={20} color={item.color} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.body}>{item.body}</Text>
                  <Text style={styles.time}>{item.time} ago</Text>
                </View>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 100, gap: theme.spacing.sm },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: 8, backgroundColor: theme.colors.primaryBg },
  loadingText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.navy },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.lg, paddingVertical: 8, backgroundColor: theme.colors.redLight },
  errorText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.red, flex: 1 },
  emptyCard: { alignItems: 'center', paddingVertical: theme.spacing.xxl, gap: theme.spacing.xs, marginTop: theme.spacing.lg },
  emptyIconBox: { width: 54, height: 54, borderRadius: 27, backgroundColor: theme.colors.cardBorder, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.xs },
  emptyTitle: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark },
  emptySub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, textAlign: 'center' },
  noticeCard: { padding: theme.spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  iconBox: { width: 42, height: 42, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },
  title: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  body: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18, marginTop: 2 },
  time: { fontFamily: theme.fonts.semibold, fontSize: 11, color: theme.colors.textLight, marginTop: 4 },
});
