import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { Icon } from '../../../components/Icon';
import { Button } from '../../../components/Button';
import { CartLine, Product } from '../../../types';
import { StockShortfall, getStockQtyByProduct, lineKey } from '../../../utils/cart';
import { formatQty, formatUnitQty } from '../../../utils/units';
import { describeShortfall } from '../../../utils/stock';

interface SummaryTabProps {
  mode: 'sale' | 'order';
  customerName: string;
  cart: CartLine[];
  products: Product[];
  total: number;
  stockShortfalls: StockShortfall[];
  submitting: boolean;
  onDeleteLine: (key: string) => void;
  onEdit: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
}

// Mirrors the "Sales Summary" tab in the reference OrderWorkspace: a totals
// card, the current cart's line items (editable only by removal — quantity
// is adjusted back on the Sale/Order tab), then Edit/Save Draft/Submit.
export const SummaryTab: React.FC<SummaryTabProps> = ({
  mode, customerName, cart, products, total, stockShortfalls, submitting,
  onDeleteLine, onEdit, onSaveDraft, onSubmit,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const modeLabel = mode === 'sale' ? 'Sale' : 'Order';
  const hasItems = cart.length > 0;
  const hasShortfall = stockShortfalls.length > 0;

  // Lines can mix units (cartons and loose units of one product), so both
  // counts work per product, from its stock units across all its lines.
  const stockQtyByProduct = getStockQtyByProduct(cart);
  const totalSkus = stockQtyByProduct.size;
  let totalCases = 0;
  stockQtyByProduct.forEach((stockQty, productId) => {
    const perCase = products.find((p) => p.id === productId)?.unitsPerCase || 0;
    if (perCase > 0) totalCases += stockQty / perCase;
  });

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryCardLabel}>{modeLabel.toUpperCase()}S SUMMARY</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>Customer</Text>
          <Text style={styles.summaryRowValue}>{customerName}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>Amount</Text>
          <Text style={styles.summaryRowValue}>₦{total.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>Total SKUs</Text>
          <Text style={styles.summaryRowValue}>{totalSkus}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>Total Cases</Text>
          <Text style={styles.summaryRowValue}>{formatQty(Math.round(totalCases * 10) / 10)}</Text>
        </View>
      </View>

      <View style={styles.productsCard}>
        <Text style={styles.productsLabel}>PRODUCTS</Text>
        {hasItems ? (
          <View style={styles.linesList}>
            {cart.map((line, idx) => {
              // A product's shortfall covers all its lines: shown once, on its first.
              const isFirstOfProduct = cart.findIndex((l) => l.productId === line.productId) === idx;
              const shortfall = stockShortfalls.find((s) => s.productId === line.productId);
              return (
                <View key={lineKey(line)} style={[styles.lineRow, shortfall && styles.lineRowError]}>
                  <View style={styles.flex1}>
                    <Text style={styles.lineName}>{line.productName}</Text>
                    <Text style={styles.lineSub}>
                      ₦{line.unitPrice.toLocaleString()} × {formatUnitQty(line.quantity, line.uom)} · ₦{(line.unitPrice * line.quantity).toLocaleString()}
                    </Text>
                    {shortfall && isFirstOfProduct && (
                      <Text style={styles.shortfallText}>{describeShortfall(shortfall, shortfall.product)}</Text>
                    )}
                  </View>
                  <Pressable onPress={() => onDeleteLine(lineKey(line))} style={styles.removeBtn}>
                    <Icon name="minus" size={16} color={theme.colors.red} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Icon name="package" size={28} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>No products added yet.</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomBlock}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL AMOUNT</Text>
          <Text style={styles.totalVal}>₦{total.toLocaleString()}</Text>
        </View>

        <View style={styles.actionsRow}>
          <Pressable onPress={onEdit} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Edit {modeLabel}</Text>
          </Pressable>
          <Pressable onPress={onSaveDraft} disabled={!hasItems} style={[styles.secondaryBtn, !hasItems && styles.secondaryBtnDisabled]}>
            <Text style={[styles.secondaryBtnText, !hasItems && styles.secondaryBtnTextDisabled]}>Save to Draft</Text>
          </Pressable>
        </View>
        <Text style={styles.helperText}>Save to Draft keeps this {mode} unsent so you can finish it later.</Text>

        <Button
          title={submitting ? 'Submitting...' : `Submit & Complete ${modeLabel}`}
          onPress={onSubmit}
          variant="navy"
          size="large"
          loading={submitting}
          disabled={!hasItems || submitting || hasShortfall}
        />
      </View>
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { gap: theme.spacing.md },
  flex1: { flex: 1 },

  summaryCard: {
    backgroundColor: theme.colors.navy, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.sm,
  },
  summaryCardLabel: { fontFamily: theme.fonts.bold, fontSize: 11, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.8, marginBottom: 2 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryRowLabel: { fontFamily: theme.fonts.regular, fontSize: 14, color: 'rgba(255,255,255,0.75)' },
  summaryRowValue: { fontFamily: theme.fonts.bold, fontSize: 14, color: '#FFFFFF' },

  productsCard: {
    backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.sm,
  },
  productsLabel: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl },
  emptyText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted },

  linesList: { gap: theme.spacing.xs },
  lineRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.fieldFill, borderWidth: 1, borderColor: theme.colors.fieldBorder,
    borderRadius: theme.radius.md, padding: theme.spacing.md,
  },
  lineRowError: { borderColor: theme.colors.red },
  lineName: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  lineSub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  shortfallText: { fontFamily: theme.fonts.semibold, fontSize: 11, color: theme.colors.red, marginTop: 2 },
  removeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder },

  bottomBlock: { gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.textMuted, letterSpacing: 0.6 },
  totalVal: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.textDark },

  actionsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  secondaryBtn: {
    flex: 1, minHeight: 44, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder,
  },
  secondaryBtnDisabled: { opacity: 0.5 },
  secondaryBtnText: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.textDark },
  secondaryBtnTextDisabled: { color: theme.colors.textMuted },
  helperText: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted, textAlign: 'center' },
});
