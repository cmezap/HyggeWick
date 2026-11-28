import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { Book } from '@/features/library/book-repository';
import { Borders, Radii, Spacing } from '@/theme';

type CoverBook = Pick<Book, 'id' | 'title' | 'author' | 'genre' | 'series' | 'volumeNumber' | 'coverPath'> & {
  hideCoverDetails?: boolean;
};
type Palette = { colors: [string, string, string]; accent: string; glyph: string };

// ─── Default cover images (8 portadas) ───────────────────────────────────────
const DEFAULT_COVERS = [
  require('../../assets/images/portadas/Portada1.png'),
  require('../../assets/images/portadas/Portada2.png'),
  require('../../assets/images/portadas/Portada3.png'),
  require('../../assets/images/portadas/Portada4.png'),
  require('../../assets/images/portadas/Portada5.png'),
  require('../../assets/images/portadas/Portada6.png'),
  require('../../assets/images/portadas/Portada7.png'),
  require('../../assets/images/portadas/Portada8.png'),
] as const;

/** Deterministic cover selection: same book always gets the same cover image. */
function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function defaultCoverFor(book: CoverBook) {
  return DEFAULT_COVERS[stableHash(book.id) % DEFAULT_COVERS.length]!;
}

// ─── Palettes ─────────────────────────────────────────────────────────────────
// Colores oscuros coordinados (negros, azules profundos, morados oscuros y noche)
// diseñados para fundirse sutilmente con las ilustraciones sin generar choque o desbalance.
const PALETTES: Palette[] = [
  // Noche profunda & índigo suave
  { colors: ['#070A18', '#0F162D', '#1A1838'], accent: '#D8B96E', glyph: '✦' },
  // Azul oscuro abisal & lavanda apagado
  { colors: ['#060C1A', '#0D182E', '#161933'], accent: '#C4AAEE', glyph: '☾' },
  // Ciruela & morado oscuro elegante
  { colors: ['#0F0819', '#1C122B', '#271738'], accent: '#D6B875', glyph: '❧' },
  // Carbón índigo & berenjena oscuro
  { colors: ['#090D1C', '#141830', '#1F1730'], accent: '#D1A675', glyph: '✧' },
  // Morado azulado medianoche & sombra
  { colors: ['#0B091B', '#17142E', '#221832'], accent: '#C7B6EA', glyph: '✶' },
];

function paletteFor(book: CoverBook): Palette {
  const genre = book.genre?.toLocaleLowerCase() ?? '';
  if (/(fantas|fantasía|magia|mitolog)/.test(genre)) return PALETTES[0]!;
  if (/(ciencia ficción|sci.?fi|espacial|tecnolog)/.test(genre)) return PALETTES[1]!;
  if (/(romance|amor|poesía|poesia)/.test(genre)) return PALETTES[2]!;
  if (/(terror|horror|misterio|suspenso|thriller)/.test(genre)) return PALETTES[4]!;
  if (/(aventura|históric|historical|acción|accion)/.test(genre)) return PALETTES[3]!;
  return PALETTES[stableHash(book.id) % PALETTES.length]!;
}

