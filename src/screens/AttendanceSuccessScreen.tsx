import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../components/Icon';
import { RouteName, Campaign } from '../types';

interface AttendanceSuccessScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
  onClockInSuccess: (campaign: Campaign) => void;
  routeData?: { campaign: Campaign; placeLabel?: string; timestamp?: string };
}

export const AttendanceSuccessScreen: React.FC<AttendanceSuccessScreenProps> = ({
  onNavigate,
  onClockInSuccess,
  routeData,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const now = new Date();
  const timestamp = routeData?.timestamp || `${now.getDate()} ${now.toLocaleDateString('en-US', { weekday: 'short' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

  const handleContinue = () => {
    if (routeData?.campaign) {
      onClockInSuccess(routeData.campaign);
    } else {
      onNavigate('home');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.checkCircle}>
          <Icon name="check" size={36} color={theme.colors.emerald} strokeWidth={3} />
        </View>

        <Text style={styles.title}>Attendance completed successfully</Text>
        <Text style={styles.timestamp}>{timestamp}</Text>

        {routeData?.placeLabel ? (
          <View style={styles.placePill}>
            <Icon name="map-pin" size={13} color={theme.colors.darkMuted} />
            <Text style={styles.placeText}>{routeData.placeLabel}</Text>
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          <Pressable
            onPress={() => Alert.alert('Attendance History', 'This will show your past clock-in/out records — coming soon.')}
            style={styles.historyBtn}
          >
            <Text style={styles.historyBtnText}>History</Text>
          </Pressable>

          <Pressable onPress={handleContinue} style={styles.continueBtn}>
            <Text style={styles.continueBtnText}>Continue to Homepage</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.darkBg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.sm },
  checkCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: theme.colors.emeraldLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  title: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.darkText, textAlign: 'center', lineHeight: 26 },
  timestamp: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.primaryLight, marginTop: 4 },
  placePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.colors.darkSurface, borderWidth: 1, borderColor: theme.colors.darkBorder,
    borderRadius: theme.radius.full, paddingHorizontal: 14, paddingVertical: 8, marginTop: theme.spacing.md,
  },
  placeText: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.darkMuted },
  buttonRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xl, width: '100%' },
  historyBtn: {
    flex: 1, height: 52, borderRadius: theme.radius.full,
    borderWidth: 1, borderColor: theme.colors.darkBorder, backgroundColor: theme.colors.darkSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  historyBtnText: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.darkText },
  continueBtn: {
    flex: 1.4, height: 52, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  continueBtnText: { fontFamily: theme.fonts.bold, fontSize: 14, color: '#FFFFFF' },
});
