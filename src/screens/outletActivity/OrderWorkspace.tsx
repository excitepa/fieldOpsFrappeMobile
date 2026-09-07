import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Icon } from '../../components/Icon';
import { CartLine, Product } from '../../types';

interface OrderWorkspaceProps {
  mode: 'sale' | 'order';
  products: Product[];
  cart: CartLine[];
  onSetQty: (product: Product, qty: number) => void;
}

export const OrderWorkspace: React.FC<OrderWorkspaceProps> = ({ mode, products, cart, onSetQty }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const anyOutOfStock = products.some((p) => p.stock <= 0);

  return (
    <View style={styles.container}>
      {anyOutOfStock && (
        <View style={styles.stockWarning}>
          <Icon name="alert-circle" size={16} color={theme.colors.amber} />
          <View style={styles.flex1}>
            <Text style={styles.stockWarningTitle}>Some products are out of stock</Text>
            <Text style={styles.stockWarningSub}>You need available stock to {mode === 'sale' ? 'sell' : 'order'}.</Text>
          </View>
        </View>
      )}

      {products.length === 0 && (
        <Text style={styles.emptyText}>No products available for this {mode === 'sale' ? 'sale' : 'order'}.</Text>
      )}

      <View style={styles.list}>
        {products.map((p) => {
          const line = cart.find((l) => l.productId === p.id);
          const qty = line?.quantity || 0;
          const unitsPerCase = p.unitsPerCase || 1;
          const cases = Math.floor(qty / unitsPerCase);
          const units = qty % unitsPerCase;
          const outOfStock = p.stock <= 0;

          return (
            <View key={p.id} style={[styles.productCard, outOfStock && styles.productCardDisabled]}>
              <View style={styles.productRow}>
                <View style={styles.productIcon}>
                  <Icon name="package" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.productName}>{p.name}</Text>
                  <Text style={styles.productMeta}>
                    ₦{p.price.toLocaleString()} / {p.unit || 'unit'} · {unitsPerCase} per case
                  </Text>
                </View>
                {outOfStock && (
                  <View style={styles.oosBadge}>
                    <Text style={styles.oosBadgeText}>Out of stock</Text>
                  </View>
                )}
              </View>

              {!outOfStock && (
                <>
                  <View style={styles.stepperRow}>
                    {unitsPerCase > 1 ? (
                      <>
                        <Stepper
                          label="CASES"
                          value={cases}
                          onChange={(v) => onSetQty(p, Math.max(0, v) * unitsPerCase + units)}
                        />
                        <Stepper
                          label="UNITS"
                          value={units}
                          onChange={(v) => onSetQty(p, cases * unitsPerCase + Math.max(0, v))}
                        />
                      </>
                    ) : (
                      // A product with no real case packaging (unitsPerCase <= 1, the
                      // default when the backend doesn't send units_per_case/
                      // conversion_factor) has no room for a leftover unit — qty % 1 is
                      // always 0, so the UNITS stepper could never show anything but 0
                      // no matter how many times it was pressed, while CASES silently
                      // absorbed every tap instead. One QUANTITY stepper avoids that
                      // dead control entirely for these products.
                      <Stepper label="QUANTITY" value={qty} onChange={(v) => onSetQty(p, Math.max(0, v))} />
                    )}
                  </View>
                  {qty > 0 && (
                    <Text style={styles.qtyHint}>
                      {qty} unit{qty === 1 ? '' : 's'} · ₦{(qty * p.price).toLocaleString()}
                    </Text>
                  )}
                </>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const Stepper: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.stepperCard}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControl}>
        <Pressable onPress={() => onChange(value - 1)} disabled={value <= 0} style={[styles.stepperBtn, value <= 0 && styles.stepperBtnDisabled]}>
          <Icon name="minus" size={14} color={theme.colors.textDark} />
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable onPress={() => onChange(value + 1)} style={styles.stepperBtn}>
          <Icon name="plus" size={14} color={theme.colors.textDark} />
        </Pressable>
      </View>
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { gap: theme.spacing.md },
  flex1: { flex: 1 },
  emptyText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: theme.spacing.xl },

  stockWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm,
    backgroundColor: theme.colors.amberLight, borderRadius: theme.radius.md,
    borderLeftWidth: 3, borderLeftColor: theme.colors.amber, padding: theme.spacing.md,
  },
  stockWarningTitle: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.textDark },
  stockWarningSub: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },

  list: { gap: theme.spacing.sm },
  productCard: {
    backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: theme.spacing.sm,
  },
  productCardDisabled: { opacity: 0.6 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  productIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.teal, alignItems: 'center', justifyContent: 'center' },
  productName: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  productMeta: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  oosBadge: { backgroundColor: theme.colors.redLight, paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full },
  oosBadgeText: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.red },

  stepperRow: { flexDirection: 'row', gap: theme.spacing.sm },
  stepperCard: {
    flex: 1, gap: 6, backgroundColor: theme.colors.fieldFill, borderWidth: 1, borderColor: theme.colors.fieldBorder,
    borderRadius: theme.radius.md, paddingVertical: 8, paddingHorizontal: 10,
  },
  stepperLabel: { fontFamily: theme.fonts.bold, fontSize: 9, color: theme.colors.textMuted, letterSpacing: 0.5, textAlign: 'center' },
  stepperControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  stepperBtnDisabled: { opacity: 0.35 },
  stepperValue: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark, minWidth: 20, textAlign: 'center' },

  qtyHint: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.textMuted },
});
