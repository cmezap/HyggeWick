import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, TextInput, View,
  useWindowDimensions,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BookCover } from '@/components/book-cover';
import { ThemedView } from '@/components/themed-view';
import { Button, IconButton, Surface } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { Borders, Layout, Radii, Spacing, Typography } from '@/theme';
import { DocumentStorageError, getLibraryBooks, importPdf, removeImportedDocument, type ImportedDocument } from '@/features/library/document-storage';
import { formatReadingTime, setBookFavorite, type Book } from '@/features/library/book-repository';

type SortMode = 'recent' | 'title-asc' | 'title-desc' | 'opened';
type FilterMode = 'all' | 'favorites';

const HERO_IMAGE = require('../../assets/images/Hero_Biblioteca.png');

const CONTENT_PADDING = 27; // Layout.phoneHorizontalMargin (24) + ~10%

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`;
}

function friendlyError(error: unknown) {
  if (error instanceof DocumentStorageError) return error.message;
  return 'No se pudo completar la acción. Inténtalo de nuevo.';
}

function readingStateLabel(book: Book): string {
  if (book.status === 'missing') return 'Archivo no encontrado';
  if (book.readingState === 'finished') return 'Terminado';
  if (book.readingState === 'reading') return 'Leyendo';
  return 'Pendiente';
}

function readingStateDotColor(book: Book, theme: ReturnType<typeof useTheme>): string {
  if (book.status === 'missing') return theme.error;
  if (book.readingState === 'finished') return theme.success;
  if (book.readingState === 'reading') return theme.progress;
  return theme.textMuted;
}

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  const isLandscape = windowWidth > windowHeight;
  const hasSidebar = windowWidth >= Layout.tabletLandscapeBreakpoint || (isLandscape && windowWidth >= 600);
  const effectiveWidth = containerWidth ?? (hasSidebar ? Math.max(0, windowWidth - 196) : windowWidth);

  const isWide = effectiveWidth >= 600;
  // En landscape o pantallas anchas limitamos a 5 columnas; en teléfono vertical 3 columnas más grandes
  const columns = effectiveWidth >= 700 ? 5 : effectiveWidth >= 500 ? 4 : 3;
  const gridHorizontalPadding = isWide ? CONTENT_PADDING : Spacing.three;
  const cellScale = isWide ? 0.9 : 1;
  const cellHorizontalPadding = isWide ? Spacing.three : Spacing.one + 2;
  const availableGridWidth = Math.max(0, effectiveWidth - gridHorizontalPadding * 2);
  const cellWidth = Math.floor((availableGridWidth / columns) * cellScale);
  const gridHorizontalMargin = Math.max(gridHorizontalPadding, Math.floor((effectiveWidth - cellWidth * columns) / 2));

  const compactHeader = effectiveWidth < 520;
  const heroMinHeight = isWide
    ? Math.round(Math.min(240, Math.max(180, effectiveWidth * 0.22)) * 1.1)
    : 210;

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ book: Book; expiresAt: number } | null>(null);
  const [undoSeconds, setUndoSeconds] = useState(5);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try { setBooks(await getLibraryBooks()); setErrorMessage(null); }
    catch { setErrorMessage('No se pudo cargar la biblioteca. Vuelve a intentarlo.'); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void loadBooks(); }, [loadBooks]));

  const finishRemoval = useCallback(async (book: Book) => {
    const document: ImportedDocument = { id: book.id, originalName: book.originalFileName,
      internalFileName: book.filePath.split('/').pop() ?? '', sizeBytes: book.fileSize, importedAt: book.dateAdded };
    try { await removeImportedDocument(document); setErrorMessage(null); }
    catch (error) {
      setBooks((current) => current.some((entry) => entry.id === book.id) ? current : [...current, book]);
      setErrorMessage(friendlyError(error));
    }
  }, []);

  useEffect(() => {
    if (!pendingRemoval) return;
    const { book, expiresAt } = pendingRemoval;
    const updateCountdown = () => setUndoSeconds(Math.max(0, (expiresAt - Date.now()) / 1000));
    updateCountdown();
    const interval = setInterval(updateCountdown, 100);
    const timeout = setTimeout(() => {
      setPendingRemoval((current) => current?.book.id === book.id ? null : current);
      void finishRemoval(book);
    }, Math.max(0, expiresAt - Date.now()));
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [pendingRemoval, finishRemoval]);

  const visibleBooks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const result = books.filter((book) => (filter === 'all' || book.isFavorite) &&
      (!needle || `${book.title} ${book.originalFileName} ${book.author ?? ''}`.toLocaleLowerCase().includes(needle)));
    result.sort((a, b) => {
      if (sort === 'title-asc') return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
      if (sort === 'title-desc') return b.title.localeCompare(a.title, 'es', { sensitivity: 'base' });
      if (sort === 'opened') return (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? '') || b.dateAdded.localeCompare(a.dateAdded);
      return b.dateAdded.localeCompare(a.dateAdded);
    });
    return result;
  }, [books, filter, query, sort]);

  const handleImport = async () => {
    setErrorMessage(null); setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf', copyToCacheDirectory: false, multiple: false,
      });
      if (result.canceled) return;
      const picked = result.assets[0];
      if (!picked) { setErrorMessage('No se recibió un archivo del selector. Inténtalo de nuevo.'); return; }
      if (picked.mimeType && !['application/pdf', 'application/octet-stream'].includes(picked.mimeType)) {
        setErrorMessage('Selecciona un archivo con formato PDF.'); return;
      }
      const imported = await importPdf(picked.uri, picked.name, picked.size);
      setNotice(imported.duplicate ? `"${picked.name}" ya está en tu biblioteca; no se creó otra copia.` : null);
      await loadBooks();
    } catch (error) { setErrorMessage(friendlyError(error)); }
    finally { setImporting(false); }
  };

  const toggleFavorite = async (book: Book) => {
    const next = !book.isFavorite;
    setBooks((current) => current.map((entry) => entry.id === book.id ? { ...entry, isFavorite: next } : entry));
    try { await setBookFavorite(book.id, next); }
    catch { setBooks((current) => current.map((entry) => entry.id === book.id ? { ...entry, isFavorite: book.isFavorite } : entry)); setErrorMessage('No se pudo guardar el favorito. Inténtalo de nuevo.'); }
  };

  const confirmRemove = (book: Book) => {
    if (pendingRemoval) return;
    setBooks((current) => current.filter((entry) => entry.id !== book.id));
    setPendingRemoval({ book, expiresAt: Date.now() + 5000 });
    setUndoSeconds(5);
    setErrorMessage(null);
  };

  const undoRemoval = () => {
    if (!pendingRemoval) return;
    setBooks((current) => current.some((entry) => entry.id === pendingRemoval.book.id)
      ? current : [...current, pendingRemoval.book]);
    setPendingRemoval(null);
  };

  const openBook = (book: Book) => {
    router.push({ pathname: '/book/[id]', params: { id: book.id } } as unknown as Href);
  };

  const openBookOptions = (book: Book) => {
    Alert.alert(book.title, 'Opciones del libro', [
      { text: 'Editar libro', onPress: () => router.push({ pathname: '/metadata/[id]', params: { id: book.id } } as unknown as Href) },
      { text: 'Eliminar de HyggeWick', style: 'destructive', onPress: () => confirmRemove(book) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  // ─── Book Card ───────────────────────────────────────────────────────────────
  const renderBook = ({ item }: { item: Book }) => {
    const pct = Math.round(item.readingProgress * 100);
    const dotColor = readingStateDotColor(item, theme);
    return (
      <View style={[styles.bookCell, { width: cellWidth, paddingHorizontal: cellHorizontalPadding }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Abrir ${item.title}`}
          onPress={() => openBook(item)}
          style={({ pressed }) => [styles.bookPressable, pressed && styles.pressed]}
        >
          {/* Cover – larger, prominent */}
          <BookCover book={item} favorite={item.isFavorite} />

          {/* Title – max 2 lines */}
          <ThemedText numberOfLines={2} ellipsizeMode="tail" style={styles.bookTitle}>{item.title}</ThemedText>

          {/* Author slot */}
          {item.author ? (
            <ThemedText style={styles.bookAuthor} themeColor="textMuted" numberOfLines={1} ellipsizeMode="tail">{item.author}</ThemedText>
          ) : (
            <View style={styles.authorPlaceholder} />
          )}

          {/* Reading state row */}
          <View style={styles.stateRow}>
            <View style={[styles.stateDot, { backgroundColor: dotColor }]} />
            <ThemedText style={styles.bookMeta} numberOfLines={1}
              themeColor={item.status === 'missing' ? 'error' : 'textMuted'}>
              {readingStateLabel(item)}
            </ThemedText>
            {item.status === 'available' && item.readingProgress > 0 ? (
              <ThemedText style={styles.pctText} themeColor="textMuted">{pct}%</ThemedText>
            ) : null}
          </View>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: theme.progressTrack }]}>
            {item.status === 'available' && item.readingProgress > 0 ? (
              <View style={[styles.progress, { width: `${pct}%`, backgroundColor: theme.progress }]} />
            ) : null}
          </View>
        </Pressable>

        {/* Actions row */}
        <View style={styles.bookActions}>
          <IconButton
            style={styles.compactIcon}
            accessibilityLabel={item.isFavorite ? `Quitar ${item.title} de favoritos` : `Añadir ${item.title} a favoritos`}
            variant="subtle"
            onPress={() => void toggleFavorite(item)}
            icon={<SymbolView
              name={{ ios: item.isFavorite ? 'heart.fill' : 'heart', android: item.isFavorite ? 'favorite' : 'favorite_border', web: item.isFavorite ? 'favorite' : 'favorite_border' }}
              size={18} tintColor={item.isFavorite ? theme.accent : theme.textMuted} />}
          />
          <IconButton
            style={styles.compactIcon}
            accessibilityLabel={`Opciones de ${item.title}`}
            variant="subtle"
            disabled={!!pendingRemoval}
            onPress={() => openBookOptions(item)}
            icon={<SymbolView
              name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }}
              size={19} tintColor={theme.textSecondary} />}
          />
          {item.readingTimeSeconds > 0 ? (
            <ThemedText style={styles.readingTimeBadge} themeColor="textMuted" numberOfLines={1}>
              {formatReadingTime(item.readingTimeSeconds, true)}
            </ThemedText>
          ) : null}
        </View>
      </View>
    );
  };

  // ─── Filters / sort labels ───────────────────────────────────────────────────
  const sortLabel = sort === 'recent' ? 'Más recientes' : sort === 'title-asc' ? 'Título A–Z' : sort === 'title-desc' ? 'Título Z–A' : 'Última apertura';
  const cycleSort = () => setSort((s) => s === 'recent' ? 'title-asc' : s === 'title-asc' ? 'title-desc' : s === 'title-desc' ? 'opened' : 'recent');

  const FILTERS: { value: FilterMode; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'favorites', label: 'Favoritos' },
  ];

  // ─── Hero header ─────────────────────────────────────────────────────────────
  const heroSection = (
    <View style={[styles.heroContainer, { minHeight: heroMinHeight }]}>
      {/* Hero image anchored to the right, bleeds to edges */}
      <View style={[styles.heroArtworkWrap, !isWide && styles.heroArtworkWrapPortrait]}>
        <Image
          source={HERO_IMAGE}
          style={styles.heroArtwork}
          contentFit="cover"
          contentPosition={{ right: 0, top: '45%' }}
          accessibilityLabel="Ilustración de la Biblioteca de HyggeWick"
        />
      </View>

      {/* Gradient that fades the image into the background — mirrors home hero */}
      <LinearGradient
        colors={[
          theme.background,
          theme.background,
          'rgba(1, 1, 11, 0.92)',
          'rgba(1, 1, 11, 0.55)',
          'rgba(1, 1, 11, 0.15)',
          'transparent',
        ]}
        locations={isWide ? [0, 0.25, 0.42, 0.58, 0.72, 0.86] : [0, 0.16, 0.34, 0.52, 0.70, 0.88]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Also fade the bottom so it merges seamlessly with the list */}
      <LinearGradient
        colors={['transparent', theme.background]}
        start={{ x: 0, y: 0.6 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Text + import button */}
      <View style={[styles.heroCopy, !isWide && styles.heroCopyPortrait]}>
        <View style={styles.heroEyebrowRow}>
          <ThemedText style={[styles.heroEyebrow, { color: theme.accent }]}>✦ TU BIBLIOTECA</ThemedText>
          <View style={[styles.heroEyebrowLine, { backgroundColor: theme.border }]} />
        </View>
        <ThemedText style={styles.heroTitle}>Biblioteca</ThemedText>
        <ThemedText style={styles.heroSubtitle} themeColor="textSecondary">
          Historias reunidas bajo una misma luz.
        </ThemedText>
        <ThemedText style={styles.heroCount} themeColor="textMuted">
          {books.length} {books.length === 1 ? 'libro guardado' : 'libros guardados'}
        </ThemedText>

        <View style={styles.heroImportRow}>
          <Button
            title="Importar PDF"
            loading={importing}
            onPress={() => void handleImport()}
            icon={<SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={theme.textOnAccent} />}
          />
        </View>
      </View>
    </View>
  );

  // ─── Controls (search + filters + sort) ─────────────────────────────────────
  const controls = books.length > 0 ? (
    <View style={styles.controlsBlock}>
      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={17} tintColor={theme.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por título, archivo o autor"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Buscar libros"
          returnKeyType="search"
          style={[styles.searchInput, { color: theme.text }]}
        />
        {query ? (
          <IconButton
            accessibilityLabel="Limpiar búsqueda"
            variant="subtle"
            onPress={() => setQuery('')}
            icon={<SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={16} tintColor={theme.textSecondary} />}
          />
        ) : null}
      </View>

      {/* Filter pills + sort */}
      <View style={styles.controlRow}>
        <View style={styles.pills}>
          {FILTERS.map(({ value, label }) => (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              style={[
                styles.pill,
                {
                  backgroundColor: filter === value ? theme.surfaceSelected : 'transparent',
                  borderColor: filter === value ? theme.borderEmphasized : theme.border,
                },
              ]}
            >
              <ThemedText
                type="small"
                style={{ color: filter === value ? theme.accentLavender : theme.textSecondary, fontWeight: filter === value ? '700' : '500' }}
              >
                {label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Sort control */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cambiar orden de los libros"
          style={[styles.sortControl, { borderColor: theme.border }]}
          onPress={cycleSort}
        >
          <SymbolView name={{ ios: 'arrow.up.arrow.down', android: 'sort', web: 'sort' }} size={14} tintColor={theme.accentLavender} />
          <ThemedText type="small" style={{ color: theme.textSecondary }}>{sortLabel}</ThemedText>
        </Pressable>
      </View>
    </View>
  ) : null;

  // ─── Full header component ───────────────────────────────────────────────────
  // The hero lives OUTSIDE the maxWidth-constrained block so it truly bleeds
  // edge-to-edge. Controls + messages stay inside the constrained block.
  const header = (
    <View>
      {/* ── HERO: fullwidth, no maxWidth ── */}
      {heroSection}

      {/* ── Constrained content below ── */}
      <View style={styles.headerContent}>
        {/* Error / notice banners */}
        {errorMessage ? (
          <Surface variant="subtle" style={[styles.message, { borderColor: theme.error }]}>
            <ThemedText themeColor="error" accessibilityRole="alert">{errorMessage}</ThemedText>
            {books.length === 0 ? <Button title="Volver a intentar" size="small" variant="ghost" onPress={() => void loadBooks()} /> : null}
          </Surface>
        ) : null}
        {notice ? (
          <Pressable onPress={() => setNotice(null)} accessibilityRole="button">
            <ThemedText themeColor="accentSoft">{notice}  ·  Cerrar</ThemedText>
          </Pressable>
        ) : null}

        {controls}
      </View>
    </View>
  );

  // ─── Empty / no-results states ───────────────────────────────────────────────
  const emptyLibrary = !loading && books.length === 0 ? (
    <Surface variant="subtle" style={styles.emptyState}>
      <View style={[styles.emptyIcon, { borderColor: theme.borderEmphasized }]}>
        <SymbolView name={{ ios: 'books.vertical', android: 'auto_stories', web: 'auto_stories' }} size={29} tintColor={theme.accentSoft} />
      </View>
      <ThemedText type="subtitle" style={styles.emptyTitle}>Aún no hay libros en tus estantes</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.emptyCopy}>Trae un PDF y encontrará aquí su lugar.</ThemedText>
      <Button title="Importar primer PDF" loading={importing} onPress={() => void handleImport()} />
    </Surface>
  ) : null;

  const noResults = books.length > 0 ? (
    <View style={styles.noResults}>
      <ThemedText type="subtitle">No encontramos ese libro</ThemedText>
      <ThemedText themeColor="textSecondary">Prueba otro término o limpia los filtros.</ThemedText>
      <Button title="Limpiar búsqueda y filtros" variant="ghost" onPress={() => { setQuery(''); setFilter('all'); }} />
    </View>
  ) : <View />;

  const listEmpty = loading
    ? <View style={styles.loading}><ActivityIndicator color={theme.accent} /><ThemedText themeColor="textMuted">Abriendo los estantes…</ThemedText></View>
    : emptyLibrary || noResults;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <ThemedView
      style={styles.screen}
      onLayout={(event) => {
        const measured = Math.floor(event.nativeEvent.layout.width);
        if (measured > 0 && measured !== containerWidth) setContainerWidth(measured);
      }}
    >
      <FlatList
        data={visibleBooks}
        renderItem={renderBook}
        keyExtractor={(book) => book.id}
        numColumns={columns}
        key={columns}
        ListHeaderComponent={header}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={columns > 1 ? [styles.row, { paddingHorizontal: gridHorizontalMargin }] : undefined}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={7}
      />

      {/* Undo dock */}
      {pendingRemoval ? (
        <View style={styles.undoDock} pointerEvents="box-none">
          <Surface variant="elevated" style={[styles.undoCard, { borderColor: theme.borderEmphasized }]}>
            <View style={styles.undoCopy}>
              <ThemedText style={styles.undoTitle}>Eliminación pendiente</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                "{pendingRemoval.book.title}" se quitará de tu Biblioteca en {Math.ceil(undoSeconds)} s. El PDF seguirá en el dispositivo.
              </ThemedText>
              <View style={[styles.undoTrack, { backgroundColor: theme.border }]}>
                <View style={[styles.undoProgress, { width: `${Math.max(0, Math.min(100, undoSeconds / 5 * 100))}%`, backgroundColor: theme.accent }]} />
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Deshacer eliminación"
              onPress={undoRemoval}
              style={({ pressed }) => [styles.undoButton, { backgroundColor: theme.surfaceSelected }, pressed && styles.pressed]}
            >
              <SymbolView name={{ ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' }} size={17} tintColor={theme.accent} />
              <ThemedText themeColor="accent" style={styles.undoButtonText}>Deshacer</ThemedText>
            </Pressable>
          </Surface>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ── List container ──
  listContent: {
    flexGrow: 1,
    // No paddingHorizontal here — hero must bleed fullwidth.
    // Each row and headerContent adds its own horizontal padding.
    paddingBottom: Spacing.five,
  },
  row: { justifyContent: 'flex-start', paddingHorizontal: CONTENT_PADDING },
  // ── Header block: constrained and padded, hero is fullwidth above it ──
  headerContent: {
    width: '100%',
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  // ── Hero — open fullwidth, no card, blends into background ──
  heroContainer: {
    // No borderRadius, no backgroundColor, no overflow:hidden
    // The gradients handle the blending with the background
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  heroArtworkWrap: {
    position: 'absolute',
    // Start right after the text area ends and bleed to the screen edge
    right: 0,
    left: '30%',
    top: 0,
    bottom: 0,
    // No alignItems/justifyContent center — image anchors right via contentPosition
  },
  heroArtworkWrapPortrait: {
    left: 0,
  },
  heroArtwork: {
    width: '100%',
    height: '100%',
  },
  heroCopy: {
    maxWidth: '58%',
    paddingHorizontal: CONTENT_PADDING,
    paddingVertical: Spacing.three,
    gap: 3,
    zIndex: 2,
    justifyContent: 'center',
  },
  heroCopyPortrait: {
    maxWidth: '64%',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.one },
  heroEyebrow: { fontSize: 10, letterSpacing: 0.9, fontWeight: '600' },
  heroEyebrowLine: { flex: 1, height: 1, opacity: 0.4 },
  heroTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    fontFamily: 'serif',
    color: '#E8DCFF',
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  heroCount: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  heroImportRow: {
    marginTop: Spacing.two,
    flexDirection: 'row',
  },

  // ── Controls block ──
  controlsBlock: {
    gap: Spacing.two,
    paddingHorizontal: CONTENT_PADDING,
  },

  // ── Search ──
  searchWrap: {
    minHeight: 44,
    borderRadius: Radii.medium,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    borderWidth: Borders.subtle,
  },
  searchInput: {
    ...Typography.body,
    fontSize: 14,
    flex: 1,
    minWidth: 0,
    paddingVertical: Spacing.one,
  },

  // ── Filter pills + sort ──
  controlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  pills: { flexDirection: 'row', gap: Spacing.one },
  pill: {
    minHeight: 34,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.pill,
    justifyContent: 'center',
    borderWidth: Borders.subtle,
  },
  sortControl: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: Borders.subtle,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.two,
  },

  // ── Book card ──
  bookCell: {
    minWidth: 0,
    paddingHorizontal: Spacing.three,   // 16 px horizontal padding (32 px gap between book covers)
    paddingBottom: Spacing.five,        // 32 px vertical gap between rows
  },
  bookPressable: { gap: 3 },
  pressed: { opacity: 0.78 },
  bookTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: Spacing.one + 2,
    minWidth: 0,
    // Fixed 2-line height so cards always align regardless of title length.
    // 2 lines × lineHeight 16 = 32 px.
    height: 32,
    overflow: 'hidden',
  },
  bookAuthor: { fontSize: 13, lineHeight: 16 },
  bookMeta: { fontSize: 11, lineHeight: 14 },
  authorPlaceholder: { height: 16 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  stateDot: { width: 5, height: 5, borderRadius: 3 },
  pctText: { fontSize: 10, lineHeight: 13, marginLeft: 'auto' },
  progressTrack: { height: 2, borderRadius: 2, overflow: 'hidden', marginTop: 3 },
  progress: { height: '100%', borderRadius: 2 },
  bookActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 2, marginTop: 1 },
  readingTimeBadge: { fontSize: 10, lineHeight: 13, marginLeft: 'auto' },
  compactIcon: { width: 36, height: 36 },

  // ── Messages ──
  message: { gap: Spacing.two, borderWidth: Borders.subtle, marginHorizontal: CONTENT_PADDING },

  // ── Empty state ──
  emptyState: {
    minHeight: 290,
    maxWidth: 620,
    width: '100%',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.five,
    gap: Spacing.three,
    marginHorizontal: CONTENT_PADDING,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderWidth: Borders.subtle,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { textAlign: 'center' },
  emptyCopy: { textAlign: 'center', maxWidth: 420 },

  // ── Loading / no results ──
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingHorizontal: CONTENT_PADDING },
  noResults: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingHorizontal: CONTENT_PADDING },
  // ── Undo dock ──
  undoDock: { position: 'absolute', left: Layout.phoneHorizontalMargin, right: Layout.phoneHorizontalMargin, bottom: Spacing.three, alignItems: 'center' },
  undoCard: { width: '100%', maxWidth: Layout.contentMaxWidth, minHeight: 76, padding: Spacing.three, borderRadius: Radii.large, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  undoCopy: { flex: 1, minWidth: 0, gap: Spacing.one }, undoTitle: { fontWeight: '600' },
  undoTrack: { width: '100%', height: 3, borderRadius: 2, overflow: 'hidden', marginTop: Spacing.one },
  undoProgress: { height: '100%', borderRadius: 2 },
  undoButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, borderRadius: Radii.medium },
  undoButtonText: { fontWeight: '600' },
});
