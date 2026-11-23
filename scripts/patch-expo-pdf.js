const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'node_modules', '@kishannareshpal', 'expo-pdf');
function edit(file, before, after, marker) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) throw new Error(`Missing expo-pdf file: ${file}`);
  const source = fs.readFileSync(target, 'utf8');
  if (source.includes(marker)) return;
  if (!source.includes(before)) throw new Error(`Could not patch expo-pdf file: ${file}`);
  fs.writeFileSync(target, source.replace(before, after));
}
function replace(file, before, after) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) throw new Error(`Missing expo-pdf file: ${file}`);
  const source = fs.readFileSync(target, 'utf8');
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Could not migrate expo-pdf file: ${file}`);
  fs.writeFileSync(target, source.replace(before, after));
}
function copy(source, destination) {
  const from = path.resolve(__dirname, '..', source);
  const to = path.join(root, destination);
  if (!fs.existsSync(from)) throw new Error(`Missing local Expo PDF extension: ${source}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

edit('src/pdf-view.tsx', '  pageColorInverted?: boolean;\n}', '  pageColorInverted?: boolean;\n  initialPage?: number;\n  targetPage?: number;\n  withAnimation?: boolean;\n}', 'targetPage?: number;');
edit('src/pdf-view.tsx', '      pageColorInverted={props.pageColorInverted}\n', '      pageColorInverted={props.pageColorInverted}\n      initialPage={props.initialPage}\n      targetPage={props.targetPage}\n      withAnimation={props.withAnimation}\n', 'targetPage={props.targetPage}');
edit('build/pdf-view.d.ts', '    pageColorInverted?: boolean;\n', '    pageColorInverted?: boolean;\n    initialPage?: number;\n    targetPage?: number;\n    withAnimation?: boolean;\n', 'targetPage?: number;');
edit('build/pdf-view.js', 'pageColorInverted={props.pageColorInverted} onLoadComplete=', 'pageColorInverted={props.pageColorInverted} initialPage={props.initialPage} targetPage={props.targetPage} withAnimation={props.withAnimation} onLoadComplete=', 'targetPage={props.targetPage}');

const selectionTypes = `\nexport type TextSelectionRect = { left: number; top: number; right: number; bottom: number };\nexport type TextSelectionEventPayload = { pageIndex: number; startIndex: number; endIndex: number; text: string; pageRotation: number; coordinateSpace: 'normalizedPageTopLeft'; phase: 'started' | 'changed'; rects: TextSelectionRect[] };\nexport type TextSelectionCancelledEventPayload = { pageIndex: number; reason: string };\nexport type SelectionUnavailableEventPayload = { pageIndex?: number; reason: string };\nexport type HighlightTappedEventPayload = { id: string; page: number };\n`;
edit('src/types.ts', 'export type OnErrorEventPayload = { code: ErrorCode, message: string }\n', `export type OnErrorEventPayload = { code: ErrorCode, message: string }${selectionTypes}`, 'export type TextSelectionEventPayload');
edit('build/types.d.ts', 'export type OnErrorEventPayload = {\n    code: ErrorCode;\n    message: string;\n};\n', `export type OnErrorEventPayload = {\n    code: ErrorCode;\n    message: string;\n};${selectionTypes}`, 'export type TextSelectionEventPayload');

const selectionTypeImports = 'HighlightTappedEventPayload, SelectionUnavailableEventPayload, TextSelectionCancelledEventPayload, TextSelectionEventPayload';
edit('src/pdf-view.tsx', "import { ContentPadding, FitMode, OnErrorEventPayload, OnLoadCompleteEventPayload, OnPageChangedEventPayload } from './types';", `import { ContentPadding, FitMode, OnErrorEventPayload, OnLoadCompleteEventPayload, OnPageChangedEventPayload, ${selectionTypeImports} } from './types';`, 'TextSelectionEventPayload } from \'./types\'');
edit('src/pdf-view.tsx', '  withAnimation?: boolean;\n}', '  withAnimation?: boolean;\n  highlightsJson?: string;\n  selectionClearToken?: number;\n  selectionCopyRequest?: string;\n}', 'highlightsJson?: string;');
edit('src/pdf-view.tsx', '  onError?: (\n    event: NativeSyntheticEvent<OnErrorEventPayload>\n  ) => void;\n};', '  onError?: (\n    event: NativeSyntheticEvent<OnErrorEventPayload>\n  ) => void;\n  onTextSelectionStarted?: (event: NativeSyntheticEvent<TextSelectionEventPayload>) => void;\n  onTextSelectionChanged?: (event: NativeSyntheticEvent<TextSelectionEventPayload>) => void;\n  onTextSelectionCancelled?: (event: NativeSyntheticEvent<TextSelectionCancelledEventPayload>) => void;\n  onSelectionUnavailable?: (event: NativeSyntheticEvent<SelectionUnavailableEventPayload>) => void;\n  onHighlightTapped?: (event: NativeSyntheticEvent<HighlightTappedEventPayload>) => void;\n};', 'onTextSelectionStarted?:');
edit('src/pdf-view.tsx', '  onError?: (params: OnErrorEventPayload) => void\n};', '  onError?: (params: OnErrorEventPayload) => void,\n  onTextSelectionStarted?: (params: TextSelectionEventPayload) => void,\n  onTextSelectionChanged?: (params: TextSelectionEventPayload) => void,\n  onTextSelectionCancelled?: (params: TextSelectionCancelledEventPayload) => void,\n  onSelectionUnavailable?: (params: SelectionUnavailableEventPayload) => void,\n  onHighlightTapped?: (params: HighlightTappedEventPayload) => void\n};', 'onHighlightTapped?: (params: HighlightTappedEventPayload)');
edit('src/pdf-view.tsx', '  onPageChanged,\n  ...props', '  onPageChanged,\n  onTextSelectionStarted,\n  onTextSelectionChanged,\n  onTextSelectionCancelled,\n  onSelectionUnavailable,\n  onHighlightTapped,\n  ...props', 'onTextSelectionStarted,');
edit('src/pdf-view.tsx', '      withAnimation={props.withAnimation}\n', '      withAnimation={props.withAnimation}\n      highlightsJson={props.highlightsJson}\n      selectionClearToken={props.selectionClearToken}\n      selectionCopyRequest={props.selectionCopyRequest}\n', 'selectionCopyRequest={props.selectionCopyRequest}');
edit('src/pdf-view.tsx', '      onError={forwardNativeEventTo(onError)}\n', '      onError={forwardNativeEventTo(onError)}\n      onTextSelectionStarted={forwardNativeEventTo(onTextSelectionStarted)}\n      onTextSelectionChanged={forwardNativeEventTo(onTextSelectionChanged)}\n      onTextSelectionCancelled={forwardNativeEventTo(onTextSelectionCancelled)}\n      onSelectionUnavailable={forwardNativeEventTo(onSelectionUnavailable)}\n      onHighlightTapped={forwardNativeEventTo(onHighlightTapped)}\n', 'onHighlightTapped={forwardNativeEventTo(onHighlightTapped)}');

