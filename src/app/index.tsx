import { Link, useFocusEffect, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BookCover } from '@/components/book-cover';
import { ThemedView } from '@/components/themed-view';
import { Button, Surface } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { getLibraryBooks } from '@/features/library/document-storage';
import type { Book } from '@/features/library/book-repository';
import { openBook as openLibraryBook } from '@/features/library/open-book';
import { Borders, Layout, Radii, Spacing, Typography } from '@/theme';

const heroArtwork = require('../../assets/images/hyggewick-home-hero.webp');
const COVER_RATIO = 2 / 3;

export default function HomeScreen() {
  const theme = useTheme();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isWide = width >= Layout.tabletBreakpoint || (isLandscape && width >= 600);
  const heroLandscapeHeight = isWide ? Math.min(330, Math.max(270, height * 0.55)) : 290;

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [openNotice, setOpenNotice] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      setBooks(await getLibraryBooks());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadBooks(); }, [loadBooks]));

  const currentBook = books
    .filter((b) => b.readingState === 'reading' && b.status === 'available')
    .sort((a, b) => (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt))[0];

  // Prioriza lecturas retomadas y aperturas recientes sin convertir Home en otra biblioteca.
  const shelfBooks = books.filter((book) => book.status === 'available')
    .sort((a, b) => (b.lastOpenedAt ?? b.dateAdded).localeCompare(a.lastOpenedAt ?? a.dateAdded))
    .slice(0, isWide ? 6 : 4);

  const handleOpenBook = (book: Book) => {
    const issue = openLibraryBook(book, pathname);
    setOpenNotice(issue === 'missing' ? `No se encontró el PDF de “${book.title}”.` : issue === 'inaccessible' ? `No se pudo acceder al archivo de “${book.title}”.` : null);
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}>

        {/* ── TOP BAR (solo en horizontal / tablet) ── */}
        {isWide && (
          <View style={styles.landscapeHeaderBar}>
            <View style={{ flex: 1 }} />
            <View style={styles.headerIconsRow}>
              <View style={[styles.headerIconCircle, { backgroundColor: theme.surface }]}>
                <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={18} tintColor={theme.textSecondary} />
              </View>
              <View style={[styles.headerIconCircle, { backgroundColor: theme.surface }]}>
                <SymbolView name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }} size={18} tintColor={theme.textSecondary} />
              </View>
            </View>
          </View>
        )}

        {/* ── HERO ── */}
        {isWide ? (
          /* Landscape: Imagen centrada y con mayor protagonismo, sin zoom brusco */
          <View style={[styles.heroLandscape, { height: heroLandscapeHeight, backgroundColor: theme.background }]}>
            {/* Imagen centrada en el sector derecho/central con aire a los lados */}
            <View style={styles.heroArtworkWrapLandscape}>
              <Image
                source={heroArtwork}
                contentFit="contain"
                contentPosition="center"
                accessibilityLabel="El mago-vela de HyggeWick lee entre libros y luces mágicas"
                style={styles.heroArtworkLandscape}
              />
            </View>

            {/* Degradado lineal suave continuo que funde el fondo con la imagen */}
            <LinearGradient
              colors={[
                theme.background,
                theme.background,
                'rgba(1, 1, 11, 0.90)',
                'rgba(1, 1, 11, 0.50)',
                'rgba(1, 1, 11, 0.12)',
                'transparent',
              ]}
              locations={[0, 0.28, 0.44, 0.58, 0.72, 0.85]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Texto y acciones posicionados sobre el fondo oscuro */}
            <View style={styles.heroCopyLandscape}>
              <View style={styles.eyebrowRow}>
                <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>✦ TU REFUGIO ENTRE PÁGINAS</ThemedText>
                <View style={[styles.eyebrowLine, { backgroundColor: theme.border }]} />
              </View>
              <ThemedText style={styles.greetingLandscape}>Buenas noches, lector</ThemedText>
              <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
                Un mundo de historias te espera.
              </ThemedText>

              <View style={styles.actionsLandscape}>
                <Link href="/library" asChild>
                  <Button
                    title="Importar PDF"
                    icon={<SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={theme.textOnAccent} />}
                    style={styles.actionPrimary}
                  />
                </Link>
                <Link href="/library" asChild>
                  <Button title="Tu biblioteca" variant="ghost" style={styles.actionGhost} />
                </Link>
              </View>
            </View>
          </View>
        ) : (
          /* Portrait: Imagen nítida sin cortes, texto abajo */
          <View style={styles.heroPortrait}>
            <View style={styles.heroArtworkWrapPortrait}>
              <Image
                source={heroArtwork}
                contentFit="cover"
                accessibilityLabel="El mago-vela de HyggeWick lee entre libros y luces mágicas"
                style={styles.heroArtworkPortrait}
              />
            </View>
            <View style={styles.heroCopyPortrait}>
              <View style={styles.eyebrowRow}>
                <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>✦ TU REFUGIO ENTRE PÁGINAS</ThemedText>
                <View style={[styles.eyebrowLine, { backgroundColor: theme.border }]} />
              </View>
              <ThemedText style={styles.greeting}>Buenas noches, lector</ThemedText>
              <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
                Un mundo de historias te espera.
              </ThemedText>

              <View style={styles.actions}>
                <Link href="/library" asChild>
                  <Button
                    title="Importar PDF"
                    icon={<SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={theme.textOnAccent} />}
                    style={styles.actionPrimary}
                  />
                </Link>
                <Link href="/library" asChild>
                  <Button title="Tu biblioteca" variant="ghost" style={styles.actionGhost} />
                </Link>
              </View>
            </View>
          </View>
        )}

        {/* ── SECCIONES ── */}
        <View style={[styles.sections, isWide && styles.sectionsWide]}>

          {/* ── CONTINÚA LEYENDO ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Continúa leyendo</ThemedText>
              <ThemedText style={[styles.sectionDot, { color: theme.accent }]}> ✦</ThemedText>
              <View style={[styles.sectionLine, { backgroundColor: theme.border }]} />
              <Link href="/library" asChild>
                <Button title="Ver todo →" variant="ghost" size="small" />
              </Link>
            </View>

            {loading ? (
              <Surface variant="subtle" style={styles.loadingCard}>
                <ActivityIndicator color={theme.accent} />
                <ThemedText themeColor="textMuted">Revisando tus estantes…</ThemedText>
              </Surface>
            ) : currentBook ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Continuar leyendo ${currentBook.title}`} onPress={() => handleOpenBook(currentBook)} style={StyleSheet.flatten([styles.readingCard, { backgroundColor: theme.surface, borderColor: theme.border }])}>
                  <BookCover book={currentBook} style={styles.readingCover} />
                  <View style={styles.readingInfo}>
                    <ThemedText style={styles.readingTitle} numberOfLines={1}>
                      {currentBook.title.replace(/\.pdf$/i, '')}
                    </ThemedText>
                    <ThemedText style={[styles.readingPct, { color: theme.textSecondary }]}>
                      {Math.round(currentBook.readingProgress * 100)}% leído
                    </ThemedText>
                    <View style={[styles.progressTrack, { backgroundColor: theme.progressTrack }]}>
                      <View style={[styles.progressFill, { width: `${Math.round(currentBook.readingProgress * 100)}%`, backgroundColor: theme.progress }]} />
                    </View>
                  </View>
                  <View style={[styles.readingArrow, { backgroundColor: theme.accentLavender }]}>
                    <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={theme.background} />
                  </View>
              </Pressable>
            ) : (
              <Surface variant="subtle" style={styles.emptyCard}>
                <View style={[styles.emptyIcon, { borderColor: theme.borderEmphasized }]}>
                  <SymbolView name={{ ios: 'book.closed', android: 'menu_book', web: 'menu_book' }} size={20} tintColor={theme.accentSoft} />
                </View>
                <View style={styles.emptyCopy}>
                  <ThemedText style={styles.emptyTitle}>Tu próxima aventura</ThemedText>
                  <ThemedText style={[styles.emptyBody, { color: theme.textSecondary }]}>
                    Importa un libro y comienza a leer.
                  </ThemedText>
                </View>
                <Link href="/library" asChild>
                  <Button title="Explorar" size="small" variant="secondary" />
                </Link>
              </Surface>
            )}

            {loadError ? (
              <ThemedText type="small" themeColor="error" accessibilityRole="alert">
                No pudimos cargar tus libros. Vuelve a abrir esta pantalla para intentarlo de nuevo.
              </ThemedText>
            ) : null}
          </View>

          {openNotice ? <Pressable accessibilityRole="button" onPress={() => setOpenNotice(null)}><ThemedText type="small" themeColor="error">{openNotice} · Cerrar</ThemedText></Pressable> : null}

          {/* ── TU BIBLIOTECA ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Libros recientes</ThemedText>
              <ThemedText style={[styles.sectionDot, { color: theme.accent }]}> ✦</ThemedText>
              <View style={[styles.sectionLine, { backgroundColor: theme.border }]} />
              <Link href="/library" asChild>
                <Button title="Ver todo →" variant="ghost" size="small" />
              </Link>
            </View>

            {/* Estante de libros con tamaño controlado y proporcionado */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.shelfContent, isWide && styles.shelfContentWide]}>
              {shelfBooks.map((book, i) => (
                <Pressable key={book.id} accessibilityRole="button" accessibilityLabel={`Abrir ${book.title}`} onPress={() => handleOpenBook(book)} style={[styles.shelfItem, isWide && styles.shelfItemWide]}>
                  <BookCover book={book} style={styles.shelfCover} />
                  <ThemedText numberOfLines={2} style={styles.shelfBookTitle}>{book.title.replace(/\.pdf$/i, '')}</ThemedText>
                  {book.readingProgress > 0 ? <ThemedText type="small" themeColor="textMuted">{Math.round(book.readingProgress * 100)}% leído</ThemedText> : null}
                </Pressable>
              ))}

              {/* Celda "Agregar más libros" con dimensiones proporcionales fijas */}
              <Link href="/library" asChild>
                <Pressable
                  style={StyleSheet.flatten([
                    styles.shelfItem,
                    isWide && styles.shelfItemWide,
                    styles.addCell,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ])}>
                  <ThemedText style={[styles.addIcon, { color: theme.textSecondary }]}>+</ThemedText>
                  <ThemedText style={[styles.addLabel, { color: theme.textSecondary }]}>
                    Agregar{'\n'}más libros
                  </ThemedText>
                </Pressable>
              </Link>
            </ScrollView>

            {books.length === 0 && !loading ? <Surface variant="subtle" style={styles.shelfEmptyCard}>
              <ThemedText type="small" themeColor="textSecondary">Tus historias aparecerán aquí cuando importes tu primer libro.</ThemedText>
              <Link href="/library" asChild><Button title="Importar desde Biblioteca" size="small" variant="secondary" /></Link>
            </Surface> : null}
            {loadError ? <ThemedText type="small" themeColor="textMuted">No se pudo actualizar la colección.</ThemedText> : null}
          </View>

        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: Spacing.five },
  scrollContentWide: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },

  /* Top Bar en horizontal */
  landscapeHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    marginBottom: Spacing.one,
  },
  headerIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Hero Portrait */
  heroPortrait: { width: '100%' },
  heroArtworkWrapPortrait: {
    width: '100%',
    aspectRatio: 1672 / 941,
    overflow: 'hidden',
  },
  heroArtworkPortrait: { width: '100%', height: '100%' },
  heroCopyPortrait: {
    paddingHorizontal: Layout.phoneHorizontalMargin,
    paddingTop: Spacing.three,
    gap: Spacing.one,
  },

  /* Hero Landscape: Centrado, con mayor protagonismo y aire a los lados */
  heroLandscape: {
    width: '100%',
    borderRadius: Radii.large,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  heroArtworkWrapLandscape: {
    position: 'absolute',
    right: Spacing.three,
    left: '22%',
    top: Spacing.two,
    bottom: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroArtworkLandscape: {
    width: '100%',
    height: '100%',
  },
  heroCopyLandscape: {
    maxWidth: 420,
    gap: Spacing.one,
    justifyContent: 'center',
    zIndex: 2,
    paddingLeft: Spacing.one,
  },

  /* Copy común */
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.one },
  eyebrow: { fontSize: 10, letterSpacing: 0.9, fontWeight: '600' },
  eyebrowLine: { flex: 1, height: 1, opacity: 0.4 },

  greeting: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: Typography.literary.fontFamily,
    color: '#E8DCFF',
    fontWeight: '600',
  },
  greetingLandscape: {
    fontSize: 25,
    lineHeight: 31,
    fontFamily: Typography.literary.fontFamily,
    color: '#E8DCFF',
    fontWeight: '600',
  },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 2 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  actionsLandscape: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  actionPrimary: { minWidth: 140, borderRadius: Radii.pill },
  actionGhost: { minWidth: 130, borderRadius: Radii.pill, borderWidth: 1, borderColor: '#4A3870' },

  /* Secciones */
  sections: { paddingHorizontal: Layout.phoneHorizontalMargin, gap: Spacing.three, marginTop: Spacing.three },
  sectionsWide: { paddingHorizontal: 0, marginTop: Spacing.two },
  section: { gap: Spacing.two },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontFamily: Typography.literary.fontFamily, fontWeight: '600' },
  sectionDot: { fontSize: 13 },
  sectionLine: { flex: 1, height: 1, opacity: 0.4, marginHorizontal: Spacing.one },

  /* Tarjeta de lectura */
  loadingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, minHeight: 90, padding: Spacing.three },
  readingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radii.large,
    borderWidth: Borders.subtle,
  },
  readingCover: { width: 64, minWidth: 64, aspectRatio: COVER_RATIO, flexShrink: 0 },
  readingInfo: { flex: 1, minWidth: 0, gap: 4 },
  readingTitle: { fontSize: 15, lineHeight: 20, fontFamily: Typography.literary.fontFamily, fontWeight: '600' },
  readingPct: { fontSize: 12, lineHeight: 16 },
  progressTrack: { height: 4, borderRadius: Radii.pill, overflow: 'hidden', marginTop: 2 },
  progressFill: { height: '100%', borderRadius: Radii.pill },
  readingArrow: {
    width: 32,
    height: 32,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: Spacing.one,
  },

  /* Estado vacío */
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
  emptyIcon: { width: 44, height: 44, borderRadius: Radii.pill, borderWidth: Borders.subtle, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emptyCopy: { flex: 1, minWidth: 0, gap: 2 },
  emptyTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  emptyBody: { fontSize: 13, lineHeight: 18 },

  /* Estantes de biblioteca: tamaño controlado que no explota en tablet */
  shelfContent: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  shelfContentWide: {
    gap: Spacing.three,
  },
  shelfItem: {
    width: 96,
    flexShrink: 0,
  },
  shelfItemWide: {
    width: 104,
    flexShrink: 0,
  },
  shelfCover: {
    width: '100%',
    aspectRatio: COVER_RATIO,
  },
  addCell: {
    aspectRatio: COVER_RATIO,
    borderRadius: Radii.medium,
    borderWidth: Borders.subtle,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addIcon: { fontSize: 22, lineHeight: 26 },
  addLabel: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
  shelfEmptyCard: { marginTop: Spacing.one, padding: Spacing.three, gap: Spacing.two, alignItems: 'flex-start' },
  shelfBookTitle: { marginTop: Spacing.one, fontSize: 12, lineHeight: 16, fontFamily: Typography.literary.fontFamily },

});
