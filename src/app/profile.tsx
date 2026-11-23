import { useFocusEffect, useRouter, type Href } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, IconButton, Surface } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { getLibraryBooks } from '@/features/library/document-storage';
import { summarizeReadingProgress, type Book } from '@/features/library/book-repository';
import { getReaderProfile, getReadingActivitySummary, saveReaderProfile, storeProfileAvatar, todayLocalDate, type ReaderProfile, type ReadingActivitySummary } from '@/features/profile/profile-repository';
import { Borders, Layout, Radii, Spacing } from '@/theme';

const mascotArtwork = require('../../assets/images/hyggewick-home-hero.webp');

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const wide = width >= Layout.tabletBreakpoint || (width > height && width >= 600);
  const [books, setBooks] = useState<Book[]>([]);
  const [profile, setProfile] = useState<ReaderProfile | null>(null);
  const [activity, setActivity] = useState<ReadingActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const nextBooks = await getLibraryBooks();
      const [nextProfile, nextActivity] = await Promise.all([getReaderProfile(), getReadingActivitySummary()]);
      setBooks(nextBooks);
      setProfile(nextProfile);
      setActivity(nextActivity);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadProfile(); }, [loadProfile]));

  const openEditor = () => {
    setName(profile?.name ?? '');
    setTagline(profile?.tagline ?? '');
    setEditing(true);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const savedProfile = await saveReaderProfile({ name, tagline });
      setProfile((current) => current ? { ...current, ...savedProfile } : savedProfile);
      setEditing(false);
    } catch {
      Alert.alert('No se pudo guardar', 'El perfil no se guardó. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const image = result.assets[0];
      if (!image) return;
      const avatarUri = await storeProfileAvatar(image.uri, image.name);
      setProfile((current) => current ? { ...current, avatarUri } : current);
    } catch {
      Alert.alert('No se pudo cambiar la imagen', 'Elige una imagen disponible en el dispositivo e inténtalo otra vez.');
    }
  };

  const overview = summarizeReadingProgress(books);
  const today = todayLocalDate();
  const activeDays = new Set(activity?.activeDays ?? []);
  const week = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { key, label: new Intl.DateTimeFormat('es-CO', { weekday: 'narrow' }).format(date), active: activeDays.has(key), today: key === today };
  }), [activity?.activeDays, today]);

  let mascotMessage = 'Qué alegría tenerte aquí. Cada historia empieza con una página.';
  if (activity?.activeDays.length) {
    if (activity.bestStreakDate === today && activity.bestStreak > 0) mascotMessage = '¡Una nueva mejor racha! Tu constancia ilumina este rincón.';
    else if (activeDays.has(today) && activity.currentStreak > 1) mascotMessage = `¡Qué bonita continuidad! Ya llevas ${activity.currentStreak} días compartiendo historias.`;
    else if (activeDays.has(today)) mascotMessage = '¡Qué gusto leerte hoy! Una página también es un gran comienzo.';
    else mascotMessage = 'Tu próxima historia te espera cuando tengas un momento tranquilo.';
  }

  return <ThemedView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.content, wide && styles.contentWide]}>
        <View style={styles.heading}>
          <View style={[styles.headingSigil, { backgroundColor: theme.surfaceSelected }]}>
            <SymbolView name={{ ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' }} size={24} tintColor={theme.accent} />
          </View>
          <View style={styles.headingCopy}>
            <ThemedText type="title">Tu perfil</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Un pequeño refugio para tus historias.</ThemedText>
          </View>
        </View>

        {loading ? <Surface variant="subtle" style={styles.loadingCard}><ActivityIndicator color={theme.accent} /><ThemedText themeColor="textMuted">Preparando tu rincón…</ThemedText></Surface> : error ? <Surface variant="subtle" style={styles.errorCard}>
          <ThemedText themeColor="error" accessibilityRole="alert">No pudimos cargar el perfil y tus estadísticas.</ThemedText>
          <Button title="Volver a intentar" size="small" variant="ghost" onPress={() => void loadProfile()} />
        </Surface> : profile && activity ? <>
          <Surface variant="elevated" style={[styles.identityCard, wide && styles.identityCardWide]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cambiar imagen de perfil" onPress={() => void pickAvatar()} style={styles.avatarButton}>
              {profile.avatarUri ? <Image source={{ uri: profile.avatarUri }} contentFit="cover" style={styles.avatar} /> : <View style={[styles.avatarFallback, { backgroundColor: theme.surfaceSelected }]}>
                <SymbolView name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={35} tintColor={theme.accentSoft} />
              </View>}
              <View style={[styles.avatarEditBadge, { backgroundColor: theme.accent }]}><SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} size={13} tintColor={theme.textOnAccent} /></View>
            </Pressable>
            <View style={styles.identityCopy}>
              <ThemedText type="smallBold" themeColor="accentSoft">TU RINCÓN DE LECTURA</ThemedText>
              <ThemedText type="title" numberOfLines={2}>{profile.name || 'Lector/a'}</ThemedText>
              <ThemedText themeColor="textSecondary" numberOfLines={2}>{profile.tagline || 'Un alma entre historias.'}</ThemedText>
            </View>
            <IconButton accessibilityLabel="Editar perfil" variant="subtle" onPress={openEditor}
              icon={<SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} size={18} tintColor={theme.accentSoft} />} />
          </Surface>

          <View style={styles.section}>
            <View style={styles.sectionHeading}><ThemedText type="subtitle">Tu camino entre páginas</ThemedText><ThemedText type="small" themeColor="textMuted">Desde tu biblioteca</ThemedText></View>
            <View style={[styles.statsRow, wide && styles.statsRowWide]}>
              <StatCard label="Libros leídos" value={overview.finishedBooks} icon={{ ios: 'books.vertical.fill', android: 'auto_stories', web: 'auto_stories' }} color={theme.accent} />
              <StatCard label="Leyendo" value={overview.readingBooks} icon={{ ios: 'book.fill', android: 'menu_book', web: 'menu_book' }} color={theme.accentLavender} />
              <StatCard label="Páginas visitadas" value={activity.pagesRead} icon={{ ios: 'doc.text', android: 'auto_stories', web: 'auto_stories' }} color={theme.success} />
            </View>
          </View>

          <Surface variant="elevated" style={[styles.mascotCard, wide && styles.mascotCardWide]}>
            <View style={[styles.mascotArtworkWrap, wide && styles.mascotArtworkWrapWide]}>
              <Image source={mascotArtwork} contentFit="contain" style={styles.mascotArtwork} accessibilityLabel="La vela espiritual de HyggeWick" />
            </View>
            <View style={styles.mascotContent}>
              <ThemedText type="smallBold" themeColor="accentSoft">TU COMPAÑERA DE LECTURA</ThemedText>
              <ThemedText type="subtitle">La vela guarda tu luz</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.mascotMessage}>{mascotMessage}</ThemedText>
              <View style={styles.streakRow}>
                <StreakValue label="Racha actual" value={activity.currentStreak} />
                <View style={[styles.streakDivider, { backgroundColor: theme.border }]} />
                <StreakValue label="Mejor racha" value={activity.bestStreak} />
              </View>
              <View style={styles.weekRow}>
                {week.map((day) => <View key={day.key} style={styles.weekDay}>
                  <View style={[styles.dayDot, { backgroundColor: day.active ? theme.accent : theme.surfaceSelected, borderColor: day.today ? theme.accentSoft : theme.border }]}>
                    {day.active ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={12} tintColor={theme.textOnAccent} /> : null}
                  </View>
                  <ThemedText type="small" themeColor={day.today ? 'accentSoft' : 'textMuted'}>{day.label}</ThemedText>
                </View>)}
              </View>
              <ThemedText type="small" themeColor="textMuted">Actividad de los últimos siete días</ThemedText>
            </View>
          </Surface>
          <Pressable accessibilityRole="button" onPress={() => router.push('/activity' as Href)} style={styles.activityLink}>
            <ThemedText type="small" themeColor="accentSoft">Ver tu centro de progreso</ThemedText>
            <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} size={15} tintColor={theme.accentSoft} />
          </Pressable>
        </> : null}
      </View>
    </ScrollView>

    <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Cerrar ventana" style={styles.modalBackdrop} onPress={() => setEditing(false)} />
        <View style={[styles.editModal, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.modalHeading}>
            <View style={styles.headingCopy}><ThemedText type="subtitle">Tu identidad lectora</ThemedText><ThemedText type="small" themeColor="textMuted">Solo se guarda en este dispositivo.</ThemedText></View>
            <IconButton accessibilityLabel="Cerrar" variant="subtle" onPress={() => setEditing(false)} icon={<SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} tintColor={theme.textSecondary} />} />
          </View>
          <TextInput accessibilityLabel="Nombre del lector" value={name} onChangeText={setName} maxLength={48} placeholder="¿Cómo te llamamos?" placeholderTextColor={theme.textMuted}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]} />
          <TextInput accessibilityLabel="Frase personal" value={tagline} onChangeText={setTagline} maxLength={100} placeholder="Una frase que te acompañe…" placeholderTextColor={theme.textMuted}
            style={[styles.input, styles.taglineInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]} multiline />
          <View style={styles.modalActions}>
            <Button title="Elegir foto" variant="ghost" onPress={() => void pickAvatar()} icon={<SymbolView name={{ ios: 'photo', android: 'photo_library', web: 'photo_library' }} size={17} tintColor={theme.accent} />} />
            <Button title="Guardar" loading={saving} disabled={saving} onPress={() => void saveProfile()} />
          </View>
        </View>
      </View>
    </Modal>
  </ThemedView>;
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: ComponentProps<typeof SymbolView>['name']; color: string }) {
  return <Surface variant="subtle" style={styles.statCard}>
    <SymbolView name={icon} size={19} tintColor={color} />
    <ThemedText style={styles.statValue}>{new Intl.NumberFormat('es-CO').format(value)}</ThemedText>
    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.statLabel}>{label}</ThemedText>
  </Surface>;
}

