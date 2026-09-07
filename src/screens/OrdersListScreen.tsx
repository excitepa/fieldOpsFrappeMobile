import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { groupOrdersByRef } from '../utils/transactions';
import { getMyOrders } from '../services/api';
import { RouteName } from '../types';

interface OrdersListScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

const statusMeta: Record<string, { color: string }> = {
  Pending: { color: '#D97706' },
  Confirmed: { color: '#2563EB' },
  Delivered: { color: '#059669' },
};

export const OrdersListScreen: React.FC<OrdersListScreenProps> = ({ onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setFetchError('');
    try {
      const fetched = await getMyOrders();
      if (fetched.length > 0) dispatch({ type: 'SET_ORDERS', orders: fetched });
    } catch (e: any) {
      if (!silent) setFetchError(e?.message || 'Could not load orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dispatch]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders(true);
  };

  const orders = groupOrdersByRef(state.orders);

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Orders" subtitle={`${orders.length} orders logged`} onNavigate={onNavigate} onBackPress={() => onNavigate('home')} />
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.navy} />
          <Text style={styles.loadingText}>Loading orders…</Text>
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
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.navy} />}
      >
        {orders.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Icon name="check" size={22} color={theme.colors.navy} />
            </View>
            <Text style={styles.emptyTitle}>Nothing completed yet.</Text>
            <Text style={styles.emptyText}>Your submitted sales and surveys will appear here.</Text>
          </View>
        )}
        {orders.map((t) => {
          const outlet = state.outlets.find((o) => o.id === t.outletId);
          const meta = statusMeta[t.status || 'Pending'];
          return (
            <Pressable
              key={t.ref}
              onPress={() => onNavigate('transactionDetail', { kind: 'order', ref: t.ref, outletId: t.outletId })}
            >
              <Card style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.iconBox}>
                    <Icon name="package" size={18} color={theme.colors.navy} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.outletName}>{outlet?.name || 'Outlet'}</Text>
                    <Text style={styles.sub}>{t.customerName} · {t.lines.length} item{t.lines.length === 1 ? '' : 's'} · {t.timestamp}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.amount}>₦{t.total.toLocaleString()}</Text>
                    <View style={[styles.statusPill, { backgroundColor: `${meta.color}22` }]}>
                      <Text style={[styles.statusText, { color: meta.color }]}>{t.status}</Text>
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        })}
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
  emptyCard: {
    alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.xxl, paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.xl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.cardBorder,
  },
  emptyIconCircle: {
    width: 44, height: 44, borderRadius: 22, marginBottom: theme.spacing.sm,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: theme.colors.navy,
  },
  emptyTitle: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark, textAlign: 'center' },
  emptyText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
  card: { backgroundColor: theme.colors.cardWhite, borderColor: theme.colors.cardBorder },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  iconBox: { width: 40, height: 40, borderRadius: theme.radius.md, backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center' },
  outletName: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  sub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  amount: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full },
  statusText: { fontFamily: theme.fonts.bold, fontSize: 10 },
});
