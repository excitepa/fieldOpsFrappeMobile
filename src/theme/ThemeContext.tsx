import React, { createContext, useContext, ReactNode } from 'react';
import { Theme, theme } from './theme';

// The app is light-only (dark mode was removed). The provider is kept so every
// screen keeps reading the theme through useTheme(). Any dark-mode choice a
// user saved before (AsyncStorage '@fieldops:themeMode') is simply ignored.
const ThemeContext = createContext<Theme | null>(null);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
);

export const useTheme = (): Theme => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
};