export function BookCover({ book, style, favorite = false }: { book: CoverBook; style?: StyleProp<ViewStyle>; favorite?: boolean }) {
  const theme = useTheme();
  const palette = useMemo(() => paletteFor(book), [book.id, book.genre]);
  const defaultCover = useMemo(() => defaultCoverFor(book), [book.id]);

  // Three-tier priority: custom cover → default portada image → gradient fallback
  const hasCustomCover = Boolean(book.coverPath);
  const [customFailed, setCustomFailed] = useState(false);
  const [defaultFailed, setDefaultFailed] = useState(false);

  useEffect(() => { setCustomFailed(false); }, [book.coverPath]);

  const [coverWidth, setCoverWidth] = useState(0);
  const measure = (event: LayoutChangeEvent) => setCoverWidth(event.nativeEvent.layout.width);

  const title = book.title.replace(/\.pdf$/i, '').trim() || 'Libro sin título';
  const compact = coverWidth > 0 && coverWidth < 118;
  const maxLines = compact ? 2 : 3;
  const fontSize = compact
    ? title.length > 33 ? 9 : title.length > 20 ? 10 : 11
    : title.length > 42 ? 12 : title.length > 25 ? 14 : 16;

  const showCustomImage = hasCustomCover && !customFailed;
  const showDefaultImage = !showCustomImage && !defaultFailed;
  const showGradientFallback = !showCustomImage && defaultFailed;

  // When a custom image is chosen and hideCoverDetails is enabled, keep the cover completely clean
  const isCustomClean = showCustomImage && Boolean(book.hideCoverDetails);

  // On image covers (custom or default) we show a semi-transparent gradient
  // overlay from the dark palette so each book still has its own tonal depth.
  const showImageOverlay = (showCustomImage || showDefaultImage) && !isCustomClean;

  return (
    <View onLayout={measure} style={[styles.cover, { borderColor: theme.border, backgroundColor: palette.colors[0] }, style]}>

      {/* ── Layer 1: custom user cover ── */}
      {showCustomImage ? (
        <Image
          source={{ uri: book.coverPath! }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onError={() => setCustomFailed(true)}
        />
      ) : null}

      {/* ── Layer 2: deterministic default portada ── */}
      {showDefaultImage ? (
        <Image
          source={defaultCover}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onError={() => setDefaultFailed(true)}
        />
      ) : null}

      {/* ── Layer 3: pure gradient fallback (only when both images fail) ── */}
      {showGradientFallback ? (
        <LinearGradient
          colors={palette.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* ── Palette overlay on image covers ──────────────────────────────
          Dark tones with reduced opacity (~20% less) to keep illustrations
          vibrant and luminous while preserving tonal harmony. */}
      {showImageOverlay ? (
        <LinearGradient
          colors={[
            `${palette.colors[0]}80`,   // ~50% opacity (reduced from 70%)
            `${palette.colors[1]}4D`,   // ~30% opacity (reduced from 50%)
            `${palette.colors[2]}1A`,   // ~10% opacity (reduced from 30%)
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}

      {/* ── Vignette: smooth dark shading top + bottom for text legibility ── */}
      {!isCustomClean ? (
        <LinearGradient
          colors={['rgba(3,4,12,0.40)', 'transparent', 'transparent', 'rgba(3,4,12,0.65)']}
          locations={[0, 0.28, 0.52, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}

      {/* ── Decorative spine line & ornaments (hidden if custom clean cover) ── */}
      {!isCustomClean ? (
        <>
          <View pointerEvents="none" style={[styles.spineLine, { backgroundColor: `${palette.accent}55`, borderColor: `${palette.accent}44` }]} />

          <View pointerEvents="none" style={styles.cornerTop}>
            <View style={[styles.ornamentLine, { backgroundColor: `${palette.accent}60` }]} />
            <ThemedText style={[styles.sparkle, { color: `${palette.accent}DD` }]}>✧</ThemedText>
          </View>
          <View pointerEvents="none" style={styles.cornerBottom}>
            <ThemedText style={[styles.sparkleSmall, { color: `${palette.accent}BB` }]}>✦</ThemedText>
            <View style={[styles.ornamentLine, { backgroundColor: `${palette.accent}60` }]} />
          </View>
        </>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════
          Text + emblem overlay — three absolutely-positioned zones so the
          layout is identical for image covers AND gradient fallback:

            top  25% ── emblem ring (centred horizontally)
            mid  50% ── title (centred vertically in its zone)
            bot  75% ── author / series (centred horizontally)

          If isCustomClean is true, all details are hidden to show the raw image.
          ══════════════════════════════════════════════════════════════════ */}
      {!isCustomClean ? (
        <>
          {/* Zone 1 — Emblem at ~25% from top */}
          <View pointerEvents="none" style={styles.emblemZone}>
            <View style={[
              styles.emblemRing,
              { borderColor: `${palette.accent}90`, backgroundColor: 'rgba(2,1,10,0.50)' },
            ]}>
              <ThemedText style={[styles.emblem, { color: palette.accent }]}>{palette.glyph}</ThemedText>
            </View>
          </View>

          {/* Zone 2 — Title centred in the middle band (30 %→70 %) */}
          <View pointerEvents="none" style={styles.titleZone}>
            <ThemedText
              numberOfLines={maxLines}
              ellipsizeMode="tail"
              adjustsFontSizeToFit={false}
              style={[styles.title, { fontSize, lineHeight: fontSize * 1.22 }]}
            >
              {title}
            </ThemedText>
          </View>

          {/* Zone 3 — Author anchored at ~75% from top (25% from bottom) */}
          <View pointerEvents="none" style={styles.authorZone}>
            {book.series || book.volumeNumber ? (
              <ThemedText numberOfLines={1} style={[styles.series, { color: `${palette.accent}CC` }]}>
                {[book.series, book.volumeNumber ? `VOL. ${book.volumeNumber}` : null].filter(Boolean).join(' · ')}
              </ThemedText>
            ) : null}
            {book.author ? (
              <ThemedText numberOfLines={1} ellipsizeMode="tail" style={styles.author}>{book.author}</ThemedText>
            ) : null}
          </View>
        </>
      ) : null}

      {/* ── Favorite badge ── */}
      {favorite ? (
        <View style={[styles.favorite, { backgroundColor: theme.background }]}>
          <SymbolView name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }} size={13} tintColor={theme.accent} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderWidth: Borders.subtle,
    borderRadius: Radii.medium,
    overflow: 'hidden',
    position: 'relative',
  },

  // Spine decorative line
  spineLine: {
    position: 'absolute',
    top: '8%',
    bottom: '8%',
    left: '10%',
    width: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },

  // Corner ornaments
  cornerTop: { position: 'absolute', top: '7%', right: '9%', width: '24%', alignItems: 'center', gap: 1 },
  cornerBottom: { position: 'absolute', bottom: '6%', left: '19%', right: '9%', flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  ornamentLine: { width: '100%', height: 1 },
  sparkle: { fontSize: 10, lineHeight: 12 },
  sparkleSmall: { fontSize: 8, lineHeight: 10 },

  // ── Three absolutely-positioned overlay zones ──────────────────────────────

  // Zone 1: Emblem at top ~25% (ring centred horizontally)
  emblemZone: {
    position: 'absolute',
    top: '20%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  emblemRing: {
    width: 26,
    height: 26,
    borderWidth: 1,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblem: { fontSize: 14, lineHeight: 18, textAlign: 'center' },

  // Zone 2: Title centred vertically in the middle band (35%→70%)
  titleZone: {
    position: 'absolute',
    top: '35%',
    bottom: '30%',
    left: '8%',
    right: '8%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  title: {
    width: '100%',
    textAlign: 'center',
    fontFamily: 'serif',
    fontWeight: '600',
    color: '#F0E9DF',
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Zone 3: Author anchored at ~75% from top (25% from bottom)
  authorZone: {
    position: 'absolute',
    top: '74%',
    left: '6%',
    right: '6%',
    alignItems: 'center',
    gap: 2,
  },
  series: { maxWidth: '100%', fontSize: 6, lineHeight: 8, letterSpacing: 0.35, textAlign: 'center' },
  author: {
    maxWidth: '100%',
    fontSize: 10,
    lineHeight: 12,
    color: '#D1C7D2',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Favorite badge
  favorite: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
