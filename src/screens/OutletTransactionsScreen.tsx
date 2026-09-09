import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { groupSalesByInvoice, groupOrdersByRef } from '../utils/transactions';
import { getMyOrders, getMySales } from '../services/api';
import { RouteName } from '../types';

interface OutletTransactionsScreenProps {
  outletData?: { outletId: string };
  onNavigate: (route: RouteName, data?: any) => void;
}

export const OutletTransactionsScreen: React.FC<OutletTransactionsScreenProps> = ({ outletData, onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch, getSalesForOutlet, getOrdersForOutlet } = useFieldStore();
  const outletId = outletData?.outletId || 'o1';
  const outlet = state.outlets.find((o) => o.id === outletId);

  // This screen may be entered directly (e.g. from Outlet Detail) without ever
  // visiting Orders or Dashboard first, so it needs its own fetch to make sure
  // real transactions are loaded rather than showing only local session data.
  useEffect(() => {
    // Always reflects exactly what the server just said, including a real
    // empty list — never leaves a previous (possibly stale, possibly
    // another agent's) transaction list sitting there looking current.
    getMyOrders().then((fetched) => {
      dispatch({ type: 'SET_ORDERS', orders: fetched });
    }).catch(() => {});
    getMySales().then((fetched) => {
      dispatch({ type: 'SET_SALES', sales: fetched });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedSales = groupSalesByInvoice(getSalesForOutlet(outletId));
  const groupedOrders = groupOrdersByRef(getOrdersForOutlet(outletId));
  const transactions = [...groupedSales, ...groupedOrders].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Transactions"
        variant="navy"
        onNavigate={onNavigate}
        onBackPress={() => onNavigate('outletDetail', { outletId })}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.outletName}>{outlet?.name || 'Outlet'}</Text>

        {transactions.length === 0 ? (
          <Text style={styles.emptyText}>No transactions recorded yet.</Text>
        ) : (
          transactions.map((t) => (
            <Pressable key={`${t.kind}-${t.ref}`} onPress={() => onNavigate('transactionDetail', { kind: t.kind, ref: t.ref, outletId })}>
              <Card style={styles.rowCard}>
                <View style={styles.row}>
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle}>
                      {t.kind === 'sale' ? 'Sale' : 'Order'} · {t.lines.length} item{t.lines.length === 1 ? '' : 's'}
                    </Text>
                    <Text style={styles.rowSub}>{t.customerName} · {t.timestamp}</Text>
                  </View>
                  <Text style={styles.rowAmount}>₦{t.total.toLocaleString()}</Text>
                  <Icon name="chevron-right" size={16} color={theme.colors.textMuted} />
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.sm },
  flex1: { flex: 1 },
  outletName: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textMuted, marginBottom: 4 },
  emptyText: { fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textMuted },
  rowCard: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  rowTitle: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  rowSub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  rowAmount: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.navy },
});