edit('build/pdf-view.d.ts', "import { ContentPadding, FitMode, OnErrorEventPayload, OnLoadCompleteEventPayload, OnPageChangedEventPayload } from './types';", `import { ContentPadding, FitMode, OnErrorEventPayload, OnLoadCompleteEventPayload, OnPageChangedEventPayload, ${selectionTypeImports} } from './types';`, 'TextSelectionEventPayload } from \'./types\'');
edit('build/pdf-view.d.ts', '    withAnimation?: boolean;\n};', '    withAnimation?: boolean;\n    highlightsJson?: string;\n    selectionClearToken?: number;\n    selectionCopyRequest?: string;\n};', 'highlightsJson?: string;');
edit('build/pdf-view.d.ts', '    onError?: (params: OnErrorEventPayload) => void;\n};', '    onError?: (params: OnErrorEventPayload) => void;\n    onTextSelectionStarted?: (params: TextSelectionEventPayload) => void;\n    onTextSelectionChanged?: (params: TextSelectionEventPayload) => void;\n    onTextSelectionCancelled?: (params: TextSelectionCancelledEventPayload) => void;\n    onSelectionUnavailable?: (params: SelectionUnavailableEventPayload) => void;\n    onHighlightTapped?: (params: HighlightTappedEventPayload) => void;\n};', 'onTextSelectionStarted?:');
edit('build/pdf-view.d.ts', '({ style, onLoadComplete, onError, onPageChanged, ...props }: PdfViewProps)', '({ style, onLoadComplete, onError, onPageChanged, onTextSelectionStarted, onTextSelectionChanged, onTextSelectionCancelled, onSelectionUnavailable, onHighlightTapped, ...props }: PdfViewProps)', 'onTextSelectionStarted, onTextSelectionChanged');
edit('build/pdf-view.js', 'onPageChanged, ...props })', 'onPageChanged, onTextSelectionStarted, onTextSelectionChanged, onTextSelectionCancelled, onSelectionUnavailable, onHighlightTapped, ...props })', 'onTextSelectionStarted, onTextSelectionChanged');
edit('build/pdf-view.js', 'withAnimation={props.withAnimation} onLoadComplete=', 'withAnimation={props.withAnimation} highlightsJson={props.highlightsJson} selectionClearToken={props.selectionClearToken} selectionCopyRequest={props.selectionCopyRequest} onLoadComplete=', 'selectionCopyRequest={props.selectionCopyRequest}');
edit('build/pdf-view.js', 'onError={forwardNativeEventTo(onError)}/>);', 'onError={forwardNativeEventTo(onError)} onTextSelectionStarted={forwardNativeEventTo(onTextSelectionStarted)} onTextSelectionChanged={forwardNativeEventTo(onTextSelectionChanged)} onTextSelectionCancelled={forwardNativeEventTo(onTextSelectionCancelled)} onSelectionUnavailable={forwardNativeEventTo(onSelectionUnavailable)} onHighlightTapped={forwardNativeEventTo(onHighlightTapped)}/>);', 'onHighlightTapped={forwardNativeEventTo(onHighlightTapped)}');

const viewFile = 'android/src/main/java/com/kishannareshpal/expopdf/KJExpoPdfView.kt';
const moduleFile = 'android/src/main/java/com/kishannareshpal/expopdf/KJExpoPdfModule.kt';

// Keep the native adapter and its verified PDFium integration in source control.
copy('native/android/KJExpoPdfView.kt', viewFile);
copy('native/android/KJExpoPdfModule.kt', moduleFile);
copy('native/android/PdfTextSelectionController.kt', 'android/src/main/java/com/kishannareshpal/expopdf/PdfTextSelectionController.kt');
