import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { RouteName } from '../types';

interface ForgotPasswordScreenProps {
  onNavigate: (route: RouteName) => void;
}

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({ onNavigate }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleReset = () => {
    if (!email) {
      Alert.alert('Email Required', 'Please enter your work email address.');
      return;
    }
    setSent(true);
    Alert.alert(
      'Reset Link Sent',
      'If an account exists with this email, you will receive password reset instructions shortly.'
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Password Reset" dark onNavigate={onNavigate} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.sub}>
          Enter your registered work email address. We will send you a verification link to set a new password.
        </Text>

        <Input
          label="WORK EMAIL"
          value={email}
          onChangeText={setEmail}
          placeholder="amara@fieldops.io"
          keyboardType="email-address"
          dark
          required
          leftIcon="mail"
        />

        <Button
          title={sent ? 'Resend Instructions' : 'Send Reset Link'}
          onPress={handleReset}
          variant="lime"
          size="large"
          iconName="mail"
          iconColor={theme.colors.limeText}
          style={styles.btn}
        />

        <Button
          title="Back to Sign In"
          onPress={() => onNavigate('login')}
          variant="ghost"
          style={styles.backLink}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.darkBg,
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 26,
    color: theme.colors.darkText,
  },
  sub: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.darkMuted,
    lineHeight: 20,
    marginBottom: theme.spacing.sm,
  },
  btn: {
    marginTop: theme.spacing.md,
  },
  backLink: {
    marginTop: theme.spacing.xs,
  },
});
