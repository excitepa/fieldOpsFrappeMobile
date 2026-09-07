import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, TouchableWithoutFeedback, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { useFieldStore } from '../store/useFieldStore';
import { Product } from '../types';

const ADJUSTMENT_REASONS = ['Sale', 'Return', 'Adjustment', 'Restock', 'Damage', 'Expired'];

type Direction = 'out' | 'in';

interface StockAdjustmentSheetProps {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
}

export const StockAdjustmentSheet: React.FC<StockAdjustmentSheetProps> = ({ visible, product, onClose }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const { dispatch } = useFieldStore();

  const [direction, setDirection] = useState<Direction>('out');
  const [quantityText, setQuantityText] = useState('0');
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setDirection('out');
      setQuantityText('0');
      setReason(null);
      setNote('');
    }
  }, [visible]);

  if (!product) return null;

  const quantity = parseInt(quantityText, 10) || 0;
  const qtyChange = direction === 'out' ? -quantity : quantity;
  const newStock = product.stock + qtyChange;
  const isValid = quantity > 0 && reason !== null && newStock >= 0;

  const handleSubmit = () => {
    if (!isValid || !reason) return;
    dispatch({
      type: 'ADJUST_STOCK',
      productId: product.id,
      qtyChange,
      reason: note.trim() ? `${reason} — ${note.trim()}` : reason,
      movementType: 'adjustment',
    });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <TouchableWithoutFeedback>
              <View style={[styles.sheetContainer, { paddingBottom: theme.spacing.xxl + insets.bottom }]}>
                <View style={styles.headerRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.title}>Adjust stock</Text>
                    <Text style={styles.sub}>{product.name} · {product.stock} units on hand</Text>
                  </View>
                  <Pressable onPress={onClose} style={styles.closeBtn}>
                    <Icon name="x" size={18} color={theme.colors.darkMuted} />
                  </Pressable>
                </View>

                <View style={styles.segmentRow}>
                  <Pressable
                    onPress={() => setDirection('out')}
                    style={[styles.segment, direction === 'out' && styles.segmentActiveOut]}
                  >
                    <Text style={[styles.segmentText, direction === 'out' && styles.segmentTextActive]}>Stock out</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setDirection('in')}
                    style={[styles.segment, direction === 'in' && styles.segmentActiveIn]}
                  >
                    <Text style={[styles.segmentText, direction === 'in' && styles.segmentTextActive]}>Stock in</Text>
                  </Pressable>
                </View>

                <View>
                  <Text style={styles.label}>Quantity (units)</Text>
                  <TextInput
                    style={styles.quantityInput}
                    value={quantityText}
                    onChangeText={(t) => setQuantityText(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={theme.colors.darkMuted}
                  />
                  {newStock < 0 && <Text style={styles.errorText}>This would take stock below zero.</Text>}
                </View>

                <View>
                  <Text style={styles.label}>Reason (required)</Text>
                  <View style={styles.chipRow}>
                    {ADJUSTMENT_REASONS.map((r) => {
                      const active = reason === r;
                      return (
                        <Pressable key={r} onPress={() => setReason(r)} style={[styles.chip, active && styles.chipActive]}>
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{r}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View>
                  <Text style={styles.label}>Note (optional)</Text>
                  <TextInput
                    style={styles.noteInput}
                    value={note}
                    onChangeText={setNote}
                    placeholder="Add any extra context..."
                    placeholderTextColor={theme.colors.darkMuted}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <Button
                  title={`Confirm ${direction === 'out' ? 'Stock Out' : 'Stock In'}`}
                  onPress={handleSubmit}
                  variant="primary"
                  size="large"
                  disabled={!isValid}
                  style={styles.submitBtn}
                />
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheetContainer: {
    backgroundColor: theme.colors.darkCard, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.darkBorder,
  },
  flex1: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.darkText },
  sub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.darkMuted, marginTop: 2 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.darkSurface, alignItems: 'center', justifyContent: 'center' },
  segmentRow: { flexDirection: 'row', backgroundColor: theme.colors.darkSurface, borderRadius: theme.radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, height: 40, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentActiveOut: { backgroundColor: theme.colors.red },
  segmentActiveIn: { backgroundColor: theme.colors.emerald },
  segmentText: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.darkMuted },
  segmentTextActive: { color: '#FFFFFF' },
  label: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.darkMuted, marginBottom: 6 },
  quantityInput: {
    backgroundColor: theme.colors.darkSurface, borderWidth: 1, borderColor: theme.colors.darkBorder,
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, height: 52,
    fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.darkText,
  },
  errorText: { fontFamily: theme.fonts.semibold, fontSize: 11, color: theme.colors.red, marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: theme.radius.full, backgroundColor: theme.colors.darkSurface, borderWidth: 1, borderColor: theme.colors.darkBorder },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.darkMuted },
  chipTextActive: { color: '#FFFFFF', fontFamily: theme.fonts.bold },
  noteInput: {
    minHeight: 80, backgroundColor: theme.colors.darkSurface, borderWidth: 1, borderColor: theme.colors.darkBorder,
    borderRadius: theme.radius.md, padding: theme.spacing.sm, fontFamily: theme.fonts.regular, fontSize: 13,
    color: theme.colors.darkText, textAlignVertical: 'top',
  },
  submitBtn: { marginTop: theme.spacing.xs },
});
