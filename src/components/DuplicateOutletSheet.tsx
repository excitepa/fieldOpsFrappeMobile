import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { Button } from './Button';
import type { OutletMatch } from '../services/api';
import { formatDistance } from '../utils/geo';
import { formatServerDateTime } from '../utils/timestamp';

interface DuplicateOutletSheetProps {
  /** The outlets the new one looks like; the sheet is open while there are some. */
  matches: OutletMatch[] | null;
  /** The ones the agent can open: on their list and on this phone. */
  canOpen: (match: OutletMatch) => boolean;
  onOpen: (match: OutletMatch) => void;
  /** The agent says it's a different outlet: it's saved, and a supervisor checks it. */
  onDifferent: () => void;
  onCancel: () => void;
}

/** Why it looks like that outlet, e.g. "Same phone number (•••• 4567)" or "42m away, similar name". */
const whyItMatches = (m: OutletMatch): string =>
  m.match === 'phone'
    ? `Same phone number${m.phoneLast4 ? ` (•••• ${m.phoneLast4})` : ''}`
    : `${m.distanceM !== null ? `${formatDistance(m.distanceM)} away` : 'Nearby'}, similar name`;

/**
 * Before a new outlet is saved: the outlets already onboarded that it looks
 * like (same phone number, or near with a similar name), so the agent can
 * open the one they meant instead of adding it again.
 */
export const DuplicateOutletSheet: React.FC<DuplicateOutletSheetProps> = ({ matches, canOpen, onOpen, onDifferent, onCancel }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!matches && matches.length > 0} transparent animationType="slide" onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheetContainer, { paddingBottom: theme.spacing.xxl + insets.bottom }]}>
              <View style={styles.dragHandle} />
              <View style={styles.header}>
                <Text style={styles.title}>This looks like an outlet that's already onboarded</Text>
                <Text style={styles.sub}>Check it isn't one of these before you add it.</Text>
              </View>

              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {(matches || []).map((m) => (
                  <View key={m.outletId} style={styles.matchCard}>
                    <View style={styles.matchTop}>
                      <Icon name="store" size={16} color={theme.colors.navy} />
                      <Text style={styles.matchName}>{m.outletName}</Text>
                    </View>
                    {m.address ? <Text style={styles.matchMeta}>{m.address}</Text> : null}
                    <Text style={styles.matchWhy}>{whyItMatches(m)}</Text>
                    {m.onboardedByName || m.onboardedOn ? (
                      <Text style={styles.matchMeta}>
                        Onboarded{m.onboardedByName ? ` by ${m.onboardedByName}` : ''}{m.onboardedOn ? ` on ${formatServerDateTime(m.onboardedOn)}` : ''}
                      </Text>
                    ) : null}
                    {canOpen(m) && (
                      <Pressable onPress={() => onOpen(m)} style={styles.openBtn}>
                        <Text style={styles.openBtnText}>Open {m.outletName}</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.actions}>
                <Button title="Cancel" onPress={onCancel} variant="outline" style={styles.actionBtn} />
                <Button title="It's a different outlet" onPress={onDifferent} variant="navy" style={styles.actionBtnWide} />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetContainer: {
    backgroundColor: theme.colors.cardWhite,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    maxHeight: '85%',
  },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.cardBorder, alignSelf: 'center', marginBottom: 4 },
  header: { gap: 4 },
  title: { fontFamily: theme.fonts.bold, fontSize: 19, color: theme.colors.textDark },
  sub: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  list: { flexShrink: 1 },
  listContent: { gap: theme.spacing.sm },
  matchCard: {
    borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.radius.md,
    padding: theme.spacing.md, gap: 3,
  },
  matchTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  matchName: { flex: 1, fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  matchWhy: { fontFamily: theme.fonts.semibold, fontSize: 13, color: theme.colors.amber },
  matchMeta: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted },
  openBtn: {
    alignSelf: 'flex-start', marginTop: theme.spacing.xs,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.full, backgroundColor: theme.colors.fieldFill,
  },
  openBtnText: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.navy },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  actionBtn: { flex: 1 },
  actionBtnWide: { flex: 1.6 },
});
