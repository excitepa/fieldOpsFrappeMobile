import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon, IconName } from './Icon';

interface LeadQuickActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  onEditLead: () => void;
  onRecordSale: () => void;
  onRunSurvey: () => void;
}

export const LeadQuickActionsSheet: React.FC<LeadQuickActionsSheetProps> = ({
  visible, onClose, onEditLead, onRecordSale, onRunSurvey,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();

  const actions: { label: string; icon: IconName; onPress: () => void }[] = [
    { label: 'Edit Lead', icon: 'edit', onPress: onEditLead },
    { label: 'Record Sale', icon: 'dollar', onPress: onRecordSale },
    { label: 'Run Survey', icon: 'clipboard-list', onPress: onRunSurvey },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheetContainer, { paddingBottom: theme.spacing.xxl + insets.bottom }]}>
              <View style={styles.dragHandle} />
              <Text style={styles.title}>Quick actions</Text>

              {actions.map((a) => (
                <Pressable
                  key={a.label}
                  onPress={() => {
                    onClose();
                    a.onPress();
                  }}
                  style={styles.actionRow}
                >
                  <View style={styles.iconBadge}>
                    <Icon name={a.icon} size={18} color={theme.colors.navy} />
                  </View>
                  <Text style={styles.actionText}>{a.label}</Text>
                </Pressable>
              ))}
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
    backgroundColor: theme.colors.cardWhite, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.sm,
  },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.cardBorder, alignSelf: 'center', marginBottom: 4 },
  title: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.textDark, marginBottom: 4 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
    paddingVertical: 12,
  },
  iconBadge: {
    width: 40, height: 40, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  actionText: { fontFamily: theme.fonts.semibold, fontSize: 15, color: theme.colors.textDark },
});
