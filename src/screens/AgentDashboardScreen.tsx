import React from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { PerformanceDashboardView } from './dashboard/PerformanceDashboardView';
import { SummaryDashboardView } from './dashboard/SummaryDashboardView';
import { RouteName, Lead } from '../types';

interface AgentDashboardScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  leadsList?: Lead[];
}

export const AgentDashboardScreen: React.FC<AgentDashboardScreenProps> = ({ onNavigate, leadsList = [] }) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Dashboard" onNavigate={onNavigate} onBackPress={() => onNavigate('home')} variant="navy" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PerformanceDashboardView leadsList={leadsList} />
        <Text style={styles.groupTitle}>SUMMARY METRICS</Text>
        <SummaryDashboardView leadsList={leadsList} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  scroll: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.md },
  groupTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8, marginTop: theme.spacing.xs },
});
