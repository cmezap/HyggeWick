import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radii, Spacing } from '@/theme';
import { useTheme } from '@/hooks/use-theme';

export type ProgressBarProps = Omit<ViewProps, 'children'> & {
  value: number;
  accessibilityLabel: string;
  min?: number;
  max?: number;
  size?: 'small' | 'medium';
};

export function ProgressBar({
  value,
  accessibilityLabel,
  min = 0,
  max = 100,
  size = 'small',
  style,
  ...viewProps
}: ProgressBarProps) {
  const theme = useTheme();
  const validRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
  const safeValue = Number.isFinite(value) ? value : min;
  const boundedValue = validRange ? Math.min(max, Math.max(min, safeValue)) : min;
  const progress = validRange ? ((boundedValue - min) / (max - min)) * 100 : 0;

  return (
    <View
      {...viewProps}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: validRange ? min : 0, max: validRange ? max : 100, now: validRange ? boundedValue : 0 }}
      style={[
        styles.track,
        { height: size === 'small' ? Spacing.one : Spacing.two, backgroundColor: theme.progressTrack },
        style,
      ]}>
      <View
        style={[
          styles.progress,
          { width: `${progress}%`, backgroundColor: theme.progress },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: Radii.pill,
  },
  progress: {
    height: '100%',
    borderRadius: Radii.pill,
  },
});
