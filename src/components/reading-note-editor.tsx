import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, IconButton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { Borders, Radii, Spacing } from '@/theme';
import type { ReadingNote } from '@/features/library/reading-note-repository';

export function ReadingNoteEditor({ visible, bookTitle, page, note, initialContent, onClose, onSave }: {
  visible: boolean;
  bookTitle: string;
  page: number;
  note?: ReadingNote | null;
  initialContent?: string;
  onClose: () => void;
  onSave: (input: { title: string; content: string }) => Promise<void>;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const nextTitle = note?.title ?? '';
    const nextContent = note?.content ?? initialContent ?? '';
    setTitle(nextTitle);
    setContent(nextContent);
    setOriginalTitle(nextTitle);
    setOriginalContent(nextContent);
  }, [visible, note?.id, initialContent]);

  const requestClose = () => {
    if (saving) return;
    if (title !== originalTitle || content !== originalContent) {
      Alert.alert('Descartar cambios', 'Hay cambios sin guardar en esta nota.', [
        { text: 'Seguir escribiendo', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: onClose },
      ]);
    } else onClose();
  };

  const save = async () => {
    if (!content.trim()) {
      Alert.alert('Añade una reflexión', 'Escribe algo antes de guardar la nota.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), content: content.trim() });
      Alert.alert(note ? 'Nota actualizada' : 'Nota guardada', 'La encontrarás en la ficha de este libro.');
    } catch {
      Alert.alert('No se pudo guardar la nota', 'Conservamos el texto en este formulario. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={requestClose}>
    <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable accessibilityLabel="Cerrar ventana" style={styles.modalBackdrop} onPress={requestClose} />
      <View style={[styles.noteModal, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.modalHeading}>
          <View style={styles.modalTitleGroup}>
            <ThemedText type="subtitle">{note ? 'Editar reflexión' : 'Una nota al margen'}</ThemedText>
            <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>{bookTitle} · Página {page}</ThemedText>
          </View>
          <IconButton accessibilityLabel="Cerrar editor" variant="subtle" disabled={saving} onPress={requestClose}
            icon={<ThemedText type="subtitle" themeColor="textSecondary">×</ThemedText>} />
        </View>
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TextInput accessibilityLabel="Título opcional de la nota" value={title} onChangeText={setTitle}
            placeholder="Un título para volver a esta idea…" placeholderTextColor={theme.textMuted}
            maxLength={120} returnKeyType="next"
            style={[styles.titleInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]} />
          <TextInput accessibilityLabel="Contenido de la nota" value={content} onChangeText={setContent}
            placeholder="¿Qué te dejó esta página? Escribe aquí tu reflexión…" placeholderTextColor={theme.textMuted}
            multiline textAlignVertical="top" scrollEnabled style={[styles.contentInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]} />
          <ThemedText type="small" themeColor="textMuted">Tu reflexión queda guardada junto a esta página.</ThemedText>
          <View style={styles.modalActions}>
            <Button title="Cancelar" variant="ghost" disabled={saving} onPress={requestClose} />
            <Button title={note ? 'Guardar cambios' : 'Guardar nota'} loading={saving} disabled={saving} onPress={() => void save()} />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.three },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4, 2, 12, 0.72)' },
  noteModal: { width: '100%', maxWidth: 560, maxHeight: '90%', borderWidth: Borders.subtle, borderRadius: Radii.large, padding: Spacing.four, gap: Spacing.three },
  modalHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, modalTitleGroup: { flex: 1, minWidth: 0, gap: Spacing.one },
  formScroll: { flexShrink: 1 }, formContent: { gap: Spacing.two, paddingBottom: Spacing.one },
  titleInput: { minHeight: 48, borderWidth: Borders.subtle, borderRadius: Radii.medium, paddingHorizontal: Spacing.three, fontSize: 15 },
  contentInput: { minHeight: 240, maxHeight: 430, borderWidth: Borders.subtle, borderRadius: Radii.medium, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16, lineHeight: 24 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: Spacing.two, paddingTop: Spacing.one },
});
