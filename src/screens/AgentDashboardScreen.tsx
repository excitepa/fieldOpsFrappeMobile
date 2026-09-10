import React, { useEffect } from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { PerformanceDashboardView } from './dashboard/PerformanceDashboardView';
import { SummaryDashboardView } from './dashboard/SummaryDashboardView';
import { useFieldStore } from '../store/useFieldStore';
import { getMySales, getMyOrders, getOutlets } from '../services/api';
import { RouteName, Lead } from '../types';

interface AgentDashboardScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  leadsList?: Lead[];
}

export const AgentDashboardScreen: React.FC<AgentDashboardScreenProps> = ({ onNavigate, leadsList = [] }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();

  // Both sub-views below (the "Today" performance rows and the activity chart's
  // all/week/mtd/today ranges) read straight off state.sales/orders/outlets —
  // neither fetches anything itself. If this screen is opened without having
  // visited Home/Orders/Outlets first this session, those would still be empty
  // and every range on the chart would show nothing despite real data existing
  // on the server. Fetched here so this screen is correct on its own, regardless
  // of navigation order — always dispatched, including a real empty result, same
  // as everywhere else (never leaves a stale/previous list looking current).
  useEffect(() => {
    getMySales().then((sales) => dispatch({ type: 'SET_SALES', sales })).catch(() => {});
    getMyOrders().then((orders) => dispatch({ type: 'SET_ORDERS', orders })).catch(() => {});
    if (state.activeCampaign?.id) {
      getOutlets(state.activeCampaign.id).then((outlets) => dispatch({ type: 'SET_OUTLETS', outlets })).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
