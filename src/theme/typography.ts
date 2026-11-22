import { Platform } from 'react-native';

/** System font stacks avoid bundled font assets and remain legible on Android. */
export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'sans-serif-rounded',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const FontSizes = {
  caption: 12,
  label: 14,
  body: 16,
  bodyLarge: 18,
  subtitle: 22,
  title: 28,
  display: 36,
} as const;

export const LineHeights = {
  caption: 18,
  label: 20,
  body: 24,
  bodyLarge: 28,
  subtitle: 30,
  title: 36,
  display: 44,
} as const;

export const Typography = {
  literary: { fontFamily: Fonts?.serif },
  interface: { fontFamily: Fonts?.sans },
  auxiliary: { fontFamily: Fonts?.sans },
  caption: { fontSize: FontSizes.caption, lineHeight: LineHeights.caption },
  label: { fontSize: FontSizes.label, lineHeight: LineHeights.label },
  body: { fontSize: FontSizes.body, lineHeight: LineHeights.body },
  bodyLarge: { fontSize: FontSizes.bodyLarge, lineHeight: LineHeights.bodyLarge },
  subtitle: { fontSize: FontSizes.subtitle, lineHeight: LineHeights.subtitle },
  title: { fontSize: FontSizes.title, lineHeight: LineHeights.title },
  display: { fontSize: FontSizes.display, lineHeight: LineHeights.display },
} as const;
