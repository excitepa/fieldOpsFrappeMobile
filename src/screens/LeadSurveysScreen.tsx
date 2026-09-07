import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { getSurveysForCampaign, getSurveyDetail, getMySurveys } from '../services/api';
import { RouteName, Lead, CampaignSurveyConfig } from '../types';

interface LeadSurveysScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  leadData?: Lead;
}

export const LeadSurveysScreen: React.FC<LeadSurveysScreenProps> = ({ onNavigate, leadData }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, getLeadSurveyResponse } = useFieldStore();
  const lead = leadData;
  const activeCampaign = state.activeCampaign;

  const [surveys, setSurveys] = useState<CampaignSurveyConfig[]>([]);
  const [submittedSurveyIds, setSubmittedSurveyIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSurveys = useCallback(async () => {
    if (!activeCampaign?.id) {
      setSurveys([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [list, mySurveys] = await Promise.all([
        getSurveysForCampaign(activeCampaign.id),
        getMySurveys(activeCampaign.id),
      ]);
      const details = await Promise.all(list.map((s) => getSurveyDetail(s.id)));
      setSurveys(details.filter((d): d is CampaignSurveyConfig => !!d));
      setSubmittedSurveyIds(new Set(mySurveys.filter((r) => r.status === 'Submitted').map((r) => r.surveyId)));
    } catch (e: any) {
      setError(e?.message || 'Could not load surveys.');
    } finally {
      setLoading(false);
    }
  }, [activeCampaign?.id]);

  useEffect(() => {
    fetchSurveys();
  }, [fetchSurveys]);

  if (!lead) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Surveys" onNavigate={onNavigate} onBackPress={() => onNavigate('leads')} />
        <View style={styles.missingContainer}>
          <Icon name="alert-circle" size={44} color={theme.colors.amber} />
          <Text style={styles.missingTitle}>This lead could not be found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const rows = surveys.map((survey) => {
    const questionCount = survey.sections?.reduce((sum, s) => sum + s.questions.length, 0) ?? survey.questions.length;
    // A lead survey response is completed if the backend has one for this survey
    // (agent+survey scoped) or a local record ties it to this specific lead — the
    // backend's Survey Response has no lead-level uniqueness, so the local record is
    // what actually distinguishes "done for this lead" per submitSurveyResponse's note.
    const completed = submittedSurveyIds.has(survey.id) || !!getLeadSurveyResponse(lead.id, survey.id);
    return { survey, questionCount, completed };
  });
  const pendingCount = rows.filter((r) => !r.completed).length;
  const completedCount = rows.length - pendingCount;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Surveys"
        subtitle={loading ? 'Loading...' : `${pendingCount} pending · ${completedCount} completed`}
        onNavigate={onNavigate}
        onBackPress={() => onNavigate('leadDetail', lead)}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={styles.centerBox}>
            <ActivityIndicator color={theme.colors.navy} />
          </View>
        )}
        {!loading && error ? <Text style={styles.emptyText}>{error}</Text> : null}
        {!loading && !error && rows.length === 0 && (
          <Text style={styles.emptyText}>No surveys are configured for this campaign yet.</Text>
        )}
        {!loading && rows.map(({ survey, questionCount, completed }) => (
          <Pressable key={survey.id} onPress={() => onNavigate('leadSurveyDetail', { lead, survey })}>
            <Card style={styles.card}>
              <View style={styles.row}>
                <View style={styles.iconBox}>
                  <Icon name="clipboard-list" size={18} color={theme.colors.navy} />
                </View>
                <View style={styles.flex1}>
                  <View style={styles.titleRow}>
                    <Text style={styles.surveyName}>{survey.name}</Text>
                    <View style={[styles.badge, completed ? styles.badgeDone : styles.badgePending]}>
                      <Text style={[styles.badgeText, { color: completed ? theme.colors.emerald : theme.colors.amber }]}>
                        {completed ? 'Completed' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                  {survey.description ? <Text style={styles.surveyDesc}>{survey.description}</Text> : null}
                  <View style={styles.metaRow}>
                    <Text style={styles.surveyMeta}>{questionCount} questions</Text>
                    {survey.durationLabel ? (
                      <>
                        <Text style={styles.metaDot}>·</Text>
                        <Icon name="clock" size={12} color={theme.colors.textMuted} />
                        <Text style={styles.surveyMeta}>{survey.durationLabel}</Text>
                      </>
                    ) : null}
                  </View>
                </View>
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 60, gap: theme.spacing.sm },
  missingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  missingTitle: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark, textAlign: 'center' },
  centerBox: { paddingVertical: theme.spacing.xl, alignItems: 'center' },
  emptyText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: theme.spacing.xl },
  card: { gap: 0 },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  flex1: { flex: 1 },
  iconBox: { width: 36, height: 36, borderRadius: theme.radius.md, backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.xs },
  surveyName: { flex: 1, fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: theme.radius.full },
  badgePending: { backgroundColor: theme.colors.amberLight },
  badgeDone: { backgroundColor: theme.colors.emeraldLight },
  badgeText: { fontFamily: theme.fonts.bold, fontSize: 10 },
  surveyDesc: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  surveyMeta: { fontFamily: theme.fonts.semibold, fontSize: 11, color: theme.colors.textMuted },
  metaDot: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted },
});
