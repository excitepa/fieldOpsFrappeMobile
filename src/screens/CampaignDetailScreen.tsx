import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { Icon, IconName } from '../components/Icon';
import { mockCampaigns } from '../services/mockService';
import { getCampaignDetails, getCampaignInventory } from '../services/api';
import { RouteName, Campaign, Product } from '../types';

interface CampaignDetailScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  campaignData?: Campaign;
}

export const CampaignDetailScreen: React.FC<CampaignDetailScreenProps> = ({ onNavigate, campaignData }) => {
const theme = useTheme();  const styles = createStyles(theme);
  const base = campaignData || mockCampaigns[0];
  const [c, setC] = useState<Campaign>(base);
  const [inventory, setInventory] = useState<Product[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!base?.id) return;
    (async () => {
      try {
        const details = await getCampaignDetails(base.id);
        if (!cancelled && details) {
          setC((prev) => ({
            ...prev,
            description: details.description ?? prev.description,
            target: details.target ?? prev.target,
            progress: details.progress ?? prev.progress,
            startDate: details.startDate ?? prev.startDate,
            endDate: details.endDate ?? prev.endDate,
          }));
        }
      } catch (e) {
        // Non-fatal — the card just keeps showing whatever the list endpoint already gave us.
      }
      setLoadingInventory(true);
      try {
        const items = await getCampaignInventory(base.id);
        if (!cancelled) setInventory(items);
      } catch (e) {
        // Non-fatal — the inventory section just stays empty.
      } finally {
        if (!cancelled) setLoadingInventory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.id]);

  const activities: { title: string; route: RouteName; icon: IconName }[] = [
    { title: 'Capture store lead', route: 'leadForm', icon: 'users' },
    { title: 'View Orders', route: 'ordersList', icon: 'shopping-bag' },
    { title: 'View Pipeline', route: 'pipelineOverview', icon: 'trending-up' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Campaign Details" subtitle={c.type} onNavigate={onNavigate} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={[styles.heroCard, { backgroundColor: `${c.color}15` }]}>
          <Pill color={c.color}>{c.type}</Pill>
          <Text style={styles.heroTitle}>{c.name}</Text>
          <Text style={styles.heroDesc}>{c.description}</Text>

          <View style={styles.track}>
            <View style={[styles.fill, { width: `${c.progress}%`, backgroundColor: c.color }]} />
          </View>
          <Text style={[styles.target, { color: c.color }]}>
            {c.target} · {c.progress}% Complete
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>Assigned Activities</Text>
        {activities.map((a, index) => (
          <Card key={a.title} style={styles.activityCard} onPress={() => onNavigate(a.route)}>
            <View style={styles.numBadge}>
              <Text style={styles.numText}>{index + 1}</Text>
            </View>
            <View style={styles.activityTextContainer}>
              <Text style={styles.activityTitle}>{a.title}</Text>
              <Text style={styles.activitySub}>Tap to start execution</Text>
            </View>
            <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
          </Card>
        ))}

        <Text style={styles.sectionTitle}>Campaign Inventory</Text>
        {loadingInventory && (
          <View style={styles.inventoryLoadingRow}>
            <ActivityIndicator size="small" color={theme.colors.navy} />
            <Text style={styles.inventoryLoadingText}>Loading inventory…</Text>
          </View>
        )}
        {!loadingInventory && inventory.length === 0 && (
          <Text style={styles.inventoryEmptyText}>No products allocated to this campaign yet.</Text>
        )}
        {inventory.map((p) => (
          <Card key={p.id} style={styles.inventoryCard}>
            <View style={styles.inventoryRow}>
              <View style={styles.flex1}>
                <Text style={styles.inventoryName}>{p.name}</Text>
                <Text style={styles.inventorySub}>SKU {p.sku}</Text>
              </View>
              <View style={styles.inventoryQtyCol}>
                <Text style={styles.inventoryQty}>{p.stock}</Text>
                <Text style={styles.inventoryQtyLabel}>{(p.unit || 'unit').toUpperCase()}</Text>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 100, gap: theme.spacing.md },
  heroCard: { gap: theme.spacing.xs, borderColor: 'transparent' },
  heroTitle: { fontFamily: theme.fonts.bold, fontSize: 22, color: theme.colors.textDark, marginTop: 4 },
  heroDesc: { fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textMuted, lineHeight: 20 },
  track: { height: 8, backgroundColor: theme.colors.cardBorder, borderRadius: 4, overflow: 'hidden', marginTop: theme.spacing.xs },
  fill: { height: '100%', borderRadius: 4 },
  target: { fontFamily: theme.fonts.bold, fontSize: 13, marginTop: 4 },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  activityCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  numBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.primary },
  activityTextContainer: { flex: 1 },
  activityTitle: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  activitySub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  flex1: { flex: 1 },
  inventoryLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inventoryLoadingText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  inventoryEmptyText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted },
  inventoryCard: { gap: 0 },
  inventoryRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  inventoryName: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  inventorySub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  inventoryQtyCol: { alignItems: 'flex-end' },
  inventoryQty: { fontFamily: theme.fonts.display, fontSize: 18, color: theme.colors.textDark },
  inventoryQtyLabel: { fontFamily: theme.fonts.bold, fontSize: 9, color: theme.colors.textMuted, letterSpacing: 0.5 },
});
