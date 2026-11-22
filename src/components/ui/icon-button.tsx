import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Layout, Radii } from '@/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconButtonVariant = 'default' | 'subtle' | 'accent';

export type IconButtonProps = Omit<PressableProps, 'children' | 'disabled'> & {
  icon: ReactNode;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  disabled?: boolean;
};

export function IconButton({
  icon,
  accessibilityLabel,
  variant = 'default',
  disabled = false,
  style,
  accessibilityState,
  ...pressableProps
}: IconButtonProps) {
  const theme = useTheme();
  const backgroundColor =
    variant === 'accent'
      ? theme.accent
      : variant === 'subtle'
        ? 'transparent'
        : theme.surface;

  return (
    <Pressable
      {...pressableProps}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled }}
      disabled={disabled}
      style={(state) => [
        styles.button,
        { backgroundColor },
        disabled && styles.disabled,
        state.pressed && !disabled && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: Layout.standardTouchTarget,
    height: Layout.standardTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.pill,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78 },
});
