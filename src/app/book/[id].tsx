import { Stack, useFocusEffect, useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { BookCover } from '@/components/book-cover';
import { ThemedView } from '@/components/themed-view';
import { ReadingNoteEditor } from '@/components/reading-note-editor';
import { Button, IconButton, Surface } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { getBookById, type Book } from '@/features/library/book-repository';
import { deleteFavoriteQuote, getFavoriteQuotes, type FavoriteQuote } from '@/features/library/quote-repository';
import { deleteReadingBookmark, getReadingBookmarks, type ReadingBookmark } from '@/features/library/bookmark-repository';
import { deleteReadingNote, getReadingNotes, updateReadingNote, type ReadingNote } from '@/features/library/reading-note-repository';
import { deleteReadingHighlight, getReadingHighlights, HIGHLIGHT_COLORS, updateReadingHighlightColor, type ReadingHighlight } from '@/features/library/highlight-repository';
import { openBook as openLibraryBook } from '@/features/library/open-book';
import { Borders, Layout, Radii, Spacing, Typography } from '@/theme';

export default function BookDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
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

  return <ThemedView style={styles.screen}>
    <Stack.Screen options={{ title: book?.title ?? 'Libro', headerShown: false }} />
    <View style={[styles.topBar, { borderBottomColor: theme.divider }]}>
      <IconButton accessibilityLabel="Volver" variant="subtle" onPress={goBack}
        icon={<SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={21} tintColor={theme.accent} />} />
      <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>Ficha del libro</ThemedText>
      <View style={styles.topBarSpacer} />
    </View>
    {loading ? <View style={styles.loading}><ActivityIndicator color={theme.accent} /></View> : book ? <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.content, landscape && styles.landscapeContent]}>
        <View style={[styles.hero, landscape && styles.landscapeHero]}>
          <BookCover book={book} style={styles.cover} />
          <View style={styles.heroCopy}>
            <ThemedText type="title" style={styles.title}>{book.title.replace(/\.pdf$/i, '')}</ThemedText>
            {book.author ? <ThemedText type="subtitle" themeColor="textSecondary" style={styles.author}>{book.author}</ThemedText> : null}
            {book.genre ? <View style={[styles.genreChip, { backgroundColor: theme.surfaceSelected }]}><ThemedText type="small" themeColor="accentSoft" numberOfLines={1}>{book.genre}</ThemedText></View> : null}
            {book.series || book.volumeNumber ? <ThemedText type="small" themeColor="textMuted">
              {[book.series, book.volumeNumber ? `Vol. ${book.volumeNumber}` : null].filter(Boolean).join(' · ')}
            </ThemedText> : null}
            <View style={styles.primaryActions}>
              <Button title="Leer" onPress={readBook} icon={<SymbolView name={{ ios: 'book.fill', android: 'menu_book', web: 'menu_book' }} size={18} tintColor={theme.textOnAccent} />} />
              <Button title="Editar libro" variant="secondary" onPress={editBook} />
            </View>
          </View>
        </View>

        <Surface variant="subtle" style={styles.progressCard}>
          <View style={styles.progressHeading}><ThemedText type="smallBold">Tu lectura · {book.readingState === 'finished' ? 'Terminado' : book.readingState === 'reading' ? 'Leyendo' : 'Pendiente'}</ThemedText><ThemedText type="small" themeColor="accentSoft">{Math.round(book.readingProgress * 100)}%</ThemedText></View>
          <View style={[styles.progressTrack, { backgroundColor: theme.progressTrack }]}>
            <View style={[styles.progressFill, { width: `${Math.round(book.readingProgress * 100)}%`, backgroundColor: theme.progress }]} />
          </View>
          {book.totalPages ? <ThemedText type="small" themeColor="textMuted">Página {book.currentPage} de {book.totalPages}</ThemedText> : null}
        </Surface>

        {book.description ? <View style={styles.section}>
          <ThemedText type="subtitle">Sobre este libro</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.description}>{book.description}</ThemedText>
        </View> : null}

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <ThemedText type="subtitle">Frases guardadas</ThemedText>
            {quotes.length ? <ThemedText type="small" themeColor="textMuted">{quotes.length} {quotes.length === 1 ? 'favorita' : 'favoritas'}</ThemedText> : null}
          </View>
          {quotesLoading ? <View style={styles.quotesLoading}><ActivityIndicator color={theme.accent} /></View> : quotes.length ? quotes.map((quote) => (
            <Surface key={quote.id} variant="subtle" style={[styles.quoteCard, { borderColor: theme.border }]}>
              <View style={styles.quoteCardHeading}>
                <View style={[styles.quoteIcon, { backgroundColor: theme.surfaceSelected }]}>
                  <SymbolView name={{ ios: 'quote.opening', android: 'format_quote', web: 'format_quote' }} size={19} tintColor={theme.accentSoft} />
                </View>
                <View style={styles.quoteActions}>
                  {quote.page != null ? <Pressable accessibilityRole="button" accessibilityLabel={`Ir a la página ${quote.page}`} onPress={() => openQuotePage(quote)} style={[styles.pageChip, { backgroundColor: theme.surfaceSelected }]}>
                    <ThemedText type="small" themeColor="accentSoft">Página {quote.page}</ThemedText>
                  </Pressable> : null}
                  <IconButton accessibilityLabel="Eliminar frase" variant="subtle" onPress={() => removeQuote(quote)}
                    icon={<SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={18} tintColor={theme.textMuted} />} />
                </View>
              </View>
              <ThemedText style={[styles.quoteText, { color: theme.text }]}>{quote.text}</ThemedText>
              {quote.note ? <View style={[styles.noteBox, { borderLeftColor: theme.accentSoft, backgroundColor: theme.backgroundSecondary }]}>
                <ThemedText type="smallBold" themeColor="accentSoft">Tu nota</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.quoteNote}>{quote.note}</ThemedText>
              </View> : null}
            </Surface>
          )) : <Surface variant="subtle" style={styles.quotesEmpty}>
            <View style={[styles.quoteIcon, { backgroundColor: theme.surfaceSelected }]}>
              <SymbolView name={{ ios: 'quote.opening', android: 'format_quote', web: 'format_quote' }} size={21} tintColor={theme.accentSoft} />
            </View>
            <ThemedText type="smallBold" style={styles.quoteTitle}>Un rincón para tus palabras favoritas</ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.quoteCopy}>Mientras lees, toca el símbolo de cita para guardar un fragmento y una nota personal.</ThemedText>
          </Surface>}
          {quotesError ? <ThemedText type="small" themeColor="error" accessibilityRole="alert">{quotesError}</ThemedText> : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <ThemedText type="subtitle">Highlights</ThemedText>
            {highlights.length ? <ThemedText type="small" themeColor="textMuted">{highlights.length}</ThemedText> : null}
          </View>
          {highlightsLoading ? <View style={styles.quotesLoading}><ActivityIndicator color={theme.accent} /></View> : highlights.length ? highlights.map((highlight) => (
            <Surface key={highlight.id} variant="subtle" style={[styles.highlightCard, { borderColor: theme.border }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Abrir highlight de la página ${highlight.page}`} onPress={() => openHighlight(highlight)} style={styles.highlightInfo}>
                <ThemedText numberOfLines={3} style={styles.highlightText}>{highlight.text}</ThemedText>
                <ThemedText type="small" themeColor="textMuted">Página {highlight.page} · {new Date(highlight.createdAt).toLocaleDateString('es-CO')}</ThemedText>
              </Pressable>
              <View style={styles.highlightActions}>
                <Pressable accessibilityRole="button" accessibilityLabel="Cambiar color del highlight" onPress={() => changeHighlightColor(highlight)} style={[styles.highlightColor, { backgroundColor: highlight.color }]} />
                <IconButton accessibilityLabel="Eliminar highlight" variant="subtle" onPress={() => removeHighlight(highlight)}
                  icon={<SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={18} tintColor={theme.textMuted} />} />
              </View>
            </Surface>
          )) : <Surface variant="subtle" style={styles.quotesEmpty}>
            <View style={[styles.quoteIcon, { backgroundColor: theme.surfaceSelected }]}>
              <SymbolView name={{ ios: 'highlighter', android: 'border_color', web: 'border_color' }} size={20} tintColor={theme.accentSoft} />
            </View>
            <ThemedText type="smallBold" style={styles.quoteTitle}>Un rastro de tus lecturas</ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.quoteCopy}>Los fragmentos resaltados aparecerán aquí y podrás volver a su página.</ThemedText>
          </Surface>}
          {highlightsError ? <ThemedText type="small" themeColor="error" accessibilityRole="alert">{highlightsError}</ThemedText> : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <ThemedText type="subtitle">Marcadores de lectura</ThemedText>
            {bookmarks.length ? <ThemedText type="small" themeColor="textMuted">{bookmarks.length}</ThemedText> : null}
          </View>
          {bookmarksLoading ? <View style={styles.quotesLoading}><ActivityIndicator color={theme.accent} /></View> : bookmarks.length ? bookmarks.map((bookmark) => (
            <Surface key={bookmark.id} variant="subtle" style={[styles.bookmarkCard, { borderColor: theme.border }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Ir a ${bookmark.name}, página ${bookmark.page}`}
                onPress={() => openBookmarkPage(bookmark)} style={styles.bookmarkInfo}>
                <ThemedText type="smallBold" numberOfLines={2}>{bookmark.name}</ThemedText>
                <ThemedText type="small" themeColor="textMuted">Página {bookmark.page} · {new Date(bookmark.createdAt).toLocaleDateString('es-CO')}</ThemedText>
              </Pressable>
              <View style={styles.bookmarkActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Ir a la página ${bookmark.page}`} onPress={() => openBookmarkPage(bookmark)} style={[styles.pageChip, { backgroundColor: theme.surfaceSelected }]}>
                  <ThemedText type="small" themeColor="accentSoft">Ir</ThemedText>
                </Pressable>
                <IconButton accessibilityLabel="Eliminar marcador" variant="subtle" onPress={() => removeBookmark(bookmark)}
                  icon={<SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={18} tintColor={theme.textMuted} />} />
              </View>
            </Surface>
          )) : <Surface variant="subtle" style={styles.quotesEmpty}>
            <View style={[styles.quoteIcon, { backgroundColor: theme.surfaceSelected }]}>
              <SymbolView name={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }} size={21} tintColor={theme.accentSoft} />
            </View>
            <ThemedText type="smallBold" style={styles.quoteTitle}>Guarda tu lugar favorito</ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.quoteCopy}>Desde el lector puedes marcar una página y volver a ella cuando quieras.</ThemedText>
          </Surface>}
          {bookmarksError ? <ThemedText type="small" themeColor="error" accessibilityRole="alert">{bookmarksError}</ThemedText> : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <ThemedText type="subtitle">Notas de lectura</ThemedText>
            {notes.length ? <ThemedText type="small" themeColor="textMuted">{notes.length}</ThemedText> : null}
          </View>
          {notesLoading ? <View style={styles.quotesLoading}><ActivityIndicator color={theme.accent} /></View> : notes.length ? notes.map((note) => (
            <Surface key={note.id} variant="subtle" style={[styles.readingNoteCard, { borderColor: theme.border }]}>
              <View style={styles.readingNoteHeading}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Abrir página ${note.page}`} onPress={() => openNotePage(note)}
                  style={[styles.pageChip, { backgroundColor: theme.surfaceSelected }]}>
                  <ThemedText type="small" themeColor="accentSoft">Página {note.page}</ThemedText>
                </Pressable>
                <View style={styles.readingNoteActions}>
                  <IconButton accessibilityLabel="Editar nota" variant="subtle" onPress={() => { setEditingNote(note); setNoteEditorVisible(true); }}
                    icon={<SymbolView name={{ ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' }} size={18} tintColor={theme.accentSoft} />} />
                  <IconButton accessibilityLabel="Eliminar nota" variant="subtle" onPress={() => removeNote(note)}
                    icon={<SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={18} tintColor={theme.textMuted} />} />
                </View>
              </View>
              {note.title ? <ThemedText type="smallBold" numberOfLines={2}>{note.title}</ThemedText> : null}
              <ThemedText themeColor="textSecondary" numberOfLines={3} style={styles.readingNotePreview}>{note.content}</ThemedText>
              <ThemedText type="small" themeColor="textMuted">Editada el {new Date(note.updatedAt).toLocaleDateString('es-CO')}</ThemedText>
            </Surface>
          )) : <Surface variant="subtle" style={styles.quotesEmpty}>
            <View style={[styles.quoteIcon, { backgroundColor: theme.surfaceSelected }]}>
              <SymbolView name={{ ios: 'text.book.closed', android: 'auto_stories', web: 'auto_stories' }} size={21} tintColor={theme.accentSoft} />
            </View>
            <ThemedText type="smallBold" style={styles.quoteTitle}>Un margen para tus ideas</ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.quoteCopy}>Las reflexiones que escribas en el lector quedarán reunidas aquí.</ThemedText>
          </Surface>}
          {notesError ? <ThemedText type="small" themeColor="error" accessibilityRole="alert">{notesError}</ThemedText> : null}
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
  screen: { flex: 1, minWidth: 0 }, topBar: { minHeight: 52, paddingHorizontal: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderBottomWidth: Borders.subtle },
  topBarSpacer: { width: Layout.standardTouchTarget }, scrollContent: { flexGrow: 1, padding: Spacing.four },
  content: { width: '100%', maxWidth: 860, alignSelf: 'center', gap: Spacing.five }, landscapeContent: { maxWidth: 980 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four }, landscapeHero: { alignItems: 'flex-start' },
  cover: { width: 124, minWidth: 124, alignSelf: 'flex-start', borderRadius: Radii.large, flexShrink: 0 },
  heroCopy: { flex: 1, minWidth: 0, gap: Spacing.two }, title: { fontSize: 27, lineHeight: 32 }, author: { fontSize: 17, lineHeight: 23 },
  genreChip: { alignSelf: 'flex-start', paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: Radii.pill },
  primaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  progressCard: { gap: Spacing.two }, progressHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 3 },
  section: { gap: Spacing.two }, description: { lineHeight: 25 }, sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  quotesEmpty: { alignItems: 'center', paddingVertical: Spacing.four, paddingHorizontal: Spacing.three, gap: Spacing.two, borderRadius: Radii.large },
  quotesLoading: { minHeight: 100, alignItems: 'center', justifyContent: 'center' },
  quoteCard: { gap: Spacing.three, padding: Spacing.three, borderRadius: Radii.large }, quoteCardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, quoteActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  bookmarkCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radii.large }, bookmarkInfo: { flex: 1, minWidth: 0, gap: Spacing.one }, bookmarkActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  highlightCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radii.large }, highlightInfo: { flex: 1, minWidth: 0, gap: Spacing.one }, highlightText: { fontFamily: Typography.literary.fontFamily, fontSize: 16, lineHeight: 24 }, highlightActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }, highlightColor: { width: 20, height: 20, borderRadius: Radii.pill, borderWidth: Borders.subtle, borderColor: 'rgba(255,255,255,0.5)' },
  readingNoteCard: { gap: Spacing.two, padding: Spacing.three, borderRadius: Radii.large }, readingNoteHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two }, readingNoteActions: { flexDirection: 'row', alignItems: 'center' }, readingNotePreview: { lineHeight: 22 },
  quoteIcon: { width: 38, height: 38, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' }, pageChip: { borderRadius: Radii.pill, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  quoteText: { fontFamily: Typography.literary.fontFamily, fontSize: 17, lineHeight: 26 }, noteBox: { borderLeftWidth: 2, borderRadius: Radii.medium, padding: Spacing.two, gap: Spacing.one }, quoteNote: { lineHeight: 21 }, quoteTitle: { textAlign: 'center' }, quoteCopy: { textAlign: 'center', maxWidth: 420 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.five, gap: Spacing.three },
  errorNotice: { position: 'absolute', bottom: Spacing.three, left: Spacing.three, right: Spacing.three, padding: Spacing.three, borderRadius: Radii.medium },
});
