import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  small: {
    ...Typography.label,
    fontWeight: 500,
  },
  smallBold: {
    ...Typography.label,
    fontWeight: 700,
  },
  default: {
    ...Typography.body,
    fontWeight: 500,
  },
  title: {
    ...Typography.display,
    fontFamily: Fonts?.serif,
    fontWeight: 600,
  },
  subtitle: {
    ...Typography.title,
    fontFamily: Fonts?.serif,
    fontWeight: 600,
  },
  link: {
    ...Typography.label,
  },
  linkPrimary: {
    ...Typography.label,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    ...Typography.caption,
  },
});
