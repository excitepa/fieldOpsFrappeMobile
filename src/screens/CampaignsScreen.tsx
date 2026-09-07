import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { mockCampaigns } from '../services/mockService';
import { RouteName, Campaign } from '../types';

interface CampaignsScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

export const CampaignsScreen: React.FC<CampaignsScreenProps> = ({ onNavigate }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const [viewState, setViewState] = useState<'list' | 'empty' | 'error'>('list');

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Campaigns" subtitle="3 active field drives" onNavigate={onNavigate} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* UI State Toggles */}
        <View style={styles.stateTestRow}>
          <Pressable onPress={() => setViewState('list')}>
            <Text style={[styles.testLink, viewState === 'list' && styles.activeTest]}>Active List</Text>
          </Pressable>
          <Pressable onPress={() => setViewState('empty')}>
            <Text style={[styles.testLink, viewState === 'empty' && styles.activeTest]}>Test Empty</Text>
          </Pressable>
          <Pressable onPress={() => setViewState('error')}>
            <Text style={[styles.testLink, viewState === 'error' && styles.activeTest]}>Test Error</Text>
          </Pressable>
        </View>

        {viewState === 'empty' && (
          <Card style={styles.stateCard}>
            <Text style={styles.stateTitle}>No Campaigns Assigned</Text>
            <Text style={styles.stateSub}>New campaign drives assigned to your beat will appear here.</Text>
          </Card>
        )}

        {viewState === 'error' && (
          <Card style={styles.stateCard}>
            <Text style={[styles.stateTitle, { color: theme.colors.red }]}>Unable to Load Data</Text>
            <Text style={styles.stateSub}>Connection failed. Check your network or work in offline mode.</Text>
          </Card>
        )}

        {viewState === 'list' &&
          mockCampaigns.map((c) => (
            <Card key={c.id} style={styles.card} onPress={() => onNavigate('campaignDetail', c)}>
              <View style={styles.row}>
                <Pill color={c.color}>{c.type}</Pill>
                <Text style={styles.beatText}>{c.beat}</Text>
              </View>
              <Text style={styles.title}>{c.name}</Text>
              <Text style={styles.desc}>{c.description}</Text>

              <View style={styles.track}>
                <View style={[styles.fill, { width: `${c.progress}%`, backgroundColor: c.color }]} />
              </View>

              <View style={styles.footer}>
                <Text style={styles.target}>{c.target}</Text>
                <Text style={[styles.percent, { color: c.color }]}>{c.progress}%</Text>
              </View>
            </Card>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 100 },
  stateTestRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.md, marginBottom: theme.spacing.sm },
  testLink: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.textMuted },
  activeTest: { color: theme.colors.primary },
  card: { marginVertical: theme.spacing.xs, gap: theme.spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  beatText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  title: { fontFamily: theme.fonts.bold, fontSize: 17, color: theme.colors.textDark, marginTop: 4 },
  desc: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  track: { height: 7, backgroundColor: theme.colors.cardBorder, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', borderRadius: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  target: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  percent: { fontFamily: theme.fonts.bold, fontSize: 12 },
  stateCard: { alignItems: 'center', padding: theme.spacing.xl, gap: theme.spacing.xs, marginTop: theme.spacing.xl },
  stateTitle: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark },
  stateSub: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
});
