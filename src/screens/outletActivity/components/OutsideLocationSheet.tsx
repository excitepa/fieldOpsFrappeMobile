import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme/ThemeContext';
import { Icon } from '../../../components/Icon';
import { Button } from '../../../components/Button';

interface OutsideLocationSheetProps {
  visible: boolean;
  /** What's wrong with where the sale is being recorded, one line each. */
  problems: string[];
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/**
 * Before a sale away from the outlet, outside the agent's territory, or with
 * no location: says what's wrong and asks why. Being outside never blocks
 * the sale; it's recorded with the reason and the supervisor sees it.
 * (Alert.alert can't take text on Android, hence a sheet.)
 */
export const OutsideLocationSheet: React.FC<OutsideLocationSheetProps> = ({ visible, problems, onConfirm, onCancel }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[styles.sheetContainer, { paddingBottom: theme.spacing.xxl + insets.bottom }]}>
              <View style={styles.dragHandle} />

              <View style={styles.header}>
                <Text style={styles.title}>Check your location</Text>
                <Text style={styles.sub}>
                  You can still record this sale. It will be marked as recorded away from the outlet, and your supervisor will see it.
                </Text>
              </View>

              <View style={styles.problemList}>
                {problems.map((problem) => (
                  <View key={problem} style={styles.problemRow}>
                    <Icon name="alert-circle" size={16} color={theme.colors.amber} />
                    <Text style={styles.problemText}>{problem}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.noteWrapper}>
                <Text style={styles.noteLabel}>Reason *</Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Why are you recording this sale here?"
                  placeholderTextColor={theme.colors.textMuted}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.actions}>
                <Button title="Cancel" onPress={onCancel} variant="outline" style={styles.actionBtn} />
                <Button
                  title="Record sale anyway"
                  onPress={() => onConfirm(reason.trim())}
                  variant="navy"
                  disabled={!reason.trim()}
                  style={styles.actionBtnWide}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetContainer: {
    backgroundColor: theme.colors.cardWhite,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.cardBorder, alignSelf: 'center', marginBottom: 4 },
  header: { gap: 4 },
  title: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.textDark },
  sub: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  problemList: { gap: theme.spacing.xs },
  problemRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm,
    backgroundColor: theme.colors.amberLight, borderRadius: theme.radius.md, padding: theme.spacing.md,
  },
  problemText: { flex: 1, fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textDark, lineHeight: 19 },
  noteWrapper: { gap: 6 },
  noteLabel: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.textMuted },
  noteInput: {
    backgroundColor: theme.colors.fieldFill,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.textDark,
    textAlignVertical: 'top',
    minHeight: 70,
  },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  actionBtn: { flex: 1 },
  actionBtnWide: { flex: 1.6 },
});
