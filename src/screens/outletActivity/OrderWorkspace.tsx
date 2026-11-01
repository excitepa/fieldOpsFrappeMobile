import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Icon } from '../../components/Icon';
import { CartLine, Product, ProductUnit, PromotionChoices } from '../../types';
import { findLine, getSellingUnits, getStockUnit, lineStockQty } from '../../utils/cart';
import { formatUnitQty, unitWord, formatQty } from '../../utils/units';
import { currentPromotions, describePromotion, OfferOption } from '../../utils/promotions';
import { FreeItemChoice } from './components/FreeItemChoice';

interface OrderWorkspaceProps {
  mode: 'sale' | 'order';
  products: Product[];
  cart: CartLine[];
  onSetQty: (product: Product, unit: ProductUnit, qty: number) => void;
  /** Each product's offers for its quantity, with the stock they'd come from (offerOptions). */
  offers: Map<string, OfferOption[]>;
  /** The free item chosen for each product with more than one offer. */
  choices: PromotionChoices;
  onChoose: (productId: string, promotionId: string) => void;
}

export const OrderWorkspace: React.FC<OrderWorkspaceProps> = ({ mode, products, cart, onSetQty, offers, choices, onChoose }) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  // Out-of-stock products say so on their own card; a banner above the list
  // said it again.
  return (
    <View style={styles.container}>
      {products.length === 0 && (
        <Text style={styles.emptyText}>No products available for this {mode === 'sale' ? 'sale' : 'order'}.</Text>
      )}

      <View style={styles.list}>
        {products.map((p) => {
          const units = getSellingUnits(p);
          const stockUnit = getStockUnit(p);
          const lines = cart.filter((l) => l.productId === p.id);
          const stockQty = lines.reduce((sum, l) => sum + lineStockQty(l), 0);
          const amount = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
          const outOfStock = p.stock <= 0;
          // A pre-order doesn't come out of the agent's stock, so out-of-stock
          // products keep their quantity controls in Order mode; the badge
          // just says so.
          const canPick = mode === 'order' || !outOfStock;
          const meta = [p.brand, p.size, `₦${stockUnit.price.toLocaleString()} / ${unitWord(stockUnit.uom, 1)}`].filter(Boolean).join(' · ');
          const promotions = currentPromotions(p);
          const productOffers = offers.get(p.id) || [];

          return (
            <View key={p.id} style={[styles.productCard, !canPick && styles.productCardDisabled]}>
              <View style={styles.productRow}>
                <View style={styles.productIcon}>
                  <Icon name="package" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.flex1}>
                  {p.isMsl && (
                    <View style={styles.mslBadge}>
                      <Text style={styles.mslBadgeText}>MSL</Text>
                    </View>
                  )}
                  <Text style={styles.productName}>{p.name}</Text>
                  <Text style={styles.productMeta}>{meta}</Text>
                </View>
                {outOfStock && (
                  <View style={styles.oosBadge}>
                    <Text style={styles.oosBadgeText}>Out of stock</Text>
                  </View>
                )}
              </View>

              {promotions.map((promo) => (
                <View key={promo.id} style={styles.promoBadge}>
                  <Icon name="tag" size={12} color={theme.colors.emerald} />
                  <Text style={styles.promoBadgeText}>{describePromotion(promo, p)}</Text>
                </View>
              ))}
              {promotions.length > 1 && (
                <Text style={styles.promoHint}>One free item per product: you choose which.</Text>
              )}

              {canPick && (
                <>
                  {units.length > 1 ? (
                    // One stepper per unit the product sells in, default sales
                    // unit first — each counts whole numbers of its own unit.
                    <View style={styles.unitList}>
                      {units.map((u) => {
                        const value = findLine(cart, p, u)?.quantity || 0;
                        const size = u.conversionFactor !== 1 ? ` · ${formatQty(u.conversionFactor)} ${unitWord(stockUnit.uom, u.conversionFactor)}` : '';
                        return (
                          <View key={u.uom} style={styles.unitRow}>
                            <Text style={[styles.stepperLabel, styles.unitRowLabel]} numberOfLines={1}>
                              {u.uom.toUpperCase()} · ₦{u.price.toLocaleString()}{size}
                            </Text>
                            <StepperControl value={value} onChange={(v) => onSetQty(p, u, Math.max(0, v))} />
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    // A product that only sells in its stock unit (always the case
                    // against a backend that doesn't send units) keeps the single
                    // QUANTITY stepper.
                    <View style={styles.stepperRow}>
                      <Stepper
                        label="QUANTITY"
                        value={findLine(cart, p, units[0])?.quantity || 0}
                        onChange={(v) => onSetQty(p, units[0], Math.max(0, v))}
                      />
                    </View>
                  )}
                  {stockQty > 0 && (
                    <Text style={styles.qtyHint}>
                      {formatUnitQty(stockQty, stockUnit.uom)} · ₦{amount.toLocaleString()}
                    </Text>
                  )}
                  {productOffers.length > 1 && (
                    <View style={styles.choiceBlock}>
                      <Text style={styles.choiceTitle}>Choose the free item</Text>
                      <FreeItemChoice mode={mode} options={productOffers} chosenId={choices[p.id]} onChoose={(id) => onChoose(p.id, id)} />
                    </View>
                  )}
                  {productOffers.length === 1 && (
                    <Text style={[styles.freeHint, !productOffers[0].covered && styles.freeHintShort]}>
                      Free: {formatQty(productOffers[0].quantity)} × {productOffers[0].productName}
                      {productOffers[0].requiresCode ? ' (with promo code)' : ''}
                      {productOffers[0].covered ? '' : ' · not enough in stock'}
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

const StepperControl: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.stepperControl}>
      <Pressable onPress={() => onChange(value - 1)} disabled={value <= 0} style={[styles.stepperBtn, value <= 0 && styles.stepperBtnDisabled]}>
        <Icon name="minus" size={14} color={theme.colors.textDark} />
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable onPress={() => onChange(value + 1)} style={styles.stepperBtn}>
        <Icon name="plus" size={14} color={theme.colors.textDark} />
      </Pressable>
    </View>
  );
};

const Stepper: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.stepperCard}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <StepperControl value={value} onChange={onChange} />
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { gap: theme.spacing.md },
  flex1: { flex: 1 },
  emptyText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: theme.spacing.xl },

  list: { gap: theme.spacing.sm },
  productCard: {
    backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: theme.spacing.sm,
  },
  productCardDisabled: { opacity: 0.6 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  productIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.teal, alignItems: 'center', justifyContent: 'center' },
  productName: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  mslBadge: { alignSelf: 'flex-start', backgroundColor: theme.colors.tintGold, borderRadius: theme.radius.full, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 3 },
  mslBadgeText: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.tintGoldIcon },
  productMeta: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  oosBadge: { backgroundColor: theme.colors.redLight, paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full },
  oosBadgeText: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.red },
  promoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: theme.colors.emeraldLight, borderRadius: theme.radius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  promoBadgeText: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.emerald, flexShrink: 1 },
  promoHint: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted },
  choiceBlock: { gap: 6 },
  choiceTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textDark, letterSpacing: 0.3 },
  freeHint: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.emerald },
  freeHintShort: { color: theme.colors.red },

  stepperRow: { flexDirection: 'row', gap: theme.spacing.sm },
  stepperCard: {
    flex: 1, gap: 6, backgroundColor: theme.colors.fieldFill, borderWidth: 1, borderColor: theme.colors.fieldBorder,
    borderRadius: theme.radius.md, paddingVertical: 8, paddingHorizontal: 10,
  },
  stepperLabel: { fontFamily: theme.fonts.bold, fontSize: 9, color: theme.colors.textMuted, letterSpacing: 0.5, textAlign: 'center' },
  stepperControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  stepperBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  stepperBtnDisabled: { opacity: 0.35 },
  stepperValue: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark, minWidth: 20, textAlign: 'center' },

  unitList: { gap: 6 },
  unitRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.fieldFill, borderWidth: 1, borderColor: theme.colors.fieldBorder,
    borderRadius: theme.radius.md, paddingVertical: 8, paddingHorizontal: 10,
  },
  unitRowLabel: { flex: 1, fontSize: 10, textAlign: 'left' },

  qtyHint: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.textMuted },
});
