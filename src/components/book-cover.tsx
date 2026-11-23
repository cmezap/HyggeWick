import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { Book } from '@/features/library/book-repository';
import { Borders, Radii, Spacing } from '@/theme';

type CoverBook = Pick<Book, 'id' | 'title' | 'author' | 'genre' | 'series' | 'volumeNumber' | 'coverPath'>;
type Palette = { colors: [string, string, string]; accent: string; glyph: string };

const PALETTES: Palette[] = [
  { colors: ['#101A3B', '#192345', '#281B3E'], accent: '#D8B96E', glyph: '✦' },
  { colors: ['#111D36', '#202A4C', '#301D3B'], accent: '#C4AAEE', glyph: '☾' },
  { colors: ['#21152F', '#35203F', '#421D36'], accent: '#D6B875', glyph: '❧' },
  { colors: ['#151B36', '#222448', '#341D35'], accent: '#D1A675', glyph: '✧' },
  { colors: ['#18172F', '#29223F', '#3D1D32'], accent: '#C7B6EA', glyph: '✶' },
];

function stableIndex(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(hash) % PALETTES.length;
}

function paletteFor(book: CoverBook): Palette {
  const genre = book.genre?.toLocaleLowerCase() ?? '';
  if (/(fantas|fantasía|magia|mitolog)/.test(genre)) return PALETTES[0]!;
  if (/(ciencia ficción|sci.?fi|espacial|tecnolog)/.test(genre)) return PALETTES[1]!;
  if (/(romance|amor|poesía|poesia)/.test(genre)) return PALETTES[2]!;
  if (/(terror|horror|misterio|suspenso|thriller)/.test(genre)) return PALETTES[4]!;
  if (/(aventura|históric|historical|acción|accion)/.test(genre)) return PALETTES[3]!;
  return PALETTES[stableIndex(book.id)]!;
}

export function BookCover({ book, style, favorite = false }: { book: CoverBook; style?: StyleProp<ViewStyle>; favorite?: boolean }) {
  const theme = useTheme();
  const palette = useMemo(() => paletteFor(book), [book.id, book.genre]);
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverWidth, setCoverWidth] = useState(0);
  const title = book.title.replace(/\.pdf$/i, '').trim() || 'Libro sin título';
  const compact = coverWidth > 0 && coverWidth < 118;
  const maxLines = compact ? 2 : 3;
  const fontSize = compact
    ? title.length > 33 ? 8 : title.length > 20 ? 9 : 10
    : title.length > 42 ? 11 : title.length > 25 ? 13 : 15;
  const hasImage = Boolean(book.coverPath && !coverFailed);

  useEffect(() => { setCoverFailed(false); }, [book.coverPath]);

  const measure = (event: LayoutChangeEvent) => setCoverWidth(event.nativeEvent.layout.width);

  return <View onLayout={measure} style={[styles.cover, { borderColor: theme.border, backgroundColor: palette.colors[0] }, style]}>
    {hasImage ? <Image source={{ uri: book.coverPath! }} style={StyleSheet.absoluteFill} contentFit="cover" onError={() => setCoverFailed(true)} /> : <>
      <LinearGradient colors={palette.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[styles.spineLine, { backgroundColor: `${palette.accent}65`, borderColor: `${palette.accent}55` }]} />
      <View pointerEvents="none" style={styles.cornerTop}>
        <View style={[styles.ornamentLine, { backgroundColor: `${palette.accent}72` }]} />
        <ThemedText style={[styles.sparkle, { color: palette.accent }]}>✧</ThemedText>
      </View>
      <View pointerEvents="none" style={styles.cornerBottom}>
        <ThemedText style={[styles.sparkleSmall, { color: `${palette.accent}CC` }]}>✦</ThemedText>
        <View style={[styles.ornamentLine, { backgroundColor: `${palette.accent}72` }]} />
      </View>
      <View pointerEvents="none" style={styles.safeContent}>
        <View style={styles.emblemSlot}>
          <View style={[styles.emblemRing, { borderColor: `${palette.accent}90` }]}>
            <ThemedText style={[styles.emblem, { color: palette.accent }]}>{palette.glyph}</ThemedText>
          </View>
        </View>
        <View style={styles.titleSlot}>
          <ThemedText numberOfLines={maxLines} ellipsizeMode="tail" adjustsFontSizeToFit={false}
            style={[styles.title, { color: '#F0E9DF', fontSize, lineHeight: fontSize * 1.18 }]}>{title}</ThemedText>
        </View>
        <View style={styles.footerSlot}>
          {book.series || book.volumeNumber ? <ThemedText numberOfLines={1} style={[styles.series, { color: `${palette.accent}DC` }]}>
            {[book.series, book.volumeNumber ? `VOL. ${book.volumeNumber}` : null].filter(Boolean).join(' · ')}
          </ThemedText> : null}
          {book.author ? <ThemedText numberOfLines={1} ellipsizeMode="tail" style={styles.author}>{book.author}</ThemedText> : null}
        </View>
      </View>
    </>}
    {favorite ? <View style={[styles.favorite, { backgroundColor: theme.background }]}>
      <SymbolView name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }} size={13} tintColor={theme.accent} />
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 2 / 3, borderWidth: Borders.subtle, borderRadius: Radii.medium, overflow: 'hidden', position: 'relative' },
  spineLine: { position: 'absolute', top: '8%', bottom: '8%', left: '10%', width: 1, borderLeftWidth: 1, borderRightWidth: 1 },
  cornerTop: { position: 'absolute', top: '7%', right: '9%', width: '24%', alignItems: 'center', gap: 1 },
  cornerBottom: { position: 'absolute', bottom: '6%', left: '19%', right: '9%', flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  ornamentLine: { width: '100%', height: 1 }, sparkle: { fontSize: 10, lineHeight: 12 }, sparkleSmall: { fontSize: 8, lineHeight: 10 },
  safeContent: { position: 'absolute', top: '8%', bottom: '9%', left: '18%', right: '8%', alignItems: 'center' },
  emblemSlot: { flex: 0.8, minHeight: 0, justifyContent: 'center', alignItems: 'center' },
  emblemRing: { width: 24, height: 24, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emblem: { fontSize: 13, lineHeight: 17, textAlign: 'center' },
  titleSlot: { flex: 1.5, minHeight: 0, width: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  title: { width: '100%', maxWidth: '100%', flexShrink: 1, textAlign: 'center', fontFamily: 'serif', fontWeight: '600', includeFontPadding: false },
  footerSlot: { flex: 0.65, minHeight: 0, width: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 2, paddingBottom: 2 },
  series: { maxWidth: '100%', fontSize: 6, lineHeight: 8, letterSpacing: 0.35, textAlign: 'center' },
  author: { maxWidth: '100%', fontSize: 7, lineHeight: 9, color: '#D1C7D2', textAlign: 'center' },
  favorite: { position: 'absolute', top: 5, right: 5, width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
