import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { SkipOutletModal } from './SkipOutletModal';
import { OutletActivitySheet } from './OutletActivitySheet';
import { mockRouteAssignments } from '../services/mockService';
import { RouteName, SkipRecord } from '../types';
import { groupSalesByInvoice, groupOrdersByRef } from '../utils/transactions';
import { parseGps, distanceMeters, formatDistance } from '../utils/geo';
import { useCurrentLocation } from '../hooks/useCurrentLocation';

interface OutletDetailScreenProps {
  outletData?: { outletId: string };
  onNavigate: (route: RouteName, data?: any) => void;
}

export const OutletDetailScreen: React.FC<OutletDetailScreenProps> = ({
  outletData,
  onNavigate,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch, getSalesForOutlet, getOrdersForOutlet, getSurveysForOutlet, getSkipForOutlet } = useFieldStore();
  const outletId = outletData?.outletId || 'o1';
  const outlet = state.outlets.find((o) => o.id === outletId) || state.outlets[0];

  const [showActivitySheet, setShowActivitySheet] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showFarAwayBanner, setShowFarAwayBanner] = useState(true);
  const myLocation = useCurrentLocation();

  if (!outlet) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Customer Info" variant="navy" onNavigate={onNavigate} onBackPress={() => onNavigate('outlets')} />
        <View style={styles.missingContainer}>
          <Icon name="alert-circle" size={48} color={theme.colors.red} />
          <Text style={styles.missingTitle}>This outlet no longer exists.</Text>
          <Pressable onPress={() => onNavigate('outlets')} style={styles.returnBtn}>
            <Text style={styles.returnBtnText}>Return to Outlet List</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const activeCampaign = state.activeCampaign;
  const campaignModules = activeCampaign?.modules || ['sales', 'orders', 'surveys', 'merchandising'];
  const surveyConfigs = (activeCampaign?.surveys || []).filter((s) => campaignModules.includes(s.module));
  const merchandisingConfig = surveyConfigs.find((s) => s.module === 'merchandising');

  // Dynamic Metrics & Records
  const salesList = getSalesForOutlet(outlet.id);
  const ordersList = getOrdersForOutlet(outlet.id);
  const surveysList = getSurveysForOutlet(outlet.id);
  const skipRecord = getSkipForOutlet(outlet.id);
  const groupedSales = groupSalesByInvoice(salesList);
  const groupedOrders = groupOrdersByRef(ordersList);

  const outletCoords = parseGps(outlet.gps);
  const outletDistanceM = myLocation && outletCoords ? distanceMeters(myLocation, outletCoords) : null;

  const handlePhoneCall = () => {
    if (outlet.phone) {
      Linking.openURL(`tel:${outlet.phone}`).catch(() => {
        Alert.alert('Phone Call', `Dialing ${outlet.phone}...`);
      });
    }
  };

  // This is a "show me on the map" button, not a messaging button — per
  // product, it opens the outlet's location in Google Maps.
  const handleOpenMap = () => {
    const coords = parseGps(outlet.gps);
    const query = coords ? `${coords.lat},${coords.lng}` : outlet.address;
    if (!query) {
      Alert.alert('Location Unavailable', 'No location is saved for this outlet yet.');
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    Linking.openURL(url).catch(() => Alert.alert('Could Not Open Maps', 'Could not open Google Maps for this outlet.'));
  };

  const handleSkipSubmit = (record: SkipRecord) => {
    dispatch({ type: 'SKIP_OUTLET', outletId: outlet.id, skipRecord: record });
  };

  const handleSelectActivityAction = (action: 'editCustomer' | 'sale' | 'order' | 'survey' | 'merchandising') => {
    switch (action) {
      case 'editCustomer':
        onNavigate('editOutlet', { outletId: outlet.id });
        break;
      case 'sale':
        onNavigate('outletActivity', { outletId: outlet.id, initialTab: 'sale' });
        break;
      case 'order':
        onNavigate('outletActivity', { outletId: outlet.id, initialTab: 'order' });
        break;
      case 'survey':
        onNavigate('outletSurveys', { outletId: outlet.id });
        break;
      case 'merchandising':
        onNavigate('outletActivity', {
          outletId: outlet.id,
          initialTab: merchandisingConfig ? `survey:${merchandisingConfig.id}` : 'summary',
        });
        break;
    }
  };

  // Not a live GPS route — the closest real signal is whichever day/route
  // assignment (see mockRouteAssignments) this outlet has been slotted into.
  const routeAssignment = mockRouteAssignments.find((a) => a.outletIds.includes(outlet.id));
  const customerIdLabel = `O-${outlet.id.replace(/\D/g, '').padStart(3, '0')}`;

  const detailRows: { label: string; value: string }[] = [
    { label: 'ADDRESS', value: outlet.address || '—' },
    { label: 'ROUTE', value: routeAssignment?.routeName || outlet.area || '—' },
    { label: 'OWNER NAME', value: outlet.ownerName || '—' },
    { label: 'PHONE NUMBER', value: outlet.phone || '—' },
    { label: 'CUSTOMER TYPE', value: outlet.type || '—' },
    { label: 'IMAGE', value: outlet.photoUri ? 'Attached' : '—' },
    { label: 'CUSTOMER ID', value: customerIdLabel },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Customer Info" variant="navy" onNavigate={onNavigate} onBackPress={() => onNavigate('outlets')} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* IDENTITY CARD */}
        <Card style={styles.identityCard}>
          <View style={styles.identityHeader}>
            <View style={styles.identityIconBox}>
              <Icon name="store" size={22} color={theme.colors.navy} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.outletName}>{outlet.name}</Text>
              <View style={styles.typePillRow}>
                <View style={styles.typePill}>
                  <Text style={styles.typePillText}>{outlet.type}</Text>
                </View>
                {outlet.status !== 'pending' && (
                  <View
                    style={[
                      styles.statusBadge,
                      outlet.status === 'visited' ? styles.visitedBadge : styles.skippedBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        outlet.status === 'visited' ? styles.visitedBadgeText : styles.skippedBadgeText,
                      ]}
                    >
                      {outlet.status === 'visited' ? 'Visited' : 'Skipped'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.actionBtnsCol}>
              <Pressable onPress={handleOpenMap} style={styles.actionCircleBtn}>
                <Icon name="send" size={16} color="#FFFFFF" />
              </Pressable>
              <Pressable onPress={handlePhoneCall} style={styles.actionCircleBtn}>
                <Icon name="phone" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </Card>

        {/* FAR AWAY BANNER — real distance from the device's current GPS fix
            to the outlet's saved coordinates. Hidden when either side of that
            isn't known yet, or when the agent is already close by. */}
        {showFarAwayBanner && outlet.status === 'pending' && outletDistanceM !== null && outletDistanceM > 300 && (
          <View style={styles.farAwayBanner}>
            <Icon name="alert-circle" size={18} color={theme.colors.amber} />
            <View style={styles.flex1}>
              <Text style={styles.farAwayTitle}>You are far away from Customer.</Text>
              <Text style={styles.farAwaySub}>You are about {formatDistance(outletDistanceM)} away.</Text>
            </View>
            <Pressable onPress={() => setShowFarAwayBanner(false)} hitSlop={8}>
              <Icon name="x" size={16} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* DETAIL ROWS */}
        <Card style={styles.detailCard}>
          {detailRows.map((row, i) => (
            <View key={row.label} style={[styles.detailRow, i === detailRows.length - 1 && styles.detailRowLast]}>
              <Text style={styles.detailLabel}>{row.label}</Text>
              <Text style={styles.detailValue}>{row.value}</Text>
            </View>
          ))}
        </Card>

        {/* TRANSACTIONS LINK */}
        <Pressable onPress={() => onNavigate('outletTransactions', { outletId: outlet.id })} style={styles.transactionsRow}>
          <View style={styles.transactionsIconBox}>
            <Icon name="dollar" size={18} color={theme.colors.navy} />
          </View>
          <Text style={styles.transactionsText}>Transactions</Text>
          <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
        </Pressable>

        {/* OUTLET METRICS (3-Column Layout) */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCell}>
            <Text style={styles.metricValue}>{salesList.length}</Text>
            <Text style={styles.metricLabel}>SALES</Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricValue}>{ordersList.length}</Text>
            <Text style={styles.metricLabel}>ORDERS</Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricValue}>{surveysList.length}</Text>
            <Text style={styles.metricLabel}>SURVEYS</Text>
          </View>
        </View>

        <Text style={styles.hintText}>
          Use the + button to log a sale, order, or survey. Outlets are marked visited automatically once an activity is completed.
        </Text>

        {/* SKIPPED SUMMARY CARD (If skipped) */}
        {outlet.status === 'skipped' && (
          <Card style={styles.skippedSummaryCard}>
            <View style={styles.skippedSummaryHeader}>
              <Icon name="alert-circle" size={18} color={theme.colors.skippedText} />
              <Text style={styles.skippedSummaryTitle}>Skipped</Text>
            </View>
            <Text style={styles.skippedSummaryText}>
              Reason: {skipRecord?.reason || 'Outlet Closed'}
            </Text>
            {skipRecord?.note ? (
              <Text style={styles.skippedSummaryNote}>Note: {skipRecord.note}</Text>
            ) : null}
            {skipRecord?.timestamp ? (
              <Text style={styles.skippedSummaryTime}>{skipRecord.timestamp}</Text>
            ) : null}
          </Card>
        )}

        {/* Sales History */}
        {groupedSales.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>SALES HISTORY ({groupedSales.length})</Text>
            {groupedSales.map((t) => (
              <Pressable key={t.ref} onPress={() => onNavigate('transactionDetail', { kind: 'sale', ref: t.ref, outletId: outlet.id })}>
                <Card style={styles.historyItemCard}>
                  <View style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle}>{t.lines.length} item{t.lines.length === 1 ? '' : 's'} · {t.customerName}</Text>
                      <Text style={styles.historySub}>{t.timestamp}</Text>
                    </View>
                    <Text style={styles.historyAmount}>₦{t.total.toLocaleString()}</Text>
                    <Icon name="chevron-right" size={16} color={theme.colors.textMuted} />
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}

        {/* Orders History */}
        {groupedOrders.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>ORDERS HISTORY ({groupedOrders.length})</Text>
            {groupedOrders.map((t) => (
              <Pressable key={t.ref} onPress={() => onNavigate('transactionDetail', { kind: 'order', ref: t.ref, outletId: outlet.id })}>
                <Card style={styles.historyItemCard}>
                  <View style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle}>{t.lines.length} item{t.lines.length === 1 ? '' : 's'} · {t.customerName}</Text>
                      <Text style={styles.historySub}>Status: {t.status} · {t.timestamp}</Text>
                    </View>
                    <Text style={styles.historyAmount}>₦{t.total.toLocaleString()}</Text>
                    <Icon name="chevron-right" size={16} color={theme.colors.textMuted} />
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}

        {/* Surveys History */}
        {surveysList.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>SURVEYS COMPLETED ({surveysList.length})</Text>
            {surveysList.map((sur) => (
              <Pressable key={sur.id} onPress={() => onNavigate('transactionDetail', { kind: 'survey', id: sur.id, outletId: outlet.id })}>
                <Card style={styles.historyItemCard}>
                  <View style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle}>{sur.surveyName || 'Completed Field Survey'}</Text>
                      <Text style={styles.historySub}>{sur.answers.length} response items · {sur.timestamp}</Text>
                    </View>
                    <View style={styles.surveyTag}>
                      <Icon name="check-circle" size={14} color={theme.colors.emerald} />
                      <Text style={styles.surveyTagText}>Submitted</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable onPress={() => setShowActivitySheet(true)} style={styles.fabBtn}>
        <Icon name="plus" size={26} color="#FFFFFF" strokeWidth={2.5} />
      </Pressable>

      <OutletActivitySheet
        visible={showActivitySheet}
        outletName={outlet.name}
        enabledModules={campaignModules}
        onClose={() => setShowActivitySheet(false)}
        onSelectAction={handleSelectActivityAction}
        onSkipOutlet={() => setShowSkipModal(true)}
      />

      <SkipOutletModal
        visible={showSkipModal}
        outletName={outlet.name}
        outletId={outlet.id}
        campaignId={activeCampaign?.id || ''}
        onClose={() => setShowSkipModal(false)}
        onSubmitSkip={handleSkipSubmit}
      />
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  scroll: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: 100, gap: theme.spacing.md },
  missingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  missingTitle: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.textDark, textAlign: 'center' },
  returnBtn: { backgroundColor: theme.colors.navy, paddingHorizontal: 20, paddingVertical: 12, borderRadius: theme.radius.md },
  returnBtnText: { fontFamily: theme.fonts.bold, fontSize: 14, color: '#FFF' },
  flex1: { flex: 1 },
  identityCard: { padding: theme.spacing.lg },
  identityHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  identityIconBox: { width: 46, height: 46, borderRadius: theme.radius.md, backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center' },
  outletName: { fontFamily: theme.fonts.bold, fontSize: 19, color: theme.colors.textDark },
  typePillRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  typePill: { backgroundColor: theme.colors.fieldFill, paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.full },
  typePillText: { fontFamily: theme.fonts.semibold, fontSize: 11, color: theme.colors.textMuted },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.full },
  statusBadgeText: { fontFamily: theme.fonts.bold, fontSize: 11 },
  visitedBadge: { backgroundColor: theme.colors.visitedBg },
  visitedBadgeText: { color: theme.colors.visitedText },
  skippedBadge: { backgroundColor: theme.colors.skippedBg },
  skippedBadgeText: { color: theme.colors.skippedText },
  actionBtnsCol: { flexDirection: 'row', gap: theme.spacing.sm },
  actionCircleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' },
  farAwayBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm,
    backgroundColor: theme.colors.amberLight, borderRadius: theme.radius.md,
    borderLeftWidth: 3, borderLeftColor: theme.colors.amber,
    padding: theme.spacing.md,
  },
  farAwayTitle: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.textDark },
  farAwaySub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  detailCard: { padding: theme.spacing.lg },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: theme.colors.cardBorder },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.textMuted, letterSpacing: 0.6 },
  detailValue: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
  transactionsRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.lg, padding: theme.spacing.md,
  },
  transactionsIconBox: { width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center' },
  transactionsText: { flex: 1, fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  metricsGrid: { flexDirection: 'row', gap: theme.spacing.sm },
  metricCell: {
    flex: 1,
    backgroundColor: theme.colors.cardWhite,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.xl,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  metricValue: { fontFamily: theme.fonts.display, fontSize: 26, color: theme.colors.textDark },
  metricLabel: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.textMuted, letterSpacing: 0.8 },
  hintText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, lineHeight: 17, paddingHorizontal: 4 },
  skippedSummaryCard: { backgroundColor: theme.colors.skippedBg, borderColor: theme.colors.skippedBg, gap: 4 },
  skippedSummaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  skippedSummaryTitle: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.skippedText },
  skippedSummaryText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
  skippedSummaryNote: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  skippedSummaryTime: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  historySection: { gap: theme.spacing.xs },
  historyItemCard: { backgroundColor: theme.colors.cardWhite, borderColor: theme.colors.cardBorder, padding: theme.spacing.md },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  historyTitle: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  historySub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  historyAmount: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.navy },
  surveyTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.visitedBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.sm },
  surveyTagText: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.visitedText },
  fabBtn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: theme.colors.navy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
});
