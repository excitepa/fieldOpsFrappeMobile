import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { RouteName, OutletSurvey } from '../types';

interface SurveySuccessScreenProps {
  routeData?: { survey?: OutletSurvey; outletId?: string };
  onNavigate: (route: RouteName, data?: any) => void;
}

export const SurveySuccessScreen: React.FC<SurveySuccessScreenProps> = ({ routeData, onNavigate }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const survey = routeData?.survey;
  const outletId = routeData?.outletId || survey?.outletId || 'o1';

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Survey Success"
        subtitle="Feedback Submitted"
        onNavigate={onNavigate}
        onBackPress={() => onNavigate('outletDetail', { outletId })}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Success Icon Box */}
        <View style={styles.successHeader}>
          <View style={styles.iconCircle}>
            <Icon name="clipboard-list" size={32} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <Text style={styles.successTitle}>Survey Submitted Successfully</Text>
          <Text style={styles.successSub}>
            Your field survey answers and shelf photo evidence have been recorded. Outlet marked Visited.
          </Text>
        </View>

        {/* Survey Details Card */}
        <Card style={styles.receiptCard}>
          <View style={styles.sectionRow}>
            <Text style={styles.label}>Survey Responses</Text>
            <Text style={styles.val}>{survey?.answers.length || 5} questions answered</Text>
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.label}>Submission Time</Text>
            <Text style={styles.val}>{survey?.timestamp || 'Just now'}</Text>
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.label}>Sync Queue Status</Text>
            <Text style={styles.statusVal}>Queued for sync</Text>
          </View>
        </Card>

        <Button
          title="Return to Outlet Workspace →"
          onPress={() => onNavigate('outletDetail', { outletId })}
          variant="navy"
          size="large"
          style={styles.doneBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  scroll: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 60 },
  successHeader: { alignItems: 'center', marginVertical: theme.spacing.md, gap: theme.spacing.xs },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.navy, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  successTitle: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.textDark, textAlign: 'center' },
  successSub: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', maxWidth: '85%', lineHeight: 18 },
  receiptCard: { gap: theme.spacing.sm, padding: theme.spacing.lg },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textMuted },
  val: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textDark },
  statusVal: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.emerald },
  doneBtn: { marginTop: theme.spacing.sm },
});