function StreakValue({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return <View style={styles.streakValue}>
    <ThemedText style={[styles.streakNumber, { color: theme.accent }]}>{value}</ThemedText>
    <ThemedText type="small" themeColor="textMuted">{label} {value === 1 ? 'día' : 'días'}</ThemedText>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, minWidth: 0 },
  scrollContent: { flexGrow: 1, paddingHorizontal: Layout.phoneHorizontalMargin, paddingVertical: Spacing.four },
  content: { width: '100%', maxWidth: Layout.contentMaxWidth, alignSelf: 'center', gap: Spacing.four },
  contentWide: { gap: Spacing.five },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headingSigil: { width: 50, height: 50, borderRadius: Radii.large, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1, minWidth: 0, gap: Spacing.one },
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  identityCardWide: { padding: Spacing.four },
  avatarButton: { width: 76, height: 76, position: 'relative' },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarFallback: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  avatarEditBadge: { position: 'absolute', width: 25, height: 25, borderRadius: 13, right: -2, bottom: -2, borderWidth: 2, borderColor: '#150E30', alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1, minWidth: 0, gap: Spacing.one },
  section: { gap: Spacing.two },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.one },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  statsRowWide: { gap: Spacing.three },
  statCard: { flex: 1, minWidth: 0, minHeight: 106, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: Spacing.one, paddingVertical: Spacing.two },
  statValue: { fontSize: 21, lineHeight: 27, fontWeight: '700' },
  statLabel: { textAlign: 'center', lineHeight: 16 },
  mascotCard: { gap: Spacing.two, padding: Spacing.three, overflow: 'hidden' },
  mascotCardWide: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, padding: Spacing.four },
  mascotArtworkWrap: { height: 150, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.medium, overflow: 'hidden', backgroundColor: '#0B061A' },
  mascotArtworkWrapWide: { width: '38%', height: 220, flexShrink: 0 },
  mascotArtwork: { width: '100%', height: '100%' },
  mascotContent: { flex: 1, minWidth: 0, gap: Spacing.two },
  mascotMessage: { lineHeight: 21 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, paddingVertical: Spacing.one },
  streakValue: { gap: 1 },
  streakNumber: { fontSize: 27, lineHeight: 32, fontWeight: '700', fontFamily: 'serif' },
  streakDivider: { width: 1, height: 34 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.one, paddingTop: Spacing.one },
  weekDay: { minWidth: 30, alignItems: 'center', gap: 5 },
  dayDot: { width: 28, height: 28, borderRadius: 14, borderWidth: Borders.subtle, alignItems: 'center', justifyContent: 'center' },
  activityLink: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  loadingCard: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  errorCard: { alignItems: 'flex-start', gap: Spacing.two },
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.three },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4, 2, 12, 0.72)' },
  editModal: { width: '100%', maxWidth: 500, borderWidth: Borders.subtle, borderRadius: Radii.extraLarge, padding: Spacing.four, gap: Spacing.three },
  modalHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { minHeight: 48, borderWidth: Borders.subtle, borderRadius: Radii.medium, paddingHorizontal: Spacing.three, fontSize: 15 },
  taglineInput: { minHeight: 82, paddingVertical: Spacing.two, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.two },
});
