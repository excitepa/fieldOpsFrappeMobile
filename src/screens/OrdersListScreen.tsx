import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Icon, IconName } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { groupOrdersByRef, groupSalesByInvoice } from '../utils/transactions';
import { getMyOrders, getMySales, getMyStockRequests, StockRequestSummary } from '../services/api';
import { RouteName } from '../types';

interface OrdersListScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

const statusMeta: Record<string, { color: string }> = {
  Pending: { color: '#D97706' },
  Confirmed: { color: '#2563EB' },
  Delivered: { color: '#059669' },
  'Pending Approval': { color: '#D97706' },
  Approved: { color: '#059669' },
  Rejected: { color: '#DC2626' },
  Cancelled: { color: '#DC2626' },
};

export const OrdersListScreen: React.FC<OrdersListScreenProps> = ({ onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [stockRequests, setStockRequests] = useState<StockRequestSummary[]>([]);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setFetchError('');
    try {
      // Always reflects exactly what the server just said, including a real
      // empty list — never leaves a previous (possibly stale, possibly
      // another agent's) list sitting there looking current.
      const [orders, sales, requests] = await Promise.all([getMyOrders(), getMySales(), getMyStockRequests()]);
      dispatch({ type: 'SET_ORDERS', orders });
      dispatch({ type: 'SET_SALES', sales });
      setStockRequests(requests);
    } catch (e: any) {
      if (!silent) setFetchError(e?.message || 'Could not load your activity.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dispatch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAll(true);
  };

  const orders = groupOrdersByRef(state.orders);
  const sales = groupSalesByInvoice(state.sales);
  const totalCount = orders.length + sales.length + stockRequests.length;

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Orders" subtitle={`${totalCount} logged`} onNavigate={onNavigate} onBackPress={() => onNavigate('home')} />
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.navy} />
          <Text style={styles.loadingText}>Loading your activity…</Text>
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
        {totalCount === 0 && !loading && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Icon name="check" size={22} color={theme.colors.navy} />
            </View>
            <Text style={styles.emptyTitle}>Nothing completed yet.</Text>
            <Text style={styles.emptyText}>Your submitted sales, orders and stock requests will appear here.</Text>
          </View>
        )}

        {sales.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>SALES ({sales.length})</Text>
            {sales.map((t) => {
              const outlet = state.outlets.find((o) => o.id === t.outletId);
              return (
                <Pressable
                  key={t.ref}
                  onPress={() => onNavigate('transactionDetail', { kind: 'sale', ref: t.ref, outletId: t.outletId })}
                >
                  <Card style={styles.card}>
                    <View style={styles.row}>
                      <View style={[styles.iconBox, { backgroundColor: theme.colors.tintPurple }]}>
                        <Icon name="shopping-bag" size={18} color={theme.colors.tintPurpleIcon} />
                      </View>
                      <View style={styles.flex1}>
                        <Text style={styles.outletName}>{outlet?.name || t.customerName || 'Outlet'}</Text>
                        <Text style={styles.sub}>{t.lines.length} item{t.lines.length === 1 ? '' : 's'} · {t.timestamp}</Text>
                      </View>
                      <View style={styles.amountCol}>
                        <Text style={styles.amount}>₦{t.total.toLocaleString()}</Text>
                        <View style={[styles.statusPill, { backgroundColor: `${theme.colors.emerald}22` }]}>
                          <Text style={[styles.statusText, { color: theme.colors.emerald }]}>Sold</Text>
                        </View>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </>
        )}

        {orders.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>ORDERS ({orders.length})</Text>
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
                      <View style={styles.flex1}>
                        <Text style={styles.outletName}>{outlet?.name || t.customerName || 'Outlet'}</Text>
                        <Text style={styles.sub}>{t.lines.length} item{t.lines.length === 1 ? '' : 's'} · {t.timestamp}</Text>
                      </View>
                      <View style={styles.amountCol}>
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
          </>
        )}

        {stockRequests.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>STOCK REQUESTS ({stockRequests.length})</Text>
            {stockRequests.map((r) => {
              const meta = statusMeta[r.status] || statusMeta.Pending;
              const totalQty = r.items.reduce((sum, it) => sum + it.qty, 0);
              return (
                <Pressable key={r.id} onPress={() => onNavigate('inventory')}>
                  <Card style={styles.card}>
                    <View style={styles.row}>
                      <View style={[styles.iconBox, { backgroundColor: theme.colors.tintGold }]}>
                        <Icon name="layers" size={18} color={theme.colors.tintGoldIcon} />
                      </View>
                      <View style={styles.flex1}>
                        <Text style={styles.outletName}>{r.id}</Text>
                        <Text style={styles.sub}>
                          {r.items.length} item{r.items.length === 1 ? '' : 's'} · {totalQty} units · {r.createdAt || 'Just now'}
                        </Text>
                      </View>
                      <View style={styles.amountCol}>
                        <View style={[styles.statusPill, { backgroundColor: `${meta.color}22` }]}>
                          <Text style={[styles.statusText, { color: meta.color }]}>{r.status}</Text>
                        </View>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 100, gap: theme.spacing.sm },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8, marginTop: theme.spacing.sm },
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
  flex1: { flex: 1 },
  outletName: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  sub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  amountCol: { alignItems: 'flex-end', gap: 4 },
  amount: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full },
  statusText: { fontFamily: theme.fonts.bold, fontSize: 10 },
});
