import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { Borders, Elevation, Radii, Spacing } from '@/theme';
import { useTheme } from '@/hooks/use-theme';

export type SurfaceVariant = 'default' | 'elevated' | 'subtle';

export type SurfaceProps = PropsWithChildren<ViewProps> & {
  variant?: SurfaceVariant;
};

export function Surface({ variant = 'default', children, style, ...viewProps }: SurfaceProps) {
  const theme = useTheme();
  const backgroundColor =
    variant === 'elevated'
      ? theme.surfaceElevated
      : variant === 'subtle'
        ? theme.backgroundSecondary
        : theme.surface;
  const borderColor =
    variant === 'elevated'
      ? theme.borderEmphasized
      : theme.border;

  return (
    <View
      {...viewProps}
      style={[
        styles.surface,
        { backgroundColor, borderColor },
        variant === 'elevated' && Elevation.low,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    padding: Spacing.four,
    borderRadius: Radii.large,
    borderWidth: Borders.subtle,
  },
});
