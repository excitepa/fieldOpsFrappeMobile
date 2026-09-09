import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { RouteName } from '../types';

interface HeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  onNavigate: (route: RouteName) => void;
  onBackPress?: () => void;
  onSubtitlePress?: () => void;
  rightAction?: React.ReactNode;
  dark?: boolean;
  /** Opt-in "new UI" navy header (solid navy bg, white text/icons). Defaults to
   *  'light', which renders exactly as before this prop existed. */
  variant?: 'light' | 'navy';
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  back = true,
  onNavigate,
  onBackPress,
  onSubtitlePress,
  rightAction,
  dark = true,
  variant = 'light',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const navy = variant === 'navy';

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      onNavigate('home');
    }
  };

  return (
    <View style={[styles.headerContainer, dark && styles.headerDark, navy && styles.headerNavy]}>
      {back ? (
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.iconBtn, dark && styles.iconBtnDark, navy && styles.iconBtnNavy, pressed && styles.pressed]}
        >
          <Icon name="chevron-left" size={24} color={navy ? '#FFFFFF' : dark ? theme.colors.darkText : theme.colors.textDark} />
        </Pressable>
      ) : (
        <View style={styles.logoBadge}>
          <Image source={require('../../assets/logo-icon.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
      )}

      <View style={styles.titleWrapper}>
        <Text numberOfLines={1} style={[styles.title, dark && styles.titleDark, navy && styles.titleNavy]}>
          {title}
        </Text>
        {subtitle ? (
          onSubtitlePress ? (
            <Pressable onPress={onSubtitlePress} hitSlop={6}>
              <Text numberOfLines={1} style={[styles.subtitleLink, navy && styles.subtitleLinkNavy]}>
                {subtitle}
              </Text>
            </Pressable>
          ) : (
            <Text numberOfLines={1} style={[styles.subtitle, dark && styles.subtitleDark, navy && styles.subtitleNavy]}>
              {subtitle}
            </Text>
          )
        ) : null}
      </View>

      {rightAction ? (
        <View style={styles.rightSlot}>{rightAction}</View>
      ) : (
        <View style={styles.rightPlaceholder} />
      )}
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  headerContainer: {
    // SafeAreaView (from react-native-safe-area-context, used by every screen
    // that renders this Header) already reserves the real status-bar/notch
    // inset — adding theme.safeTopPadding here on top of that double-counts
    // it and leaves a blank gap under the header. Just a normal top padding.
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.darkBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.darkBorder,
  },
  headerDark: {
    backgroundColor: theme.colors.darkBg,
    borderBottomColor: theme.colors.darkBorder,
  },
  headerNavy: {
    backgroundColor: theme.colors.navy,
    borderBottomWidth: 0,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.darkSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.darkBorder,
  },
  iconBtnDark: {
    backgroundColor: theme.colors.darkSurface,
    borderColor: theme.colors.darkBorder,
  },
  iconBtnNavy: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.24)',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 36,
    height: 36,
  },
  titleWrapper: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 19,
    color: theme.colors.darkText,
    letterSpacing: -0.3,
  },
  titleDark: {
    color: theme.colors.darkText,
  },
  titleNavy: {
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.darkMuted,
    marginTop: 1,
  },
  subtitleDark: {
    color: theme.colors.darkMuted,
  },
  subtitleNavy: {
    color: 'rgba(255,255,255,0.75)',
  },
  subtitleLink: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    color: theme.colors.primaryLight,
    marginTop: 1,
    textDecorationLine: 'underline',
  },
  subtitleLinkNavy: {
    color: '#FFFFFF',
  },
  rightSlot: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rightPlaceholder: {
    width: 40,
  },
});
