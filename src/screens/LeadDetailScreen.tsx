import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { LeadQuickActionsSheet } from '../components/LeadQuickActionsSheet';
import { useFieldStore } from '../store/useFieldStore';
import { mockLeads } from '../services/mockService';
import { getInitials, formatShortDate } from '../utils/leadDisplay';
import { FUNNEL_STAGES, STAGE_PROBABILITY } from '../utils/pipelineMetrics';
import { localDateStr } from '../utils/timestamp';
import { RouteName, Lead, LeadStage } from '../types';

interface LeadDetailScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  leadData?: Lead;
}

type DetailTab = 'details' | 'history' | 'notes';

export const LeadDetailScreen: React.FC<LeadDetailScreenProps> = ({ onNavigate, leadData }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state } = useFieldStore();
  const user = state.user;
  const l = leadData || mockLeads[0];
  const [tab, setTab] = useState<DetailTab>('details');
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const stageScrollRef = useRef<ScrollView>(null);

  const todayIso = localDateStr();
  const isOverdue = !!l.nextActionDate && l.nextActionDate < todayIso;
  const stageProbabilityPct = Math.round((STAGE_PROBABILITY[l.stage] || 0) * 100);

  const handleCall = () => {
    Linking.openURL(`tel:${l.phone}`).catch(() => Alert.alert('Call Failed', `Could not start a call to ${l.phone}.`));
  };
  const handleEmail = () => {
    if (!l.email) {
      Alert.alert('No Email', 'This lead has no email address on file.');
      return;
    }
    Linking.openURL(`mailto:${l.email}`).catch(() => Alert.alert('Could Not Open Email', 'No email app is available on this device.'));
  };
  const handleWhatsApp = () => {
    const digits = l.phone.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${digits}`).catch(() => Alert.alert('WhatsApp Unavailable', 'Could not open WhatsApp for this number.'));
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Lead Details" onNavigate={onNavigate} variant="navy" />
      <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <Card style={styles.heroCard}>
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(l.name)}</Text>
              </View>
              <View style={styles.flex1}>
                <Text style={styles.heroName}>{l.name}</Text>
                <Text style={styles.heroSource}>Source: {l.source || 'Unknown'}</Text>
              </View>
              <Text style={styles.heroValue}>{l.value}</Text>
            </View>

            <Pressable onPress={handleCall} style={styles.phoneRow}>
              <Icon name="phone" size={16} color={theme.colors.navy} />
              <Text style={styles.phoneText}>{l.phone}</Text>
              <Text style={styles.tapToCall}>Tap to call</Text>
            </Pressable>
          </Card>

          {/* Next Action */}
          <Card style={styles.nextActionCard}>
            <Text style={styles.nextActionLabel}>NEXT ACTION</Text>
            <Text style={styles.nextActionText}>{l.next}</Text>
          </Card>

          {/* Current Stage */}
          <Card style={styles.stageCard}>
            <View style={styles.stageHeaderRow}>
              <View>
                <Text style={styles.cardLabel}>CURRENT STAGE</Text>
                <Text style={styles.stageName}>{l.stage}</Text>
                {l.pipeline ? <Text style={styles.stageSub}>{l.pipeline}</Text> : null}
              </View>
              <View style={styles.scoreCol}>
                <Text style={styles.stagePctText}>{stageProbabilityPct}%</Text>
                <Text style={styles.scoreText}>Score {l.score}/100</Text>
              </View>
            </View>

            {l.nextActionDate ? (
              <View style={styles.followUpRow}>
                <Icon name="calendar" size={13} color={isOverdue ? theme.colors.red : theme.colors.textMuted} />
                <Text style={[styles.followUpText, isOverdue && { color: theme.colors.red }]}>
                  Follow-up {formatShortDate(l.nextActionDate)}{isOverdue ? ' · Overdue' : ''}
                </Text>
              </View>
            ) : null}

            <View style={styles.stagePillRow}>
              <Pressable onPress={() => stageScrollRef.current?.scrollTo({ x: 0, animated: true })} style={styles.stageNavBtn}>
                <Icon name="chevron-left" size={16} color={theme.colors.textDark} />
              </Pressable>
              <ScrollView ref={stageScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stagePills}>
                {FUNNEL_STAGES.map((stage: LeadStage) => {
                  const active = stage === l.stage;
                  return (
                    <View key={stage} style={[styles.stagePill, active && styles.stagePillActive]}>
                      <Text style={[styles.stagePillText, active && styles.stagePillTextActive]}>{stage}</Text>
                    </View>
                  );
                })}
              </ScrollView>
              <Pressable onPress={() => stageScrollRef.current?.scrollToEnd({ animated: true })} style={styles.stageNavBtn}>
                <Icon name="chevron-right" size={16} color={theme.colors.textDark} />
              </Pressable>
            </View>

            <Button
              title="Progress Stage"
              onPress={() => onNavigate('leadUpdate', l)}
              iconName="trending-up"
              variant="navy"
              style={styles.progressBtn}
            />
          </Card>

          {/* Tabs */}
          <View style={styles.tabRow}>
            {(['details', 'history', 'notes'] as DetailTab[]).map((t) => {
              const active = t === tab;
              return (
                <Pressable key={t} onPress={() => setTab(t)} style={[styles.tabBtn, active && styles.tabBtnActive]}>
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                </Pressable>
              );
            })}
          </View>

          {tab === 'details' && (
            <>
              <Card style={styles.infoCard}>
                <Text style={styles.infoTitle}>CONTACT INFORMATION</Text>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Phone</Text><Text style={styles.infoValue}>{l.phone}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Email</Text><Text style={styles.infoValue}>{l.email || '—'}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Position</Text><Text style={styles.infoValue}>{l.position || '—'}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Address</Text><Text style={styles.infoValue}>{l.address || '—'}</Text></View>
              </Card>

              <Card style={styles.infoCard}>
                <Text style={styles.infoTitle}>LEAD INFORMATION</Text>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Created By</Text><Text style={styles.infoValue}>{user.name.split(' ')[0]}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Source</Text><Text style={styles.infoValue}>{l.source || '—'}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Last Contact</Text><Text style={styles.infoValue}>{formatShortDate(l.lastContactDate)}</Text></View>
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Next Follow-up</Text><Text style={styles.infoValue}>{formatShortDate(l.nextActionDate)}</Text></View>
              </Card>

              <View style={styles.contactActionsRow}>
                <Pressable onPress={handleEmail} style={styles.contactActionBtn}>
                  <Icon name="mail" size={16} color={theme.colors.textDark} />
                  <Text style={styles.contactActionText}>Email</Text>
                </Pressable>
                <Pressable onPress={handleWhatsApp} style={styles.contactActionBtn}>
                  <Icon name="message-circle" size={16} color={theme.colors.textDark} />
                  <Text style={styles.contactActionText}>WhatsApp</Text>
                </Pressable>
              </View>
            </>
          )}

          {tab === 'history' && (
            <Card style={styles.infoCard}>
              <Text style={styles.infoTitle}>ACTIVITY HISTORY</Text>
              <View style={styles.historyRow}>
                <View style={styles.historyDot} />
                <View style={styles.flex1}>
                  <Text style={styles.historyText}>Lead created</Text>
                  <Text style={styles.historySub}>{formatShortDate(l.createdAt)}</Text>
                </View>
              </View>
              {l.lastContactDate ? (
                <View style={styles.historyRow}>
                  <View style={styles.historyDot} />
                  <View style={styles.flex1}>
                    <Text style={styles.historyText}>Last contacted</Text>
                    <Text style={styles.historySub}>{formatShortDate(l.lastContactDate)}</Text>
                  </View>
                </View>
              ) : null}
            </Card>
          )}

          {tab === 'notes' && (
            <Card style={styles.infoCard}>
              <Text style={styles.infoTitle}>NOTES</Text>
              <Text style={styles.notesText}>{l.notes || 'No notes recorded for this lead yet.'}</Text>
            </Card>
          )}
        </ScrollView>

        <Pressable onPress={() => setQuickActionsOpen(true)} style={styles.fab}>
          <Icon name="plus" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      <LeadQuickActionsSheet
        visible={quickActionsOpen}
        onClose={() => setQuickActionsOpen(false)}
        onEditLead={() => onNavigate('editLead', l)}
        // A lead only carries a free-text `company` name, not a real Outlet id — so
        // there's no specific outlet to jump straight into a sale for. Send the agent
        // to Outlets to pick (or add) the actual outlet to record the sale against,
        // instead of the old "coming soon" dead end.
        onRecordSale={() => onNavigate('outlets')}
        onRunSurvey={() => onNavigate('leadSurveys', l)}
      />
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  body: { flex: 1 },
  content: { padding: theme.spacing.lg, paddingBottom: 100, gap: theme.spacing.md },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  heroCard: { gap: theme.spacing.sm },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.navy },
  heroName: { fontFamily: theme.fonts.bold, fontSize: 17, color: theme.colors.textDark },
  heroSource: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  heroValue: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.navy },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.cardBorder, paddingTop: theme.spacing.sm },
  phoneText: { flex: 1, fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
  tapToCall: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.navy },
  nextActionCard: { backgroundColor: theme.colors.primaryBg, borderColor: theme.colors.primary, gap: 4 },
  nextActionLabel: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.navy, letterSpacing: 0.8 },
  nextActionText: { fontFamily: theme.fonts.semibold, fontSize: 14, color: theme.colors.textDark },
  stageCard: { gap: theme.spacing.sm },
  stageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLabel: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.textMuted, letterSpacing: 0.8 },
  stageName: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.textDark, marginTop: 2 },
  stageSub: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  scoreCol: { alignItems: 'flex-end' },
  scoreText: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  stagePctText: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.navy },
  followUpRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  followUpText: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.textMuted },
  stagePillRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  stageNavBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  stagePills: { flexDirection: 'row', gap: theme.spacing.xs, paddingHorizontal: 2 },
  stagePill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.full, backgroundColor: theme.colors.cardWhite, borderWidth: 1, borderColor: theme.colors.cardBorder },
  stagePillActive: { backgroundColor: theme.colors.navy, borderColor: theme.colors.navy },
  stagePillText: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.textMuted },
  stagePillTextActive: { color: '#FFFFFF', fontFamily: theme.fonts.bold },
  progressBtn: { marginTop: 4 },
  tabRow: { flexDirection: 'row', backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.full, padding: 4, gap: 4 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: theme.radius.full },
  tabBtnActive: { backgroundColor: theme.colors.navy },
  tabText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textMuted },
  tabTextActive: { color: '#FFFFFF', fontFamily: theme.fonts.bold },
  infoCard: { gap: theme.spacing.sm },
  infoTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoLabel: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted },
  infoValue: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
  contactActionsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  contactActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 46, borderRadius: theme.radius.md, backgroundColor: theme.colors.cardWhite,
    borderWidth: 1, borderColor: theme.colors.cardBorder,
  },
  contactActionText: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.textDark },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.navy, marginTop: 5 },
  historyText: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.textDark },
  historySub: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  notesText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textDark, lineHeight: 19 },
  fab: {
    position: 'absolute', right: theme.spacing.lg, bottom: theme.spacing.lg,
    width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.navy,
    alignItems: 'center', justifyContent: 'center', elevation: 6,
    shadowColor: theme.colors.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
});
