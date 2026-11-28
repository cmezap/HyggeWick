import * as DocumentPicker from 'expo-document-picker';
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
import { setBookFavorite, type Book } from '@/features/library/book-repository';

type SortMode = 'recent' | 'title-asc' | 'title-desc' | 'opened';
type FilterMode = 'all' | 'favorites';

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

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compactHeader = width < 520;
  const columns = width >= 1150 ? 6 : width >= 850 ? 5 : width >= 600 ? 4 : 3;
  const gridWidth = Math.min(width, Layout.contentMaxWidth) - Layout.phoneHorizontalMargin * 2;
  const cellWidth = Math.floor(gridWidth / columns);
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
  }, [loadBooks]);

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
      setNotice(imported.duplicate ? `“${picked.name}” ya está en tu biblioteca; no se creó otra copia.` : null);
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

  const renderBook = ({ item }: { item: Book }) => (
    <View style={[styles.bookCell, { width: cellWidth }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${item.title}`} onPress={() => openBook(item)} style={({ pressed }) => [styles.bookPressable, pressed && styles.pressed]}>
        <BookCover book={item} favorite={item.isFavorite} />
        <ThemedText numberOfLines={1} ellipsizeMode="tail" style={styles.bookTitle}>{item.title}</ThemedText>
        <View style={styles.authorSlot}>
          {item.author ? <ThemedText style={styles.bookMeta} themeColor="textMuted" numberOfLines={1} ellipsizeMode="tail">{item.author}</ThemedText> : null}
        </View>
        <ThemedText style={styles.bookMeta} numberOfLines={1} ellipsizeMode="tail" themeColor={item.status === 'missing' ? 'error' : 'textMuted'}>
          {item.status === 'missing' ? 'Archivo no encontrado' : `${formatFileSize(item.fileSize)} · ${item.readingState === 'finished' ? 'Terminado' : item.readingState === 'reading' ? `${Math.round(item.readingProgress * 100)}% · Leyendo` : 'Pendiente'}`}
        </ThemedText>
        <View style={[styles.progressTrack, { backgroundColor: theme.progressTrack }]}>
          {item.status === 'available' && item.readingProgress > 0 ? <View style={[styles.progress, { width: `${Math.round(item.readingProgress * 100)}%`, backgroundColor: theme.progress }]} /> : null}
        </View>
      </Pressable>
      <View style={styles.bookActions}>
        <IconButton style={styles.compactIcon} accessibilityLabel={item.isFavorite ? `Quitar ${item.title} de favoritos` : `Añadir ${item.title} a favoritos`}
          variant="subtle" onPress={() => void toggleFavorite(item)} icon={<SymbolView
            name={{ ios: item.isFavorite ? 'heart.fill' : 'heart', android: item.isFavorite ? 'favorite' : 'favorite_border', web: item.isFavorite ? 'favorite' : 'favorite_border' }}
            size={18} tintColor={item.isFavorite ? theme.accent : theme.textMuted} />} />
        <IconButton style={styles.compactIcon} accessibilityLabel={`Opciones de ${item.title}`} variant="subtle" disabled={!!pendingRemoval} onPress={() => openBookOptions(item)} icon={<SymbolView
          name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }} size={19} tintColor={theme.textSecondary} />} />
      </View>
    </View>
  );

  const header = (
    <View style={styles.headerContent}>
      <View style={[styles.header, compactHeader && styles.compactHeader]}>
        <View style={styles.headingCopy}>
          <ThemedText style={styles.libraryTitle}>Biblioteca</ThemedText>
          <ThemedText style={styles.librarySubtitle} themeColor="textSecondary">Historias reunidas bajo una misma luz.</ThemedText>
          <ThemedText style={styles.libraryCount} themeColor="textMuted">{books.length} {books.length === 1 ? 'libro' : 'libros'} guardados</ThemedText>
        </View>
        <Button title="Importar PDF" loading={importing} style={compactHeader && styles.compactImportButton} onPress={() => void handleImport()}
          icon={<SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={theme.textOnAccent} />} />
      </View>
      {errorMessage ? <Surface variant="subtle" style={[styles.message, { borderColor: theme.error }]}>
        <ThemedText themeColor="error" accessibilityRole="alert">{errorMessage}</ThemedText>
        {books.length === 0 ? <Button title="Volver a intentar" size="small" variant="ghost" onPress={() => void loadBooks()} /> : null}
      </Surface> : null}
      {notice ? <Pressable onPress={() => setNotice(null)} accessibilityRole="button"><ThemedText themeColor="accentSoft">{notice}  ·  Cerrar</ThemedText></Pressable> : null}
      {books.length > 0 ? <>
        <View style={[styles.searchWrap, { backgroundColor: theme.backgroundSecondary }]}>
          <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={18} tintColor={theme.textMuted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por título, archivo o autor"
            placeholderTextColor={theme.textMuted} accessibilityLabel="Buscar libros" returnKeyType="search" style={[styles.searchInput, { color: theme.text }]} />
          {query ? <IconButton accessibilityLabel="Limpiar búsqueda" variant="subtle" onPress={() => setQuery('')}
            icon={<SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={17} tintColor={theme.textSecondary} />} /> : null}
        </View>
        <View style={styles.controlRow}>
          <View style={styles.pills}>
            {(['all', 'favorites'] as FilterMode[]).map((value) => <Pressable key={value} onPress={() => setFilter(value)}
              style={[styles.pill, { backgroundColor: filter === value ? theme.surfaceSelected : 'transparent' }]}>
              <ThemedText type="small" themeColor={filter === value ? 'accent' : 'textSecondary'}>{value === 'all' ? 'Todos' : 'Favoritos'}</ThemedText>
            </Pressable>)}
          </View>
          <View style={styles.sortWrap}>
            <ThemedText type="small" themeColor="textMuted">Orden:</ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel="Cambiar orden de los libros" style={[styles.sortControl, { borderColor: theme.border }]}
            onPress={() => setSort((current) => current === 'recent' ? 'title-asc' : current === 'title-asc' ? 'title-desc' : current === 'title-desc' ? 'opened' : 'recent')}>
            <SymbolView name={{ ios: 'arrow.up.arrow.down', android: 'sort', web: 'sort' }} size={15} tintColor={theme.accent} />
            <ThemedText type="small">{sort === 'recent' ? 'Recientes' : sort === 'title-asc' ? 'Título A–Z' : sort === 'title-desc' ? 'Título Z–A' : 'Última apertura'}</ThemedText>
          </Pressable>
          </View>
        </View>
      </> : null}
    </View>
  );

  const empty = !loading && books.length === 0 ? (
    <Surface variant="subtle" style={styles.emptyState}>
      <View style={[styles.emptyIcon, { borderColor: theme.borderEmphasized }]}><SymbolView name={{ ios: 'books.vertical', android: 'auto_stories', web: 'auto_stories' }} size={29} tintColor={theme.accentSoft} /></View>
      <ThemedText type="subtitle" style={styles.emptyTitle}>Aún no hay libros en tus estantes</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.emptyCopy}>Trae un PDF y encontrará aquí su lugar.</ThemedText>
      <Button title="Importar primer PDF" loading={importing} onPress={() => void handleImport()} />
    </Surface>
  ) : null;

  return (
    <ThemedView style={styles.screen}>
      <FlatList data={visibleBooks} renderItem={renderBook} keyExtractor={(book) => book.id} numColumns={columns}
        key={columns} ListHeaderComponent={header} ListEmptyComponent={loading ? <View style={styles.loading}><ActivityIndicator color={theme.accent} /><ThemedText themeColor="textMuted">Abriendo los estantes…</ThemedText></View> : empty || (books.length ? <View style={styles.noResults}>
          <ThemedText type="subtitle">No encontramos ese libro</ThemedText><ThemedText themeColor="textSecondary">Prueba otro término o limpia los filtros.</ThemedText>
          <Button title="Limpiar búsqueda y filtros" variant="ghost" onPress={() => { setQuery(''); setFilter('all'); }} />
        </View> : <View />)}
        contentContainerStyle={styles.listContent} columnWrapperStyle={columns > 1 ? styles.row : undefined}
        showsVerticalScrollIndicator={false} initialNumToRender={12} windowSize={7} />
      {pendingRemoval ? <View style={styles.undoDock} pointerEvents="box-none">
        <Surface variant="elevated" style={[styles.undoCard, { borderColor: theme.borderEmphasized }]}>
          <View style={styles.undoCopy}>
            <ThemedText style={styles.undoTitle}>Eliminación pendiente</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              “{pendingRemoval.book.title}” se quitará de tu Biblioteca en {Math.ceil(undoSeconds)} s. El PDF seguirá en el dispositivo.
            </ThemedText>
            <View style={[styles.undoTrack, { backgroundColor: theme.border }]}>
              <View style={[styles.undoProgress, { width: `${Math.max(0, Math.min(100, undoSeconds / 5 * 100))}%`, backgroundColor: theme.accent }]} />
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Deshacer eliminación" onPress={undoRemoval}
            style={({ pressed }) => [styles.undoButton, { backgroundColor: theme.surfaceSelected }, pressed && styles.pressed]}>
            <SymbolView name={{ ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' }} size={17} tintColor={theme.accent} />
            <ThemedText themeColor="accent" style={styles.undoButtonText}>Deshacer</ThemedText>
          </Pressable>
        </Surface>
      </View> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  listContent: { flexGrow: 1, paddingHorizontal: Layout.phoneHorizontalMargin, paddingVertical: Spacing.three, maxWidth: Layout.contentMaxWidth, alignSelf: 'center' },
  undoDock: { position: 'absolute', left: Layout.phoneHorizontalMargin, right: Layout.phoneHorizontalMargin, bottom: Spacing.three, alignItems: 'center' },
  undoCard: { width: '100%', maxWidth: Layout.contentMaxWidth, minHeight: 76, padding: Spacing.three, borderRadius: Radii.large, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  undoCopy: { flex: 1, minWidth: 0, gap: Spacing.one }, undoTitle: { fontWeight: '600' },
  undoTrack: { width: '100%', height: 3, borderRadius: 2, overflow: 'hidden', marginTop: Spacing.one },
  undoProgress: { height: '100%', borderRadius: 2 },
  undoButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, borderRadius: Radii.medium },
  undoButtonText: { fontWeight: '600' },
  headerContent: { width: '100%', maxWidth: Layout.contentMaxWidth, alignSelf: 'center', gap: Spacing.two, marginBottom: Spacing.three, paddingHorizontal: Layout.phoneHorizontalMargin },
  
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  compactHeader: { flexDirection: 'column', alignItems: 'stretch', gap: Spacing.two },
  compactImportButton: { alignSelf: 'flex-start' },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 }, message: { gap: Spacing.two, borderWidth: Borders.subtle },
  libraryTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', fontFamily: Typography.literary.fontFamily },
  librarySubtitle: { fontSize: 13, lineHeight: 18 },
  libraryCount: { fontSize: 11, lineHeight: 15 },
  searchWrap: { minHeight: 44, borderRadius: Radii.medium, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingLeft: Spacing.three },
  searchInput: { ...Typography.body, fontSize: 14, flex: 1, minWidth: 0, paddingVertical: Spacing.one },
  controlRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  pills: { flexDirection: 'row', gap: Spacing.one }, pill: { minHeight: 36, paddingHorizontal: Spacing.three, borderRadius: Radii.pill, justifyContent: 'center' },
  sortWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }, sortControl: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderWidth: Borders.subtle, borderRadius: Radii.medium, paddingHorizontal: Spacing.two },
  bookCell: { minWidth: 0, paddingHorizontal: Spacing.two, paddingBottom: Spacing.two }, bookPressable: { gap: 2 }, pressed: { opacity: 0.78 },
  bookTitle: { fontSize: 12, lineHeight: 15, fontWeight: '600', marginTop: 3, height: 15, minWidth: 0 }, bookMeta: { fontSize: 11, lineHeight: 14 }, authorSlot: { height: 14, justifyContent: 'center' }, progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 2 }, progress: { height: '100%' },
  bookActions: { flexDirection: 'row', justifyContent: 'flex-start', gap: 2 }, compactIcon: { width: 38, height: 38 },
  emptyState: { minHeight: 290, maxWidth: 620, width: '100%', alignSelf: 'center', justifyContent: 'center', alignItems: 'center', padding: Spacing.five, gap: Spacing.three },
  emptyIcon: { width: 64, height: 64, borderWidth: Borders.subtle, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { textAlign: 'center' }, emptyCopy: { textAlign: 'center', maxWidth: 420 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: Spacing.three }, noResults: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: Spacing.two }, row: { justifyContent: 'flex-start' },
});
