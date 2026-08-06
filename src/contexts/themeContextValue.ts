import { createContext, useContext } from 'react';

/** 'system' is only the silent default (OS preference). UI exposes light/dark. */
export type Theme = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Resolved appearance after applying system preference when needed. */
  isDark: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
