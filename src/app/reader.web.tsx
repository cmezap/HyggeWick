import { router, useLocalSearchParams, type Href } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { Spacing } from '@/theme';

export default function ReaderWebScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const origin = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const goBack = () => {
    if (origin?.startsWith('/') && !origin.startsWith('//') && !origin.includes('..')) router.replace(origin as Href);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <ThemedView style={{ flex: 1, padding: Spacing.four, justifyContent: 'center', alignItems: 'center', gap: Spacing.three }}>
      <ThemedText type="subtitle">El lector PDF está disponible en Android</ThemedText>
      <ThemedText themeColor="textSecondary">Esta vista utiliza el motor PDF nativo del Development Build.</ThemedText>
      <Button title="Volver" variant="ghost" onPress={goBack} />
    </ThemedView>
  );
}
