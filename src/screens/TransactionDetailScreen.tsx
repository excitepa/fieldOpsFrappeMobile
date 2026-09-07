import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { groupSalesByInvoice, groupOrdersByRef } from '../utils/transactions';
import { RouteName } from '../types';

interface TransactionDetailScreenProps {
  routeData?: { kind?: 'sale' | 'order' | 'survey'; ref?: string; id?: string; outletId?: string };
  onNavigate: (route: RouteName, data?: any) => void;
}

export const TransactionDetailScreen: React.FC<TransactionDetailScreenProps> = ({ routeData, onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, getSalesForOutlet, getOrdersForOutlet, getOutlet } = useFieldStore();

  const outletId = routeData?.outletId || '';
  const outlet = getOutlet(outletId);
  const kind = routeData?.kind;

  const sale = kind === 'sale' ? groupSalesByInvoice(getSalesForOutlet(outletId)).find((t) => t.ref === routeData?.ref) : undefined;
  const order = kind === 'order' ? groupOrdersByRef(getOrdersForOutlet(outletId)).find((t) => t.ref === routeData?.ref) : undefined;
  const survey = kind === 'survey' ? state.surveys.find((s) => s.id === routeData?.id) : undefined;

  if (!outlet || (!sale && !order && !survey)) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Transaction" subtitle="Not found" variant="navy" onNavigate={onNavigate} onBackPress={() => onNavigate('outletDetail', { outletId })} />
        <View style={styles.missingContainer}>
          <Icon name="alert-circle" size={44} color={theme.colors.amber} />
          <Text style={styles.missingTitle}>This transaction could not be found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const title = sale ? 'Sale Transaction' : order ? 'Order Transaction' : 'Survey Response';
  const statusLabel = sale ? 'Completed' : order ? order.status : 'Submitted';
  const statusColor = sale ? theme.colors.emerald : order?.status === 'Pending' ? theme.colors.amber : theme.colors.emerald;

  return (
    <SafeAreaView style={styles.container}>
      <Header title={title} subtitle={outlet.name} variant="navy" onNavigate={onNavigate} onBackPress={() => onNavigate('outletDetail', { outletId })} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Text style={styles.refText}>{sale?.ref || order?.ref || survey?.id}</Text>
          <Text style={styles.timeText}>{sale?.timestamp || order?.timestamp || survey?.timestamp}</Text>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>OUTLET</Text>
          <Text style={styles.bodyStrong}>{outlet.name}</Text>
          <Text style={styles.bodyMuted}>{outlet.area} · {outlet.address}</Text>
        </Card>

        {(sale || order) && (
          <>
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>CUSTOMER</Text>
              <Text style={styles.bodyStrong}>{(sale || order)!.customerName}</Text>
            </Card>

            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>PRODUCTS & QUANTITIES</Text>
              {(sale || order)!.lines.map((line) => (
                <View key={line.productId} style={styles.lineRow}>
                  <Text style={styles.lineText}>{line.productName} × {line.quantity}</Text>
                  <Text style={styles.lineAmount}>₦{line.total.toLocaleString()}</Text>
                </View>
              ))}
              <View style={styles.divider} />
              {(sale || order)!.discount > 0 && (
                <View style={styles.lineRow}>
                  <Text style={styles.lineText}>Discount</Text>
                  <Text style={[styles.lineAmount, { color: theme.colors.emerald }]}>-₦{(sale || order)!.discount.toLocaleString()}</Text>
                </View>
              )}
              <View style={styles.lineRow}>
                <Text style={styles.totalLabel}>TOTAL AMOUNT</Text>
                <Text style={styles.totalVal}>₦{(sale || order)!.total.toLocaleString()}</Text>
              </View>
            </Card>
          </>
        )}

        {survey && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{survey.surveyName || 'SURVEY'} — RESPONSES</Text>
            {survey.answers.map((a) => (
              <View key={a.questionId} style={styles.answerBlock}>
                <Text style={styles.answerQuestion}>{a.question}</Text>
                <Text style={styles.answerValue}>
                  {Array.isArray(a.answer) ? a.answer.join(', ') : (a.answer ?? '—').toString()}
                </Text>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.md },
  missingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  missingTitle: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark, textAlign: 'center' },
  statusCard: { backgroundColor: theme.colors.cardWhite, borderColor: theme.colors.cardBorder, alignItems: 'center', gap: 4 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.full },
  statusBadgeText: { fontFamily: theme.fonts.bold, fontSize: 12 },
  refText: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark, marginTop: 6 },
  timeText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  sectionCard: { backgroundColor: theme.colors.cardWhite, borderColor: theme.colors.cardBorder, gap: 6 },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  bodyStrong: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  bodyMuted: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  lineText: { fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textMuted },
  lineAmount: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textDark },
  divider: { height: 1, backgroundColor: theme.colors.cardBorder, marginVertical: 4 },
  totalLabel: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  totalVal: { fontFamily: theme.fonts.display, fontSize: 18, color: theme.colors.navy },
  answerBlock: { gap: 2, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.cardBorder },
  answerQuestion: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
  answerValue: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted },
});
