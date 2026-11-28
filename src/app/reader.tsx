import { type HighlightTappedEventPayload, type OnErrorEventPayload, type OnPageChangedEventPayload, type SelectionUnavailableEventPayload, type TextSelectionCancelledEventPayload, type TextSelectionEventPayload } from '@kishannareshpal/expo-pdf';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ReadingNoteEditor } from '@/components/reading-note-editor';
import { ReaderPdfView, type PdfChapterItem, type ReaderLoadCompleteEvent } from '@/components/reader-pdf-view';
import { Button, IconButton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { getBookById, updateLastOpenedAt, updateReadingProgress, type Book } from '@/features/library/book-repository';
import { addFavoriteQuote, getFavoriteQuotes, type FavoriteQuote } from '@/features/library/quote-repository';
import { getReadingBookmarkAtPage, getReadingBookmarks, saveReadingBookmark, type ReadingBookmark } from '@/features/library/bookmark-repository';
import { createReadingNote, getReadingNotes, type ReadingNote } from '@/features/library/reading-note-repository';
import { deleteReadingHighlight, getReadingHighlights, HIGHLIGHT_COLORS, mergeContinuousHighlightRects, saveReadingHighlight, updateReadingHighlightColor, type ReadingHighlight } from '@/features/library/highlight-repository';
import { DEFAULT_READER_PREFERENCES, getReaderPreferences, saveReaderPreferences, type ReaderColorMode, type ReaderPaddingPreset, type ReaderPreferences } from '@/features/library/reader-preferences';
import { recordReadingActivity } from '@/features/profile/profile-repository';
import { Borders, Spacing } from '@/theme';

function paddingForPreset(preset: ReaderPaddingPreset) {
  if (preset === 'none') return { top: 0, right: 0, bottom: 0, left: 0 };
  if (preset === 'moderate') return { top: 14, right: 14, bottom: 14, left: 14 };
  return { top: 8, right: 8, bottom: 8, left: 8 };
}

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
type AnnotationTab = 'chapters' | 'bookmarks' | 'highlights' | 'notes';
export default function ReaderScreen() {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const { bookId, returnTo, openId, page: pageParam } = useLocalSearchParams<{ bookId?: string | string[]; returnTo?: string | string[]; openId?: string | string[]; page?: string | string[] }>();
  const id = Array.isArray(bookId) ? bookId[0] : bookId;
  const origin = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const openInstance = Array.isArray(openId) ? openId[0] : openId;
  const requestedStartPage = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const parsedStartPage = Number(requestedStartPage);
  const startPage = Number.isInteger(parsedStartPage) && parsedStartPage > 0 ? parsedStartPage : null;
  const [book, setBook] = useState<Book | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [page, setPage] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [actionsMenuVisible, setActionsMenuVisible] = useState(false);
  const [annotationsMenuVisible, setAnnotationsMenuVisible] = useState(false);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [openSettingsSections, setOpenSettingsSections] = useState<Record<'appearance' | 'layout' | 'reading', boolean>>({
    appearance: true,
    layout: true,
    reading: false,
  });
  const [activeAnnotationTab, setActiveAnnotationTab] = useState<AnnotationTab>('chapters');
  const [prefs, setPrefs] = useState<ReaderPreferences>(DEFAULT_READER_PREFERENCES);
  const [returnJumpPage, setReturnJumpPage] = useState<number | null>(null);
  const [annotationListsLoading, setAnnotationListsLoading] = useState(false);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pageInput, setPageInput] = useState('');
  const [requestedPage, setRequestedPage] = useState<number | undefined>(undefined);
  const [pageJumpAnimated, setPageJumpAnimated] = useState(true);
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
  const [notes, setNotes] = useState<ReadingNote[]>([]);
  const [chapters, setChapters] = useState<PdfChapterItem[]>([]);
  const [selection, setSelection] = useState<TextSelectionEventPayload | null>(null);
  const [selectionMenuVisible, setSelectionMenuVisible] = useState(false);
  const [highlightPaletteVisible, setHighlightPaletteVisible] = useState(false);
  const [continuousHighlight, setContinuousHighlight] = useState(true);
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
  const readerTouchStart = useRef<{ x: number; y: number } | null>(null);
  const readerTouchMoved = useRef(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

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
      setBook(result);
      setHighlights([]);
      setBookmarks([]);
      setQuotes([]);
      setNotes([]);
      setChapters([]);
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
  }, [id, openInstance, startPage]);

  const loadAnnotationLists = async () => {
    if (!book || annotationListsBookId.current === book.id) return;
    const requestedBookId = book.id;
    annotationListsBookId.current = requestedBookId;
    setAnnotationListsLoading(true);
    try {
      const bookmarkItems = await getReadingBookmarks(requestedBookId);
      const quoteItems = await getFavoriteQuotes(requestedBookId);
      const noteItems = await getReadingNotes(requestedBookId);
      if (annotationListsBookId.current === requestedBookId) {
        setBookmarks(bookmarkItems);
        setQuotes(quoteItems);
        setNotes(noteItems);
      }
    } catch {
      if (annotationListsBookId.current === requestedBookId) {
        annotationListsBookId.current = null;
        Alert.alert('Anotaciones no disponibles', 'No se pudieron cargar los marcadores y notas guardadas. Inténtalo de nuevo.');
      }
    } finally {
      if (annotationListsBookId.current === requestedBookId) setAnnotationListsLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    void getReaderPreferences().then((loaded) => {
      if (mounted.current) {
        setPrefs(loaded);
        setContinuousHighlight(loaded.continuousHighlight);
      }
    }).catch(() => {});
    return () => {
      mounted.current = false;
      viewerLoaded.current = false;
      flushPendingProgress();
    };
  }, []);

  const updatePreference = <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) => {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      void saveReaderPreferences(next).catch(() => {});
      return next;
    });
    if (key === 'continuousHighlight') setContinuousHighlight(Boolean(value));
  };

  const handlePageChanged = (event: OnPageChangedEventPayload) => {
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
    // A programmatic jump can emit intermediate page changes while PDFView is
    // animating. Keep targetPage set until the requested page is reached; an
    // intermediate event must not clear the native target or update the input.
    if (pendingProgrammaticPage.current != null && currentPage !== pendingProgrammaticPage.current) return;
    const previousPage = lastObservedPage.current ?? page;
    const manualArrowChange = manualAdvanceTarget.current === currentPage;
    const isProgrammaticTarget = pendingProgrammaticPage.current === currentPage;
    const isUserPageChange = (!isProgrammaticTarget && requestedPage == null) || manualArrowChange;
    lastObservedPage.current = currentPage;
    if (isProgrammaticTarget) {
      pendingProgrammaticPage.current = null;
      setPageJumpAnimated(true);
    }
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

  const navigateToPage = (targetPage: number, countArrowNavigationAsReading = false, animated = true) => {
    if (!pageCount || !Number.isInteger(targetPage) || targetPage < 1 || targetPage > pageCount) return false;
    setPageInput(String(targetPage));
    setPage(targetPage);
    if (book) scheduleProgressSave(book.id, targetPage, pageCount);
    manualAdvanceTarget.current = countArrowNavigationAsReading ? targetPage : null;
    pendingProgrammaticPage.current = targetPage;
    setPageJumpAnimated(animated);
    // The page prop is implemented by the bundled Expo PDF module native view.
    setRequestedPage(targetPage);
    return true;
  };

  const toggleSettingsSection = (section: 'appearance' | 'layout' | 'reading') => {
    setOpenSettingsSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const openAnnotationPage = (targetPage: number) => {
    const previousPage = page;
    if (navigateToPage(targetPage)) {
      if (previousPage != null && previousPage !== targetPage) setReturnJumpPage(previousPage);
      setAnnotationsMenuVisible(false);
      setActionsMenuVisible(false);
      setSettingsMenuVisible(false);
    }
  };

  const jumpToPage = () => {
    const input = pageInput.trim();
    const requested = Number(input);
    if (!input || !Number.isInteger(requested) || !pageCount || requested < 1 || requested > pageCount) {
      Alert.alert('Página no válida', 'Escribe un número de página válido.');
      return;
    }
    const previousPage = page;
    if (navigateToPage(requested, false, false) && previousPage != null && previousPage !== requested) {
      setReturnJumpPage(previousPage);
    }
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

  const handlePdfLoaded = (event: ReaderLoadCompleteEvent) => {
    if (!mounted.current) return;
    if (pdfLoadHandled.current) return;
    pdfLoadHandled.current = true;
    viewerLoaded.current = true;
    setPageCount(event.pageCount);
    const nextChapters = Array.isArray(event.tableOfContents) ? event.tableOfContents : [];
    setChapters(nextChapters);
    if (book) {
      const restoredPage = Math.min(startPage ?? book.currentPage, event.pageCount);
      initialTargetPage.current = restoredPage;
      initialPageChangePending.current = restoredPage !== 1;
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
      const rects = continuousHighlight ? mergeContinuousHighlightRects(selection.rects) : selection.rects;
      const saved = await saveReadingHighlight({
        bookId: book.id, page: selection.pageIndex + 1, text: selection.text,
        startIndex: selection.startIndex, endIndex: selection.endIndex,
        rects, pageRotation: selection.pageRotation, color,
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
    const created = await createReadingNote({ bookId: book.id, page, title, content });
    setNotes((current) => [created, ...current]);
    setNoteInitialContent(undefined);
    setNoteEditorVisible(false);
  };

  return (
    <ThemedView style={[styles.screen, styles.readerRoot]}>
      <KeyboardAvoidingView style={styles.readerKeyboardAvoider} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {controlsVisible ? <View style={[styles.header, landscape && styles.headerLandscape, { backgroundColor: theme.navigation, borderBottomColor: theme.divider }]}>
        <IconButton accessibilityLabel="Volver" variant="subtle" onPress={returnToOrigin}
          icon={<SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={21} tintColor={theme.accent} />} />
        <ThemedText numberOfLines={1} style={styles.title}>{book?.title ?? 'Lector'}</ThemedText>
        {loadState === 'ready' ? <IconButton accessibilityLabel="Buscar texto en el libro" variant="subtle"
          onPress={() => Alert.alert('Búsqueda de texto', 'Próximamente podrás buscar palabras dentro del PDF.')}
          icon={<SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={20} tintColor={theme.accentSoft} />} /> : null}
        {loadState === 'ready' ? <IconButton accessibilityLabel="Abrir menú de contenido y anotaciones" variant="subtle"
          onPress={() => {
            setActionsMenuVisible(false);
            setSettingsMenuVisible(false);
            setAnnotationsMenuVisible((visible) => !visible);
            if (!annotationsMenuVisible) void loadAnnotationLists();
          }}
          icon={<SymbolView name={{ ios: 'bookmark', android: 'collections_bookmark', web: 'collections_bookmark' }} size={20} tintColor={theme.accentSoft} />} /> : null}
        {loadState === 'ready' ? <IconButton accessibilityLabel="Configuración de lectura" variant="subtle"
          onPress={() => {
            setActionsMenuVisible(false);
            setAnnotationsMenuVisible(false);
            setSettingsMenuVisible((visible) => !visible);
          }}
          icon={<SymbolView name={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }} size={20} tintColor={theme.accentSoft} />} /> : null}
        {loadState === 'ready' ? <IconButton accessibilityLabel="Acciones personales de lectura" variant="subtle"
          onPress={() => { setAnnotationsMenuVisible(false); setSettingsMenuVisible(false); setActionsMenuVisible((visible) => !visible); }}
          icon={<SymbolView name={{ ios: 'ellipsis.circle', android: 'more_vert', web: 'more_vert' }} size={21} tintColor={theme.accent} />} /> : null}
        <IconButton accessibilityLabel={controlsVisible ? 'Ocultar controles' : 'Mostrar controles'} variant="subtle"
          onPress={() => { setActionsMenuVisible(false); setAnnotationsMenuVisible(false); setSettingsMenuVisible(false); setControlsVisible(false); }}
          icon={<SymbolView name={{ ios: controlsVisible ? 'eye.slash' : 'eye', android: controlsVisible ? 'visibility_off' : 'visibility', web: controlsVisible ? 'visibility_off' : 'visibility' }} size={20} tintColor={theme.accentSoft} />} />
      </View> : null}

      <View style={styles.readingArea}
        onTouchStart={(event) => {
          const touch = event.nativeEvent.touches[0];
          readerTouchStart.current = touch ? { x: touch.pageX, y: touch.pageY } : null;
          readerTouchMoved.current = false;
        }}
        onTouchMove={(event) => {
          const start = readerTouchStart.current;
          const touch = event.nativeEvent.touches[0];
          if (!start || !touch) return;
          if (event.nativeEvent.touches.length !== 1) {
            readerTouchMoved.current = true;
            return;
          }
          const deltaX = touch.pageX - start.x;
          const deltaY = touch.pageY - start.y;
          if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) readerTouchMoved.current = true;
          if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX) && controlsVisible) {
            setControlsVisible(false);
          }
        }}
        onTouchEnd={() => {
          if (!readerTouchMoved.current && !controlsVisible) setControlsVisible(true);
          readerTouchStart.current = null;
          readerTouchMoved.current = false;
        }}
        onTouchCancel={() => {
          readerTouchStart.current = null;
          readerTouchMoved.current = false;
        }}>
        {loadState === 'ready' && book ? (
          <ReaderPdfView key={`${book.id}:${openInstance ?? 'direct'}`} style={styles.pdf} uri={book.filePath}
            fitMode={prefs.fitMode} horizontal={prefs.horizontal} pagingEnabled={prefs.horizontal}
            pageGap={prefs.pageGapEnabled ? 12 : 0} contentPadding={paddingForPreset(prefs.paddingPreset)}
            colorMode={prefs.colorMode} keepScreenOn={prefs.keepAwake} doubleTapToZoom
            initialPage={startPage ?? book.currentPage} withAnimation={pageJumpAnimated} targetPage={requestedPage}
            highlightsJson={highlightsJson} selectionClearToken={selectionClearToken} selectionCopyRequest={selectionCopyRequest}
            onLoadComplete={handlePdfLoaded} onPageChanged={handlePageChanged} onError={handlePdfError}
            onTextSelectionStarted={handleTextSelection} onTextSelectionChanged={handleTextSelection}
            onTextSelectionCancelled={handleSelectionCancelled} onSelectionUnavailable={handleSelectionUnavailable}
            onHighlightTapped={handleHighlightTapped} />
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
          <Pressable accessibilityLabel="Cerrar menú de contenido y anotaciones" style={styles.annotationsBackdrop} onPress={() => setAnnotationsMenuVisible(false)} />
          <View style={[styles.annotationsPanel, { top: controlsVisible ? (landscape ? 56 : 66) : Spacing.two, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <View style={styles.annotationHeading}>
              <View style={styles.annotationTitleRow}>
                <SymbolView name={{ ios: 'list.bullet.rectangle', android: 'menu_book', web: 'menu_book' }} size={19} tintColor={theme.accent} />
                <ThemedText type="subtitle">Contenido y notas</ThemedText>
              </View>
              <IconButton accessibilityLabel="Cerrar panel" variant="subtle" onPress={() => setAnnotationsMenuVisible(false)}
                icon={<SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} tintColor={theme.textSecondary} />} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.annotationTabsRow} style={styles.annotationTabsBar}>
              {([
                { key: 'chapters', label: 'Contenido', count: chapters.length },
                { key: 'bookmarks', label: 'Marcadores', count: bookmarks.length },
                { key: 'highlights', label: 'Highlights', count: highlights.length },
                { key: 'notes', label: 'Notas', count: notes.length },
              ] as const).map((tab) => {
                const active = activeAnnotationTab === tab.key;
                return (
                  <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: active }}
                    onPress={() => setActiveAnnotationTab(tab.key)}
                    style={[styles.annotationTabPill, {
                      backgroundColor: active ? theme.surfaceSelected : theme.backgroundSecondary,
                      borderColor: active ? theme.accent : theme.border,
                    }]}>
                    <ThemedText type="smallBold" themeColor={active ? 'accent' : 'textSecondary'}>
                      {tab.label}{tab.count > 0 ? ` (${tab.count})` : ''}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.annotationList}>
              {activeAnnotationTab !== 'chapters' && (annotationListsLoading || (activeAnnotationTab === 'highlights' && highlightsLoading)) ? (
                <View style={styles.annotationLoadingRow}>
                  <ActivityIndicator size="small" color={theme.accent} />
                  <ThemedText type="small" themeColor="textMuted">Cargando…</ThemedText>
                </View>
              ) : null}

              {activeAnnotationTab === 'chapters' ? (
                chapters.length ? chapters.map((chapter, index) => {
                  const nextChapter = chapters[index + 1];
                  const isCurrentChapter = page != null && page >= chapter.page && (!nextChapter || page < nextChapter.page);
                  return (
                    <Pressable key={`${chapter.page}-${chapter.level}-${index}`} accessibilityRole="button"
                      accessibilityLabel={`Ir al capítulo ${chapter.title}, página ${chapter.page}`}
                      onPress={() => openAnnotationPage(chapter.page)}
                      style={[
                        styles.annotationCard,
                        {
                          marginLeft: Math.min(chapter.level, 3) * 14,
                          backgroundColor: isCurrentChapter ? theme.surfaceSelected : theme.backgroundSecondary,
                          borderColor: isCurrentChapter ? theme.accent : theme.border,
                        },
                      ]}>
                      <View style={styles.annotationCardBody}>
                        <ThemedText type={chapter.level === 0 ? 'smallBold' : 'small'} numberOfLines={2}
                          themeColor={isCurrentChapter ? 'accent' : 'text'}>
                          {chapter.title}
                        </ThemedText>
                      </View>
                      <View style={[styles.annotationPageBadge, { backgroundColor: theme.surfaceElevated }]}>
                        <ThemedText type="smallBold" themeColor={isCurrentChapter ? 'accent' : 'textSecondary'}>Pág. {chapter.page}</ThemedText>
                      </View>
                    </Pressable>
                  );
                }) : (
                  <View style={styles.annotationEmptyState}>
                    <SymbolView name={{ ios: 'book.closed', android: 'menu_book', web: 'menu_book' }} size={24} tintColor={theme.textMuted} />
                    <ThemedText type="smallBold" themeColor="textSecondary">Sin índice de capítulos</ThemedText>
                    <ThemedText type="small" themeColor="textMuted" style={styles.annotationEmptyCopy}>
                      Este PDF no incluye una tabla de contenidos integrada.
                    </ThemedText>
                  </View>
                )
              ) : null}

              {activeAnnotationTab === 'bookmarks' ? (
                bookmarks.length ? bookmarks.map((item) => (
                  <Pressable key={item.id} accessibilityRole="button"
                    accessibilityLabel={`Ir a ${item.name}, página ${item.page}`}
                    onPress={() => openAnnotationPage(item.page)}
                    style={[styles.annotationCard, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
                    <SymbolView name={{ ios: 'bookmark.fill', android: 'bookmark', web: 'bookmark' }} size={18} tintColor={theme.accent} />
                    <View style={styles.annotationCardBody}>
                      <ThemedText type="smallBold" numberOfLines={2}>{item.name}</ThemedText>
                      <ThemedText type="small" themeColor="textMuted">{new Date(item.createdAt).toLocaleDateString('es-CO')}</ThemedText>
                    </View>
                    <View style={[styles.annotationPageBadge, { backgroundColor: theme.surfaceElevated }]}>
                      <ThemedText type="smallBold" themeColor="accentSoft">Pág. {item.page}</ThemedText>
                    </View>
                  </Pressable>
                )) : (
                  <View style={styles.annotationEmptyState}>
                    <SymbolView name={{ ios: 'bookmark', android: 'bookmark_border', web: 'bookmark_border' }} size={24} tintColor={theme.textMuted} />
                    <ThemedText type="smallBold" themeColor="textSecondary">Sin marcadores</ThemedText>
                    <ThemedText type="small" themeColor="textMuted" style={styles.annotationEmptyCopy}>
                      Guarda marcadores desde el menú de acciones para volver rápido a una página.
                    </ThemedText>
                  </View>
                )
              ) : null}

              {activeAnnotationTab === 'highlights' ? (
                highlights.length ? highlights.map((item) => (
                  <Pressable key={item.id} accessibilityRole="button"
                    accessibilityLabel={`Ir al highlight de la página ${item.page}`}
                    onPress={() => openAnnotationPage(item.page)}
                    style={[styles.annotationCard, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
                    <View style={[styles.highlightColorStrip, { backgroundColor: item.color }]} />
                    <View style={styles.annotationCardBody}>
                      <ThemedText type="small" numberOfLines={3}>{item.text}</ThemedText>
                    </View>
                    <View style={[styles.annotationPageBadge, { backgroundColor: theme.surfaceElevated }]}>
                      <ThemedText type="smallBold" themeColor="accentSoft">Pág. {item.page}</ThemedText>
                    </View>
                  </Pressable>
                )) : (
                  <View style={styles.annotationEmptyState}>
                    <SymbolView name={{ ios: 'highlighter', android: 'ink_highlighter', web: 'ink_highlighter' }} size={24} tintColor={theme.textMuted} />
                    <ThemedText type="smallBold" themeColor="textSecondary">Sin highlights</ThemedText>
                    <ThemedText type="small" themeColor="textMuted" style={styles.annotationEmptyCopy}>
                      Mantén presionada una palabra del libro y elige un color para resaltar.
                    </ThemedText>
                  </View>
                )
              ) : null}

              {activeAnnotationTab === 'notes' ? (
                notes.length ? notes.map((item) => (
                  <Pressable key={item.id} accessibilityRole="button"
                    accessibilityLabel={`Ir a la nota de la página ${item.page}`}
                    onPress={() => openAnnotationPage(item.page)}
                    style={[styles.annotationCard, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
                    <SymbolView name={{ ios: 'note.text', android: 'sticky_note_2', web: 'sticky_note_2' }} size={18} tintColor={theme.accentSoft} />
                    <View style={styles.annotationCardBody}>
                      {item.title ? <ThemedText type="smallBold" numberOfLines={1}>{item.title}</ThemedText> : null}
                      <ThemedText type="small" numberOfLines={3} themeColor={item.title ? 'textSecondary' : 'text'}>{item.content}</ThemedText>
                    </View>
                    <View style={[styles.annotationPageBadge, { backgroundColor: theme.surfaceElevated }]}>
                      <ThemedText type="smallBold" themeColor="accentSoft">Pág. {item.page}</ThemedText>
                    </View>
                  </Pressable>
                )) : (
                  <View style={styles.annotationEmptyState}>
                    <SymbolView name={{ ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' }} size={24} tintColor={theme.textMuted} />
                    <ThemedText type="smallBold" themeColor="textSecondary">Sin notas</ThemedText>
                    <ThemedText type="small" themeColor="textMuted" style={styles.annotationEmptyCopy}>
                      Crea notas personales desde el menú de acciones o al seleccionar texto.
                    </ThemedText>
                  </View>
                )
              ) : null}
            </ScrollView>
          </View>
        </View> : null}
        <Modal visible={settingsMenuVisible && loadState === 'ready'} animationType="slide" presentationStyle="fullScreen"
          onRequestClose={() => setSettingsMenuVisible(false)}>
          <ThemedView style={styles.settingsFullScreen}>
            <View style={[styles.settingsTopBar, { backgroundColor: theme.navigation, borderBottomColor: theme.divider }]}>
              <IconButton accessibilityLabel="Cerrar configuración" variant="subtle" onPress={() => setSettingsMenuVisible(false)}
                icon={<SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={21} tintColor={theme.accent} />} />
              <View style={styles.settingsTopCopy}>
                <ThemedText type="subtitle">Configuración de lectura</ThemedText>
                <ThemedText type="small" themeColor="textMuted">Ajustes guardados automáticamente</ThemedText>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsScrollContent}>
              <View style={[styles.accordionCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <Pressable accessibilityRole="button" onPress={() => toggleSettingsSection('appearance')} style={styles.accordionHeader}>
                  <View style={styles.accordionHeaderLeft}>
                    <View style={[styles.accordionIconWrap, { backgroundColor: theme.surfaceSelected }]}>
                      <SymbolView name={{ ios: 'paintpalette', android: 'palette', web: 'palette' }} size={18} tintColor={theme.accent} />
                    </View>
                    <View style={styles.accordionTitleCopy}>
                      <ThemedText type="smallBold">Apariencia y color</ThemedText>
                      <ThemedText type="small" themeColor="textMuted">
                        {prefs.colorMode === 'day' ? 'Día' : prefs.colorMode === 'night' ? 'Noche' : prefs.colorMode === 'night_contrast' ? 'Contraste' : prefs.colorMode === 'sepia' ? 'Sepia' : 'Grises'} · {prefs.keepAwake ? 'Pantalla encendida' : 'Pantalla normal'}
                      </ThemedText>
                    </View>
                  </View>
                  <SymbolView name={{ ios: openSettingsSections.appearance ? 'chevron.up' : 'chevron.down', android: openSettingsSections.appearance ? 'expand_less' : 'expand_more', web: openSettingsSections.appearance ? 'expand_less' : 'expand_more' }} size={18} tintColor={theme.textSecondary} />
                </Pressable>
                {openSettingsSections.appearance ? (
                  <View style={[styles.accordionBody, { borderTopColor: theme.divider }]}>
                    <View style={styles.settingsGroup}>
                      <ThemedText type="smallBold" themeColor="textMuted">MODO DE COLOR</ThemedText>
                      <View style={styles.settingsOptionsRow}>
                        {([
                          { value: 'day', label: 'Día' },
                          { value: 'night', label: 'Noche' },
                          { value: 'night_contrast', label: 'Contraste' },
                          { value: 'sepia', label: 'Sepia' },
                          { value: 'grayscale', label: 'Grises' },
                        ] as { value: ReaderColorMode; label: string }[]).map((opt) => {
                          const active = prefs.colorMode === opt.value;
                          return (
                            <Pressable key={opt.value} accessibilityRole="button" onPress={() => updatePreference('colorMode', opt.value)}
                              style={[styles.settingsChip, { backgroundColor: active ? theme.surfaceSelected : theme.backgroundSecondary, borderColor: active ? theme.accent : theme.border }]}>
                              <ThemedText type="smallBold" themeColor={active ? 'accent' : 'textSecondary'}>{opt.label}</ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                    <View style={styles.settingsGroup}>
                      <ThemedText type="smallBold" themeColor="textMuted">PANTALLA</ThemedText>
                      <View style={styles.settingsOptionsRow}>
                        {([
                          { value: true, label: 'Mantener encendida' },
                          { value: false, label: 'Normal' },
                        ] as const).map((opt) => {
                          const active = prefs.keepAwake === opt.value;
                          return (
                            <Pressable key={opt.label} accessibilityRole="button" onPress={() => updatePreference('keepAwake', opt.value)}
                              style={[styles.settingsChip, { backgroundColor: active ? theme.surfaceSelected : theme.backgroundSecondary, borderColor: active ? theme.accent : theme.border }]}>
                              <ThemedText type="smallBold" themeColor={active ? 'accent' : 'textSecondary'}>{opt.label}</ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={[styles.accordionCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <Pressable accessibilityRole="button" onPress={() => toggleSettingsSection('layout')} style={styles.accordionHeader}>
                  <View style={styles.accordionHeaderLeft}>
                    <View style={[styles.accordionIconWrap, { backgroundColor: theme.surfaceSelected }]}>
                      <SymbolView name={{ ios: 'doc.text', android: 'article', web: 'article' }} size={18} tintColor={theme.accent} />
                    </View>
                    <View style={styles.accordionTitleCopy}>
                      <ThemedText type="smallBold">Diseño y páginas</ThemedText>
                      <ThemedText type="small" themeColor="textMuted">
                        {prefs.horizontal ? 'Horizontal' : 'Vertical'} · {prefs.paddingPreset === 'none' ? 'Sin margen' : prefs.paddingPreset === 'compact' ? 'Moderado' : 'Amplio'}
                      </ThemedText>
                    </View>
                  </View>
                  <SymbolView name={{ ios: openSettingsSections.layout ? 'chevron.up' : 'chevron.down', android: openSettingsSections.layout ? 'expand_less' : 'expand_more', web: openSettingsSections.layout ? 'expand_less' : 'expand_more' }} size={18} tintColor={theme.textSecondary} />
                </Pressable>
                {openSettingsSections.layout ? (
                  <View style={[styles.accordionBody, { borderTopColor: theme.divider }]}>
                    <View style={styles.settingsGroup}>
                      <ThemedText type="smallBold" themeColor="textMuted">DESPLAZAMIENTO</ThemedText>
                      <View style={styles.settingsOptionsRow}>
                        {([
                          { value: false, label: 'Vertical' },
                          { value: true, label: 'Horizontal' },
                        ] as const).map((opt) => {
                          const active = prefs.horizontal === opt.value;
                          return (
                            <Pressable key={opt.label} accessibilityRole="button" onPress={() => updatePreference('horizontal', opt.value)}
                              style={[styles.settingsChip, { backgroundColor: active ? theme.surfaceSelected : theme.backgroundSecondary, borderColor: active ? theme.accent : theme.border }]}>
                              <ThemedText type="smallBold" themeColor={active ? 'accent' : 'textSecondary'}>{opt.label}</ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                    <View style={styles.settingsGroup}>
                      <ThemedText type="smallBold" themeColor="textMuted">AJUSTE DE PÁGINA</ThemedText>
                      <View style={styles.settingsOptionsRow}>
                        {([
                          { value: 'width', label: 'Ancho' },
                          { value: 'both', label: 'Página completa' },
                          { value: 'height', label: 'Alto' },
                        ] as const).map((opt) => {
                          const active = prefs.fitMode === opt.value;
                          return (
                            <Pressable key={opt.value} accessibilityRole="button" onPress={() => updatePreference('fitMode', opt.value)}
                              style={[styles.settingsChip, { backgroundColor: active ? theme.surfaceSelected : theme.backgroundSecondary, borderColor: active ? theme.accent : theme.border }]}>
                              <ThemedText type="smallBold" themeColor={active ? 'accent' : 'textSecondary'}>{opt.label}</ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                    <View style={styles.settingsGroup}>
                      <ThemedText type="smallBold" themeColor="textMuted">ESPACIO ENTRE PÁGINAS</ThemedText>
                      <View style={styles.settingsOptionsRow}>
                        {([
                          { value: true, label: 'Con separación' },
                          { value: false, label: 'Continuo (sin gap)' },
                        ] as const).map((opt) => {
                          const active = prefs.pageGapEnabled === opt.value;
                          return (
                            <Pressable key={opt.label} accessibilityRole="button" onPress={() => updatePreference('pageGapEnabled', opt.value)}
                              style={[styles.settingsChip, { backgroundColor: active ? theme.surfaceSelected : theme.backgroundSecondary, borderColor: active ? theme.accent : theme.border }]}>
                              <ThemedText type="smallBold" themeColor={active ? 'accent' : 'textSecondary'}>{opt.label}</ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                    <View style={styles.settingsGroup}>
                      <ThemedText type="smallBold" themeColor="textMuted">MÁRGENES DE PÁGINA</ThemedText>
                      <View style={styles.settingsOptionsRow}>
                        {([
                          { value: 'none', label: 'Sin margen' },
                          { value: 'compact', label: 'Moderado' },
                          { value: 'moderate', label: 'Amplio' },
                        ] as { value: ReaderPaddingPreset; label: string }[]).map((opt) => {
                          const active = prefs.paddingPreset === opt.value;
                          return (
                            <Pressable key={opt.value} accessibilityRole="button" onPress={() => updatePreference('paddingPreset', opt.value)}
                              style={[styles.settingsChip, { backgroundColor: active ? theme.surfaceSelected : theme.backgroundSecondary, borderColor: active ? theme.accent : theme.border }]}>
                              <ThemedText type="smallBold" themeColor={active ? 'accent' : 'textSecondary'}>{opt.label}</ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={[styles.accordionCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <Pressable accessibilityRole="button" onPress={() => toggleSettingsSection('reading')} style={styles.accordionHeader}>
                  <View style={styles.accordionHeaderLeft}>
                    <View style={[styles.accordionIconWrap, { backgroundColor: theme.surfaceSelected }]}>
                      <SymbolView name={{ ios: 'highlighter', android: 'ink_highlighter', web: 'ink_highlighter' }} size={18} tintColor={theme.accent} />
                    </View>
                    <View style={styles.accordionTitleCopy}>
                      <ThemedText type="smallBold">Lectura y resaltado</ThemedText>
                      <ThemedText type="small" themeColor="textMuted">
                        {prefs.continuousHighlight ? 'Resaltado continuo (Word)' : 'Resaltado exacto'}
                      </ThemedText>
                    </View>
                  </View>
                  <SymbolView name={{ ios: openSettingsSections.reading ? 'chevron.up' : 'chevron.down', android: openSettingsSections.reading ? 'expand_less' : 'expand_more', web: openSettingsSections.reading ? 'expand_less' : 'expand_more' }} size={18} tintColor={theme.textSecondary} />
                </Pressable>
                {openSettingsSections.reading ? (
                  <View style={[styles.accordionBody, { borderTopColor: theme.divider }]}>
                    <View style={styles.settingsGroup}>
                      <ThemedText type="smallBold" themeColor="textMuted">ESTILO DE RESALTADO</ThemedText>
                      <View style={styles.settingsOptionsRow}>
                        {([
                          { value: true, label: 'Continuo (Word)' },
                          { value: false, label: 'Exacto' },
                        ] as const).map((opt) => {
                          const active = prefs.continuousHighlight === opt.value;
                          return (
                            <Pressable key={opt.label} accessibilityRole="button" onPress={() => updatePreference('continuousHighlight', opt.value)}
                              style={[styles.settingsChip, { backgroundColor: active ? theme.surfaceSelected : theme.backgroundSecondary, borderColor: active ? theme.accent : theme.border }]}>
                              <ThemedText type="smallBold" themeColor={active ? 'accent' : 'textSecondary'}>{opt.label}</ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </ThemedView>
        </Modal>
        {returnJumpPage != null && loadState === 'ready' && !selectionMenuVisible && !selectedHighlight ? (
          <View style={[styles.returnJumpContainer, { bottom: controlsVisible ? 82 : Spacing.three }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Volver a página ${returnJumpPage}`}
              onPress={() => {
                const target = returnJumpPage;
                setReturnJumpPage(null);
                navigateToPage(target, false, false);
              }}
              style={[styles.returnJumpPill, { backgroundColor: theme.surfaceElevated, borderColor: theme.accent }]}>
              <SymbolView name={{ ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' }} size={15} tintColor={theme.accent} />
              <ThemedText type="smallBold" themeColor="accent">Volver a pág. {returnJumpPage}</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Descartar aviso de retorno"
              onPress={() => setReturnJumpPage(null)}
              style={[styles.returnJumpDismiss, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={theme.textMuted} />
            </Pressable>
          </View>
        ) : null}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Estilo de resaltado: ${continuousHighlight ? 'Continuo' : 'Exacto'}`}
              disabled={savingHighlight}
              onPress={() => setContinuousHighlight((current) => !current)}
              style={[
                styles.highlightModeToggle,
                {
                  backgroundColor: continuousHighlight ? theme.surfaceSelected : theme.backgroundSecondary,
                  borderColor: theme.border,
                },
              ]}>
              <ThemedText type="smallBold" themeColor={continuousHighlight ? 'accent' : 'textSecondary'}>
                {continuousHighlight ? 'Continuo' : 'Exacto'}
              </ThemedText>
            </Pressable>
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
          <View style={[styles.controls, landscape && styles.controlsLandscape, { bottom: keyboardVisible ? Spacing.five : (landscape ? Spacing.one : Spacing.two), backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
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
              style={[styles.pageInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]} />
            <Pressable accessibilityRole="button" accessibilityLabel="Ir a la página indicada" onPress={jumpToPage} style={[styles.goPageButton, { backgroundColor: theme.surfaceSelected }]}>
              <ThemedText type="smallBold" themeColor="accent">Ir</ThemedText>
            </Pressable>
            <IconButton accessibilityLabel="Página siguiente" variant="subtle" style={styles.pageNavButton} disabled={!page || !pageCount || page >= pageCount}
              onPress={() => navigateToPage((page ?? 0) + 1, true)}
              icon={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={20} tintColor={theme.accentSoft} />} />
          </View>
        ) : null}
      </View>
      </KeyboardAvoidingView>

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
  readerKeyboardAvoider: { flex: 1, minHeight: 0 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 58, paddingHorizontal: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderBottomWidth: Borders.subtle, zIndex: 20, elevation: 20 },
  headerLandscape: { minHeight: 48 },
  title: { flex: 1, textAlign: 'center' },
  readingArea: { flex: 1, minHeight: 0, position: 'relative', backgroundColor: '#090711' },
  pdf: { flex: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  controls: { position: 'absolute', left: Spacing.two, right: Spacing.two, bottom: Spacing.two, minHeight: 58, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 22, borderWidth: Borders.subtle, flexDirection: 'row', gap: Spacing.one, alignItems: 'center', elevation: 12, shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
  controlsLandscape: { minHeight: 52, paddingHorizontal: Spacing.one },
  progressCopy: { flex: 1, minWidth: 0, gap: 4 }, progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' }, progressFill: { height: '100%' },
  pageNavButton: { width: 36, height: 38 },
  goPageButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  pageInput: { width: 52, maxWidth: '15%', height: 38, borderWidth: Borders.subtle, borderRadius: 12, textAlign: 'center', paddingHorizontal: 2, fontSize: 14, fontWeight: '600' },
  actionsMenuOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 5 },
  actionsMenuBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4, 2, 12, 0.18)' },
  actionsMenu: { position: 'absolute', top: Spacing.two, right: Spacing.two, width: 252, maxWidth: '90%', borderWidth: Borders.subtle, borderRadius: 20, padding: Spacing.three, gap: Spacing.two, elevation: 12 },
  annotationsOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 8 },
  annotationsBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4, 2, 12, 0.2)' },
  annotationsPanel: { position: 'absolute', left: Spacing.two, right: Spacing.two, bottom: Spacing.two, maxWidth: 440, maxHeight: '80%', borderWidth: Borders.subtle, borderRadius: 22, padding: Spacing.three, gap: Spacing.two, elevation: 14, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  annotationHeading: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  annotationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  annotationTabsBar: { flexGrow: 0 },
  annotationTabsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingVertical: 2 },
  annotationTabPill: { minHeight: 34, paddingHorizontal: Spacing.two, borderRadius: 12, borderWidth: Borders.subtle, alignItems: 'center', justifyContent: 'center' },
  annotationList: { gap: Spacing.two, paddingBottom: Spacing.two },
  annotationLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  annotationCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: 14, borderWidth: Borders.subtle },
  annotationCardBody: { flex: 1, minWidth: 0, gap: 3 },
  annotationPageBadge: { paddingHorizontal: Spacing.two, paddingVertical: 5, borderRadius: 10 },
  highlightColorStrip: { width: 5, alignSelf: 'stretch', borderRadius: 4, minHeight: 24 },
  annotationEmptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.five, paddingHorizontal: Spacing.three, gap: Spacing.one },
  annotationEmptyCopy: { textAlign: 'center', lineHeight: 19 },
  settingsFullScreen: { flex: 1 },
  settingsTopBar: { minHeight: 62, paddingHorizontal: Spacing.two, paddingTop: Spacing.two, paddingBottom: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderBottomWidth: Borders.subtle },
  settingsTopCopy: { flex: 1, minWidth: 0, gap: 2 },
  settingsScrollContent: { padding: Spacing.three, gap: Spacing.three, maxWidth: 640, width: '100%', alignSelf: 'center' },
  accordionCard: { borderRadius: 18, borderWidth: Borders.subtle, overflow: 'hidden' },
  accordionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.three, gap: Spacing.two },
  accordionHeaderLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  accordionIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  accordionTitleCopy: { flex: 1, minWidth: 0, gap: 2 },
  accordionBody: { padding: Spacing.three, gap: Spacing.three, borderTopWidth: Borders.subtle },
  settingsGroup: { gap: Spacing.one },
  settingsOptionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  settingsChip: { minHeight: 36, paddingHorizontal: Spacing.two, borderRadius: 12, borderWidth: Borders.subtle, alignItems: 'center', justifyContent: 'center' },
  returnJumpContainer: { position: 'absolute', alignSelf: 'center', zIndex: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  returnJumpPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.three, paddingVertical: 8, borderRadius: 18, borderWidth: Borders.subtle, elevation: 10 },
  returnJumpDismiss: { width: 32, height: 32, borderRadius: 16, borderWidth: Borders.subtle, alignItems: 'center', justifyContent: 'center', elevation: 10 },
  selectionMenu: { position: 'absolute', zIndex: 6, top: 70, left: Spacing.two, right: Spacing.two, alignSelf: 'center', maxWidth: 620, borderWidth: Borders.subtle, borderRadius: 16, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, gap: 4, elevation: 12 },
  selectionPreview: { lineHeight: 21 }, selectionActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexWrap: 'wrap' },
  markerAction: { width: 42, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  highlightPalette: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one, borderWidth: Borders.subtle, borderRadius: 18, paddingHorizontal: Spacing.one, paddingVertical: 2, elevation: 14 },
  highlightColorTouch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  highlightColorDot: { width: 26, height: 26, borderWidth: Borders.subtle, borderRadius: 13 },
  highlightModeToggle: { minHeight: 34, paddingHorizontal: Spacing.two, borderWidth: Borders.subtle, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.one },
  selectionAction: { minHeight: 34, justifyContent: 'center', paddingHorizontal: Spacing.one, borderRadius: 10 }, selectionClose: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
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
