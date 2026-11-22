import {
  TabList,
  TabSlot,
  TabTrigger,
  Tabs,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { useWindowDimensions, Pressable, StyleSheet, View, type PressableInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode, Ref } from 'react';
import { usePathname, type Href } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Borders, Layout, Radii, Spacing } from '@/theme';
import { useTheme } from '@/hooks/use-theme';

type Destination = 'home' | 'library' | 'activity';

const destinationIcons = {
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  library: { ios: 'books.vertical.fill', android: 'library_books', web: 'menu_book' },
  activity: { ios: 'clock.fill', android: 'history', web: 'history' },
} as const;

export function ResponsiveAppTabs() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isWide = width >= Layout.tabletLandscapeBreakpoint || (isLandscape && width >= 600);
  const isPdfPoc = usePathname() === '/pdf-poc';
  const theme = useTheme();

  return (
    <Tabs asChild>
      <SafeAreaView
        edges={['top', 'right', 'bottom', 'left']}
        style={[
          styles.safeArea,
          isWide && styles.wideLayout,
          { backgroundColor: theme.background },
        ]}>
        <TabSlot style={styles.content} />
        <TabList asChild>
          <ResponsiveTabList wide={isWide} hidden={isPdfPoc}>
            <TabTrigger name="home" href="/" asChild>
              <TabButton destination="home" label="Inicio" wide={isWide} />
            </TabTrigger>
            <TabTrigger name="library" href="/library" asChild>
              <TabButton destination="library" label="Biblioteca" wide={isWide} />
            </TabTrigger>
            <TabTrigger name="activity" href="/activity" asChild>
              <TabButton destination="activity" label="Actividad" wide={isWide} />
            </TabTrigger>
            <TabTrigger name="pdf-poc" href={'/pdf-poc' as Href} style={styles.hiddenTrigger} />
          </ResponsiveTabList>
        </TabList>
      </SafeAreaView>
    </Tabs>
  );
}

function TabButton({
  children,
  destination,
  label,
  wide,
  isFocused,
  ...props
}: TabTriggerSlotProps & {
  destination: Destination;
  label: string;
  wide: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const { ref, style, accessibilityState, ...pressableProps } = props;
  const selected = Boolean(isFocused);

  return (
    <Pressable
      {...pressableProps}
      ref={ref as Ref<PressableInstance>}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ ...accessibilityState, selected }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        styles.tabButton,
        wide ? styles.wideTabButton : styles.compactTabButton,
        selected && wide && { backgroundColor: theme.surfaceSelected },
        selected && wide && { borderLeftColor: theme.accent, borderLeftWidth: Borders.selected },
        state.pressed && styles.pressed,
      ]}>
      <SymbolView
        name={destinationIcons[destination]}
        size={22}
        tintColor={selected ? theme.accent : theme.textMuted}
      />
      <ThemedText
        type="small"
        numberOfLines={1}
        style={{ color: selected ? theme.accent : theme.textSecondary, fontWeight: selected ? '700' : '500' }}>
        {label || children}
      </ThemedText>
      {selected && !wide && (
        <View style={[styles.activeIndicator, { backgroundColor: theme.accent }]} />
      )}
    </Pressable>
  );
}

function ResponsiveTabList({
  children,
  style,
  wide,
  hidden,
  ...props
}: TabListProps & { wide: boolean; hidden: boolean }) {
  const theme = useTheme();

  return (
    <View
      {...props}
      style={[
        style,
        styles.tabList,
        wide ? styles.sidebar : styles.bottomBar,
        hidden && styles.hidden,
        { backgroundColor: theme.navigation },
        wide && { borderRightColor: theme.divider },
        !wide && { borderTopColor: theme.divider },
      ]}>
      {wide ? (
        <View style={styles.sidebarTop}>
          <View style={styles.brandRow}>
            <ThemedText style={[styles.brandStar, { color: theme.accent }]}>✦</ThemedText>
            <ThemedText type="subtitle" style={[styles.brand, { color: theme.text }]}>
              HyggeWick
            </ThemedText>
          </View>
          <View style={styles.wideDestinations}>{children}</View>
        </View>
      ) : (
        <View style={styles.destinations}>{children}</View>
      )}

      {wide ? (
        <View style={styles.sidebarBottom}>
          <Pressable style={styles.settingsRow}>
            <SymbolView
              name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
              size={20}
              tintColor={theme.textSecondary}
            />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Ajustes
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, minWidth: 0, flexDirection: 'column' },
  wideLayout: { flexDirection: 'row-reverse' },
  content: { flex: 1, minWidth: 0 },
  tabList: { justifyContent: 'center' },
  bottomBar: {
    width: '100%',
    flexDirection: 'row',
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
    borderTopWidth: Borders.subtle,
  },
  sidebar: {
    width: 190,
    height: '100%',
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
    borderRightWidth: Borders.subtle,
  },
  sidebarTop: {
    flex: 1,
    gap: Spacing.three,
  },
  sidebarBottom: {
    paddingTop: Spacing.two,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  brandStar: {
    fontSize: 20,
    fontWeight: '700',
  },
  brand: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.medium,
  },
  destinations: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  wideDestinations: { flexDirection: 'column', alignItems: 'stretch', gap: Spacing.two },
  tabButton: {
    minHeight: Layout.standardTouchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radii.medium,
  },
  compactTabButton: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
    paddingHorizontal: Spacing.one,
    paddingBottom: 4,
    position: 'relative',
  },
  wideTabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.pill,
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: Radii.pill,
  },
  pressed: { opacity: 0.78 },
  hidden: { display: 'none' },
  hiddenTrigger: { display: 'none' },
});
