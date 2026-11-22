import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, TextInput, View,
  useWindowDimensions,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
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

function BookCover({ book, index }: { book: Book; index: number }) {
  const theme = useTheme();
  const motifs = [
    { glyph: '✦', tint: theme.accent }, { glyph: '☾', tint: theme.accentLavender },
    { glyph: '❧', tint: theme.success }, { glyph: '✧', tint: theme.warning },
  ];
  const motif = motifs[index % motifs.length]!;
  return (
    <View style={[styles.cover, { backgroundColor: theme.surfaceSelected, borderColor: theme.border }]}>
      {book.coverPath ? <Image source={{ uri: book.coverPath }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
        <>
          <View style={[styles.coverRule, { backgroundColor: motif.tint }]} />
          <ThemedText style={[styles.coverGlyph, { color: motif.tint }]}>{motif.glyph}</ThemedText>
          <ThemedText numberOfLines={3} ellipsizeMode="tail" style={styles.coverTitle}>{book.title.replace(/\.pdf$/i, '')}</ThemedText>
          <ThemedText type="small" themeColor="textMuted" style={styles.coverFormat}>PDF · HYGGEWICK</ThemedText>
        </>
      )}
      {book.isFavorite ? <View style={[styles.coverFavorite, { backgroundColor: theme.background }]}>
        <SymbolView name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }} size={14} tintColor={theme.accent} />
      </View> : null}
    </View>
  );
}

