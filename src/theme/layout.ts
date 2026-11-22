import { Platform } from 'react-native';

import { Spacing } from './spacing';

export const Layout = {
  contentMaxWidth: 800,
  readingMaxWidth: 680,
  phoneHorizontalMargin: Spacing.four,
  tabletHorizontalMargin: Spacing.seven,
  sectionGap: Spacing.five,
  tabletBreakpoint: 840,
  tabletLandscapeBreakpoint: 1024,
  tabletNavigationWidth: 240,
  tabletContentGap: Spacing.six,
  minimumTouchTarget: 44,
  standardTouchTarget: 48,
} as const;

/** Kept for compatibility with existing starter screens. */
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = Layout.contentMaxWidth;
