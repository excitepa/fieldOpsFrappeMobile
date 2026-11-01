import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { formatQty, formatUnitQty } from '../../../utils/units';
import { OfferOption } from '../../../utils/promotions';

interface FreeItemChoiceProps {
  mode: 'sale' | 'order';
  /** The product's offers, with the stock each would come from (offerOptions). */
  options: OfferOption[];
  /** The promotion chosen, if it's one of them. */
  chosenId?: string;
  onChoose: (promotionId: string) => void;
}

/** What an offer's free item can come from in a sale, e.g. "12 units in stock" or "Out of stock". */
const stockText = (o: OfferOption): string => {
  if (o.available === undefined) return '';
  if (o.available <= 0) return 'Out of stock';
  return `${o.covered ? '' : 'Only '}${formatUnitQty(o.available, o.rewardStockUom || 'unit')} in stock`;
};

/**
 * The free items a product's quantity qualifies for, one to pick: the reward,
 * its quantity and unit, and in a sale the stock it would come from. One the
 * agent's stock can't cover is greyed out and can't be picked.
 */
export const FreeItemChoice: React.FC<FreeItemChoiceProps> = ({ mode, options, chosenId, onChoose }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.list}>
      {options.map((o) => {
        const selected = o.promotionId === chosenId;
        const meta = [
          formatUnitQty(o.quantity, o.uom),
          o.promotionName,
          o.requiresCode ? 'with promo code' : '',
          mode === 'sale' ? stockText(o) : '',
        ].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={o.promotionId}
            onPress={() => onChoose(o.promotionId)}
            disabled={!o.covered}
            style={[styles.option, selected && styles.optionSelected, !o.covered && styles.optionDisabled]}
          >
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected && <View style={styles.radioDot} />}
            </View>
            <View style={styles.flex1}>
              <Text style={styles.optionTitle}>{formatQty(o.quantity)} × {o.productName}</Text>
              <Text style={[styles.optionMeta, !o.covered && styles.optionMetaShort]}>{meta}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  list: { gap: 6 },
  flex1: { flex: 1 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.fieldFill, borderWidth: 1, borderColor: theme.colors.fieldBorder,
    borderRadius: theme.radius.md, paddingVertical: 8, paddingHorizontal: 10,
  },
  optionSelected: { backgroundColor: theme.colors.emeraldLight, borderColor: theme.colors.emerald },
  optionDisabled: { opacity: 0.5 },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: theme.colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: theme.colors.emerald },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.emerald },
  optionTitle: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.textDark },
  optionMeta: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  optionMetaShort: { color: theme.colors.red },
});
