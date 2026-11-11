import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { OptionPickerSheet } from './OptionPickerSheet';
import { MasterOption } from '../types';

interface SelectFieldProps {
  label: string;
  options: MasterOption[];
  /** The chosen option's id. */
  value?: string;
  /** Shown for a `value` that isn't in `options`, e.g. a choice the record has that's since been made inactive. */
  valueName?: string;
  placeholder: string;
  /** The picker sheet's title. */
  title: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/**
 * A form field that picks one option by id, in a sheet; searchable when the
 * list is long. Labelled and sized like Input's field variant, so pickers and
 * text fields line up on a form.
 */
export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  options,
  value,
  valueName,
  placeholder,
  title,
  onChange,
  disabled = false,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [open, setOpen] = useState(false);

  // The sheet works on labels, so two options with the same name are told
  // apart by their phone number or id.
  const labels = options.map((o) =>
    options.some((other) => other !== o && other.name === o.name) ? `${o.name} · ${o.phone || o.id}` : o.name
  );
  const selectedIndex = options.findIndex((o) => o.id === value);
  const shown = selectedIndex >= 0 ? options[selectedIndex].name : value ? valueName || value : '';
  const canOpen = !disabled && options.length > 0;

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={!canOpen}
        style={[styles.dropdownBtn, !canOpen && styles.dropdownDisabled]}
      >
        <Text style={[styles.dropdownText, !shown && styles.dropdownPlaceholder]} numberOfLines={1}>
          {shown || placeholder}
        </Text>
        {canOpen && <Icon name="chevron-down" size={18} color={theme.colors.textMuted} />}
      </Pressable>

      <OptionPickerSheet
        visible={open}
        title={title}
        options={labels}
        selected={selectedIndex >= 0 ? labels[selectedIndex] : null}
        searchable={options.length > 6}
        searchPlaceholder={`Search ${label.toLowerCase()}`}
        onConfirm={(picked) => {
          const index = labels.indexOf(picked as string);
          if (index >= 0) onChange(options[index].id);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  fieldGroup: { gap: 6, marginVertical: theme.spacing.xs },
  label: { ...typography.fieldLabel, color: theme.colors.textMuted },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.fieldFill,
    borderRadius: theme.radius.md,
    height: 52,
    paddingHorizontal: theme.spacing.md,
  },
  dropdownDisabled: { opacity: 0.6 },
  dropdownText: { flex: 1, ...typography.inputText, color: theme.colors.textDark },
  dropdownPlaceholder: { color: theme.colors.textMuted },
});
