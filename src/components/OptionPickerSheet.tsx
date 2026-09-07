import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { Button } from './Button';

interface OptionPickerSheetProps {
  visible: boolean;
  title: string;
  options: string[];
  selected: string | string[] | null;
  multiple?: boolean;
  required?: boolean;
  /** Opt-in search box + local filtering, for long option lists (e.g. outlet channel). Defaults to false — unchanged behavior for existing callers. */
  searchable?: boolean;
  searchPlaceholder?: string;
  onConfirm: (value: string | string[]) => void;
  onClose: () => void;
}

export const OptionPickerSheet: React.FC<OptionPickerSheetProps> = ({
  visible,
  title,
  options,
  selected,
  multiple = false,
  required = false,
  searchable = false,
  searchPlaceholder = 'Search...',
  onConfirm,
  onClose,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();

  const initialMulti = Array.isArray(selected) ? selected : [];
  const [draftSelection, setDraftSelection] = useState<string[]>(initialMulti);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setDraftSelection(Array.isArray(selected) ? selected : []);
      setQuery('');
    }
  }, [visible, selected]);

  const toggleMulti = (option: string) => {
    setDraftSelection((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
    );
  };

  const handleSingleSelect = (option: string) => {
    onConfirm(option);
    onClose();
  };

  const handleConfirmMulti = () => {
    onConfirm(draftSelection);
    onClose();
  };

  const visibleOptions = searchable && query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheetContainer, { paddingBottom: theme.spacing.xxl + insets.bottom }]}>
              <View style={styles.dragHandle} />
              <Text style={styles.title}>{title}</Text>
              {searchable && <Text style={styles.searchHint}>Search and pick the closest match.</Text>}

              {searchable && (
                <View style={styles.searchBox}>
                  <Icon name="search" size={16} color={theme.colors.textMuted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder={searchPlaceholder}
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.searchInput}
                  />
                </View>
              )}

              <View style={styles.optionsList}>
                {visibleOptions.map((option) => {
                  const isSelected = multiple
                    ? draftSelection.includes(option)
                    : selected === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => (multiple ? toggleMulti(option) : handleSingleSelect(option))}
                      style={styles.optionRow}
                    >
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                        {option}
                      </Text>
                      {multiple ? (
                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                          {isSelected && <Icon name="check" size={13} color="#FFFFFF" />}
                        </View>
                      ) : (
                        isSelected && <Icon name="check" size={18} color={theme.colors.navy} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {multiple && (
                <Button
                  title="Done"
                  onPress={handleConfirmMulti}
                  variant="navy"
                  size="large"
                  disabled={required && draftSelection.length === 0}
                  style={styles.confirmBtn}
                />
              )}
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: theme.colors.cardWhite,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
    maxHeight: '80%',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.cardBorder,
    alignSelf: 'center',
  },
  title: { fontFamily: theme.fonts.bold, fontSize: 19, color: theme.colors.textDark },
  searchHint: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, marginTop: -8 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md, height: 46,
  },
  searchInput: { flex: 1, fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textDark },
  optionsList: { gap: theme.spacing.sm },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.cardWhite,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
  },
  optionText: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textDark, flex: 1 },
  optionTextSelected: { color: theme.colors.navy, fontFamily: theme.fonts.bold },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: theme.colors.navy,
    backgroundColor: theme.colors.navy,
  },
  confirmBtn: { marginTop: theme.spacing.xs },
});
