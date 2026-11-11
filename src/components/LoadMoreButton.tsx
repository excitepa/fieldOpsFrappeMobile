import React from 'react';
import { Text, StyleSheet, Pressable, ActivityIndicator, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface LoadMoreButtonProps {
  /** From useLoadMore (one or more lists). */
  canLoadMore: boolean;
  loading: boolean;
  error: string;
  onPress: () => void;
  label?: string;
}

/** "Load more" under a history list: the next page, after what's there. Hidden when there's no more, or offline. */
export const LoadMoreButton: React.FC<LoadMoreButtonProps> = ({ canLoadMore, loading, error, onPress, label = 'Load more' }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  if (!canLoadMore && !loading && !error) return null;
  return (
    <View style={styles.wrapper}>
      {(canLoadMore || loading) && (
        <Pressable onPress={onPress} disabled={loading} style={styles.button}>
          {loading ? <ActivityIndicator size="small" color={theme.colors.navy} /> : <Text style={styles.text}>{label}</Text>}
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 6, paddingVertical: theme.spacing.sm },
  button: {
    minWidth: 140, height: 40, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radius.full,
    borderWidth: 1, borderColor: theme.colors.cardBorder, backgroundColor: theme.colors.cardWhite,
    alignItems: 'center', justifyContent: 'center',
  },
  text: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.navy },
  error: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.red },
});
