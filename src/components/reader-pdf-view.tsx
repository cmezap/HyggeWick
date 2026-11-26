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

let pdfViewSequence = 0;

type ReaderPdfViewProps = Omit<NativeReaderPdfProps, 'uri' | 'onLoadComplete' | 'onPageChanged' | 'onError' | 'onTextSelectionStarted' | 'onTextSelectionChanged' | 'onTextSelectionCancelled' | 'onSelectionUnavailable' | 'onHighlightTapped'> & {
  uri: string;
  onLoadComplete?: (event: OnLoadCompleteEventPayload, pdfViewInstanceId: string) => void;
  onPageChanged?: (event: OnPageChangedEventPayload, pdfViewInstanceId: string) => void;
  onError?: (event: OnErrorEventPayload) => void;
  onTextSelectionStarted?: (event: TextSelectionEventPayload) => void;
  onTextSelectionChanged?: (event: TextSelectionEventPayload) => void;
  onTextSelectionCancelled?: (event: TextSelectionCancelledEventPayload) => void;
  onSelectionUnavailable?: (event: SelectionUnavailableEventPayload) => void;
  onHighlightTapped?: (event: HighlightTappedEventPayload) => void;
  readerInstanceId: string;
  bookId?: string;
  openId?: string;
  onUriReceived: (uri: string) => void;
};

/** Applies native PDF configuration before assigning the URI, so URI assignment starts one configured load. */
export function ReaderPdfView({
  uri, readerInstanceId, bookId, openId, onUriReceived, onLoadComplete, onPageChanged, onError,
  onTextSelectionStarted, onTextSelectionChanged, onTextSelectionCancelled,
  onSelectionUnavailable, onHighlightTapped, ...nativeProps
}: ReaderPdfViewProps) {
  const pdfViewInstanceId = useRef<string | null>(null);
  if (pdfViewInstanceId.current == null) pdfViewInstanceId.current = `pdf-${++pdfViewSequence}`;
  const instanceId = pdfViewInstanceId.current;
  const currentProps = useRef({ readerInstanceId, bookId, openId, initialPage: nativeProps.initialPage, targetPage: nativeProps.targetPage, uri });
  currentProps.current = { readerInstanceId, bookId, openId, initialPage: nativeProps.initialPage, targetPage: nativeProps.targetPage, uri };
  const [uriAssigned, setUriAssigned] = useState(false);
  const lastReportedUri = useRef<string | null>(null);
  const logPdf = useCallback((event: string, details: Record<string, unknown> = {}) => {
    const props = currentProps.current;
    console.info(`[PdfView] ${event}`, {
      pdfViewInstanceId: instanceId,
      readerInstanceId: props.readerInstanceId,
      bookId: props.bookId,
      openId: props.openId,
      initialPage: props.initialPage,
      targetPage: props.targetPage,
      uri: props.uri,
      ...details,
    });
  }, [instanceId]);

  useEffect(() => {
    logPdf('mounted');
    return () => logPdf('unmounted');
  }, []);

  useEffect(() => {
    logPdf('initialPage changed');
  }, [logPdf, nativeProps.initialPage]);

  useEffect(() => {
    logPdf('targetPage changed');
  }, [logPdf, nativeProps.targetPage]);

  useEffect(() => {
    setUriAssigned(true);
  }, []);

  useEffect(() => {
    if (!uriAssigned || lastReportedUri.current === uri) return;
    lastReportedUri.current = uri;
    logPdf('receives URI');
    onUriReceived(uri);
  }, [logPdf, onUriReceived, uri, uriAssigned]);

  return (
    <NativeReaderPdf
      {...nativeProps}
      style={[styles.container, nativeProps.style]}
      {...(uriAssigned ? { uri } : {})}
      onLoadComplete={onLoadComplete ? (event) => {
        logPdf('onLoad', { pageCount: event.nativeEvent.pageCount });
        onLoadComplete(event.nativeEvent, instanceId);
      } : undefined}
      onPageChanged={onPageChanged ? (event) => {
        const payload = event.nativeEvent;
        logPdf('onPageChanged', { page: payload.pageIndex, pageIndex: payload.pageIndex, pageCount: payload.pageCount });
        onPageChanged(payload, instanceId);
      } : undefined}
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
