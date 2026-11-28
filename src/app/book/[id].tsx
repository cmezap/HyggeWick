import { Stack, useFocusEffect, useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { BookCover } from '@/components/book-cover';
import { ThemedView } from '@/components/themed-view';
import { ReadingNoteEditor } from '@/components/reading-note-editor';
import { Button, IconButton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { formatReadingTime, getBookById, setBookFavorite, type Book } from '@/features/library/book-repository';
import { deleteFavoriteQuote, getFavoriteQuotes, type FavoriteQuote } from '@/features/library/quote-repository';
import { deleteReadingBookmark, getReadingBookmarks, type ReadingBookmark } from '@/features/library/bookmark-repository';
import { deleteReadingNote, getReadingNotes, updateReadingNote, type ReadingNote } from '@/features/library/reading-note-repository';
import { deleteReadingHighlight, getReadingHighlights, HIGHLIGHT_COLORS, updateReadingHighlightColor, type ReadingHighlight } from '@/features/library/highlight-repository';
import { openBook as openLibraryBook } from '@/features/library/open-book';
import { getBookReadingActivity, type BookReadingDay } from '@/features/profile/profile-repository';
import { Borders, Layout, Radii, Spacing, Typography } from '@/theme';

type DetailSection = 'resumen' | 'actividad' | 'recuerdos' | 'diario';
type MemoryKind = 'Frase' | 'Highlight' | 'Nota' | 'Marcador';

export default function BookDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const sectionOffsets = useRef<Partial<Record<DetailSection, number>>>({});
  const progressValue = useSharedValue(0);
  const [activeSection, setActiveSection] = useState<DetailSection>('resumen');
  const [selectedActivityDate, setSelectedActivityDate] = useState<string | null>(null);
  const [memoryFilter, setMemoryFilter] = useState<MemoryKind | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<FavoriteQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<ReadingBookmark[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(true);
  const [bookmarksError, setBookmarksError] = useState<string | null>(null);
  const [notes, setNotes] = useState<ReadingNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<ReadingNote | null>(null);
  const [noteEditorVisible, setNoteEditorVisible] = useState(false);
  const [highlights, setHighlights] = useState<ReadingHighlight[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(true);
  const [highlightsError, setHighlightsError] = useState<string | null>(null);
  const [readingDays, setReadingDays] = useState<BookReadingDay[]>([]);
  const [showFullCollection, setShowFullCollection] = useState(false);

  useEffect(() => {
    if (!book) return;
    progressValue.value = reduceMotion
      ? book.readingProgress
      : withTiming(book.readingProgress, { duration: 560 });
  }, [book?.id, book?.readingProgress, reduceMotion]);

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(progressValue.value, 1)) * 100}%`,
  }));

  const scrollToSection = (section: DetailSection) => {
    setActiveSection(section);
    const y = sectionOffsets.current[section];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: !reduceMotion });
  };

  const recordSectionOffset = (section: DetailSection) => (event: { nativeEvent: { layout: { y: number } } }) => {
    sectionOffsets.current[section] = event.nativeEvent.layout.y;
  };

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError(null);
    setQuotesLoading(true); setQuotesError(null);
    setBookmarksLoading(true); setBookmarksError(null);
    setNotesLoading(true); setNotesError(null);
    setHighlightsLoading(true); setHighlightsError(null);
    setQuotes([]);
    setBookmarks([]);
    setNotes([]);
    setHighlights([]);
    setReadingDays([]);
    void getBookById(id).then(async (result) => {
      if (active) {
        setBook(result);
        if (!result) setError('No se encontró este libro en la biblioteca.');
      }
      if (result) {
        // Each repository can initialize a SQLite table on first access. Run
        // those migrations serially to avoid concurrent schema/transaction
        // races; keep showing genuine query failures for each section.
        try { const items = await getFavoriteQuotes(result.id); if (active) setQuotes(items); }
        catch { if (active) setQuotesError('No se pudieron cargar las frases guardadas.'); }
        try { const items = await getReadingBookmarks(result.id); if (active) setBookmarks(items); }
        catch { if (active) setBookmarksError('No se pudieron cargar los marcadores.'); }
        try { const items = await getReadingNotes(result.id); if (active) setNotes(items); }
        catch { if (active) setNotesError('No se pudieron cargar las notas de lectura.'); }
        try { const items = await getReadingHighlights(result.id); if (active) setHighlights(items); }
        catch { if (active) setHighlightsError('No se pudieron cargar los highlights.'); }
        try { const days = await getBookReadingActivity(result.id); if (active) setReadingDays(days); }
        catch { if (active) setReadingDays([]); }
      }
    }).catch(() => { if (active) setError('No se pudieron cargar los datos del libro.'); })
      .finally(() => { if (active) { setLoading(false); setQuotesLoading(false); setBookmarksLoading(false); setNotesLoading(false); setHighlightsLoading(false); } });
    return () => { active = false; };
  }, [id]));

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/library');
  };

  const readBook = () => {
    if (!book) return;
    const issue = openLibraryBook(book, pathname);
    if (issue === 'missing') setError(`No se encontró el PDF de “${book.title}”.`);
    else if (issue === 'inaccessible') setError(`No se pudo acceder al PDF de “${book.title}”.`);
  };

  const editBook = () => {
    if (book) router.push({ pathname: '/metadata/[id]', params: { id: book.id } } as unknown as Href);
  };

  const removeQuote = (quote: FavoriteQuote) => Alert.alert(
    'Eliminar frase', '¿Quieres quitar esta frase de tu colección?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => {
        void deleteFavoriteQuote(quote.id, quote.bookId).then(() => {
          setQuotes((current) => current.filter((item) => item.id !== quote.id));
          setQuotesError(null);
        }).catch(() => setQuotesError('No se pudo eliminar la frase. Inténtalo de nuevo.'));
      } },
    ],
  );

  const openQuotePage = (quote: FavoriteQuote) => {
    if (!book || quote.page == null) return;
    const issue = openLibraryBook(book, pathname, quote.page);
    if (issue === 'missing') setError(`No se encontró el PDF de “${book.title}”.`);
    else if (issue === 'inaccessible') setError(`No se pudo acceder al PDF de “${book.title}”.`);
  };

  const removeBookmark = (bookmark: ReadingBookmark) => Alert.alert(
    'Eliminar marcador', '¿Quieres quitar este marcador de lectura?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => {
        void deleteReadingBookmark(bookmark.id, bookmark.bookId).then(() => {
          setBookmarks((current) => current.filter((item) => item.id !== bookmark.id));
          setBookmarksError(null);
        }).catch(() => setBookmarksError('No se pudo eliminar el marcador. Inténtalo de nuevo.'));
      } },
    ],
  );

  const openBookmarkPage = (bookmark: ReadingBookmark) => {
    if (!book) return;
    const issue = openLibraryBook(book, pathname, bookmark.page);
    if (issue === 'missing') setError(`No se encontró el PDF de “${book.title}”.`);
    else if (issue === 'inaccessible') setError(`No se pudo acceder al PDF de “${book.title}”.`);
  };

  const removeNote = (note: ReadingNote) => Alert.alert(
    'Eliminar nota', '¿Quieres quitar esta reflexión de tu diario de lectura?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => {
        void deleteReadingNote(note.id, note.bookId).then(() => {
          setNotes((current) => current.filter((item) => item.id !== note.id));
          setNotesError(null);
        }).catch(() => setNotesError('No se pudo eliminar la nota. Inténtalo de nuevo.'));
      } },
    ],
  );

  const openNotePage = (note: ReadingNote) => {
    if (!book) return;
    const issue = openLibraryBook(book, pathname, note.page);
    if (issue === 'missing') setError(`No se encontró el PDF de “${book.title}”.`);
    else if (issue === 'inaccessible') setError(`No se pudo acceder al PDF de “${book.title}”.`);
  };

  const openHighlight = (highlight: ReadingHighlight) => {
    if (!book) return;
    const issue = openLibraryBook(book, pathname, highlight.page);
    if (issue === 'missing') setError(`No se encontró el PDF de “${book.title}”.`);
    else if (issue === 'inaccessible') setError(`No se pudo acceder al PDF de “${book.title}”.`);
  };

  const removeHighlight = (highlight: ReadingHighlight) => Alert.alert(
    'Eliminar highlight', '¿Quieres quitar este resaltado del libro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => {
        void deleteReadingHighlight(highlight.id, highlight.bookId).then(() => {
          setHighlights((current) => current.filter((item) => item.id !== highlight.id));
          setHighlightsError(null);
        }).catch(() => setHighlightsError('No se pudo eliminar el highlight. Inténtalo de nuevo.'));
      } },
    ],
  );

  const changeHighlightColor = (highlight: ReadingHighlight) => {
    const index = HIGHLIGHT_COLORS.indexOf(highlight.color as typeof HIGHLIGHT_COLORS[number]);
    const color = HIGHLIGHT_COLORS[(index + 1 + HIGHLIGHT_COLORS.length) % HIGHLIGHT_COLORS.length];
    void updateReadingHighlightColor(highlight.id, highlight.bookId, color).then(() => {
      setHighlights((current) => current.map((item) => item.id === highlight.id ? { ...item, color } : item));
    }).catch(() => setHighlightsError('No se pudo cambiar el color del highlight.'));
  };

  const saveNoteChanges = async ({ title, content }: { title: string; content: string }) => {
    if (!book || !editingNote) throw new Error('No se encontró la nota que quieres editar.');
    const updated = await updateReadingNote(editingNote.id, book.id, { title, content });
    setNotes((current) => current.map((item) => item.id === updated.id ? updated : item));
    setEditingNote(null);
    setNoteEditorVisible(false);
  };

  const toggleFavorite = async () => {
    if (!book) return;
    const next = !book.isFavorite;
    setBook({ ...book, isFavorite: next });
    try { await setBookFavorite(book.id, next); }
    catch { setBook({ ...book, isFavorite: !next }); setError('No se pudo actualizar el favorito.'); }
  };

  const chartDays = readingDays.slice(0, width < 420 ? 7 : 14);

  return <ThemedView style={styles.screen}>
    <Stack.Screen options={{ title: book?.title ?? 'Libro', headerShown: false }} />
    <View style={[styles.topBar, { borderBottomColor: theme.divider }]}>
      <IconButton accessibilityLabel="Volver" variant="subtle" onPress={goBack}
        icon={<SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={21} tintColor={theme.accent} />} />
      <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>Ficha del libro</ThemedText>
      <View style={styles.topBarSpacer} />
    </View>
    {book ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contextNav} style={[styles.contextNavScroll, { borderBottomColor: theme.divider }]}>
      {([
        ['resumen', 'Resumen', 'book.closed'],
        ['actividad', 'Actividad', 'chart.bar'],
        ['recuerdos', 'Recuerdos', 'quote.opening'],
        ['diario', 'Diario', 'calendar']
      ] as const).map(([section, label, symbol]) => <Pressable key={section} accessibilityRole="button" accessibilityState={{ selected: activeSection === section }}
        onPress={() => scrollToSection(section)} style={[styles.contextNavItem, activeSection === section && { borderBottomColor: theme.accent, borderBottomWidth: 2 }]}>
        <SymbolView name={{ ios: symbol, android: section === 'resumen' ? 'menu_book' : section === 'actividad' ? 'bar_chart' : section === 'recuerdos' ? 'format_quote' : 'calendar_month', web: section === 'resumen' ? 'menu_book' : section === 'actividad' ? 'bar_chart' : section === 'recuerdos' ? 'format_quote' : 'calendar_month' }} size={15} tintColor={activeSection === section ? theme.accent : theme.textMuted} />
        <ThemedText type="small" style={{ color: activeSection === section ? theme.text : theme.textMuted }}>{label}</ThemedText>
      </Pressable>)}
    </ScrollView> : null}
    {loading ? <View style={styles.loading}><ActivityIndicator color={theme.accent} /></View> : book ? <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
      onScroll={(event) => {
        // Keep the section tab in sync with the last section whose top has passed
        // the reading viewport's anchor line.
        const y = event.nativeEvent.contentOffset.y + 100;
        const ordered: DetailSection[] = ['resumen', 'actividad', 'recuerdos', 'diario'];
        let current: DetailSection = 'resumen';
        for (const section of ordered) if (sectionOffsets.current[section] != null && sectionOffsets.current[section]! <= y) current = section;
        if (current !== activeSection) setActiveSection(current);
      }} scrollEventThrottle={120}>
      <View style={[styles.content, landscape && styles.landscapeContent]}>
        <View onLayout={recordSectionOffset('resumen')} style={[styles.hero, landscape && styles.landscapeHero]}>
          <BookCover book={book} style={[styles.cover, landscape ? styles.coverLandscape : styles.coverPortrait]} />
          <View style={styles.heroCopy}>
            <ThemedText type="small" themeColor="accentSoft" style={styles.eyebrow}>TU BIBLIOTECA · {book.readingState === 'finished' ? 'TERMINADO' : book.readingState === 'reading' ? 'EN LECTURA' : 'PENDIENTE'}</ThemedText>
            <ThemedText type="title" style={styles.title}>{book.title.replace(/\.pdf$/i, '')}</ThemedText>
            {book.author ? <ThemedText type="subtitle" themeColor="textSecondary" style={styles.author}>{book.author}</ThemedText> : null}
            <ThemedText type="small" themeColor="textMuted">Añadido el {new Date(book.dateAdded).toLocaleDateString('es-CO')}</ThemedText>
            {book.genre || book.series || book.volumeNumber ? <ThemedText type="small" themeColor="textMuted">{[book.genre, book.series, book.volumeNumber ? `Vol. ${book.volumeNumber}` : null].filter(Boolean).join(' · ')}</ThemedText> : null}
            <View style={styles.primaryActions}>
              <Button title={book.readingState === 'pending' ? 'Comenzar a leer' : 'Continuar leyendo'} onPress={readBook} icon={<SymbolView name={{ ios: 'book.fill', android: 'menu_book', web: 'menu_book' }} size={18} tintColor={theme.textOnAccent} />} />
              <IconButton accessibilityLabel={book.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} variant="subtle" onPress={() => void toggleFavorite()}
                icon={<SymbolView name={{ ios: book.isFavorite ? 'heart.fill' : 'heart', android: book.isFavorite ? 'favorite' : 'favorite_border', web: book.isFavorite ? 'favorite' : 'favorite_border' }} size={21} tintColor={book.isFavorite ? theme.accentSoft : theme.textSecondary} />} />
              <Button title="Editar" variant="secondary" onPress={editBook} />
            </View>
          </View>
        </View>

        {book.description ? <View style={[styles.section, styles.descriptionSection]}>
          <ThemedText type="subtitle">Sobre esta historia</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.description}>{book.description}</ThemedText>
        </View> : null}

        <View style={[styles.progressSection, { borderTopColor: theme.divider, borderBottomColor: theme.divider }]}>
          <ThemedText type="subtitle">Tu recorrido</ThemedText>
          <View style={styles.statsRow}>
            <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(250)} style={styles.stat}><ThemedText style={styles.statValue}>{Math.round(book.readingProgress * 100)}%</ThemedText><ThemedText type="small" themeColor="textMuted">completado</ThemedText></Animated.View>
            <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(250).delay(35)} style={styles.stat}><ThemedText style={styles.statValue}>{book.currentPage}{book.totalPages ? <ThemedText style={styles.statTotal}> / {book.totalPages}</ThemedText> : null}</ThemedText><ThemedText type="small" themeColor="textMuted">página</ThemedText></Animated.View>
            <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(250).delay(70)} style={styles.stat}><ThemedText style={styles.statValue}>{formatReadingTime(book.readingTimeSeconds ?? 0, true)}</ThemedText><ThemedText type="small" themeColor="textMuted">tiempo acumulado</ThemedText></Animated.View>
            <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(250).delay(105)} style={styles.stat}><ThemedText style={styles.statValueSmall}>{book.lastOpenedAt ? new Date(book.lastOpenedAt).toLocaleDateString('es-CO') : '—'}</ThemedText><ThemedText type="small" themeColor="textMuted">última sesión</ThemedText></Animated.View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.progressTrack }]}><Animated.View style={[styles.progressFill, animatedProgressStyle, { backgroundColor: theme.progress }]} /></View>
        </View>

        <View onLayout={recordSectionOffset('actividad')} style={styles.section}>
          <View style={styles.activityHeading}>
            <View style={styles.sectionHeading}><ThemedText type="subtitle">Ritmo de lectura</ThemedText><ThemedText type="small" themeColor="textMuted">páginas con primera visita · día</ThemedText></View>
            <Image source={require('../../../assets/images/Hyggewick_icon.png')} contentFit="contain" accessibilityLabel="HyggeWick leyendo" style={styles.mascot} />
          </View>
          {readingDays.length >= 2 ? <View style={styles.chart}>
            {chartDays.slice().reverse().map((day) => {
              const max = Math.max(...chartDays.map((item) => item.pages.length), 1);
              const isPeak = day.pages.length === max;
              const selected = selectedActivityDate === day.date;
              const entering = reduceMotion ? undefined : FadeInDown.duration(320).delay(chartDays.length > 8 ? 0 : readingDays.indexOf(day) * 35);
              return <Animated.View key={day.date} entering={entering} style={styles.chartDay}>
                <ThemedText type="small" themeColor="textMuted">{day.pages.length}</ThemedText>
                <Pressable accessibilityRole="button" accessibilityLabel={`${day.pages.length} páginas registradas el ${new Date(`${day.date}T12:00:00`).toLocaleDateString('es-CO')}`} accessibilityState={{ selected }}
                  onPress={() => setSelectedActivityDate(selected ? null : day.date)} style={[styles.chartTrack, { backgroundColor: theme.progressTrack }]}>
                  <View style={[styles.chartBar, { height: `${Math.max(8, (day.pages.length / max) * 100)}%`, backgroundColor: isPeak ? theme.accent : theme.accentLavender }]} />
                  {selected ? <View style={[styles.chartSelection, { backgroundColor: theme.accent }]} /> : null}
                </Pressable>
                <ThemedText type="small" themeColor="textMuted">{width < 420 ? day.date.slice(8) : day.date.slice(5).replace('-', '/')}</ThemedText>
              </Animated.View>;
            })}
          </View> : <ThemedText type="small" themeColor="textMuted" style={styles.quietNote}>{readingDays.length === 1 ? 'Hay actividad registrada en un día. El gráfico aparecerá cuando haya más días de lectura.' : 'La actividad aparecerá aquí cuando avances páginas desde el lector. Solo se muestran visitas guardadas.'}</ThemedText>}
          {selectedActivityDate ? (() => {
            const selected = readingDays.find((day) => day.date === selectedActivityDate);
            return selected ? <ThemedText type="small" themeColor="textSecondary" style={styles.chartDetail}>{new Date(`${selected.date}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })} · {selected.pages.length} {selected.pages.length === 1 ? 'página registrada' : 'páginas registradas'} (págs. {selected.pages.slice(0, 8).join(', ')}{selected.pages.length > 8 ? '…' : ''})</ThemedText> : null;
          })() : null}
          {readingDays.length >= 2 ? <ThemedText type="small" themeColor="textMuted">Cada página se cuenta una vez, en el primer día que se registró.</ThemedText> : null}
        </View>

        <View onLayout={recordSectionOffset('diario')} style={styles.section}>
          <ThemedText type="subtitle">Diario de lectura</ThemedText>
          {readingDays.length ? <View style={[styles.timeline, { borderLeftColor: theme.divider }]}>
            {readingDays.slice(0, 8).map((day, index) => <Animated.View key={day.date} entering={reduceMotion ? undefined : FadeInUp.duration(260).delay(Math.min(index * 30, 150))} style={styles.timelineEntry}>
              <View style={[styles.timelineDot, { backgroundColor: theme.accentSoft }]} />
              <View style={styles.timelineCopy}><ThemedText type="smallBold">{new Date(`${day.date}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</ThemedText><ThemedText type="small" themeColor="textMuted">{day.pages.length} {day.pages.length === 1 ? 'página con primera visita' : 'páginas con primera visita'} · última: {Math.max(...day.pages)}</ThemedText></View>
            </Animated.View>)}
          </View>
          : <ThemedText type="small" themeColor="textMuted" style={styles.quietNote}>Tu recorrido aparecerá aquí cuando haya páginas visitadas guardadas. Todavía no hay suficientes registros.</ThemedText>}
          {readingDays.length ? <ThemedText type="small" themeColor="textMuted">El historial actual guarda la primera visita de cada página; no incluye sesiones ni duración diaria.</ThemedText> : null}
        </View>

        <View onLayout={recordSectionOffset('recuerdos')} style={[styles.section, { borderTopColor: theme.divider, borderTopWidth: Borders.subtle, paddingTop: Spacing.four }]}>
          <View style={styles.sectionHeading}><ThemedText type="subtitle">Lo que esta historia ha dejado en ti</ThemedText></View>
          <View style={styles.memoryCounts}>
            {([
              ['Frase', 'Frases', quotes.length, 'quote.opening', 'format_quote', '#D8B96E'],
              ['Highlight', 'Highlights', highlights.length, 'highlighter', 'ink_highlighter', '#91AA91'],
              ['Nota', 'Notas', notes.length, 'pencil', 'edit_note', '#C4AAEE'],
              ['Marcador', 'Marcadores', bookmarks.length, 'bookmark', 'bookmark', '#9B6FE0'],
            ] as const).map(([kind, label, count, iosSymbol, nativeSymbol, color], index) => <View key={kind} style={styles.memoryCountCell}>
              {index > 0 ? <View style={[styles.memoryCountDivider, { backgroundColor: theme.divider }]} /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`${count} ${label.toLowerCase()}`} accessibilityState={{ selected: memoryFilter === kind }}
                onPress={() => { setShowFullCollection(true); setMemoryFilter(memoryFilter === kind ? null : kind); }} style={styles.memoryCountButton}>
                <SymbolView name={{ ios: iosSymbol, android: nativeSymbol, web: nativeSymbol }} size={16} tintColor={color} />
                <ThemedText style={[styles.memoryCountValue, { color: theme.text }]}>{count}</ThemedText>
                <ThemedText type="small" style={{ color: theme.textMuted }}>{label}</ThemedText>
              </Pressable>
            </View>)}
          </View>
          {quotesLoading || highlightsLoading || notesLoading || bookmarksLoading ? <View style={styles.quotesLoading}><ActivityIndicator color={theme.accent} /></View> : null}
          {!quotesLoading && !highlightsLoading && !notesLoading && !bookmarksLoading && !quotes.length && !highlights.length && !notes.length && !bookmarks.length ? <ThemedText type="small" themeColor="textMuted" style={styles.quietNote}>Tus fragmentos, ideas y páginas guardadas se reunirán aquí mientras lees.</ThemedText> : null}
          {(() => {
            const latest: Array<{ kind: MemoryKind; date: string; text: string; page: number | null; run: () => void; remove: () => void; change?: () => void }> = [
              ...quotes.map((item) => ({ kind: 'Frase' as const, date: item.createdAt, text: item.text, page: item.page, run: () => openQuotePage(item), remove: () => removeQuote(item) })),
              ...highlights.map((item) => ({ kind: 'Highlight' as const, date: item.createdAt, text: item.text, page: item.page, run: () => openHighlight(item), remove: () => removeHighlight(item), change: () => changeHighlightColor(item) })),
              ...notes.map((item) => ({ kind: 'Nota' as const, date: item.updatedAt, text: item.content, page: item.page, run: () => { setEditingNote(item); setNoteEditorVisible(true); }, remove: () => removeNote(item) })),
              ...bookmarks.map((item) => ({ kind: 'Marcador' as const, date: item.createdAt, text: item.name, page: item.page, run: () => openBookmarkPage(item), remove: () => removeBookmark(item) })),
            ].sort((a, b) => b.date.localeCompare(a.date));
            const filtered = memoryFilter ? latest.filter((item) => item.kind === memoryFilter) : latest;
            const visible = showFullCollection ? filtered : filtered.slice(0, 1);
            return <>
              {visible.map((item, index) => <View key={`${item.kind}-${item.date}-${index}`} style={[styles.memoryEntry, { borderTopColor: theme.divider }]}>
                <Pressable accessibilityRole="button" onPress={item.run} style={styles.memoryText}>
                  <ThemedText type="small" themeColor="accentSoft">{item.kind}{item.page ? ` · Página ${item.page}` : ''}</ThemedText>
                  <ThemedText style={styles.memoryPreview} numberOfLines={showFullCollection ? 4 : 3}>{item.text}</ThemedText>
                </Pressable>
                {showFullCollection && item.change ? <IconButton accessibilityLabel="Cambiar color del highlight" variant="subtle" onPress={item.change} icon={<SymbolView name={{ ios: 'highlighter', android: 'ink_highlighter', web: 'ink_highlighter' }} size={18} tintColor={theme.accentSoft} />} /> : null}
                {showFullCollection ? <IconButton accessibilityLabel={`Eliminar ${item.kind.toLowerCase()}`} variant="subtle" onPress={item.remove} icon={<SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={18} tintColor={theme.textMuted} />} /> : null}
              </View>)}
              {filtered.length === 0 && memoryFilter ? <ThemedText type="small" themeColor="textMuted" style={styles.quietNote}>Todavía no hay recuerdos de esta categoría.</ThemedText> : null}
              {latest.length ? <View style={styles.collectionActions}>
                <Pressable accessibilityRole="button" onPress={() => { setMemoryFilter(null); setShowFullCollection((value) => !value); }} style={styles.collectionAction}><ThemedText type="smallBold" themeColor="accentSoft">{showFullCollection ? 'Mostrar último recuerdo' : `Ver colección completa · ${latest.length}`}</ThemedText></Pressable>
                {memoryFilter ? <Pressable accessibilityRole="button" onPress={() => setMemoryFilter(null)} style={styles.collectionAction}><ThemedText type="small" themeColor="textMuted">Ver todas las categorías</ThemedText></Pressable> : null}
              </View> : null}
            </>;
          })()}
          {[quotesError, highlightsError, notesError, bookmarksError].filter(Boolean).map((message, index) => <ThemedText key={index} type="small" themeColor="error" accessibilityRole="alert">{message}</ThemedText>)}
        </View>
      </View>
    </ScrollView> : <View style={styles.errorState}>
      <ThemedText type="subtitle">No encontramos este libro</ThemedText>
      <ThemedText themeColor="textSecondary">{error ?? 'Vuelve a la Biblioteca e inténtalo de nuevo.'}</ThemedText>
      <Button title="Volver a Biblioteca" onPress={() => router.replace('/library')} />
    </View>}
    {book && editingNote ? <ReadingNoteEditor visible={noteEditorVisible} bookTitle={book.title} page={editingNote.page} note={editingNote}
      onClose={() => { setNoteEditorVisible(false); setEditingNote(null); }} onSave={saveNoteChanges} /> : null}
    {error && book ? <Pressable style={[styles.errorNotice, { backgroundColor: theme.surfaceElevated }]} onPress={() => setError(null)}>
      <ThemedText type="small" themeColor="error">{error} · Cerrar</ThemedText>
    </Pressable> : null}
  </ThemedView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, minWidth: 0 },
  topBar: { minHeight: 50, paddingHorizontal: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderBottomWidth: Borders.subtle },
  topBarSpacer: { width: Layout.standardTouchTarget },
  contextNavScroll: { maxHeight: 43, borderBottomWidth: Borders.subtle, flexGrow: 0 },
  contextNav: { minWidth: '100%', paddingHorizontal: Spacing.four, flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: Spacing.five },
  contextNavItem: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderBottomWidth: 2, borderBottomColor: 'transparent', paddingHorizontal: Spacing.one },
  scrollContent: { flexGrow: 1, paddingHorizontal: Spacing.four, paddingVertical: Spacing.five },
  content: { width: '100%', maxWidth: 880, alignSelf: 'center', gap: Spacing.five },
  landscapeContent: { maxWidth: 1080, gap: Spacing.six },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  landscapeHero: { alignItems: 'center', gap: Spacing.five },
  cover: { width: 124, minWidth: 124, alignSelf: 'flex-start', borderRadius: Radii.medium, flexShrink: 0 },
  coverPortrait: { width: 94, minWidth: 94 }, coverLandscape: { width: 146, minWidth: 146 },
  heroCopy: { flex: 1, minWidth: 0, gap: Spacing.one },
  title: { fontFamily: Typography.literary.fontFamily, fontSize: 29, lineHeight: 34, marginTop: 1 },
  author: { fontSize: 17, lineHeight: 22 }, eyebrow: { letterSpacing: 1.5, fontSize: 10 },
  primaryActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  section: { gap: Spacing.two }, descriptionSection: { maxWidth: 760 }, description: { lineHeight: 25 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: Spacing.two },
  activityHeading: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  mascot: { width: 58, height: 58, flexShrink: 0 },
  progressSection: { borderTopWidth: Borders.subtle, borderBottomWidth: Borders.subtle, paddingVertical: Spacing.three, gap: Spacing.three },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.three, columnGap: Spacing.two },
  stat: { flexGrow: 1, flexBasis: 132, gap: 2 },
  statValue: { fontFamily: Typography.literary.fontFamily, fontSize: 26, lineHeight: 32 },
  statValueSmall: { fontFamily: Typography.literary.fontFamily, fontSize: 18, lineHeight: 32 },
  statTotal: { fontSize: 15, color: '#9B97AA' },
  progressTrack: { height: 3, overflow: 'hidden' }, progressFill: { height: '100%' },
  chart: { height: 144, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.two, paddingTop: Spacing.two },
  chartDay: { flex: 1, minWidth: 0, height: 130, justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  chartTrack: { width: '68%', maxWidth: 28, flex: 1, justifyContent: 'flex-end', overflow: 'hidden', position: 'relative' },
  chartBar: { width: '100%', minHeight: 3 }, chartSelection: { position: 'absolute', bottom: 0, left: -3, right: -3, height: 2 },
  chartDetail: { lineHeight: 20 }, quietNote: { lineHeight: 22, maxWidth: 640 },
  timeline: { borderLeftWidth: 1, marginLeft: 4, paddingLeft: Spacing.three, gap: Spacing.three },
  timelineEntry: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, marginLeft: -21 },
  timelineDot: { width: 7, height: 7, marginTop: 6 }, timelineCopy: { gap: 3 },
  memoryCounts: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between', marginVertical: Spacing.one },
  memoryCountCell: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  memoryCountDivider: { width: 1, alignSelf: 'stretch', marginRight: Spacing.two },
  memoryCountButton: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.one, paddingHorizontal: 2 },
  memoryCountValue: { fontFamily: Typography.literary.fontFamily, fontSize: 21, lineHeight: 25 },
  quotesLoading: { minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  memoryEntry: { borderTopWidth: Borders.subtle, paddingTop: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  memoryText: { flex: 1, minWidth: 0, gap: Spacing.one }, memoryPreview: { fontFamily: Typography.literary.fontFamily, fontSize: 17, lineHeight: 25 },
  collectionActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three },
  collectionAction: { alignSelf: 'flex-start', paddingVertical: Spacing.two },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.five, gap: Spacing.three },
  errorNotice: { position: 'absolute', bottom: Spacing.three, left: Spacing.three, right: Spacing.three, padding: Spacing.three, borderRadius: Radii.medium },
});
