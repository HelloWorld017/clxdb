import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { classes } from '@/utils/classes';
import type { CSSProperties, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemePalette {
  primaryColor?: string;
  defaultColor?: string;
  darkPrimaryColor?: string;
  darkDefaultColor?: string;
}

export interface ThemeFontFamily {
  sansSerif?: string;
  monospace?: string;
}

export interface ThemeProviderProps {
  children: ReactNode;
  className?: string;
  mode?: ThemeMode;
  palette?: ThemePalette;
  fontFamily?: ThemeFontFamily;
}

type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;
interface ResolvedThemePalette {
  primaryColor: string;
  defaultColor: string;
}

interface ResolvedThemeFontFamily {
  sansSerif: string;
  monospace: string;
}

type ThemeStyle = CSSProperties & Record<`--${string}`, string>;

const resolveSystemMode = (): ResolvedThemeMode => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getThemeVariables = (
  mode: ResolvedThemeMode,
  palette: ResolvedThemePalette,
  fontFamily: ResolvedThemeFontFamily
): ThemeStyle => {
  const isDark = mode === 'dark';

  return {
    'colorScheme': mode,
    '--clxui-primary-source': palette.primaryColor,
    '--clxui-primary-foreground': `color(from var(--clxui-primary-source) xyz
      clamp(0.05, (.36 / y - 1) * infinity, 1)
      clamp(0.05, (.36 / y - 1) * infinity, 1)
      clamp(0.05, (.36 / y - 1) * infinity, 1)
      / 0.95
    )`,
    '--clxui-default-source': palette.defaultColor,

    '--color-primary': 'oklch(from var(--clxui-primary-source) l c h)',
    '--color-primary-hover': isDark
      ? 'oklch(from var(--clxui-primary-source) calc(l + 0.04) c h)'
      : 'oklch(from var(--clxui-primary-source) calc(l - 0.06) c h)',
    '--color-primary-foreground': isDark
      ? 'var(--clxui-primary-foreground)'
      : 'var(--clxui-primary-foreground)',
    '--color-primary-foreground-muted': isDark
      ? 'oklch(from var(--clxui-primary-foreground) l c h / 0.6)'
      : 'oklch(from var(--clxui-primary-foreground) l c h / 0.6)',

    '--color-default-50': isDark
      ? 'oklch(from var(--clxui-default-source) 0.17 calc(c * 0.65) h)'
      : 'oklch(from var(--clxui-default-source) 0.984 calc(c * 0.08) h)',
    '--color-default-100': isDark
      ? 'oklch(from var(--clxui-default-source) 0.215 calc(c * 0.75) h)'
      : 'oklch(from var(--clxui-default-source) 0.968 calc(c * 0.16) h)',
    '--color-default-200': isDark
      ? 'oklch(from var(--clxui-default-source) 0.28 calc(c * 0.84) h)'
      : 'oklch(from var(--clxui-default-source) 0.929 calc(c * 0.3) h)',
    '--color-default-300': isDark
      ? 'oklch(from var(--clxui-default-source) 0.355 calc(c * 0.92) h)'
      : 'oklch(from var(--clxui-default-source) 0.869 calc(c * 0.48) h)',
    '--color-default-400': isDark
      ? 'oklch(from var(--clxui-default-source) 0.445 calc(c * 0.98) h)'
      : 'oklch(from var(--clxui-default-source) 0.704 calc(c * 0.87) h)',
    '--color-default-500': isDark
      ? 'oklch(from var(--clxui-default-source) 0.56 c h)'
      : 'oklch(from var(--clxui-default-source) l c h)',
    '--color-default-600': isDark
      ? 'oklch(from var(--clxui-default-source) 0.67 calc(c * 0.88) h)'
      : 'oklch(from var(--clxui-default-source) 0.446 calc(c * 0.93) h)',
    '--color-default-700': isDark
      ? 'oklch(from var(--clxui-default-source) 0.77 calc(c * 0.74) h)'
      : 'oklch(from var(--clxui-default-source) 0.372 calc(c * 0.95) h)',
    '--color-default-800': isDark
      ? 'oklch(from var(--clxui-default-source) 0.86 calc(c * 0.55) h)'
      : 'oklch(from var(--clxui-default-source) 0.279 calc(c * 0.89) h)',
    '--color-default-900': isDark
      ? 'oklch(from var(--clxui-default-source) 0.93 calc(c * 0.35) h)'
      : 'oklch(from var(--clxui-default-source) 0.208 calc(c * 0.91) h)',
    '--color-default-950': isDark
      ? 'oklch(from var(--clxui-default-source) 0.97 calc(c * 0.18) h)'
      : 'oklch(from var(--clxui-default-source) 0.129 calc(c * 0.91) h)',

    '--color-surface': isDark
      ? 'oklch(from var(--clxui-default-source) 0.245 calc(c * 0.62) h)'
      : 'oklch(from var(--clxui-default-source) 0.99 calc(c * 0.05) h)',

    '--shadow-ui-soft': isDark
      ? '0 34px 70px -48px oklch(from var(--clxui-default-source) 0.03 calc(c * 0.35) h / 0.75)'
      : '0 34px 70px -48px oklch(from var(--clxui-default-source) 0.18 calc(c * 0.5) h / 0.45)',
    '--shadow-ui-medium': isDark
      ? '0 24px 45px -36px oklch(from var(--clxui-default-source) 0.03 calc(c * 0.3) h / 0.85)'
      : '0 24px 45px -36px oklch(from var(--clxui-default-source) 0.14 calc(c * 0.4) h / 0.7)',
    '--shadow-ui-strong': isDark
      ? '0 14px 30px -22px oklch(from var(--clxui-default-source) 0.02 calc(c * 0.25) h / 0.95)'
      : '0 14px 30px -22px oklch(from var(--clxui-default-source) 0.11 calc(c * 0.35) h / 0.95)',

    '--font-sans': `${fontFamily.sansSerif}, system-ui, sans-serif`,
    '--font-monospace': `${fontFamily.monospace}, monospace`,
  };
};

const DEFAULT_PRIMARY_COLOR = 'oklch(0.2 0 250)';
const ThemeContext = createContext<Pick<ThemeProviderProps, 'mode' | 'palette' | 'fontFamily'>>({
  mode: 'system',
  palette: {},
  fontFamily: {},
});

export function ThemeProvider({
  children,
  className,
  mode = 'system',
  palette = {},
  fontFamily = {},
}: ThemeProviderProps) {
  const {
    primaryColor = 'oklch(0.2 0 250)',
    defaultColor = `oklch(from ${primaryColor} 0.56 min(c / 3, 0.06) h)`,
    darkPrimaryColor = primaryColor === DEFAULT_PRIMARY_COLOR ? 'oklch(0.9 0 250)' : primaryColor,
    darkDefaultColor = defaultColor,
  } = palette;

  const [systemMode, setSystemMode] = useState<ResolvedThemeMode>(() => resolveSystemMode());

  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemMode(event.matches ? 'dark' : 'light');
    };

    setSystemMode(media.matches ? 'dark' : 'light');
    media.addEventListener('change', handleChange);

    return () => {
      media.removeEventListener('change', handleChange);
    };
  }, [mode]);

  const resolvedMode: ResolvedThemeMode = mode === 'system' ? systemMode : mode;
  const style = useMemo(
    () => ({
      ...getThemeVariables(
        resolvedMode,
        {
          primaryColor: resolvedMode === 'dark' ? darkPrimaryColor : primaryColor,
          defaultColor: resolvedMode === 'dark' ? darkDefaultColor : defaultColor,
        },
        {
          sansSerif: fontFamily.sansSerif ?? 'ui-sans-serif',
          monospace: fontFamily.monospace ?? 'ui-monospace',
        }
      ),
      colorScheme: resolvedMode,
    }),
    [resolvedMode, primaryColor, defaultColor, darkPrimaryColor, darkDefaultColor]
  );

  const themeContext = useMemo(() => ({ mode, palette, fontFamily }), [mode, palette, fontFamily]);

  return (
    <ThemeContext.Provider value={themeContext}>
      <div className={classes(className, 'font-sans', resolvedMode)} style={style}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export const useThemeContext = () => useContext(ThemeContext);
