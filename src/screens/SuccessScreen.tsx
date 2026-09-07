import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Pill } from '../components/Pill';
import { Icon } from '../components/Icon';
import { RouteName } from '../types';

interface SuccessScreenProps {
  title?: string;
  body?: string;
  onNavigate: (route: RouteName, data?: any) => void;
}

export const SuccessScreen: React.FC<SuccessScreenProps> = ({
  title = 'Action Completed',
  body = 'Your field operation record was saved locally and queued for backend sync.',
  onNavigate,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <SafeAreaView style={styles.container}>
      <Header title="Success Confirmation" onNavigate={onNavigate} />
      <View style={styles.content}>
        <Card style={styles.card}>
          <View style={styles.checkCircle}>
            <Icon name="check" size={36} color="#FFFFFF" strokeWidth={3} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <Pill color={theme.colors.emerald}>Saved & Verified</Pill>
        </Card>

        <Button
          title="Return to Main Dashboard"
          onPress={() => onNavigate('home')}
          size="large"
          iconName="home"
        />
      </View>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { flex: 1, padding: theme.spacing.lg, justifyContent: 'space-between', paddingBottom: theme.spacing.xxl },
  card: { alignItems: 'center', paddingVertical: theme.spacing.xxl, gap: theme.spacing.md, marginTop: theme.spacing.xl },
  checkCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.emerald, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.textDark, textAlign: 'center' },
  body: { fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: theme.spacing.md },
});
