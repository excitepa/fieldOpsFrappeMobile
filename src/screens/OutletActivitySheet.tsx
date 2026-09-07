import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../components/Icon';
import { CampaignModule } from '../types';

interface OutletActivitySheetProps {
  visible: boolean;
  outletName: string;
  enabledModules: CampaignModule[];
  onClose: () => void;
  onSelectAction: (action: 'editCustomer' | 'sale' | 'order' | 'survey' | 'merchandising') => void;
  onSkipOutlet: () => void;
}

export const OutletActivitySheet: React.FC<OutletActivitySheetProps> = ({
  visible,
  outletName,
  enabledModules = [],
  onClose,
  onSelectAction,
  onSkipOutlet,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const showSale = enabledModules.includes('sales');
  // "New Order" never appears in quick actions — outlet orders are placed
  // from the Orders module, not this sheet, matching the reference flow.
  // Surveys are always offered regardless of the campaign's declared `modules`
  // list — that list is loosely-defined campaign metadata and isn't reliably
  // populated with 'surveys' even for campaigns that do have real surveys
  // assigned server-side (Survey.campaign is a separate link, independent of
  // Campaign.modules). OutletSurveysScreen already shows an empty state if a
  // campaign genuinely has no surveys configured, so gating the entry point
  // here only hid a working flow behind an unreliable flag.
  const showMerchandising = enabledModules.includes('merchandising');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheetContainer, { paddingBottom: theme.spacing.xxl + 10 + insets.bottom }]}>
              <View style={styles.dragHandle} />
              <Text style={styles.title}>Quick actions</Text>

              <View style={styles.actionsList}>
                <Pressable
                  onPress={() => {
                    onClose();
                    onSelectAction('editCustomer');
                  }}
                  style={styles.actionRow}
                >
                  <View style={[styles.iconBox, { backgroundColor: theme.colors.tintGray }]}>
                    <Icon name="store" size={18} color={theme.colors.tintGrayIcon} />
                  </View>
                  <Text style={styles.actionTitle}>Edit Customer</Text>
                </Pressable>

                {showSale && (
                  <Pressable
                    onPress={() => {
                      onClose();
                      onSelectAction('sale');
                    }}
                    style={styles.actionRow}
                  >
                    <View style={[styles.iconBox, { backgroundColor: theme.colors.tintPurple }]}>
                      <Icon name="shopping-bag" size={18} color={theme.colors.tintPurpleIcon} />
                    </View>
                    <Text style={styles.actionTitle}>New Sale</Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => {
                    onClose();
                    onSelectAction('survey');
                  }}
                  style={styles.actionRow}
                >
                  <View style={[styles.iconBox, { backgroundColor: theme.colors.tintGold }]}>
                    <Icon name="clipboard-list" size={18} color={theme.colors.tintGoldIcon} />
                  </View>
                  <Text style={styles.actionTitle}>New Survey</Text>
                </Pressable>

                {showMerchandising && (
                  <Pressable
                    onPress={() => {
                      onClose();
                      onSelectAction('merchandising');
                    }}
                    style={styles.actionRow}
                  >
                    <View style={[styles.iconBox, { backgroundColor: theme.colors.tintBlue }]}>
                      <Icon name="layers" size={18} color={theme.colors.tintBlueIcon} />
                    </View>
                    <Text style={styles.actionTitle}>New Merchandising</Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => {
                    onClose();
                    onSkipOutlet();
                  }}
                  style={styles.actionRow}
                >
                  <View style={[styles.iconBox, { backgroundColor: theme.colors.tintPeach }]}>
                    <Icon name="x" size={18} color={theme.colors.tintPeachIcon} />
                  </View>
                  <Text style={styles.actionTitle}>Skip Outlet</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: theme.colors.cardWhite,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl + 10,
    gap: theme.spacing.md,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.cardBorder,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.textDark },
  actionsList: { gap: theme.spacing.xs },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { fontFamily: theme.fonts.semibold, fontSize: 15, color: theme.colors.textDark },
});
