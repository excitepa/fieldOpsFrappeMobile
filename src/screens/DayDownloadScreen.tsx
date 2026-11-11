import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { useDayPack } from '../hooks/useDayPack';
import { DAY_PACK_SIZE, DayPackResult } from '../utils/dayPack';

interface DayDownloadScreenProps {
  /** The campaign just clocked in for. */
  campaignId?: string;
  onDone: () => void;
}

/**
 * Right after clock-in, before Home: everything the agent works from offline
 * today is downloaded, with its progress. When something doesn't come in,
 * the agent can carry on with what's saved on the phone — unless the phone has
 * never had this agent's data, when there's nothing to work from yet.
 */
export const DayDownloadScreen: React.FC<DayDownloadScreenProps> = ({ campaignId, onDone }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state } = useFieldStore();
  const { run, progress } = useDayPack();
  const [result, setResult] = useState<DayPackResult | null>(null);

  const start = async () => {
    setResult(null);
    const outcome = await run(campaignId);
    if (outcome.ok) onDone();
    else setResult(outcome);
  };

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = progress?.done ?? 0;
  const total = progress?.total ?? DAY_PACK_SIZE;
  const hasSavedData = state.outlets.length > 0 || state.products.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Icon name={result ? 'alert-circle' : 'refresh'} size={34} color={result ? theme.colors.amber : theme.colors.primaryLight} />
        </View>

        {!result ? (
          <>
            <Text style={styles.title}>Getting today's data</Text>
            <Text style={styles.sub}>Outlets, products, surveys and the rest, so you can work offline.</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round((done / total) * 100)}%` }]} />
            </View>
            <Text style={styles.count}>Getting today's data · {done} of {total}</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Some of today's data didn't come in</Text>
            <Text style={styles.sub}>
              {result.needsSignIn
                ? 'Your login has expired. Sign in again to download it.'
                : `Couldn't download: ${result.failed.join(', ')}.`}
            </Text>
            <Text style={styles.sub}>
              {hasSavedData
                ? 'You can carry on with what was saved on this phone last time, and it will keep trying.'
                : "This phone doesn't have your data yet, so it's needed before you start. Check your connection and try again."}
            </Text>
            <Pressable onPress={start} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Try again</Text>
            </Pressable>
            {hasSavedData && (
              <Pressable onPress={onDone} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Continue with saved data</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.darkBg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.sm },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: theme.colors.darkSurface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  title: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.darkText, textAlign: 'center', lineHeight: 26 },
  sub: { fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.darkMuted, textAlign: 'center', lineHeight: 20 },
  progressTrack: { width: '100%', height: 8, borderRadius: 4, backgroundColor: theme.colors.darkSurface, overflow: 'hidden', marginTop: theme.spacing.lg },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 4 },
  count: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.primaryLight, marginTop: theme.spacing.xs },
  primaryBtn: {
    width: '100%', height: 52, borderRadius: theme.radius.full, marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontFamily: theme.fonts.bold, fontSize: 14, color: '#FFFFFF' },
  secondaryBtn: {
    width: '100%', height: 52, borderRadius: theme.radius.full,
    borderWidth: 1, borderColor: theme.colors.darkBorder, backgroundColor: theme.colors.darkSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.darkText },
});
