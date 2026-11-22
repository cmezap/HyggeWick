import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing, Typography } from '@/theme';
import { useTheme } from '@/hooks/use-theme';

export type BadgeTone = 'default' | 'accent' | 'lavender' | 'success' | 'warning' | 'error';

export type BadgeProps = {
  children: string;
  tone?: BadgeTone;
  icon?: ReactNode;
};

export function Badge({ children, tone = 'default', icon }: BadgeProps) {
  const theme = useTheme();
  const palette = {
    default: { backgroundColor: theme.surfaceSelected, color: theme.textSecondary },
    accent: { backgroundColor: theme.accent, color: theme.textOnAccent },
    lavender: { backgroundColor: theme.surfaceSelected, color: theme.accentLavender },
    success: { backgroundColor: theme.surfaceSelected, color: theme.success },
    warning: { backgroundColor: theme.surfaceSelected, color: theme.warning },
    error: { backgroundColor: theme.surfaceSelected, color: theme.error },
  } satisfies Record<BadgeTone, { backgroundColor: string; color: string }>;
  const colors = palette[tone];

  return (
    <View style={[styles.badge, { backgroundColor: colors.backgroundColor }]}>
      {icon}
      <ThemedText type="smallBold" style={[styles.label, { color: colors.color }]}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.pill,
    alignSelf: 'flex-start',
  },
  label: Typography.caption,
});
