import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { groupSalesByInvoice } from '../utils/transactions';
import { RouteName } from '../types';

interface SaleReceiptScreenProps {
  routeData?: { outletId?: string; invoiceRef?: string };
  onNavigate: (route: RouteName, data?: any) => void;
}

export const SaleReceiptScreen: React.FC<SaleReceiptScreenProps> = ({ routeData, onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, getSalesForOutlet } = useFieldStore();
  const outletId = routeData?.outletId || 'o1';
  const invoiceRef = routeData?.invoiceRef;
  const transaction = groupSalesByInvoice(getSalesForOutlet(outletId)).find((t) => t.ref === invoiceRef);

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Sale Receipt"
        subtitle={invoiceRef || 'Transaction Complete'}
        onNavigate={onNavigate}
        onBackPress={() => onNavigate('outletDetail', { outletId })}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.successHeader}>
          <View style={styles.iconCircle}>
            <Icon name="check" size={32} color="#FFFFFF" strokeWidth={3} />
          </View>
          <Text style={styles.successTitle}>Sale Submitted Successfully</Text>
          <Text style={styles.successSub}>
            Product inventory stock was decremented and outlet status set to Visited.
          </Text>
        </View>

        <Card style={styles.receiptCard}>
          <View style={styles.receiptTop}>
            <Text style={styles.refLabel}>INVOICE REFERENCE</Text>
            <Text style={styles.refValue}>{transaction?.ref || invoiceRef}</Text>
            <Text style={styles.timeValue}>{transaction?.timestamp}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.sectionRow}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.val}>{transaction?.customerName}</Text>
          </View>

          {transaction?.lines.map((line) => (
            <View key={line.productId} style={styles.sectionRow}>
              <Text style={styles.label}>{line.productName} × {line.quantity}</Text>
              <Text style={styles.val}>₦{line.total.toLocaleString()}</Text>
            </View>
          ))}

          {transaction && transaction.discount > 0 ? (
            <View style={styles.sectionRow}>
              <Text style={styles.label}>Discount{transaction.promoLabel ? ` (${transaction.promoLabel})` : ''}</Text>
              <Text style={styles.discountVal}>-₦{transaction.discount.toLocaleString()}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL AMOUNT PAID</Text>
            <Text style={styles.totalVal}>₦{(transaction?.total || 0).toLocaleString()}</Text>
          </View>
        </Card>

        <Card style={styles.noticeCard}>
          <Icon name="shield-check" size={20} color={theme.colors.emerald} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Inventory & Outlet Synced</Text>
            <Text style={styles.noticeSub}>
              Outlet metrics & activity history updated in real-time.
            </Text>
          </View>
        </Card>

        <Button
          title="Return to Outlet Workspace →"
          onPress={() => onNavigate('outletDetail', { outletId })}
          variant="primary"
          size="large"
          style={styles.doneBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.darkBg },
  scroll: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 60 },
  successHeader: { alignItems: 'center', marginVertical: theme.spacing.md, gap: theme.spacing.xs },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.emerald, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  successTitle: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.darkText, textAlign: 'center' },
  successSub: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.darkMuted, textAlign: 'center', maxWidth: '85%', lineHeight: 18 },
  receiptCard: { backgroundColor: theme.colors.darkCard, borderColor: theme.colors.darkBorder, gap: theme.spacing.sm, padding: theme.spacing.lg },
  receiptTop: { alignItems: 'center', gap: 2 },
  refLabel: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.darkMuted, letterSpacing: 0.8 },
  refValue: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.primaryLight },
  timeValue: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.darkMuted },
  divider: { height: 1, backgroundColor: theme.colors.darkBorder, marginVertical: 6 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.darkMuted },
  val: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.darkText },
  discountVal: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.emerald },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.darkText },
  totalVal: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.emerald },
  noticeCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, backgroundColor: theme.colors.darkSurface, borderColor: theme.colors.darkBorder },
  noticeTitle: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.darkText },
  noticeSub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.darkMuted },
  doneBtn: { marginTop: theme.spacing.sm },
});
