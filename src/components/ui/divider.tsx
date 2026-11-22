import { StyleSheet, View, type ViewProps } from 'react-native';

import { Borders } from '@/theme';
import { useTheme } from '@/hooks/use-theme';

export type DividerOrientation = 'horizontal' | 'vertical';

export type DividerProps = Omit<ViewProps, 'children'> & {
  orientation?: DividerOrientation;
};

export function Divider({ orientation = 'horizontal', style, ...viewProps }: DividerProps) {
  const theme = useTheme();

  return (
    <View
      {...viewProps}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        orientation === 'horizontal' ? styles.horizontal : styles.vertical,
        { backgroundColor: theme.divider },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  horizontal: { width: '100%', height: Borders.subtle },
  vertical: { height: '100%', width: Borders.subtle },
});
