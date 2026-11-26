import { type HighlightTappedEventPayload, type OnErrorEventPayload, type OnPageChangedEventPayload, type SelectionUnavailableEventPayload, type TextSelectionCancelledEventPayload, type TextSelectionEventPayload } from '@kishannareshpal/expo-pdf';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams, usePathname, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ReadingNoteEditor } from '@/components/reading-note-editor';
import { ReaderPdfView } from '@/components/reader-pdf-view';
import { Button, IconButton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { getBookById, updateLastOpenedAt, updateReadingProgress, type Book } from '@/features/library/book-repository';
import { addFavoriteQuote, getFavoriteQuotes, type FavoriteQuote } from '@/features/library/quote-repository';
import { getReadingBookmarkAtPage, getReadingBookmarks, saveReadingBookmark, type ReadingBookmark } from '@/features/library/bookmark-repository';
import { createReadingNote } from '@/features/library/reading-note-repository';
import { deleteReadingHighlight, getReadingHighlights, HIGHLIGHT_COLORS, saveReadingHighlight, updateReadingHighlightColor, type ReadingHighlight } from '@/features/library/highlight-repository';
import { recordReadingActivity } from '@/features/profile/profile-repository';
import { Borders, Spacing } from '@/theme';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
let readerSequence = 0;

export default function ReaderScreen() {
  const theme = useTheme();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const { bookId, returnTo, openId, page: pageParam } = useLocalSearchParams<{ bookId?: string | string[]; returnTo?: string | string[]; openId?: string | string[]; page?: string | string[] }>();
  const id = Array.isArray(bookId) ? bookId[0] : bookId;
  const origin = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const openInstance = Array.isArray(openId) ? openId[0] : openId;
  const requestedStartPage = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const parsedStartPage = Number(requestedStartPage);
  const startPage = Number.isInteger(parsedStartPage) && parsedStartPage > 0 ? parsedStartPage : null;
  const readerInstanceId = useRef<string | null>(null);
  if (readerInstanceId.current == null) readerInstanceId.current = `reader-${++readerSequence}`;
  const instanceId = readerInstanceId.current;
  const [book, setBook] = useState<Book | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [page, setPage] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [actionsMenuVisible, setActionsMenuVisible] = useState(false);
  const [annotationsMenuVisible, setAnnotationsMenuVisible] = useState(false);
  const [annotationListsLoading, setAnnotationListsLoading] = useState(false);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pageInput, setPageInput] = useState('');
  const [requestedPage, setRequestedPage] = useState<number | undefined>(undefined);
  const readerContext = useRef({ pathname, bookId: id, openId: openInstance, pageParam: startPage, currentPage: book?.currentPage, initialPage: startPage ?? book?.currentPage, requestedPage });
  readerContext.current = { pathname, bookId: id, openId: openInstance, pageParam: startPage, currentPage: book?.currentPage, initialPage: startPage ?? book?.currentPage, requestedPage };
  const readerOpenedAt = useRef<number | null>(null);
  const timingCounts = useRef<Record<string, number>>({});
  const logTiming = useCallback((event: string, details: Record<string, unknown> = {}) => {
    const count = (timingCounts.current[event] ?? 0) + 1;
    timingCounts.current[event] = count;
    const at = Date.now();
    console.info(`[Reader timing] ${event} #${count}`, {
      at,
      elapsedMs: at - (readerOpenedAt.current ?? at),
      readerInstanceId: instanceId,
      ...readerContext.current,
      ...details,
    });
  }, [instanceId]);
  const [quoteModalVisible, setQuoteModalVisible] = useState(false);
  const [quoteText, setQuoteText] = useState('');
  const [quoteNote, setQuoteNote] = useState('');
  const [savingQuote, setSavingQuote] = useState(false);
  const [bookmarkModalVisible, setBookmarkModalVisible] = useState(false);
  const [bookmarkName, setBookmarkName] = useState('');
  const [pageBookmark, setPageBookmark] = useState<ReadingBookmark | null>(null);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [noteEditorVisible, setNoteEditorVisible] = useState(false);
  const [noteInitialContent, setNoteInitialContent] = useState<string | undefined>(undefined);
  const [highlights, setHighlights] = useState<ReadingHighlight[]>([]);
  const [bookmarks, setBookmarks] = useState<ReadingBookmark[]>([]);
  const [quotes, setQuotes] = useState<FavoriteQuote[]>([]);
  const [selection, setSelection] = useState<TextSelectionEventPayload | null>(null);
  const [selectionMenuVisible, setSelectionMenuVisible] = useState(false);
  const [highlightPaletteVisible, setHighlightPaletteVisible] = useState(false);
  const [selectedHighlight, setSelectedHighlight] = useState<ReadingHighlight | null>(null);
  const [selectionClearToken, setSelectionClearToken] = useState(0);
  const [selectionCopyRequest, setSelectionCopyRequest] = useState<string | undefined>(undefined);
  const [savingHighlight, setSavingHighlight] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgress = useRef<{ id: string; page: number; total: number } | null>(null);
  const viewerLoaded = useRef(false);
  const initialPageChangePending = useRef(false);
  const initialTargetPage = useRef<number | null>(null);
  const pdfLoadHandled = useRef(false);
  const annotationListsBookId = useRef<string | null>(null);
  const pendingProgrammaticPage = useRef<number | null>(null);
  const mounted = useRef(true);
  const activityWriteFailed = useRef(false);
  const lastObservedPage = useRef<number | null>(null);
  const manualAdvanceTarget = useRef<number | null>(null);

  useEffect(() => {
    readerOpenedAt.current = Date.now();
    logTiming('Reader mounted');
  }, []);

  useEffect(() => {
    logTiming('requestedPage changed');
  }, [requestedPage, logTiming]);

  const flushPendingProgress = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const pending = pendingProgress.current;
    if (pending) void updateReadingProgress(pending.id, pending.page, pending.total);
  };
  const scheduleProgressSave = (bookId: string, nextPage: number, total: number) => {
    pendingProgress.current = { id: bookId, page: nextPage, total };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushPendingProgress, 700);
  };

  const returnToOrigin = () => {
    flushPendingProgress();
    if (origin?.startsWith('/') && !origin.startsWith('//') && !origin.includes('..')) {
      router.replace(origin as Href);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  useEffect(() => {
    let active = true;
    if (!id) {
      setLoadState('error');
      setErrorMessage('No se indicó qué libro abrir.');
      return () => { active = false; };
    }
    setLoadState('loading');
    viewerLoaded.current = false;
    initialPageChangePending.current = false;
    initialTargetPage.current = null;
    lastObservedPage.current = null;
    pendingProgrammaticPage.current = null;
    pdfLoadHandled.current = false;
    setRequestedPage(undefined);
    annotationListsBookId.current = null;
    void getBookById(id).then((result) => {
      if (!active) return;
      if (!result) {
        setLoadState('missing');
        return;
      }
      let exists = false;
      try { exists = result.status === 'available' && new File(result.filePath).exists; } catch { exists = false; }
      if (!exists) {
        setBook(result);
        setLoadState('missing');
        return;
      }
      logTiming('book data ready', { currentPage: result.currentPage, initialPage: startPage ?? result.currentPage });
      logTiming('URI ready', { uriAvailable: true });
      setBook(result);
      setHighlights([]);
      setBookmarks([]);
      setQuotes([]);
      setAnnotationListsLoading(false);
      setHighlightsLoading(true);
      setPageCount(result.totalPages);
      setPage(result.currentPage);
      setPageInput(String(result.currentPage));
      setLoadState('ready');
      void updateLastOpenedAt(result.id);
      void getReadingHighlights(result.id).then((items) => { if (active) setHighlights(items); }).catch(() => {
        if (active) Alert.alert('Highlights no disponibles', 'No se pudieron cargar los fragmentos guardados de este libro.');
      }).finally(() => { if (active) setHighlightsLoading(false); });
    }).catch(() => {
      if (active) {
        setLoadState('error');
        setErrorMessage('No se pudo recuperar el libro de la biblioteca.');
      }
    });
    return () => { active = false; };
  }, [id, logTiming, openInstance, startPage]);

  const handlePdfUriReceived = useCallback((uri: string) => {
    logTiming('PdfView receives URI', { uri });
    logTiming('initial target requested', { initialPage: startPage ?? book?.currentPage, prop: 'initialPage' });
  }, [book?.currentPage, logTiming, startPage]);

  const loadAnnotationLists = async () => {
    if (!book || annotationListsBookId.current === book.id) return;
    const requestedBookId = book.id;
    annotationListsBookId.current = requestedBookId;
    setAnnotationListsLoading(true);
    try {
      const bookmarkItems = await getReadingBookmarks(requestedBookId);
      const quoteItems = await getFavoriteQuotes(requestedBookId);
      if (annotationListsBookId.current === requestedBookId) {
        setBookmarks(bookmarkItems);
        setQuotes(quoteItems);
      }
    } catch {
      if (annotationListsBookId.current === requestedBookId) {
        annotationListsBookId.current = null;
        Alert.alert('Anotaciones no disponibles', 'No se pudieron cargar los marcadores y frases guardadas. Inténtalo de nuevo.');
      }
    } finally {
      if (annotationListsBookId.current === requestedBookId) setAnnotationListsLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      logTiming('Reader unmounted');
      mounted.current = false;
      viewerLoaded.current = false;
      flushPendingProgress();
    };
  }, []);

  const handlePageChanged = (event: OnPageChangedEventPayload, pdfViewInstanceId: string) => {
    logTiming('onPageChanged received', { pdfViewInstanceId, page: event.pageIndex, pageIndex: event.pageIndex, pageCount: event.pageCount });
    if (!viewerLoaded.current) return;
    const currentPage = event.pageIndex + 1;
    // PDFView can emit a delayed page-change event for its own initial/restored
    // page. That event is not evidence that the reader moved, so establish the
    // baseline without recording a reading activity.
    if (initialPageChangePending.current) {
      if (currentPage === initialTargetPage.current) {
        initialPageChangePending.current = false;
        lastObservedPage.current = currentPage;
        pendingProgrammaticPage.current = null;
        setRequestedPage(undefined);
      }
      return;
    }
    const previousPage = lastObservedPage.current ?? page;
    const manualArrowChange = manualAdvanceTarget.current === currentPage;
    const isProgrammaticTarget = pendingProgrammaticPage.current === currentPage;
    const isUserPageChange = (!isProgrammaticTarget && requestedPage == null) || manualArrowChange;
    lastObservedPage.current = currentPage;
    if (isProgrammaticTarget) pendingProgrammaticPage.current = null;
    if (manualArrowChange) manualAdvanceTarget.current = null;
    setRequestedPage(undefined);
    setPageBookmark(null);
    setPage(currentPage);
    setSelection(null);
    setSelectionMenuVisible(false);
    setSelectedHighlight(null);
    setPageCount(event.pageCount);
    setPageInput(String(currentPage));
    if (!selectionMenuVisible && !selectedHighlight) setControlsVisible(false);
    if (book) {
      scheduleProgressSave(book.id, currentPage, event.pageCount);
      if (isUserPageChange && previousPage != null && previousPage !== currentPage) {
        const visited = Math.abs(previousPage - currentPage) === 1 ? [previousPage, currentPage] : [currentPage];
        void recordReadingActivity(book.id, visited).catch((error: unknown) => {
          const detail = error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error), stack: undefined };
          console.error('[Reader activity] recordReadingActivity failed', {
            ...detail,
            bookId: book.id,
            previousPage,
            newPage: currentPage,
            pages: visited,
            pageCount: event.pageCount,
          });
          if (!activityWriteFailed.current) {
            activityWriteFailed.current = true;
            Alert.alert('Actividad no guardada', 'No pudimos guardar esta actividad de lectura en el dispositivo.');
          }
        });
      }
    }
  };

  const navigateToPage = (targetPage: number, countArrowNavigationAsReading = false) => {
    if (!pageCount || !Number.isInteger(targetPage) || targetPage < 1 || targetPage > pageCount) return false;
    setPageInput(String(targetPage));
    setPage(targetPage);
    if (book) scheduleProgressSave(book.id, targetPage, pageCount);
    manualAdvanceTarget.current = countArrowNavigationAsReading ? targetPage : null;
    pendingProgrammaticPage.current = targetPage;
    // The page prop is implemented by the bundled Expo PDF module native view.
    setRequestedPage(targetPage);
    return true;
  };

  const openAnnotationPage = (targetPage: number) => {
    if (navigateToPage(targetPage)) {
      setAnnotationsMenuVisible(false);
      setActionsMenuVisible(false);
    }
  };

  const jumpToPage = () => {
    const input = pageInput.trim();
    const requested = Number(input);
    if (!input || !Number.isInteger(requested) || !pageCount || requested < 1 || requested > pageCount) {
      Alert.alert('Página no válida', 'Escribe un número de página válido.');
      return;
    }
    navigateToPage(requested);
    Keyboard.dismiss();
  };

  const choosePersonalAction = (action: 'quote' | 'bookmark' | 'note') => {
    setActionsMenuVisible(false);
    setControlsVisible(true);
    if (action === 'quote') setQuoteModalVisible(true);
    else if (action === 'bookmark') void editPageBookmark();
    else setNoteEditorVisible(true);
  };

  const handlePdfError = (event: OnErrorEventPayload) => {
    if (!mounted.current) return;
    setLoadState('error');
    setErrorMessage(`No se pudo abrir el PDF: ${event.message}`);
  };

  const handlePdfLoaded = (event: { pageCount: number }, pdfViewInstanceId: string) => {
    if (!mounted.current) return;
    logTiming('PDF metadata ready', { pdfViewInstanceId, pageCount: event.pageCount });
    logTiming('PDF onLoad', { pdfViewInstanceId, pageCount: event.pageCount });
    if (pdfLoadHandled.current) {
      logTiming('duplicate PDF onLoad ignored', { pageCount: event.pageCount });
      return;
    }
    pdfLoadHandled.current = true;
    viewerLoaded.current = true;
    setPageCount(event.pageCount);
    if (book) {
      const restoredPage = Math.min(startPage ?? book.currentPage, event.pageCount);
      initialTargetPage.current = restoredPage;
      initialPageChangePending.current = restoredPage !== 1;
      logTiming('initial target completed', { targetPage: restoredPage, pageCount: event.pageCount });
      lastObservedPage.current = restoredPage;
      setPage(restoredPage);
      setPageInput(String(restoredPage));
      pendingProgress.current = { id: book.id, page: restoredPage, total: event.pageCount };
      void updateReadingProgress(book.id, restoredPage, event.pageCount);
    }
  };

  const handleTextSelection = (event: TextSelectionEventPayload) => {
    if (!mounted.current) return;
    const selectionPage = event.pageIndex + 1;
    setSelection(event);
    setSelectedHighlight(null);
    setSelectionMenuVisible(true);
    setControlsVisible(true);
    setPage(selectionPage);
    setPageInput(String(selectionPage));
  };

  const handleSelectionCancelled = (_event: TextSelectionCancelledEventPayload) => {
    if (!mounted.current) return;
    setSelection(null);
    setSelectionMenuVisible(false);
    setSelectedHighlight(null);
  };

  const handleSelectionUnavailable = (event: SelectionUnavailableEventPayload) => {
    if (!mounted.current) return;
    if (event.reason === 'no_text_at_point') {
      Alert.alert('No se encontró texto', 'Este PDF no tiene texto seleccionable en esa zona. Los documentos escaneados necesitan OCR, que no está activado.');
    } else {
      Alert.alert('Selección no disponible', 'No se pudo preparar el índice de texto de este PDF. Puedes seguir leyendo con normalidad.');
    }
  };

  const handleHighlightTapped = (event: HighlightTappedEventPayload) => {
    if (!mounted.current) return;
    const found = highlights.find((item) => item.id === event.id);
    if (found) {
      setSelectedHighlight(found);
      setControlsVisible(true);
      setSelection(null);
      setSelectionMenuVisible(false);
    }
  };

  const clearNativeSelection = () => setSelectionClearToken((token) => token + 1);

  const saveSelectedHighlight = async (color?: typeof HIGHLIGHT_COLORS[number]) => {
    if (!book || !selection) return;
    setSavingHighlight(true);
    try {
      const saved = await saveReadingHighlight({
        bookId: book.id, page: selection.pageIndex + 1, text: selection.text,
        startIndex: selection.startIndex, endIndex: selection.endIndex,
        rects: selection.rects, pageRotation: selection.pageRotation, color,
      });
      setHighlights((current) => [...current.filter((item) => item.page !== saved.page || item.startIndex !== saved.startIndex || item.endIndex !== saved.endIndex), saved]);
      setSelectionMenuVisible(false);
      setHighlightPaletteVisible(false);
      setSelection(null);
      clearNativeSelection();
    } catch {
      Alert.alert('No se pudo guardar', 'El highlight no se guardó. La selección sigue disponible para intentarlo de nuevo.');
    } finally {
      setSavingHighlight(false);
    }
  };

  const prepareQuoteFromSelection = () => {
    if (!selection) return;
    setPage(selection.pageIndex + 1);
    setQuoteText(selection.text);
    setQuoteNote('');
    setSelectionMenuVisible(false);
    setControlsVisible(true);
    setQuoteModalVisible(true);
    setSelection(null);
    clearNativeSelection();
  };

  const prepareNoteFromSelection = () => {
    if (!selection) return;
    setPage(selection.pageIndex + 1);
    setNoteInitialContent(`Cita seleccionada:\n“${selection.text}”\n\n`);
    setSelectionMenuVisible(false);
    setControlsVisible(true);
    setNoteEditorVisible(true);
    setSelection(null);
    clearNativeSelection();
  };

  const copySelection = () => {
    if (!selection) return;
    setSelectionCopyRequest(JSON.stringify({ requestId: Date.now(), text: selection.text }));
  };

  const removeSelectedHighlight = () => {
    if (!selectedHighlight) return;
    Alert.alert('Eliminar highlight', '¿Quieres quitar este resaltado del libro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => {
        void deleteReadingHighlight(selectedHighlight.id, selectedHighlight.bookId).then(() => {
          setHighlights((current) => current.filter((item) => item.id !== selectedHighlight.id));
          setSelectedHighlight(null);
        }).catch(() => Alert.alert('No se pudo eliminar', 'Inténtalo de nuevo.'));
      } },
    ]);
  };

  const cycleSelectedHighlightColor = () => {
    if (!selectedHighlight) return;
    const index = HIGHLIGHT_COLORS.indexOf(selectedHighlight.color as typeof HIGHLIGHT_COLORS[number]);
    const color = HIGHLIGHT_COLORS[(index + 1 + HIGHLIGHT_COLORS.length) % HIGHLIGHT_COLORS.length];
    void updateReadingHighlightColor(selectedHighlight.id, selectedHighlight.bookId, color).then(() => {
      setHighlights((current) => current.map((item) => item.id === selectedHighlight.id ? { ...item, color } : item));
      setSelectedHighlight((current) => current ? { ...current, color } : current);
    }).catch(() => Alert.alert('No se pudo cambiar el color', 'Inténtalo de nuevo.'));
  };

  const highlightsJson = JSON.stringify(highlights.map(({ id, page: highlightPage, color, rects }) => ({ id, page: highlightPage, color, rects })));

  const saveQuote = async () => {
    const text = quoteText.trim();
    if (!text) {
      Alert.alert('Añade una frase', 'Escribe o pega el texto que quieres guardar.');
      return;
    }
    if (!book) return;
    setSavingQuote(true);
    try {
      const saved = await addFavoriteQuote({ bookId: book.id, text, page, note: quoteNote });
      setQuotes((current) => [saved, ...current]);
      setQuoteModalVisible(false);
      setQuoteText('');
      setQuoteNote('');
      Alert.alert('Frase guardada', 'La encontrarás en la ficha de este libro.');
    } catch {
      Alert.alert('No se pudo guardar', 'Inténtalo de nuevo en un momento.');
    } finally {
      setSavingQuote(false);
    }
  };

  const editPageBookmark = async () => {
    if (!book || !page) return;
    setControlsVisible(true);
    try {
      const existing = await getReadingBookmarkAtPage(book.id, page);
      setPageBookmark(existing);
      setBookmarkName(existing?.name ?? '');
      setBookmarkModalVisible(true);
    } catch {
      Alert.alert('No se pudo consultar el marcador', 'Inténtalo de nuevo en un momento.');
    }
  };

  const saveBookmark = async () => {
    if (!book || !page) return;
    setSavingBookmark(true);
    try {
      const saved = await saveReadingBookmark({ bookId: book.id, page, name: bookmarkName }, pageCount);
      setBookmarks((current) => [saved, ...current.filter((item) => item.page !== saved.page)]);
      setPageBookmark(saved);
      setBookmarkModalVisible(false);
      setBookmarkName('');
      Alert.alert('Marcador guardado', 'Lo encontrarás en la ficha de este libro.');
    } catch {
      Alert.alert('No se pudo guardar el marcador', 'Inténtalo de nuevo en un momento.');
    } finally {
      setSavingBookmark(false);
    }
  };

  const saveReaderNote = async ({ title, content }: { title: string; content: string }) => {
    if (!book || !page) throw new Error('No se conoce la página actual.');
    await createReadingNote({ bookId: book.id, page, title, content });
    setNoteInitialContent(undefined);
    setNoteEditorVisible(false);
  };

  return (
    <ThemedView style={[styles.screen, styles.readerRoot]}>
      {controlsVisible ? <View style={[styles.header, landscape && styles.headerLandscape, { backgroundColor: theme.navigation, borderBottomColor: theme.divider }]}>
        <IconButton accessibilityLabel="Volver" variant="subtle" onPress={returnToOrigin}
          icon={<SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={21} tintColor={theme.accent} />} />
        <ThemedText numberOfLines={1} style={styles.title}>{book?.title ?? 'Lector'}</ThemedText>
        {loadState === 'ready' ? <IconButton accessibilityLabel="Abrir menú de anotaciones" variant="subtle"
          onPress={() => {
            setActionsMenuVisible(false);
            setAnnotationsMenuVisible((visible) => !visible);
            if (!annotationsMenuVisible) void loadAnnotationLists();
          }}
          icon={<SymbolView name={{ ios: 'bookmark', android: 'collections_bookmark', web: 'collections_bookmark' }} size={20} tintColor={theme.accentSoft} />} /> : null}
        {loadState === 'ready' ? <IconButton accessibilityLabel="Acciones personales de lectura" variant="subtle"
          onPress={() => { setAnnotationsMenuVisible(false); setActionsMenuVisible((visible) => !visible); }}
          icon={<SymbolView name={{ ios: 'ellipsis.circle', android: 'more_vert', web: 'more_vert' }} size={21} tintColor={theme.accent} />} /> : null}
        <IconButton accessibilityLabel={controlsVisible ? 'Ocultar controles' : 'Mostrar controles'} variant="subtle"
          onPress={() => { setActionsMenuVisible(false); setAnnotationsMenuVisible(false); setControlsVisible(false); }}
          icon={<SymbolView name={{ ios: controlsVisible ? 'eye.slash' : 'eye', android: controlsVisible ? 'visibility_off' : 'visibility', web: controlsVisible ? 'visibility_off' : 'visibility' }} size={20} tintColor={theme.accentSoft} />} />
      </View> : null}

      <View style={styles.readingArea} onTouchStart={() => { if (!controlsVisible) setControlsVisible(true); }}>
        {loadState === 'ready' && book ? (
          <ReaderPdfView key={`${book.id}:${openInstance ?? 'direct'}`} readerInstanceId={instanceId} bookId={book.id} openId={openInstance} style={styles.pdf} uri={book.filePath} fitMode="width" doubleTapToZoom
            initialPage={startPage ?? book.currentPage} targetPage={requestedPage} withAnimation
            highlightsJson={highlightsJson} selectionClearToken={selectionClearToken} selectionCopyRequest={selectionCopyRequest}
            onLoadComplete={handlePdfLoaded} onPageChanged={handlePageChanged} onError={handlePdfError}
            onTextSelectionStarted={handleTextSelection} onTextSelectionChanged={handleTextSelection}
            onTextSelectionCancelled={handleSelectionCancelled} onSelectionUnavailable={handleSelectionUnavailable}
            onHighlightTapped={handleHighlightTapped} onUriReceived={handlePdfUriReceived} />
        ) : (
          <View style={styles.state}>
            {loadState === 'loading' ? <ActivityIndicator color={theme.accent} /> : null}
            <ThemedText type={loadState === 'error' || loadState === 'missing' ? 'subtitle' : 'default'}
              themeColor={loadState === 'error' ? 'error' : 'textSecondary'}>
              {loadState === 'loading' ? 'Abriendo el libro…' : loadState === 'missing' ? 'Archivo no disponible' : errorMessage}
            </ThemedText>
            {loadState === 'missing' ? <ThemedText type="small" themeColor="textMuted">
              {book ? `No se encontró el PDF de “${book.title}” en el almacenamiento local.` : 'Este libro ya no está en la biblioteca.'}
            </ThemedText> : null}
            {loadState === 'error' || loadState === 'missing' ? <IconButton accessibilityLabel="Volver a la pantalla anterior" onPress={returnToOrigin}
              icon={<SymbolView name={{ ios: 'books.vertical', android: 'library_books', web: 'menu_book' }} size={21} tintColor={theme.accent} />} /> : null}
          </View>
        )}
        {actionsMenuVisible && loadState === 'ready' ? <View style={styles.actionsMenuOverlay}>
          <Pressable accessibilityLabel="Cerrar acciones" style={styles.actionsMenuBackdrop} onPress={() => setActionsMenuVisible(false)} />
          <View style={[styles.actionsMenu, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <ThemedText type="smallBold" themeColor="textMuted">EN ESTA PÁGINA{page ? ` · ${page}` : ''}</ThemedText>
            <Pressable accessibilityRole="button" style={styles.actionMenuItem} onPress={() => choosePersonalAction('bookmark')}>
              <SymbolView name={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }} size={19} tintColor={theme.accent} />
              <ThemedText type="smallBold">Marcador de página</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.actionMenuItem} onPress={() => choosePersonalAction('quote')}>
              <SymbolView name={{ ios: 'quote.bubble', android: 'format_quote', web: 'format_quote' }} size={19} tintColor={theme.accentSoft} />
              <ThemedText type="smallBold">Guardar frase</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.actionMenuItem} onPress={() => choosePersonalAction('note')}>
              <SymbolView name={{ ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' }} size={19} tintColor={theme.accentSoft} />
              <ThemedText type="smallBold">Escribir nota</ThemedText>
            </Pressable>
          </View>
        </View> : null}
        {annotationsMenuVisible && loadState === 'ready' ? <View style={styles.annotationsOverlay}>
          <Pressable accessibilityLabel="Cerrar menú de anotaciones" style={styles.annotationsBackdrop} onPress={() => setAnnotationsMenuVisible(false)} />
          <View style={[styles.annotationsPanel, { top: controlsVisible ? (landscape ? 56 : 66) : Spacing.two, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <View style={styles.annotationHeading}>
              <ThemedText type="subtitle">Anotaciones</ThemedText>
              <IconButton accessibilityLabel="Cerrar anotaciones" variant="subtle" onPress={() => setAnnotationsMenuVisible(false)}
                icon={<SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} tintColor={theme.textSecondary} />} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.annotationList}>
              {annotationListsLoading || highlightsLoading ? <ThemedText type="small" themeColor="textMuted">Cargando anotaciones…</ThemedText> : null}
              <View style={styles.annotationSection}>
                <ThemedText type="smallBold" themeColor="textMuted">HIGHLIGHTS · {highlights.length}</ThemedText>
                {highlights.length ? highlights.map((item) => <Pressable key={item.id} accessibilityRole="button"
                  accessibilityLabel={`Ir al highlight de la página ${item.page}`} onPress={() => openAnnotationPage(item.page)} style={styles.annotationItem}>
                  <ThemedText numberOfLines={2}>{item.text}</ThemedText><ThemedText type="small" themeColor="textMuted">Página {item.page}</ThemedText>
                </Pressable>) : <ThemedText type="small" themeColor="textMuted">Todavía no hay highlights.</ThemedText>}
              </View>
              <View style={styles.annotationSection}>
                <ThemedText type="smallBold" themeColor="textMuted">MARCADORES · {bookmarks.length}</ThemedText>
                {bookmarks.length ? bookmarks.map((item) => <Pressable key={item.id} accessibilityRole="button"
                  accessibilityLabel={`Ir a ${item.name}, página ${item.page}`} onPress={() => openAnnotationPage(item.page)} style={styles.annotationItem}>
                  <ThemedText type="smallBold" numberOfLines={2}>{item.name}</ThemedText><ThemedText type="small" themeColor="textMuted">Página {item.page}</ThemedText>
                </Pressable>) : <ThemedText type="small" themeColor="textMuted">Todavía no hay marcadores.</ThemedText>}
              </View>
              <View style={styles.annotationSection}>
                <ThemedText type="smallBold" themeColor="textMuted">FRASES GUARDADAS · {quotes.length}</ThemedText>
                {quotes.length ? quotes.map((item) => <Pressable key={item.id} accessibilityRole="button"
                  accessibilityLabel={item.page == null ? 'Frase sin página asociada' : `Ir a la frase de la página ${item.page}`}
                  disabled={item.page == null} onPress={() => { if (item.page != null) openAnnotationPage(item.page); }} style={styles.annotationItem}>
                  <ThemedText numberOfLines={3}>{item.text}</ThemedText>
                  <ThemedText type="small" themeColor="textMuted">{item.page == null ? 'Sin página asociada' : `Página ${item.page}`}</ThemedText>
                </Pressable>) : <ThemedText type="small" themeColor="textMuted">Todavía no hay frases guardadas.</ThemedText>}
              </View>
            </ScrollView>
          </View>
        </View> : null}
        {selectionMenuVisible && selection ? <View style={[styles.selectionMenu, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          <ThemedText type="smallBold" numberOfLines={2} style={styles.selectionPreview}>{selection.text}</ThemedText>
          <ThemedText type="small" themeColor="textMuted">Página {selection.pageIndex + 1} · toca otra palabra para ampliar</ThemedText>
          <View style={styles.selectionActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Elegir color de resaltado" disabled={savingHighlight}
              onPress={() => setHighlightPaletteVisible((visible) => !visible)} style={[styles.markerAction, { backgroundColor: theme.surfaceSelected }]}>
              <SymbolView name={{ ios: 'highlighter', android: 'ink_highlighter', web: 'ink_highlighter' }} size={20} tintColor={theme.accentSoft} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={prepareQuoteFromSelection} style={styles.selectionAction}><ThemedText type="smallBold">Frase</ThemedText></Pressable>
            <Pressable accessibilityRole="button" onPress={prepareNoteFromSelection} style={styles.selectionAction}><ThemedText type="smallBold">Nota</ThemedText></Pressable>
            <Pressable accessibilityRole="button" onPress={copySelection} style={styles.selectionAction}><ThemedText type="smallBold">Copiar</ThemedText></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setSelectionMenuVisible(false); setSelection(null); clearNativeSelection(); }} style={styles.selectionClose}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} tintColor={theme.textMuted} />
            </Pressable>
          </View>
          {highlightPaletteVisible ? <View style={[styles.highlightPalette, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {HIGHLIGHT_COLORS.map((color, index) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`Resaltar en color ${['miel', 'salvia', 'rosa', 'lavanda'][index]}`}
              disabled={savingHighlight} onPress={() => void saveSelectedHighlight(color)} style={styles.highlightColorTouch}>
              <View style={[styles.highlightColorDot, { backgroundColor: color, borderColor: theme.border }]} />
            </Pressable>)}
          </View> : null}
        </View> : selectedHighlight ? <View style={[styles.selectionMenu, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          <ThemedText type="smallBold" numberOfLines={2} style={styles.selectionPreview}>{selectedHighlight.text}</ThemedText>
          <ThemedText type="small" themeColor="textMuted">Highlight · Página {selectedHighlight.page}</ThemedText>
          <View style={styles.selectionActions}>
            <Pressable accessibilityRole="button" onPress={cycleSelectedHighlightColor} style={[styles.selectionAction, { backgroundColor: theme.surfaceSelected }]}><ThemedText type="smallBold" themeColor="accentSoft">Cambiar color</ThemedText></Pressable>
            <Pressable accessibilityRole="button" onPress={removeSelectedHighlight} style={styles.selectionAction}><ThemedText type="smallBold" themeColor="error">Eliminar</ThemedText></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setSelectedHighlight(null)} style={styles.selectionClose}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} tintColor={theme.textMuted} />
            </Pressable>
          </View>
        </View> : null}
        {loadState === 'ready' && controlsVisible ? (
          <View style={[styles.controls, landscape && styles.controlsLandscape, { backgroundColor: theme.navigation, borderColor: theme.border }]}>
            <View style={styles.progressCopy}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{page && pageCount ? `${page} / ${pageCount}` : 'Documento abierto'}</ThemedText>
              <View style={[styles.progressTrack, { backgroundColor: theme.progressTrack }]}>
                <View style={[styles.progressFill, { width: `${page && pageCount ? Math.round(page / pageCount * 100) : 0}%`, backgroundColor: theme.progress }]} />
              </View>
            </View>
            <IconButton accessibilityLabel="Página anterior" variant="subtle" style={styles.pageNavButton} disabled={!page || page <= 1 || !pageCount}
              onPress={() => navigateToPage((page ?? 1) - 1, true)}
              icon={<SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={20} tintColor={theme.accentSoft} />} />
            <TextInput accessibilityLabel="Buscar página e ir" keyboardType="number-pad" value={pageInput} onChangeText={setPageInput}
              onSubmitEditing={jumpToPage} returnKeyType="go" placeholder="Página" placeholderTextColor={theme.textMuted}
              style={[styles.pageInput, { color: theme.text, borderColor: theme.border }]} />
            <Pressable accessibilityRole="button" accessibilityLabel="Ir a la página indicada" onPress={jumpToPage} style={styles.goPageButton}>
              <ThemedText type="smallBold" themeColor="accent">Ir</ThemedText>
            </Pressable>
            <IconButton accessibilityLabel="Página siguiente" variant="subtle" style={styles.pageNavButton} disabled={!page || !pageCount || page >= pageCount}
              onPress={() => navigateToPage((page ?? 0) + 1, true)}
              icon={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={20} tintColor={theme.accentSoft} />} />
          </View>
        ) : null}
      </View>

      <Modal visible={quoteModalVisible} transparent animationType="fade" onRequestClose={() => setQuoteModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable accessibilityLabel="Cerrar ventana" style={styles.modalBackdrop} onPress={() => setQuoteModalVisible(false)} />
          <View style={[styles.quoteModal, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeading}>
              <View style={styles.modalTitleGroup}>
                <ThemedText type="subtitle">Guardar una frase</ThemedText>
                <ThemedText type="small" themeColor="textMuted">{book?.title}{page ? ` · Página ${page}` : ''}</ThemedText>
              </View>
              <IconButton accessibilityLabel="Cerrar" variant="subtle" onPress={() => setQuoteModalVisible(false)}
                icon={<SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} tintColor={theme.textSecondary} />} />
            </View>
            <TextInput accessibilityLabel="Texto de la frase" value={quoteText} onChangeText={setQuoteText}
              placeholder="Escribe o pega aquí tu fragmento favorito…" placeholderTextColor={theme.textMuted}
              multiline textAlignVertical="top" style={[styles.quoteInput, styles.quoteTextInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]} />
            <TextInput accessibilityLabel="Nota personal opcional" value={quoteNote} onChangeText={setQuoteNote}
              placeholder="Añade una nota personal (opcional)" placeholderTextColor={theme.textMuted}
              multiline textAlignVertical="top" style={[styles.quoteInput, styles.noteInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]} />
            <View style={styles.modalActions}>
              <Button title="Cancelar" variant="ghost" onPress={() => setQuoteModalVisible(false)} />
              <Button title="Guardar frase" loading={savingQuote} disabled={savingQuote} onPress={() => void saveQuote()} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={bookmarkModalVisible} transparent animationType="fade" onRequestClose={() => setBookmarkModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable accessibilityLabel="Cerrar ventana" style={styles.modalBackdrop} onPress={() => setBookmarkModalVisible(false)} />
          <View style={[styles.quoteModal, { backgroundColor: theme.surface, borderColor: theme.border }] }>
            <View style={styles.modalHeading}>
              <View style={styles.modalTitleGroup}>
                <ThemedText type="subtitle">{pageBookmark ? 'Editar marcador' : 'Guardar marcador'}</ThemedText>
                <ThemedText type="small" themeColor="textMuted">{book?.title}{page ? ` · Página ${page}` : ''}</ThemedText>
              </View>
              <IconButton accessibilityLabel="Cerrar" variant="subtle" onPress={() => setBookmarkModalVisible(false)}
                icon={<SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} tintColor={theme.textSecondary} />} />
            </View>
            <TextInput accessibilityLabel="Nombre opcional del marcador" value={bookmarkName} onChangeText={setBookmarkName}
              placeholder={page ? `Página ${page}` : 'Mi marcador'} placeholderTextColor={theme.textMuted}
              maxLength={100} returnKeyType="done" onSubmitEditing={() => void saveBookmark()}
              style={[styles.bookmarkNameInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]} />
            <View style={styles.modalActions}>
              <Button title="Cancelar" variant="ghost" onPress={() => setBookmarkModalVisible(false)} />
              <Button title="Guardar marcador" loading={savingBookmark} disabled={savingBookmark || !page} onPress={() => void saveBookmark()} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {book && page ? <ReadingNoteEditor visible={noteEditorVisible} bookTitle={book.title} page={page} initialContent={noteInitialContent}
        onClose={() => { setNoteEditorVisible(false); setNoteInitialContent(undefined); }} onSave={saveReaderNote} /> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minWidth: 0 },
  readerRoot: { position: 'relative' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 58, paddingHorizontal: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderBottomWidth: Borders.subtle, zIndex: 20, elevation: 20 },
  headerLandscape: { minHeight: 48 },
  title: { flex: 1, textAlign: 'center' },
  readingArea: { flex: 1, minHeight: 0, position: 'relative', backgroundColor: '#090711' },
  pdf: { flex: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  controls: { position: 'absolute', left: Spacing.two, right: Spacing.two, bottom: Spacing.two, minHeight: 48, paddingHorizontal: Spacing.one, borderRadius: 18, borderWidth: Borders.subtle, flexDirection: 'row', gap: 2, alignItems: 'center' },
  controlsLandscape: { minHeight: 42, bottom: Spacing.one, paddingHorizontal: 4 },
  progressCopy: { flex: 1, minWidth: 0, gap: 4 }, progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' }, progressFill: { height: '100%' },
  pageNavButton: { width: 36, height: 38 },
  goPageButton: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  pageInput: { width: 44, maxWidth: '15%', height: 32, borderWidth: Borders.subtle, borderRadius: 10, textAlign: 'center', paddingHorizontal: 2, fontSize: 13 },
  actionsMenuOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 5 },
  actionsMenuBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4, 2, 12, 0.18)' },
  actionsMenu: { position: 'absolute', top: Spacing.two, right: Spacing.two, width: 252, maxWidth: '90%', borderWidth: Borders.subtle, borderRadius: 20, padding: Spacing.three, gap: Spacing.two, elevation: 12 },
  annotationsOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 8 },
  annotationsBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4, 2, 12, 0.2)' },
  annotationsPanel: { position: 'absolute', left: Spacing.two, bottom: Spacing.two, width: 360, maxWidth: '92%', maxHeight: '78%', borderWidth: Borders.subtle, borderRadius: 20, padding: Spacing.three, elevation: 14 },
  annotationHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  annotationList: { gap: Spacing.three, paddingBottom: Spacing.two },
  annotationSection: { gap: Spacing.one },
  annotationItem: { padding: Spacing.two, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', gap: 3 },
  selectionMenu: { position: 'absolute', zIndex: 6, top: Spacing.two, left: Spacing.two, right: Spacing.two, alignSelf: 'center', maxWidth: 620, borderWidth: Borders.subtle, borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.one, elevation: 12 },
  selectionPreview: { lineHeight: 21 }, selectionActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexWrap: 'wrap' },
  markerAction: { width: 42, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  highlightPalette: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderWidth: Borders.subtle, borderRadius: 18, paddingHorizontal: Spacing.one, paddingVertical: 2, elevation: 14 },
  highlightColorTouch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  highlightColorDot: { width: 26, height: 26, borderWidth: Borders.subtle, borderRadius: 13 },
  selectionAction: { minHeight: 38, justifyContent: 'center', paddingHorizontal: Spacing.two, borderRadius: 12 }, selectionClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  actionMenuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.one, borderRadius: 12 },
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.three },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4, 2, 12, 0.72)' },
  quoteModal: { width: '100%', maxWidth: 520, maxHeight: '88%', borderWidth: Borders.subtle, borderRadius: 24, padding: Spacing.four, gap: Spacing.three },
  modalHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, modalTitleGroup: { flex: 1, gap: Spacing.one },
  quoteInput: { borderWidth: Borders.subtle, borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 15, lineHeight: 22 },
  bookmarkNameInput: { minHeight: 48, borderWidth: Borders.subtle, borderRadius: 14, paddingHorizontal: Spacing.three, fontSize: 15 },
  quoteTextInput: { minHeight: 130, maxHeight: 250 }, noteInput: { minHeight: 68, maxHeight: 110 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: Spacing.two },
});
