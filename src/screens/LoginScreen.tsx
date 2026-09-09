import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { login } from '../services/api';
import { RouteName, UserProfile } from '../types';

const DEFAULT_TENANT_ID = 'excite';

interface LoginScreenProps {
  onSuccess: (user?: UserProfile) => void;
  onNavigate: (route: RouteName) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess, onNavigate }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const [tenantId, setTenantId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Required Fields', 'Please enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await login(username.trim(), password.trim(), tenantId.trim() || DEFAULT_TENANT_ID);
      if (result.success) {
        onSuccess(result.user);
      } else {
        Alert.alert('Sign in failed', result.message || 'Invalid login credentials.');
      }
    } catch (err) {
      Alert.alert('Connection error', 'Could not reach the server. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Brand Lockup */}
        <View style={styles.brandRow}>
          <Image source={require('../../assets/logo-icon.png')} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.brandWordmark}>FIELDOPS</Text>
        </View>

        {/* Title Header */}
        <View style={styles.titleSection}>
          <Text style={styles.welcomeTitle}>Welcome back.</Text>
          <Text style={styles.welcomeSub}>
            Sign in to your company workspace to start your day on the field.
          </Text>
        </View>

        {/* Login Form Inputs */}
        <View style={styles.formSection}>
          <Input
            label="Tenant ID (optional)"
            value={tenantId}
            onChangeText={setTenantId}
            placeholder={`Defaults to "${DEFAULT_TENANT_ID}"`}
            leftIcon="building"
            variant="field"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="Your username"
            leftIcon="user"
            required
            variant="field"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••••••"
            isPassword
            required
            variant="field"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Options Row */}
          <View style={styles.optionsRow}>
            <Text style={styles.sessionText}>Your session stays signed in on this device.</Text>
            <Pressable onPress={() => onNavigate('forgot')}>
              <Text style={styles.forgotText}>Forgot?</Text>
            </Pressable>
          </View>

          {/* Primary Action Button */}
          <Button
            title={loading ? 'Signing in...' : 'Sign in'}
            onPress={handleLogin}
            variant="navy"
            size="large"
            loading={loading}
            style={styles.signInBtn}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.appBg,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    flexGrow: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  logoImage: {
    width: 32,
    height: 32,
  },
  brandWordmark: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.textDark,
    letterSpacing: 1,
  },
  titleSection: {
    marginBottom: theme.spacing.xl,
  },
  welcomeTitle: {
    fontFamily: theme.fonts.display,
    fontSize: 30,
    color: theme.colors.textDark,
    letterSpacing: -0.5,
    marginBottom: theme.spacing.xs,
  },
  welcomeSub: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.textMuted,
    lineHeight: 20,
    maxWidth: '95%',
  },
  formSection: {
    gap: theme.spacing.sm,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginVertical: theme.spacing.md,
  },
  sessionText: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  forgotText: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.navy,
  },
  signInBtn: {
    marginTop: theme.spacing.sm,
  },
});
