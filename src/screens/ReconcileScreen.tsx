import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { OptionPickerSheet } from '../components/OptionPickerSheet';
import { useFieldStore } from '../store/useFieldStore';
import { submitStockReconciliation, NetworkError } from '../services/api';
import { RouteName, Product } from '../types';

const RECONCILE_REASONS = ['Recount Correction', 'Damaged Goods', 'Expired Stock', 'Theft / Loss', 'Other'];

interface ReconcileScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

export const ReconcileScreen: React.FC<ReconcileScreenProps> = ({ onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(state.products[0] || null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [physicalCount, setPhysicalCount] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [reasonPickerOpen, setReasonPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const countNum = parseInt(physicalCount, 10);
  const variance = selectedProduct && !isNaN(countNum) ? countNum - selectedProduct.stock : null;
  const isValid = selectedProduct !== null && !isNaN(countNum) && countNum >= 0 && reason !== null && variance !== 0;

  const handleSubmit = async () => {
    if (!isValid || !selectedProduct || variance === null || !reason) return;
    setLoading(true);
    try {
      await submitStockReconciliation(state.activeCampaign?.id || '', [
        { itemCode: selectedProduct.id, physicalQty: countNum, recordedQty: selectedProduct.stock },
      ]);
    } catch (e: any) {
      setLoading(false);
      if (e instanceof NetworkError) {
        Alert.alert('No Connection', 'Could not reach the server. Check your connection and try again.');
      } else {
        Alert.alert('Could Not Submit Reconciliation', e?.message || 'The server rejected this reconciliation. Please try again.');
      }
      return;
    }

    dispatch({
      type: 'ADJUST_STOCK',
      productId: selectedProduct.id,
      qtyChange: variance,
      reason,
      movementType: 'reconciliation',
    });
    setLoading(false);
    Alert.alert('Reconciliation Submitted', `${selectedProduct.name} stock updated to ${countNum} units.`);
    onNavigate('inventory');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Stock Reconciliation" subtitle="Physical count vs system stock" onNavigate={onNavigate} />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => setProductPickerOpen(true)}>
          <Card style={styles.productHeader}>
            <Text style={styles.productLabel}>SELECTED SKU</Text>
            <View style={styles.productRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productTitle}>{selectedProduct?.name || 'Select a product'}</Text>
                <Text style={styles.stockSub}>Current system stock: {selectedProduct?.stock ?? '—'} units</Text>
              </View>
              <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
            </View>
          </Card>
        </Pressable>

        <Input
          label="PHYSICAL STOCK COUNT"
          value={physicalCount}
          onChangeText={setPhysicalCount}
          placeholder="Enter counted units"
          keyboardType="numeric"
          required
        />

        {variance !== null && variance !== 0 && (
          <Text style={[styles.varianceText, { color: variance > 0 ? theme.colors.emerald : theme.colors.red }]}>
            Variance: {variance > 0 ? '+' : ''}{variance} units
          </Text>
        )}

        <Text style={styles.sectionLabel}>ADJUSTMENT REASON *</Text>
        <Pressable onPress={() => setReasonPickerOpen(true)} style={styles.reasonTrigger}>
          <Text style={styles.reasonTriggerText}>{reason || 'Select a reason'}</Text>
          <Icon name="chevron-down" size={18} color={theme.colors.textMuted} />
        </Pressable>

        <Card style={styles.alertCard}>
          <View style={styles.alertRow}>
            <Icon name="alert-circle" size={20} color={theme.colors.amber} />
            <Text style={styles.alertText}>
              Any variance between physical count and system stock will be logged as a Movements entry for Admin review.
            </Text>
          </View>
        </Card>

        <Button
          title="Submit Reconciliation"
          onPress={handleSubmit}
          loading={loading}
          disabled={!isValid}
          size="large"
          iconName="check"
          style={styles.submitBtn}
        />
      </ScrollView>

      <OptionPickerSheet
        visible={productPickerOpen}
        title="Select Product"
        options={state.products.map((p) => p.name)}
        selected={selectedProduct?.name || null}
        onConfirm={(name) => setSelectedProduct(state.products.find((p) => p.name === name) || null)}
        onClose={() => setProductPickerOpen(false)}
      />

      <OptionPickerSheet
        visible={reasonPickerOpen}
        title="Reason for Reconciliation"
        options={RECONCILE_REASONS}
        selected={reason}
        required
        onConfirm={(val) => setReason(val as string)}
        onClose={() => setReasonPickerOpen(false)}
      />
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 100, gap: theme.spacing.md },
  productHeader: { gap: theme.spacing.xs },
  productLabel: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  productTitle: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.textDark },
  stockSub: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted },
  varianceText: { fontFamily: theme.fonts.bold, fontSize: 13, marginTop: -8 },
  sectionLabel: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  reasonTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, paddingVertical: 14,
  },
  reasonTriggerText: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textDark },
  alertCard: { backgroundColor: theme.colors.amberLight, borderColor: theme.colors.amber },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  alertText: { flex: 1, fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textDark, lineHeight: 18 },
  submitBtn: { marginTop: theme.spacing.sm },
});
