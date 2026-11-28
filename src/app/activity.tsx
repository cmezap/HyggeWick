import { useFocusEffect, usePathname, useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BookCover } from '@/components/book-cover';
import { ThemedView } from '@/components/themed-view';
import { Button, ProgressBar, Surface } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { getLibraryBooks } from '@/features/library/document-storage';
import { formatReadingTime, summarizeReadingProgress, type Book } from '@/features/library/book-repository';
import { openBook as openLibraryBook } from '@/features/library/open-book';
import { Layout, Radii, Spacing } from '@/theme';

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-CO').format(value);
}

export default function ActivityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const wide = width >= Layout.tabletBreakpoint;
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      setBooks(await getLibraryBooks());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadBooks(); }, [loadBooks]));

  const overview = summarizeReadingProgress(books);
  const inProgress = books.filter((book) => book.readingState === 'reading');
  const completed = books.filter((book) => book.readingState === 'finished');
  const pending = books.filter((book) => book.readingState === 'pending');
  const columns = width >= 1000 ? 5 : width >= 740 ? 4 : width >= 520 ? 3 : 2;
  const completedRows = chunkBooks(completed, columns);
  const pendingRows = chunkBooks(pending, columns);

  const openDetails = (book: Book) => {
    router.push({ pathname: '/book/[id]', params: { id: book.id } } as unknown as Href);
  };

  const continueBook = (book: Book) => {
    openLibraryBook(book, pathname);
  };

  const startBook = (book: Book) => {
    openLibraryBook(book, pathname, 1);
  };

  return <ThemedView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <View style={styles.heading}>
          <View style={[styles.headingSigil, { backgroundColor: theme.surfaceSelected }]}>
            <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={23} tintColor={theme.accent} />
          </View>
          <View style={styles.headingCopy}>
            <ThemedText type="title">Tu progreso</ThemedText>
            <ThemedText themeColor="textSecondary">Cada página te acerca un poco más a otra historia.</ThemedText>
            <ThemedText type="small" themeColor="textMuted">{overview.totalBooks} {overview.totalBooks === 1 ? 'libro en tu estante' : 'libros en tu estante'}</ThemedText>
          </View>
        </View>

        {loading ? <Surface variant="subtle" style={styles.loadingCard}>
          <ActivityIndicator color={theme.accent} />
          <ThemedText themeColor="textMuted">Contando páginas y lecturas…</ThemedText>
        </Surface> : error ? <Surface variant="subtle" style={styles.messageCard}>
          <ThemedText themeColor="error" accessibilityRole="alert">No pudimos cargar tu progreso.</ThemedText>
          <Button title="Volver a intentar" size="small" variant="ghost" onPress={() => void loadBooks()} />
        </Surface> : <>
          <Surface variant="elevated" style={styles.overviewCard}>
            <View style={styles.overviewHeading}>
              <View style={styles.overviewCopy}>
                <ThemedText type="smallBold" themeColor="accentSoft">✦  AVANCE DE TU ESTANTE</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">Porcentaje de páginas en libros con total conocido</ThemedText>
              </View>
              <ThemedText style={[styles.overviewPercent, { color: theme.accent }]}>
                {overview.globalProgress == null ? '—' : `${Math.round(overview.globalProgress * 100)}%`}
              </ThemedText>
            </View>
            <ProgressBar value={(overview.globalProgress ?? 0) * 100} max={100}
              accessibilityLabel="Avance global de lectura" size="medium" />
            <View style={styles.pageCountRow}>
              <ThemedText type="small" themeColor="textSecondary">
                {overview.knownTotalPages > 0
                  ? `${formatNumber(overview.pagesRead)} de ${formatNumber(overview.knownTotalPages)} páginas`
                  : 'Aún no hay totales de páginas disponibles'}
                {overview.totalReadingTimeSeconds > 0 ? `  ·  ${formatReadingTime(overview.totalReadingTimeSeconds)} leídos` : ''}
              </ThemedText>
              {overview.booksWithoutPageCount > 0 ? <ThemedText type="small" themeColor="textMuted">
                {overview.booksWithoutPageCount} {overview.booksWithoutPageCount === 1 ? 'libro sin total' : 'libros sin total'}
              </ThemedText> : null}
            </View>
          </Surface>

          <View style={[styles.statsRow, wide && styles.statsRowWide]}>
            <StatCard label="Pendientes" count={overview.pendingBooks} glyph="✧" color={theme.textSecondary} />
            <StatCard label="Leyendo" count={overview.readingBooks} glyph="☾" color={theme.accentLavender} />
            <StatCard label="Terminados" count={overview.finishedBooks} glyph="✦" color={theme.accent} />
          </View>

          {overview.totalBooks === 0 ? <Surface variant="subtle" style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceSelected }]}>
              <SymbolView name={{ ios: 'books.vertical', android: 'library_books', web: 'menu_book' }} size={26} tintColor={theme.accentSoft} />
            </View>
            <ThemedText type="subtitle" style={styles.emptyTitle}>Tu estante empieza aquí</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyCopy}>Cuando agregues un libro, sus páginas encontrarán un lugar en este rincón.</ThemedText>
            <Button title="Ir a Biblioteca" onPress={() => router.push('/library' as Href)} />
          </Surface> : <>
            <View style={styles.section}>
              <SectionHeading title="Entre páginas" count={inProgress.length} accent={theme.accentLavender} />
              {inProgress.length ? inProgress.map((book) => <ProgressBookCard key={book.id} book={book}
                onDetails={() => openDetails(book)} onContinue={() => continueBook(book)} />)
                : <EmptySection copy="Todavía no hay lecturas en curso. Cuando abras un libro, lo encontrarás aquí." />}
            </View>

            <View style={styles.section}>
              <SectionHeading title="Historias terminadas" count={completed.length} accent={theme.accent} />
              {completed.length ? <View style={styles.compactGrid}>
                {completedRows.map((row, rowIndex) => <View key={`completed-${rowIndex}`} style={styles.compactRow}>
                  {row.map((book) => <CompactBookCard key={book.id} book={book} action="details" onDetails={() => openDetails(book)} />)}
                  {row.length < columns ? <View style={{ flex: columns - row.length }} /> : null}
                </View>)}
              </View> : <EmptySection copy="Tus libros completados se reunirán aquí, como pequeñas luces en el estante." />}
            </View>

            <View style={styles.section}>
              <SectionHeading title="Por descubrir" count={pending.length} accent={theme.textSecondary} />
              {pending.length ? <View style={styles.compactGrid}>
                {pendingRows.map((row, rowIndex) => <View key={`pending-${rowIndex}`} style={styles.compactRow}>
                  {row.map((book) => <CompactBookCard key={book.id} book={book} action="start" onDetails={() => openDetails(book)} onStart={() => startBook(book)} />)}
                  {row.length < columns ? <View style={{ flex: columns - row.length }} /> : null}
                </View>)}
              </View> : <EmptySection copy="Has comenzado todas las historias de tu biblioteca." />}
            </View>
          </>}
        </>}
      </View>
    </ScrollView>
  </ThemedView>;
}

