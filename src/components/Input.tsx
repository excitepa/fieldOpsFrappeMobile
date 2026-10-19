import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, KeyboardTypeOptions, TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon, IconName } from './Icon';

interface InputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  isPassword?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  keyboardType?: KeyboardTypeOptions;
  dark?: boolean;
  leftIcon?: IconName;
  required?: boolean;
  /** Opt-in "new UI" field style (uppercase muted label, flat gray fill).
   *  Defaults to 'default', which renders exactly as before this prop existed. */
  variant?: 'default' | 'field';
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  /** Shown under the field, which is outlined in red while it's set. */
  error?: string;
  /** Passed to TextInput. Not for phone numbers: see normalizePhone. */
  maxLength?: number;
}

export const Input: React.FC<InputProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  isPassword = false,
  multiline = false,
  keyboardType = 'default',
  dark = false,
  leftIcon,
  required = false,
  variant = 'default',
  autoCapitalize,
  autoCorrect,
  error,
  maxLength,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [showPassword, setShowPassword] = useState(!isPassword);
  const [isFocused, setIsFocused] = useState(false);
  const isField = variant === 'field';

  return (
    <View style={styles.container}>
      <Text style={[styles.label, dark && styles.labelDark, isField && styles.labelField]}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>
      <View
        style={[
          styles.inputWrapper,
          dark && styles.inputWrapperDark,
          isField && styles.inputWrapperField,
          isFocused && (isField ? styles.focusedField : dark ? styles.focusedDark : styles.focusedLight),
          multiline && styles.multilineWrapper,
          !!error && styles.inputWrapperError,
        ]}
      >
        {leftIcon && (
          <View style={styles.leftIconContainer}>
            <Icon
              name={leftIcon}
              size={18}
              color={dark ? theme.colors.darkMuted : theme.colors.textMuted}
            />
          </View>
        )}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={dark ? '#64748B' : '#94A3B8'}
          secureTextEntry={isPassword && !showPassword}
          multiline={multiline}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          maxLength={maxLength}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[
            styles.input,
            dark && styles.inputDark,
            multiline && styles.multilineInput,
          ]}
        />

        {isPassword && (
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeBtn}
          >
            <Icon
              name={showPassword ? 'eye-off' : 'eye'}
              size={18}
              color={dark ? theme.colors.darkMuted : theme.colors.textMuted}
            />
          </Pressable>
        )}
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    marginVertical: theme.spacing.xs,
  },
  label: {
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
    color: theme.colors.textDark,
    marginBottom: 6,
  },
  labelDark: {
    color: theme.colors.darkText,
  },
  labelField: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    color: theme.colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  required: {
    color: theme.colors.red,
  },
  inputWrapper: {
    minHeight: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.cardWhite,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  inputWrapperDark: {
    backgroundColor: theme.colors.darkInputBg,
    borderColor: theme.colors.darkBorder,
  },
  focusedLight: {
    borderColor: theme.colors.primary,
    backgroundColor: '#FAFAFF',
  },
  focusedDark: {
    borderColor: theme.colors.limePrimary,
    backgroundColor: '#151D28',
  },
  inputWrapperField: {
    backgroundColor: theme.colors.fieldFill,
    borderColor: theme.colors.fieldFill,
    borderRadius: theme.radius.md,
  },
  focusedField: {
    borderColor: theme.colors.navy,
  },
  inputWrapperError: {
    borderColor: theme.colors.red,
  },
  errorText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: theme.colors.red,
    marginTop: 4,
  },
  leftIconContainer: {
    marginRight: theme.spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.textDark,
    paddingVertical: theme.spacing.sm,
  },
  inputDark: {
    color: theme.colors.darkText,
  },
  multilineWrapper: {
    minHeight: 100,
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.sm,
  },
  multilineInput: {
    height: 90,
    textAlignVertical: 'top',
  },
  eyeBtn: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
});
