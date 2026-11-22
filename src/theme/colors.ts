/** HyggeWick semantic colors. Dark is the brand direction; light remains supported. */
const dark = {
  background: '#01010B',
  backgroundSecondary: '#0B061A',
  navigation: '#070314',
  surface: '#150E30',
  surfaceElevated: '#1D1440',
  surfaceSelected: '#251A4E',
  surfaceInteractive: '#2E215C',
  text: '#F2EEF8',
  textSecondary: '#C4BDCF',
  textMuted: '#A69DB6',
  textDisabled: '#777183',
  accent: '#D8B96E',
  accentSoft: '#B79B62',
  accentLavender: '#C4AAEE',
  textOnAccent: '#1A1206',
  selected: '#D8B96E',
  border: '#281C46',
  borderEmphasized: '#44306C',
  borderSelected: '#8E7547',
  divider: '#160D2E',
  success: '#91AA91',
  warning: '#D6B875',
  error: '#C88787',
  progressTrack: '#281C46',
  progress: '#9B6FE0',
} as const;

const light = {
  background: '#F4F1F5',
  backgroundSecondary: '#EBE7EF',
  navigation: '#EDE9F1',
  surface: '#E7E2EB',
  surfaceElevated: '#F9F7FA',
  surfaceSelected: '#DED7E7',
  surfaceInteractive: '#E2DCE8',
  text: '#292532',
  textSecondary: '#514B5D',
  textMuted: '#6D6678',
  textDisabled: '#908A99',
  accent: '#755B27',
  accentSoft: '#92763F',
  accentLavender: '#6F5C8B',
  textOnAccent: '#FFFFFF',
  selected: '#755B27',
  border: '#D6D0DC',
  borderEmphasized: '#B8AFBF',
  borderSelected: '#92763F',
  divider: '#DED9E3',
  success: '#416B4B',
  warning: '#755B27',
  error: '#9B4F54',
  progressTrack: '#D9D3E0',
  progress: '#755B27',
} as const;

type SemanticColors = { [Key in keyof typeof dark]: string };
type LegacyColors = {
  backgroundElement: string;
  backgroundSelected: string;
};

function withLegacyAliases(colors: SemanticColors): SemanticColors & LegacyColors {
  return {
    ...colors,
    backgroundElement: colors.surface,
    backgroundSelected: colors.surfaceSelected,
  };
}

export const Colors = {
  light: withLegacyAliases(light),
  dark: withLegacyAliases(dark),
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