function StatCard({ label, count, glyph, color }: { label: string; count: number; glyph: string; color: string }) {
  return <Surface variant="subtle" style={styles.statCard}>
    <ThemedText style={[styles.statGlyph, { color }]}>{glyph}</ThemedText>
    <ThemedText style={styles.statCount}>{count}</ThemedText>
    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{label}</ThemedText>
  </Surface>;
}

function SectionHeading({ title, count, accent }: { title: string; count: number; accent: string }) {
  return <View style={styles.sectionHeading}>
    <ThemedText type="subtitle">{title}</ThemedText>
    <ThemedText type="smallBold" style={{ color: accent }}>{count}</ThemedText>
  </View>;
}

function ProgressBookCard({ book, onDetails, onContinue }: { book: Book; onDetails: () => void; onContinue: () => void }) {
  const theme = useTheme();
  const percent = Math.round(book.readingProgress * 100);
  return <Surface variant="subtle" style={styles.progressBookCard}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver ficha de ${book.title}`} onPress={onDetails}>
      <BookCover book={book} style={styles.progressCover} />
    </Pressable>
    <View style={styles.progressBookInfo}>
      <Pressable accessibilityRole="button" onPress={onDetails}>
        <ThemedText type="smallBold" numberOfLines={2}>{book.title.replace(/\.pdf$/i, '')}</ThemedText>
      </Pressable>
      <ThemedText type="small" themeColor="textSecondary">
        {book.totalPages ? `Página ${book.currentPage} de ${book.totalPages}` : `Página ${book.currentPage} · total por conocer`}
        {book.readingTimeSeconds > 0 ? `  ·  ${formatReadingTime(book.readingTimeSeconds, true)}` : ''}
      </ThemedText>
      <View style={styles.bookProgressLine}>
        <ProgressBar value={percent} accessibilityLabel={`Progreso de ${book.title}`} />
        <ThemedText type="smallBold" themeColor="accentSoft">{book.totalPages ? `${percent}%` : '—'}</ThemedText>
      </View>
      {book.status === 'missing' ? <ThemedText type="small" themeColor="error">PDF no disponible</ThemedText> : null}
      <View style={styles.bookCardActions}>
        <Button title="Ficha" size="small" variant="ghost" onPress={onDetails} />
        {book.status === 'available' ? <Button title="Continuar" size="small" onPress={onContinue} /> : null}
      </View>
    </View>
  </Surface>;
}

function chunkBooks(books: Book[], columns: number) {
  const rows: Book[][] = [];
  for (let index = 0; index < books.length; index += columns) rows.push(books.slice(index, index + columns));
  return rows;
}

function CompactBookCard({ book, action, onDetails, onStart }: {
  book: Book; action: 'details' | 'start'; onDetails: () => void; onStart?: () => void;
}) {
  const theme = useTheme();
  return <View style={[styles.compactBookCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver ficha de ${book.title}`} onPress={onDetails}
      style={({ pressed }) => [styles.compactBookContent, pressed && styles.pressed]}>
      <BookCover book={book} style={styles.compactCover} />
      <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="tail" style={styles.compactTitle}>{book.title.replace(/\.pdf$/i, '')}</ThemedText>
      <ThemedText type="small" themeColor="textMuted">{action === 'start' ? 'Aún por abrir' : 'Lectura completa'}</ThemedText>
    </Pressable>
    {action === 'start' ? <Button title={book.status === 'available' ? 'Comenzar' : 'Ver ficha'} size="small"
      variant={book.status === 'available' ? 'ghost' : 'secondary'} onPress={book.status === 'available' ? onStart : onDetails} /> : null}
  </View>;
}

