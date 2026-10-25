import { Platform, StatusBar } from 'react-native';

// The app is light-only — dark mode was removed. Several keys below keep their
// historical "dark*"/"light-ish" names (darkBg, darkText, cardWhite, textDark,
// ...) because the app was originally built dark-only and every screen still
// reads these exact keys; their values are the light palette.
export interface ThemeColors {
  darkBg: string; darkSurface: string; darkCard: string; darkBorder: string;
  darkText: string; darkMuted: string; darkInputBg: string;

  primary: string; primaryLight: string; primaryDark: string; primaryBg: string; primaryText: string;

  limePrimary: string; limePrimaryDark: string; limeText: string; limeBg: string;

  appBg: string; cardWhite: string; cardBorder: string;
  textDark: string; textMuted: string; textLight: string;

  tintBeige: string; tintBeigeIcon: string;
  tintMint: string; tintMintIcon: string;
  tintPeach: string; tintPeachIcon: string;
  tintBlue: string; tintBlueIcon: string;
  tintPurple: string; tintPurpleIcon: string;
  tintGray: string; tintGrayIcon: string;
  tintGold: string; tintGoldIcon: string;
  tintTeal: string; tintTealIcon: string;

  visitedBg: string; visitedText: string;
  skippedBg: string; skippedText: string;
  pendingBg: string; pendingText: string;

  teal: string; tealLight: string;
  emerald: string; emeraldLight: string;
  amber: string; amberLight: string;
  red: string; redLight: string;

  campaignCardBg: string; campaignCardBorder: string;

  // "New UI" redesign tokens (see /new ui reference screenshots) — fixed brand
  // colors used by the opt-in `variant` props on Header/Button/Input so the
  // restyled screens can look consistent without touching every other screen's
  // existing colors.
  navy: string; navyDark: string; navyPressed: string;
  accent: string; accentDark: string; accentPressed: string;
  fieldFill: string; fieldBorder: string;
}

// ─── Brand blue — fixed across both themes ────────────────────────────────────
const BRAND_PRIMARY = '#0066CC';
const BRAND_PRIMARY_DARK = '#003366';
const BRAND_PRIMARY_ACCENT = '#004AB8';

// ─── New UI redesign brand colors — fixed across both themes ─────────────────
const NAVY = '#1E3A6B';
const NAVY_DARK = '#152B54';
const NAVY_PRESSED = '#122346';
const ACCENT_ORANGE = '#F5A623';
const ACCENT_ORANGE_DARK = '#D6890A';
const ACCENT_ORANGE_PRESSED = '#C27A08';

export const lightColors: ThemeColors = {
  darkBg:       '#F7F8FC',
  darkSurface:  '#EEF0F6',
  darkCard:     '#FFFFFF',
  darkBorder:   '#E2E5EE',
  darkText:     '#1E2233',
  darkMuted:    '#67708A',
  darkInputBg:  '#F4F5F9',

  primary:      BRAND_PRIMARY,
  primaryLight: BRAND_PRIMARY_ACCENT,
  primaryDark:  BRAND_PRIMARY_DARK,
  primaryBg:    '#E6F0FA',
  primaryText:  BRAND_PRIMARY_DARK,

  limePrimary:     '#65A30D',
  limePrimaryDark: '#4D7C0F',
  limeText:        '#1A2E05',
  limeBg:          '#ECFCCB',

  appBg:       '#F7F8FC',
  cardWhite:   '#FFFFFF',
  cardBorder:  '#E2E5EE',
  textDark:    '#1E2233',
  textMuted:   '#67708A',
  textLight:   '#94A0B8',

  tintBeige:       '#FEF3E2',  tintBeigeIcon:  '#B45309',
  tintMint:        '#D1FAE5',  tintMintIcon:   '#059669',
  tintPeach:       '#FEE2E2',  tintPeachIcon:  '#DC2626',
  tintBlue:        '#DBEAFE',  tintBlueIcon:   '#2563EB',
  tintPurple:      '#E0E7FF',  tintPurpleIcon: '#3730A3',
  tintGray:        '#F1F5F9',  tintGrayIcon:   '#64748B',
  tintGold:        '#FEF3C7',  tintGoldIcon:   '#B45309',
  tintTeal:        '#CCFBF1',  tintTealIcon:   '#0F766E',

  visitedBg:     '#D1FAE5',  visitedText:   '#059669',
  skippedBg:     '#FEF3C7',  skippedText:   '#B45309',
  pendingBg:     '#F1F5F9',  pendingText:   '#64748B',

  teal:        '#0D9488',
  tealLight:   '#CCFBF1',
  emerald:     '#059669',
  emeraldLight:'#D1FAE5',
  amber:       '#D97706',
  amberLight:  '#FEF3C7',
  red:         '#DC2626',
  redLight:    '#FEE2E2',

  campaignCardBg:     '#FFFFFF',
  campaignCardBorder: '#E2E5EE',

  navy: NAVY, navyDark: NAVY_DARK, navyPressed: NAVY_PRESSED,
  accent: ACCENT_ORANGE, accentDark: ACCENT_ORANGE_DARK, accentPressed: ACCENT_ORANGE_PRESSED,
  fieldFill: '#EEF0F5', fieldBorder: '#E2E5EE',
};

export const fonts = {
  regular:  'SourceSans3_400Regular',
  semibold: 'SourceSans3_600SemiBold',
  bold:     'SourceSans3_700Bold',
  display:  'SourceSans3_700Bold',
};

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 28,
};

export const safeTopPadding = Platform.OS === 'ios' ? 48 : (StatusBar.currentHeight || 24) + 8;

export const radius = {
  sm:   8,
  md:   14,
  lg:   20,
  xl:   26,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
};

export interface Theme {
  colors: ThemeColors;
  fonts: typeof fonts;
  spacing: typeof spacing;
  radius: typeof radius;
  shadows: typeof shadows;
  safeTopPadding: number;
}

export const theme: Theme = {
  colors: lightColors,
  fonts,
  spacing,
  radius,
  shadows,
  safeTopPadding,
};
