import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { groupOrdersByRef } from '../utils/transactions';
import { RouteName } from '../types';

interface OrderSuccessScreenProps {
  routeData?: { outletId?: string; orderRef?: string };
  onNavigate: (route: RouteName, data?: any) => void;
}

export const OrderSuccessScreen: React.FC<OrderSuccessScreenProps> = ({ routeData, onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { getOrdersForOutlet } = useFieldStore();
  const outletId = routeData?.outletId || 'o1';
  const orderRef = routeData?.orderRef;
  const transaction = groupOrdersByRef(getOrdersForOutlet(outletId)).find((t) => t.ref === orderRef);

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Order Success"
        subtitle="Replenishment Request Logged"
        onNavigate={onNavigate}
        onBackPress={() => onNavigate('outletDetail', { outletId })}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.successHeader}>
          <View style={styles.iconCircle}>
            <Icon name="package" size={32} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <Text style={styles.successTitle}>Order Submitted</Text>
          <Text style={styles.successSub}>
            Your stock order request has been sent for distributor fulfillment. Outlet status marked Visited.
          </Text>
        </View>

        <Card style={styles.receiptCard}>
          <View style={styles.sectionRow}>
            <Text style={styles.label}>Order Reference</Text>
            <Text style={styles.val}>{transaction?.ref || orderRef}</Text>
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.label}>Customer Account</Text>
            <Text style={styles.val}>{transaction?.customerName}</Text>
          </View>

          {transaction?.lines.map((line) => (
            <View key={line.productId} style={styles.sectionRow}>
              <Text style={styles.label}>{line.productName} × {line.quantity}</Text>
              <Text style={styles.val}>₦{line.total.toLocaleString()}</Text>
            </View>
          ))}

          <View style={styles.sectionRow}>
            <Text style={styles.label}>Fulfillment Status</Text>
            <Text style={styles.statusPendingVal}>{transaction?.status || 'Pending'}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL ORDER VALUE</Text>
            <Text style={styles.totalVal}>₦{(transaction?.total || 0).toLocaleString()}</Text>
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
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.teal, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  successTitle: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.darkText, textAlign: 'center' },
  successSub: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.darkMuted, textAlign: 'center', maxWidth: '85%', lineHeight: 18 },
  receiptCard: { backgroundColor: theme.colors.darkCard, borderColor: theme.colors.darkBorder, gap: theme.spacing.sm, padding: theme.spacing.lg },
  divider: { height: 1, backgroundColor: theme.colors.darkBorder, marginVertical: 6 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.darkMuted },
  val: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.darkText },
  statusPendingVal: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.amber },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.darkText },
  totalVal: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.teal },
  doneBtn: { marginTop: theme.spacing.sm },
});
