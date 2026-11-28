import { requireNativeView } from 'expo';
import { useEffect, useState, type ComponentType } from 'react';
import { StyleSheet, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import type {
  ContentPadding,
  FitMode,
  HighlightTappedEventPayload,
  OnErrorEventPayload,
  OnLoadCompleteEventPayload,
  OnPageChangedEventPayload,
  SelectionUnavailableEventPayload,
  TextSelectionCancelledEventPayload,
  TextSelectionEventPayload,
} from '@kishannareshpal/expo-pdf';
import type { ReaderColorMode } from '@/features/library/reader-preferences';

export type PdfChapterItem = { title: string; page: number; level: number };
export type ReaderLoadCompleteEvent = OnLoadCompleteEventPayload & { tableOfContents?: PdfChapterItem[] };

type NativeReaderPdfProps = ViewProps & {
  uri?: string;
  fitMode: FitMode;
  horizontal?: boolean;
  pagingEnabled?: boolean;
  pageGap?: number;
  contentPadding?: ContentPadding;
  pageColorInverted?: boolean;
  colorMode?: ReaderColorMode;
  keepScreenOn?: boolean;
  initialPage: number;
  targetPage?: number;
  withAnimation: boolean;
  doubleTapToZoom: boolean;
  highlightsJson: string;
  selectionClearToken: number;
  selectionCopyRequest?: string;
  onLoadComplete?: (event: NativeSyntheticEvent<ReaderLoadCompleteEvent>) => void;
  onPageChanged?: (event: NativeSyntheticEvent<OnPageChangedEventPayload>) => void;
  onError?: (event: NativeSyntheticEvent<OnErrorEventPayload>) => void;
  onTextSelectionStarted?: (event: NativeSyntheticEvent<TextSelectionEventPayload>) => void;
  onTextSelectionChanged?: (event: NativeSyntheticEvent<TextSelectionEventPayload>) => void;
  onTextSelectionCancelled?: (event: NativeSyntheticEvent<TextSelectionCancelledEventPayload>) => void;
  onSelectionUnavailable?: (event: NativeSyntheticEvent<SelectionUnavailableEventPayload>) => void;
  onHighlightTapped?: (event: NativeSyntheticEvent<HighlightTappedEventPayload>) => void;
};

const NativeReaderPdf = requireNativeView('KJExpoPdf') as ComponentType<NativeReaderPdfProps & { ref?: (view: unknown | null) => void }>;

type ReaderPdfViewProps = Omit<NativeReaderPdfProps, 'uri' | 'onLoadComplete' | 'onPageChanged' | 'onError' | 'onTextSelectionStarted' | 'onTextSelectionChanged' | 'onTextSelectionCancelled' | 'onSelectionUnavailable' | 'onHighlightTapped'> & {
  uri: string;
  onLoadComplete?: (event: ReaderLoadCompleteEvent) => void;
  onPageChanged?: (event: OnPageChangedEventPayload) => void;
  onError?: (event: OnErrorEventPayload) => void;
  onTextSelectionStarted?: (event: TextSelectionEventPayload) => void;
  onTextSelectionChanged?: (event: TextSelectionEventPayload) => void;
  onTextSelectionCancelled?: (event: TextSelectionCancelledEventPayload) => void;
  onSelectionUnavailable?: (event: SelectionUnavailableEventPayload) => void;
  onHighlightTapped?: (event: HighlightTappedEventPayload) => void;
};

/** Applies native PDF configuration before assigning the URI, so URI assignment starts one configured load. */
export function ReaderPdfView({
  uri, onLoadComplete, onPageChanged, onError, onTextSelectionStarted, onTextSelectionChanged,
  onTextSelectionCancelled, onSelectionUnavailable, onHighlightTapped, ...nativeProps
}: ReaderPdfViewProps) {
  const [uriAssigned, setUriAssigned] = useState(false);

  useEffect(() => {
    setUriAssigned(true);
  }, []);

  return (
    <NativeReaderPdf
      {...nativeProps}
      style={[styles.container, nativeProps.style]}
      {...(uriAssigned ? { uri } : {})}
      onLoadComplete={onLoadComplete ? (event) => onLoadComplete(event.nativeEvent) : undefined}
      onPageChanged={onPageChanged ? (event) => onPageChanged(event.nativeEvent) : undefined}
      onError={onError ? (event) => onError(event.nativeEvent) : undefined}
      onTextSelectionStarted={onTextSelectionStarted ? (event) => onTextSelectionStarted(event.nativeEvent) : undefined}
      onTextSelectionChanged={onTextSelectionChanged ? (event) => onTextSelectionChanged(event.nativeEvent) : undefined}
      onTextSelectionCancelled={onTextSelectionCancelled ? (event) => onTextSelectionCancelled(event.nativeEvent) : undefined}
      onSelectionUnavailable={onSelectionUnavailable ? (event) => onSelectionUnavailable(event.nativeEvent) : undefined}
      onHighlightTapped={onHighlightTapped ? (event) => onHighlightTapped(event.nativeEvent) : undefined}
    />
  );
}

const styles = StyleSheet.create({ container: { backgroundColor: '#eeeeee' } });
