import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Surface } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { getBookById, updateBookMetadata, type Book } from '@/features/library/book-repository';
import { storeBookCover } from '@/features/library/document-storage';
import { Borders, Layout, Radii, Spacing, Typography } from '@/theme';

type Form = { title: string; author: string; description: string; genre: string; series: string; volumeNumber: string; language: string; coverPath: string | null };
const EMPTY_FORM: Form = { title: '', author: '', description: '', genre: '', series: '', volumeNumber: '', language: '', coverPath: null };
const optional = (value: string) => value.trim() || null;

export default function MetadataEditorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const wide = width >= Layout.tabletBreakpoint;
  const [book, setBook] = useState<Book | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [initial, setInitial] = useState<Form>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  const guardedNavigation = useMemo(() => navigation as unknown as {
    addListener: (event: 'beforeRemove', callback: (event: { preventDefault: () => void; data: { action: unknown } }) => void) => () => void;
    dispatch: (action: unknown) => void;
  }, [navigation]);

  useEffect(() => {
    let active = true;
    void getBookById(id).then((result) => {
      if (!active) return;
      if (!result) { setError('No se encontró este libro en la biblioteca.'); return; }
      setBook(result);
      const value: Form = { title: result.title, author: result.author ?? '', description: result.description ?? '', genre: result.genre ?? '', series: result.series ?? '', volumeNumber: result.volumeNumber ?? '', language: result.language ?? '', coverPath: result.coverPath };
      setForm(value); setInitial(value);
    }).catch(() => setError('No se pudieron cargar los metadatos del libro.')).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const leave = useCallback(() => { router.back(); }, [router]);
  useEffect(() => guardedNavigation.addListener('beforeRemove', (event) => {
    if (!dirty) return;
    event.preventDefault();
    Alert.alert('¿Descartar cambios?', 'Los cambios que no hayas guardado se perderán.', [
      { text: 'Seguir editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => { setInitial(form); setTimeout(() => guardedNavigation.dispatch(event.data.action), 0); } },
    ]);
  }), [dirty, form, guardedNavigation]);

  const setField = (field: keyof Form, value: string | null) => setForm((current) => ({ ...current, [field]: value }));

  const chooseCover = async () => {
    setError(null); setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: false, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset || (asset.mimeType && !asset.mimeType.startsWith('image/'))) { setError('Selecciona un archivo de imagen.'); return; }
      const coverPath = await storeBookCover(asset.uri, asset.name);
      setField('coverPath', coverPath);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : 'No se pudo seleccionar la portada.');
    } finally { setPicking(false); }
  };

  const save = async () => {
    const title = form.title.trim();
    if (!title) { setError('El título es obligatorio.'); return; }
    setError(null); setSaving(true);
    try {
      const updated = await updateBookMetadata(id, { title, author: optional(form.author), description: optional(form.description), genre: optional(form.genre), series: optional(form.series), volumeNumber: optional(form.volumeNumber), language: optional(form.language), coverPath: form.coverPath });
      if (!updated) { setError('No se encontró este libro en la biblioteca.'); return; }
      const savedForm = { ...form, title };
      setForm(savedForm); setInitial(savedForm);
      router.back();
    } catch { setError('No se pudieron guardar los cambios. Inténtalo de nuevo.'); }
    finally { setSaving(false); }
  };

  const field = (label: string, key: keyof Form, options: { multiline?: boolean; required?: boolean } = {}) => (
    <View style={styles.field} key={key}>
      <ThemedText type="smallBold">{label}{options.required ? ' *' : ''}</ThemedText>
      <TextInput value={String(form[key] ?? '')} onChangeText={(value) => setField(key, value)} multiline={options.multiline}
        textAlignVertical={options.multiline ? 'top' : 'center'} accessibilityLabel={label}
        placeholder={label} placeholderTextColor={theme.textMuted}
        style={[styles.input, options.multiline && styles.multiline, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]} />
    </View>
  );

  return <ThemedView style={styles.screen}>
    <Stack.Screen options={{ title: 'Editar metadatos', headerShown: false }} />
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        <View style={styles.heading}>
          <Button title="Volver" variant="ghost" onPress={leave} />
          <View style={styles.headingCopy}><ThemedText type="title">Editar libro</ThemedText><ThemedText themeColor="textSecondary">Actualiza la información de tu biblioteca.</ThemedText></View>
        </View>
        {loading ? <View style={styles.loading}><ActivityIndicator color={theme.accent} /></View> : book ? <>
          <Surface variant="subtle" style={styles.formCard}>
            <View style={[styles.formGrid, wide && styles.wideGrid]}>
              <View style={styles.coverColumn}>
                <View style={[styles.coverPreview, { backgroundColor: theme.surfaceSelected, borderColor: theme.border }]}>
                  {form.coverPath ? <Image source={{ uri: form.coverPath }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <ThemedText themeColor="textMuted">Sin portada personalizada</ThemedText>}
                </View>
                <Button title={picking ? 'Seleccionando…' : 'Elegir portada'} variant="secondary" loading={picking} onPress={() => void chooseCover()} />
                {form.coverPath ? <Button title="Quitar portada" variant="ghost" onPress={() => setField('coverPath', null)} /> : null}
              </View>
              <View style={styles.fields}>
                {field('Título', 'title', { required: true })}
                {field('Autor', 'author')}
                {field('Descripción o sinopsis', 'description', { multiline: true })}
                <View style={styles.twoFields}>{field('Género o categoría', 'genre')}{field('Idioma', 'language')}</View>
                <View style={styles.twoFields}>{field('Serie', 'series')}{field('Número de volumen', 'volumeNumber')}</View>
              </View>
            </View>
            <ThemedText type="small" themeColor="textMuted">* Campo obligatorio</ThemedText>
          </Surface>
          {error ? <ThemedText themeColor="error" accessibilityRole="alert">{error}</ThemedText> : null}
          <View style={styles.actions}><Button title="Cancelar" variant="secondary" onPress={leave} /><Button title="Guardar cambios" loading={saving} onPress={() => void save()} /></View>
        </> : error ? <ThemedText themeColor="error">{error}</ThemedText> : null}
      </View>
    </ScrollView>
  </ThemedView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, scrollContent: { flexGrow: 1, padding: Spacing.four }, container: { width: '100%', maxWidth: Layout.contentMaxWidth, alignSelf: 'center', gap: Spacing.four },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three }, headingCopy: { flex: 1, gap: Spacing.one },
  formCard: { gap: Spacing.four }, formGrid: { gap: Spacing.four }, wideGrid: { flexDirection: 'row', alignItems: 'flex-start' },
  coverColumn: { gap: Spacing.two, alignItems: 'stretch' }, coverPreview: { width: 150, aspectRatio: 2 / 3, borderWidth: Borders.subtle, borderRadius: Radii.medium, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: Spacing.two },
  fields: { flex: 1, minWidth: 0, gap: Spacing.three }, field: { flex: 1, minWidth: 0, gap: Spacing.one }, twoFields: { flexDirection: 'row', gap: Spacing.three },
  input: { minHeight: 48, borderWidth: Borders.subtle, borderRadius: Radii.medium, paddingHorizontal: Spacing.three, ...Typography.body }, multiline: { minHeight: 120, paddingTop: Spacing.two },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: Spacing.two }, loading: { minHeight: 200, justifyContent: 'center', alignItems: 'center' },
});
