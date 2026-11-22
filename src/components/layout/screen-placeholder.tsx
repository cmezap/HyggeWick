import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, Spacing } from '@/theme';

export function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <ThemedView style={styles.screen}>
      <View style={styles.content}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Destino temporal de navegación
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    width: '100%',
    maxWidth: Layout.contentMaxWidth,
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Layout.phoneHorizontalMargin,
  },
});
