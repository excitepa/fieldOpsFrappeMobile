import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { RouteAssignment } from '../types';
import { localDateStr } from '../utils/timestamp';

interface DayRouteNavProps {
  selectedDate: string; // ISO yyyy-mm-dd
  onSelectDate: (date: string) => void;
  assignments: RouteAssignment[];
}

const toIso = (d: Date) => localDateStr(d);
const addDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toIso(d);
};
const fullDateLabel = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

export const DayRouteNav: React.FC<DayRouteNavProps> = ({ selectedDate, onSelectDate, assignments }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const todayIso = toIso(new Date());

  const assignmentForSelected = assignments.find((a) => a.date === selectedDate);

  return (
    <View style={styles.headerRow}>
      <Pressable onPress={() => onSelectDate(addDays(selectedDate, -1))} style={styles.navBtn}>
        <Icon name="chevron-left" size={18} color={theme.colors.darkText} />
      </Pressable>

      <Pressable onPress={() => onSelectDate(todayIso)} style={styles.todayWrap}>
        <View style={styles.dateRow}>
          <Icon name="calendar" size={14} color={theme.colors.primaryLight} />
          <Text style={styles.todayLabel}>{fullDateLabel(selectedDate)}</Text>
        </View>
        {assignmentForSelected ? (
          <Text style={styles.routeLabel}>{assignmentForSelected.routeName}</Text>
        ) : (
          <Text style={styles.routeLabelMuted}>No route assigned</Text>
        )}
      </Pressable>

      <Pressable onPress={() => onSelectDate(addDays(selectedDate, 1))} style={styles.navBtn}>
        <Icon name="chevron-right" size={18} color={theme.colors.darkText} />
      </Pressable>
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.xs },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.darkSurface, borderWidth: 1, borderColor: theme.colors.darkBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  todayWrap: { alignItems: 'center', flex: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  todayLabel: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.darkText, letterSpacing: 0.3 },
  routeLabel: { fontFamily: theme.fonts.semibold, fontSize: 11, color: theme.colors.primaryLight, marginTop: 1 },
  routeLabelMuted: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.darkMuted, marginTop: 1 },
});
