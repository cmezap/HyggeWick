import { PdfView, type OnErrorEventPayload, type OnLoadCompleteEventPayload, type OnPageChangedEventPayload } from '@kishannareshpal/expo-pdf';
import { File } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { getLibraryBooks } from '@/features/library/document-storage';
import type { Book } from '@/features/library/book-repository';
import { Borders, Radii, Spacing } from '@/theme';

type ReaderState = { page: number; pageCount: number };

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileAvailable(book: Book) {
  try {
    return new File(book.filePath).exists;
  } catch {
    return false;
  }
}

export default function PdfPocScreen() {
  const theme = useTheme();
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [readingState, setReadingState] = useState<ReaderState | null>(null);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getLibraryBooks()
      .then((result) => { if (active) setBooks(result); })
      .catch(() => { if (active) setLoadError('No se pudo leer la biblioteca local.'); })
      .finally(() => { if (active) setLoadingBooks(false); });
    return () => { active = false; };
  }, []);

  const openBook = (book: Book) => {
    setPdfError(null);
    setReadingState(null);
    setSelectedBook(book);
  };

  const closeReader = () => {
    setSelectedBook(null);
    setReadingState(null);
    setPdfError(null);
  };

  const onLoadComplete = (event: OnLoadCompleteEventPayload) => {
    setReadingState({ page: 1, pageCount: event.pageCount });
  };

  const onPageChanged = (event: OnPageChangedEventPayload) => {
    setReadingState({ page: event.pageIndex + 1, pageCount: event.pageCount });
  };

  const onError = (event: OnErrorEventPayload) => {
    setPdfError(`${event.code}: ${event.message}`);
  };

  if (selectedBook) {
    return (
      <ThemedView style={styles.screen}>
        <View style={[styles.readerHeader, { borderBottomColor: theme.divider }]}>
          <Button title="Volver a la lista" variant="ghost" size="small" onPress={closeReader} />
          <ThemedText numberOfLines={1} style={styles.readerTitle}>{selectedBook.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {readingState ? `Página ${readingState.page} / ${readingState.pageCount}` : 'Cargando documento…'}
          </ThemedText>
        </View>
        {pdfError ? (
          <View style={styles.centerState}>
            <ThemedText themeColor="error">No se pudo abrir este PDF.</ThemedText>
            <ThemedText type="small" themeColor="textMuted">{pdfError}</ThemedText>
          </View>
        ) : (
          <View style={styles.viewer}>
            {!readingState ? <ActivityIndicator style={styles.loadingOverlay} color={theme.accent} /> : null}
            <PdfView
              key={selectedBook.id}
              style={styles.pdf}
              uri={selectedBook.filePath}
              fitMode="width"
              autoScale
              doubleTapToZoom
              onLoadComplete={onLoadComplete}
              onPageChanged={onPageChanged}
              onError={onError}
            />
          </View>
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.listHeader}>
        <Button title="Cerrar POC" variant="ghost" size="small" onPress={() => router.replace('/library')} />
        <ThemedText type="title">Prueba técnica del motor PDF</ThemedText>
        <ThemedText themeColor="textSecondary">
          Selecciona un archivo importado. Usa scroll para navegar y pellizco o doble toque para ampliar.
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted">
          El motor informa página y total. Esta API no ofrece salto programático de página ni evento de escala.
        </ThemedText>
      </View>

      {loadingBooks ? (
        <View style={styles.centerState}><ActivityIndicator color={theme.accent} /><ThemedText themeColor="textMuted">Buscando PDFs locales…</ThemedText></View>
      ) : loadError ? (
        <View style={styles.centerState}><ThemedText themeColor="error">{loadError}</ThemedText></View>
      ) : books.length === 0 ? (
        <View style={styles.centerState}><ThemedText>No hay PDFs importados para probar.</ThemedText><ThemedText type="small" themeColor="textMuted">Importa documentos desde Biblioteca y vuelve a abrir esta ruta.</ThemedText></View>
      ) : (
        <ScrollView contentContainerStyle={styles.bookList}>
          {books.map((book) => {
            const available = book.status === 'available' && fileAvailable(book);
            return (
              <Pressable
                key={book.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: !available }}
                disabled={!available}
                onPress={() => openBook(book)}
                style={({ pressed }) => [styles.bookRow, { borderColor: theme.border, backgroundColor: theme.surface }, pressed && styles.pressed, !available && styles.unavailable]}>
                <View style={styles.bookCopy}>
                  <ThemedText numberOfLines={2}>{book.title}</ThemedText>
                  <ThemedText type="small" themeColor="textMuted">
                    {formatSize(book.fileSize)} · {book.totalPages ? `${book.totalPages} páginas conocidas` : 'total de páginas desconocido'} · {available ? book.filePath.split('/').pop() : 'archivo no disponible'}
                  </ThemedText>
                </View>
                <ThemedText type="smallBold" themeColor={available ? 'accent' : 'textDisabled'}>{available ? 'Abrir' : 'No disponible'}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listHeader: { padding: Spacing.four, gap: Spacing.two },
  bookList: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.two },
  bookRow: { minHeight: 64, borderWidth: Borders.subtle, borderRadius: Radii.medium, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  bookCopy: { flex: 1, gap: Spacing.one },
  unavailable: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  readerHeader: { minHeight: 58, paddingHorizontal: Spacing.two, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, borderBottomWidth: Borders.subtle },
  readerTitle: { flex: 1, textAlign: 'center' },
  viewer: { flex: 1, backgroundColor: '#eeeeee' },
  pdf: { flex: 1 },
  loadingOverlay: { position: 'absolute', top: Spacing.four, alignSelf: 'center', zIndex: 1 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
});
