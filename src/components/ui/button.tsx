import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Layout, Radii, Spacing } from '@/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'small' | 'medium';

export type ButtonProps = Omit<PressableProps, 'children' | 'disabled'> & {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  title,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  style,
  accessibilityLabel,
  accessibilityState,
  ...pressableProps
}: ButtonProps) {
  const theme = useTheme();
  const unavailable = disabled || loading;

  const backgroundColor = unavailable
    ? theme.surfaceInteractive
    : variant === 'primary'
      ? theme.accent
      : variant === 'secondary'
        ? theme.surface
        : 'transparent';

  const foregroundColor = unavailable
    ? theme.textDisabled
    : variant === 'primary'
      ? theme.textOnAccent
      : variant === 'ghost'
        ? theme.accent
        : theme.text;

  const borderColor = unavailable
    ? 'transparent'
    : variant === 'secondary'
      ? theme.border
      : variant === 'ghost'
        ? theme.borderEmphasized
        : 'transparent';

  const borderWidth = variant === 'secondary' || variant === 'ghost' ? 1 : 0;

  return (
    <Pressable
      {...pressableProps}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ ...accessibilityState, disabled: unavailable, busy: loading }}
      disabled={unavailable}
      style={(state) => [
        styles.button,
        styles[size],
        { backgroundColor, borderColor, borderWidth },
        state.pressed && !unavailable && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={foregroundColor} />
      ) : (
        <>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <ThemedText type="smallBold" style={{ color: foregroundColor }}>
            {title}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radii.medium,
  },
  small: { minHeight: Layout.minimumTouchTarget },
  medium: { minHeight: Layout.standardTouchTarget },
  icon: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.82 },
});
