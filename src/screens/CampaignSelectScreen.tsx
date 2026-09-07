import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { getCampaigns, AuthError } from '../services/api';
import { parseNumericTarget } from '../utils/dashboardMetrics';
import { Campaign, RouteName } from '../types';

interface CampaignSelectScreenProps {
  onClockInSuccess: (campaign: Campaign) => void;
  onNavigate: (route: RouteName, data?: any) => void;
  onBackToLogin: () => void;
}

export const CampaignSelectScreen: React.FC<CampaignSelectScreenProps> = ({ onClockInSuccess, onNavigate, onBackToLogin }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getCampaigns();
        if (cancelled) return;
        setCampaigns(data);
        setSelected(data[0] ?? null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AuthError) {
          onBackToLogin();
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not load campaigns.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProceed = () => {
    if (selected) onNavigate('attendance', { campaign: selected });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Assigned Campaigns" subtitle="Select the campaign to work on today" onNavigate={onNavigate} onBackPress={onBackToLogin} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !selected) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Assigned Campaigns" subtitle="Select the campaign to work on today" onNavigate={onNavigate} onBackPress={onBackToLogin} />
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error || 'No campaigns are assigned to your account yet.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Assigned Campaigns" subtitle="Select the campaign to work on today" onNavigate={onNavigate} onBackPress={onBackToLogin} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          {campaigns.map((c) => {
            const isSelected = selected.id === c.id;
            const isOutlets = c.ctaType === 'outlets' || c.modules?.includes('orders') || c.modules?.includes('merchandising');

            return (
              <Pressable key={c.id} onPress={() => setSelected(c)}>
                <Card style={[styles.card, isSelected && styles.cardSelected]}>
                  <View style={styles.cardTop}>
                    <Text style={styles.labelText}>{c.client.toUpperCase()} · {isOutlets ? 'EXECUTION' : 'PIPELINE'}</Text>
                    {isSelected && (
                      <View style={styles.checkBadge}>
                        <Icon name="check" size={12} color="#FFFFFF" />
                      </View>
                    )}
                  </View>

                  <Text style={styles.campName}>{c.name}</Text>
                  {!!c.description && (
                    <Text style={styles.campDesc} numberOfLines={2}>{c.description}</Text>
                  )}

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Icon name="target" size={12} color={theme.colors.textMuted} />
                      <Text style={styles.metaText}>Target: {parseNumericTarget(c.target)}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Icon name="calendar" size={12} color={theme.colors.textMuted} />
                      <Text style={styles.metaText}>Ends {c.endDate}</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>

        <Button
          title={`Proceed to Clock In (${selected.ctaType === 'outlets' ? 'Outlets' : 'Leads'} Drive) →`}
          onPress={handleProceed}
          variant="primary"
          size="large"
          style={styles.cta}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  scroll: { padding: theme.spacing.lg, paddingBottom: 40, gap: theme.spacing.md },
  list: { gap: theme.spacing.md },
  card: { backgroundColor: theme.colors.cardWhite, borderColor: theme.colors.cardBorder, gap: 6, padding: theme.spacing.lg },
  cardSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryBg, borderWidth: 1.5 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelText: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.primary, letterSpacing: 0.5 },
  checkBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  campName: { fontFamily: theme.fonts.bold, fontSize: 17, color: theme.colors.textDark },
  campDesc: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  metaRow: { flexDirection: 'row', gap: theme.spacing.md, marginTop: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.textMuted },
  cta: { marginTop: theme.spacing.xs },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  errorText: { fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
});
