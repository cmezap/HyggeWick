import { requireNativeView } from 'expo';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { StyleSheet, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import type {
  FitMode,
  HighlightTappedEventPayload,
  OnErrorEventPayload,
  OnLoadCompleteEventPayload,
  OnPageChangedEventPayload,
  SelectionUnavailableEventPayload,
  TextSelectionCancelledEventPayload,
  TextSelectionEventPayload,
} from '@kishannareshpal/expo-pdf';

type NativeReaderPdfProps = ViewProps & {
  uri?: string;
  fitMode: FitMode;
  initialPage: number;
  targetPage?: number;
  withAnimation: boolean;
  doubleTapToZoom: boolean;
  highlightsJson: string;
  selectionClearToken: number;
  selectionCopyRequest?: string;
  onLoadComplete?: (event: NativeSyntheticEvent<OnLoadCompleteEventPayload>) => void;
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
  onLoadComplete?: (event: OnLoadCompleteEventPayload) => void;
  onPageChanged?: (event: OnPageChangedEventPayload) => void;
  onError?: (event: OnErrorEventPayload) => void;
  onTextSelectionStarted?: (event: TextSelectionEventPayload) => void;
  onTextSelectionChanged?: (event: TextSelectionEventPayload) => void;
  onTextSelectionCancelled?: (event: TextSelectionCancelledEventPayload) => void;
  onSelectionUnavailable?: (event: SelectionUnavailableEventPayload) => void;
  onHighlightTapped?: (event: HighlightTappedEventPayload) => void;
  onMounted: () => void;
  onUriReceived: (uri: string) => void;
};

/** Applies native PDF configuration before assigning the URI, so URI assignment starts one configured load. */
export function ReaderPdfView({
  uri, onMounted, onUriReceived, onLoadComplete, onPageChanged, onError,
  onTextSelectionStarted, onTextSelectionChanged, onTextSelectionCancelled,
  onSelectionUnavailable, onHighlightTapped, ...nativeProps
}: ReaderPdfViewProps) {
  const [uriAssigned, setUriAssigned] = useState(false);
  const lastReportedUri = useRef<string | null>(null);
  const nativeRef = useCallback((view: unknown | null) => {
    if (view) onMounted();
  }, [onMounted]);

  useEffect(() => {
    setUriAssigned(true);
  }, []);

  useEffect(() => {
    if (!uriAssigned || lastReportedUri.current === uri) return;
    lastReportedUri.current = uri;
    onUriReceived(uri);
  }, [onUriReceived, uri, uriAssigned]);

  return (
    <NativeReaderPdf
      ref={nativeRef}
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
