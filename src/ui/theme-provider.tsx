import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeProviderProps {
  children: ReactNode;
  primary?: string;
  mode?: ThemeMode;
  className?: string;
}

interface ThemeBoundaryProps {
  children: ReactNode;
}

type ResolvedThemeMode = 'light' | 'dark';

type ThemeShade = {
  shade: 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
  lightness: number;
  chromaFactor: number;
};

type ThemeStyles = CSSProperties & Record<`--clxdb-${string}`, string>;

const DEFAULT_PRIMARY = 'oklch(0.56 0.05 250)';
const ThemeProviderContext = createContext(false);

const LIGHT_THEME_SCALE: readonly ThemeShade[] = [
  { shade: 50, lightness: 0.985, chromaFactor: 0.05 },
  { shade: 100, lightness: 0.965, chromaFactor: 0.1 },
  { shade: 200, lightness: 0.92, chromaFactor: 0.15 },
  { shade: 300, lightness: 0.86, chromaFactor: 0.35 },
  { shade: 400, lightness: 0.7, chromaFactor: 0.4 },
  { shade: 500, lightness: 0.56, chromaFactor: 0.42 },
  { shade: 600, lightness: 0.47, chromaFactor: 0.4 },
  { shade: 700, lightness: 0.39, chromaFactor: 0.35 },
  { shade: 800, lightness: 0.31, chromaFactor: 0.15 },
  { shade: 900, lightness: 0.24, chromaFactor: 0.1 },
  { shade: 950, lightness: 0.17, chromaFactor: 0.06 },
];

const DARK_THEME_SCALE: readonly ThemeShade[] = [
  { shade: 50, lightness: 0.17, chromaFactor: 0.06 },
  { shade: 100, lightness: 0.22, chromaFactor: 0.1 },
  { shade: 200, lightness: 0.29, chromaFactor: 0.15 },
  { shade: 300, lightness: 0.37, chromaFactor: 0.35 },
  { shade: 400, lightness: 0.5, chromaFactor: 0.4 },
  { shade: 500, lightness: 0.62, chromaFactor: 0.42 },
  { shade: 600, lightness: 0.71, chromaFactor: 0.4 },
  { shade: 700, lightness: 0.78, chromaFactor: 0.35 },
  { shade: 800, lightness: 0.83, chromaFactor: 0.15 },
  { shade: 900, lightness: 0.88, chromaFactor: 0.1 },
  { shade: 950, lightness: 0.94, chromaFactor: 0.05 },
];

const resolveInitialMode = (mode: ThemeMode): ResolvedThemeMode => {
  if (mode !== 'system') {
    return mode;
  }

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const createThemeScaleVariables = (scale: readonly ThemeShade[]) => {
  const variables: Record<`--clxdb-color-${ThemeShade['shade']}`, string> = {
    '--clxdb-color-50': '',
    '--clxdb-color-100': '',
    '--clxdb-color-200': '',
    '--clxdb-color-300': '',
    '--clxdb-color-400': '',
    '--clxdb-color-500': '',
    '--clxdb-color-600': '',
    '--clxdb-color-700': '',
    '--clxdb-color-800': '',
    '--clxdb-color-900': '',
    '--clxdb-color-950': '',
  };

  for (const color of scale) {
    variables[`--clxdb-color-${color.shade}`] =
      `oklch(from var(--clxdb-primary) ${color.lightness} calc(c * ${color.chromaFactor}) h)`;
  }

  return variables;
};

const createThemeStyles = (mode: ResolvedThemeMode, primary: string): ThemeStyles => {
  const isDark = mode === 'dark';

  return {
    ...createThemeScaleVariables(isDark ? DARK_THEME_SCALE : LIGHT_THEME_SCALE),
    '--clxdb-primary': primary,
    '--clxdb-color-accent-300': isDark
      ? 'oklch(from var(--clxdb-primary) 0.48 calc(c * 0.14) calc(h + 16))'
      : 'oklch(from var(--clxdb-primary) 0.84 calc(c * 0.08) calc(h + 16))',
    '--clxdb-color-surface': isDark
      ? 'oklch(from var(--clxdb-primary) 0.24 calc(c * 0.09) h)'
      : 'oklch(from var(--clxdb-primary) 0.995 calc(c * 0.015) h)',
    'colorScheme': mode,
  };
};

export function ThemeProvider({
  children,
  primary = DEFAULT_PRIMARY,
  mode = 'system',
  className,
}: ThemeProviderProps) {
  const [resolvedMode, setResolvedMode] = useState<ResolvedThemeMode>(() =>
    resolveInitialMode(mode)
  );

  useEffect(() => {
    if (mode !== 'system') {
      setResolvedMode(mode);
      return;
    }

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setResolvedMode('light');
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncMode = () => {
      setResolvedMode(mediaQuery.matches ? 'dark' : 'light');
    };

    syncMode();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncMode);
      return () => {
        mediaQuery.removeEventListener('change', syncMode);
      };
    }

    mediaQuery.addListener(syncMode);
    return () => {
      mediaQuery.removeListener(syncMode);
    };
  }, [mode]);

  const styles = useMemo(() => createThemeStyles(resolvedMode, primary), [resolvedMode, primary]);

  return (
    <ThemeProviderContext.Provider value>
      <div data-clxdb-theme={resolvedMode} className={className} style={styles}>
        {children}
      </div>
    </ThemeProviderContext.Provider>
  );
}

export function ThemeBoundary({ children }: ThemeBoundaryProps) {
  const hasThemeProvider = useContext(ThemeProviderContext);

  if (hasThemeProvider) {
    return <>{children}</>;
  }

  return <ThemeProvider>{children}</ThemeProvider>;
}
