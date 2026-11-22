export const Radii = {
  small: 6,
  medium: 12,
  large: 18,
  extraLarge: 24,
  pill: 999,
} as const;

export const Borders = {
  subtle: 1,
  emphasized: 1,
  selected: 2,
} as const;

/** Prefer tonal surface differences; these shadows are intentionally restrained. */
export const Elevation = {
  none: {},
  low: {
    shadowColor: '#090811',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 1,
  },
  medium: {
    shadowColor: '#090811',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;