function EmptySection({ copy }: { copy: string }) {
  const theme = useTheme();
  return <View style={[styles.sectionEmpty, { borderColor: theme.border }]}>
    <ThemedText style={{ color: theme.accentSoft }}>✧</ThemedText>
    <ThemedText type="small" themeColor="textMuted" style={styles.sectionEmptyCopy}>{copy}</ThemedText>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, minWidth: 0 },
  scrollContent: { flexGrow: 1, paddingHorizontal: Layout.phoneHorizontalMargin, paddingVertical: Spacing.four },
  content: { width: '100%', maxWidth: Layout.contentMaxWidth, alignSelf: 'center', gap: Spacing.four },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headingSigil: { width: 50, height: 50, borderRadius: Radii.large, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1, minWidth: 0, gap: Spacing.one },
  overviewCard: { gap: Spacing.three, padding: Spacing.four },
  overviewHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, overviewCopy: { flex: 1, minWidth: 0, gap: Spacing.one },
  overviewPercent: { fontFamily: 'serif', fontSize: 33, lineHeight: 40, fontWeight: '700' },
  pageCountRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.one },
  statsRow: { flexDirection: 'row', gap: Spacing.two }, statsRowWide: { gap: Spacing.three },
  statCard: { flex: 1, minWidth: 0, paddingVertical: Spacing.two, paddingHorizontal: Spacing.one, alignItems: 'center', gap: 2, borderRadius: Radii.medium },
  statGlyph: { fontSize: 14, lineHeight: 17 }, statCount: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  section: { gap: Spacing.two }, sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  progressBookCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  progressCover: { width: 64, height: 96, flexShrink: 0 }, progressBookInfo: { flex: 1, minWidth: 0, gap: Spacing.one },
  bookProgressLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bookCardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  compactGrid: { gap: Spacing.two }, compactRow: { flexDirection: 'row', gap: Spacing.two },
  compactBookCard: { flex: 1, minWidth: 0, padding: Spacing.two, borderWidth: 1, borderRadius: Radii.medium, alignItems: 'flex-start', gap: Spacing.one },
  compactBookContent: { width: '100%', minWidth: 0, alignItems: 'stretch', gap: Spacing.one },
  compactCover: { width: 52, height: 78, flexShrink: 0, alignSelf: 'center' }, compactTitle: { width: '100%', height: 20, flexShrink: 0 }, startLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  sectionEmpty: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radii.medium },
  sectionEmptyCopy: { flex: 1, lineHeight: 19 }, pressed: { opacity: 0.78 },
  loadingCard: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  messageCard: { alignItems: 'flex-start', gap: Spacing.two },
  emptyState: { minHeight: 320, alignItems: 'center', justifyContent: 'center', padding: Spacing.five, gap: Spacing.three },
  emptyIcon: { width: 60, height: 60, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { textAlign: 'center' }, emptyCopy: { maxWidth: 380, textAlign: 'center', lineHeight: 22 },
});
