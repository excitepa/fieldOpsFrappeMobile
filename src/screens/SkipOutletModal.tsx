import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { skipOutletVisit, NetworkError } from '../services/api';
import { SkipRecord } from '../types';

interface SkipOutletModalProps {
  visible: boolean;
  outletName: string;
  outletId: string;
  campaignId: string;
  onClose: () => void;
  onSubmitSkip: (record: SkipRecord) => void;
}

const SKIP_REASONS = [
  'Outlet Closed',
  'No Stock Available',
  'Owner Not Available',
  'Wrong Location',
  'Temporary Closure',
  'Other',
];

export const SkipOutletModal: React.FC<SkipOutletModalProps> = ({
  visible,
  outletName,
  outletId,
  campaignId,
  onClose,
  onSubmitSkip,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isOther = selectedReason === 'Other';
  const isValid = selectedReason !== null && (!isOther || note.trim().length > 0);

  const handleSubmit = async () => {
    if (!selectedReason || !isValid) return;
    setSubmitting(true);

    const nowStr = new Date().toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    let gps = 'Location unavailable';
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        gps = `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      }
    } catch (e) {
      // keep the "unavailable" fallback — never fabricate coordinates
    }

    const reasonText = isOther ? note.trim() : selectedReason;
    try {
      await skipOutletVisit(outletId, campaignId, reasonText);
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        Alert.alert('No Connection', 'Could not reach the server. Check your connection and try again.');
      } else {
        Alert.alert('Could Not Skip Outlet', e?.message || 'The server rejected this. Please try again.');
      }
      return;
    }

    const skipRecord: SkipRecord = {
      id: `skip-${Date.now()}`,
      outletId,
      reason: selectedReason,
      note: isOther ? note.trim() : undefined,
      gps,
      timestamp: nowStr,
    };

    onSubmitSkip(skipRecord);
    setSubmitting(false);
    setSelectedReason(null);
    setNote('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[styles.sheetContainer, { paddingBottom: theme.spacing.xxl + insets.bottom }]}>
              <View style={styles.dragHandle} />

              {/* Title Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Skip customer</Text>
                <Text style={styles.sub}>
                  Select a reason. GPS and timestamp are captured automatically.
                </Text>
              </View>

              {/* Reasons List */}
              <View style={styles.reasonsList}>
                {SKIP_REASONS.map((reason) => {
                  const isSelected = selectedReason === reason;
                  return (
                    <Pressable
                      key={reason}
                      onPress={() => setSelectedReason(reason)}
                      style={[styles.reasonOption, isSelected && styles.reasonOptionSelected]}
                    >
                      <Text style={[styles.reasonText, isSelected && styles.reasonTextSelected]}>
                        {reason}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Note Input if Other is selected */}
              {isOther && (
                <View style={styles.noteWrapper}>
                  <Text style={styles.noteLabel}>Required Reason Note *</Text>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Describe why this outlet is skipped..."
                    placeholderTextColor={theme.colors.darkMuted}
                    value={note}
                    onChangeText={setNote}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              )}

              {/* Submit Button */}
              <Button
                title={submitting ? 'Submitting...' : 'Submit'}
                onPress={handleSubmit}
                variant="navy"
                size="large"
                disabled={!isValid || submitting}
                loading={submitting}
                style={styles.submitBtn}
              />
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
    paddingBottom: theme.spacing.xxl,
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
  header: { gap: 4 },
  title: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.textDark },
  sub: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  reasonsList: { gap: theme.spacing.xs },
  reasonOption: {
    backgroundColor: theme.colors.fieldFill,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
  },
  reasonOptionSelected: {
    backgroundColor: theme.colors.navy,
  },
  reasonText: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textDark },
  reasonTextSelected: { color: '#FFFFFF', fontFamily: theme.fonts.bold },
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
  submitBtn: { marginTop: theme.spacing.xs },
});
