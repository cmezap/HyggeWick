import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { Spacing } from '@/theme';

export default function PdfPocWebScreen() {
  return (
    <ThemedView style={{ flex: 1, padding: Spacing.four, justifyContent: 'center', alignItems: 'center', gap: Spacing.three }}>
      <ThemedText type="subtitle">POC disponible en Android</ThemedText>
      <ThemedText themeColor="textSecondary">El motor PDF de esta prueba utiliza vistas nativas y no incluye implementación web.</ThemedText>
      <Button title="Volver a Biblioteca" variant="ghost" onPress={() => router.replace('/library')} />
    </ThemedView>
  );
}