export default function LibraryScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compactHeader = width < 520;
  const columns = width >= Layout.tabletLandscapeBreakpoint ? 5 : width >= Layout.tabletBreakpoint ? 4 : width >= 520 ? 3 : 2;
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [notice, setNotice] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try { setBooks(await getLibraryBooks()); setErrorMessage(null); }
    catch { setErrorMessage('No se pudo cargar la biblioteca. Vuelve a intentarlo.'); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void loadBooks(); }, [loadBooks]));

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
      await importPdf(picked.uri, picked.name, picked.size);
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

  const confirmRemove = (book: Book) => Alert.alert(
    'Eliminar de HyggeWick',
    `Se eliminará “${book.title}” de la biblioteca y de este dispositivo.`,
    [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => {
      const document: ImportedDocument = { id: book.id, originalName: book.originalFileName,
        internalFileName: book.filePath.split('/').pop() ?? '', sizeBytes: book.fileSize, importedAt: book.dateAdded };
      void removeImportedDocument(document).then(() => {
        setBooks((current) => current.filter((entry) => entry.id !== book.id)); setErrorMessage(null);
      }).catch((error: unknown) => setErrorMessage(friendlyError(error)));
    } }],
  );

  const renderBook = ({ item, index }: { item: Book; index: number }) => (
    <View style={styles.bookCell}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Seleccionar ${item.title}`} onPress={() => {
        if (item.status === 'missing') setNotice(`No se encontró el PDF de “${item.title}”. Puedes quitar el registro de la biblioteca.`);
        else setNotice('El lector PDF estará disponible en una próxima etapa.');
      }} style={({ pressed }) => [styles.bookPressable, pressed && styles.pressed]}>
        <BookCover book={item} index={index} />
        <ThemedText numberOfLines={2} ellipsizeMode="tail" style={styles.bookTitle}>{item.title}</ThemedText>
        <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>{item.author || 'Documento PDF'}</ThemedText>
        <ThemedText type="small" themeColor={item.status === 'missing' ? 'error' : 'textMuted'}>
          {item.status === 'missing' ? 'Archivo no encontrado' : `${formatFileSize(item.fileSize)} · ${item.readingProgress > 0 ? `${Math.round(item.readingProgress * 100)}% leído` : 'PDF'}`}
        </ThemedText>
        {item.status === 'available' && item.readingProgress > 0 ? <View style={[styles.progressTrack, { backgroundColor: theme.progressTrack }]}>
          <View style={[styles.progress, { width: `${Math.round(item.readingProgress * 100)}%`, backgroundColor: theme.progress }]} />
        </View> : null}
      </Pressable>
      <View style={styles.bookActions}>
        <IconButton accessibilityLabel={item.isFavorite ? `Quitar ${item.title} de favoritos` : `Añadir ${item.title} a favoritos`}
          variant="subtle" onPress={() => void toggleFavorite(item)} icon={<SymbolView
            name={{ ios: item.isFavorite ? 'heart.fill' : 'heart', android: item.isFavorite ? 'favorite' : 'favorite_border', web: item.isFavorite ? 'favorite' : 'favorite_border' }}
            size={19} tintColor={item.isFavorite ? theme.accent : theme.textMuted} />} />
        <IconButton accessibilityLabel={`Eliminar ${item.title} de HyggeWick`} variant="subtle" onPress={() => confirmRemove(item)} icon={<SymbolView
          name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={19} tintColor={theme.textSecondary} />} />
      </View>
    </View>
  );

  const header = (
    <View style={styles.headerContent}>
      <View style={[styles.header, compactHeader && styles.compactHeader]}>
        <View style={styles.headingCopy}>
          <ThemedText type="title">Biblioteca</ThemedText>
          <ThemedText themeColor="textSecondary">Historias reunidas bajo una misma luz.</ThemedText>
          <ThemedText type="small" themeColor="textMuted">{books.length} {books.length === 1 ? 'libro' : 'libros'} guardados</ThemedText>
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, listContent: { flexGrow: 1, paddingHorizontal: Layout.phoneHorizontalMargin, paddingVertical: Spacing.five },
  headerContent: { width: '100%', maxWidth: Layout.contentMaxWidth, alignSelf: 'center', gap: Spacing.four, marginBottom: Spacing.four },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  compactHeader: { flexDirection: 'column', alignItems: 'stretch', gap: Spacing.two },
  compactImportButton: { alignSelf: 'flex-start' },
  headingCopy: { flex: 1, minWidth: 0, gap: Spacing.one }, message: { gap: Spacing.two, borderWidth: Borders.subtle },
  searchWrap: { minHeight: 50, borderRadius: Radii.medium, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingLeft: Spacing.three },
  searchInput: { ...Typography.body, flex: 1, minWidth: 0, paddingVertical: Spacing.two },
  controlRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  pills: { flexDirection: 'row', gap: Spacing.one }, pill: { minHeight: 40, paddingHorizontal: Spacing.three, borderRadius: Radii.pill, justifyContent: 'center' },
  sortWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }, sortControl: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderWidth: Borders.subtle, borderRadius: Radii.medium, paddingHorizontal: Spacing.two },
  bookCell: { flex: 1, minWidth: 0, paddingHorizontal: Spacing.one, paddingBottom: Spacing.four, maxWidth: 220 }, bookPressable: { gap: Spacing.one }, pressed: { opacity: 0.78 },
  cover: { width: '100%', minWidth: 0, aspectRatio: 2 / 3, borderRadius: Radii.medium, borderWidth: Borders.subtle, overflow: 'hidden', padding: Spacing.two, justifyContent: 'center', alignItems: 'center' },
  coverRule: { position: 'absolute', top: 12, bottom: 12, left: 10, width: 2, opacity: 0.75 }, coverGlyph: { fontSize: 28, marginBottom: Spacing.one },
  coverTitle: { width: '100%', flexShrink: 1, textAlign: 'center', fontFamily: 'serif', fontSize: 14, lineHeight: 18 }, coverFormat: { position: 'absolute', bottom: 10, letterSpacing: 0.7, fontSize: 8 },
  coverFavorite: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bookTitle: { fontWeight: '600', marginTop: Spacing.one, minHeight: 40 }, progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: Spacing.one }, progress: { height: '100%' },
  bookActions: { flexDirection: 'row', justifyContent: 'flex-start', gap: Spacing.one, marginTop: Spacing.one },
  emptyState: { minHeight: 290, maxWidth: 620, width: '100%', alignSelf: 'center', justifyContent: 'center', alignItems: 'center', padding: Spacing.five, gap: Spacing.three },
  emptyIcon: { width: 64, height: 64, borderWidth: Borders.subtle, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { textAlign: 'center' }, emptyCopy: { textAlign: 'center', maxWidth: 420 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: Spacing.three }, noResults: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: Spacing.two }, row: { justifyContent: 'flex-start' },
});
