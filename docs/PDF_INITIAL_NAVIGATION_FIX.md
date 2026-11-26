# Corrección de navegación inicial y reabrir lectura en PDF (Android)

## 1. Resumen del problema

Al abrir un PDF desde una página guardada (progreso de lectura, frase, marcador, nota o highlight) se presentaban dos problemas distintos que producían síntomas similares:

1. **En el visor nativo (`AndroidPdfViewer` / `KJExpoPdfView.kt`):** el PDF cargaba la página correcta en el estado de React (`221`), pero visualmente se quedaba en la página `1` (`pageIndex = 0`).
2. **En la navegación de Expo Router (`<Tabs>` / `reader.tsx` / `open-book.ts`):** tras abrir una anotación en una página `X` (ej. `55`), avanzar a otra página `Y` (ej. `65`) y volver a pulsar **Leer / Continuar leyendo**, el lector abría en la página `X` (`55`) o en la página `1` en lugar de `Y` (`65`).

---

## 2. Causas raíz

### A. Ciclo de vida de `PDFView.loadComplete` en `AndroidPdfViewer`
En `PDFView.java`, al terminar el decodificado (`DecodingAsyncTask`), `loadComplete(PdfFile)` ejecuta en este orden:

```java
callbacks.callOnLoadComplete(pdfFile.getPagesCount());
jumpTo(defaultPage, false);
```

- Como `KJExpoPdfView.kt` no configuraba `.defaultPage(...)` y llamaba `pdfView.jumpTo(pageToOpen - 1, false)` dentro de `.onLoad`, `PDFView` inmediatamente ejecutaba `jumpTo(0, false)` después de `.onLoad`, sobrescribiendo la posición inicial a la página `1`.
- En `reader.tsx`, `handlePdfLoaded` dejaba `initialPageChangePending.current = true` esperando `221`, por lo que `handlePageChanged` descartaba el evento `pageIndex = 0` y el indicador inferior seguía mostrando `221` mientras el contenido permanecía en la página `1`.
- Adicionalmente, `KJExpoPdfView.kt` llamaba `reloadPdf()` en `onAttachedToWindow()` y en setters de propiedades sin verificar si los valores habían cambiado, provocando recargas innecesarias en PDFs grandes (~100 MB).

### B. Caché de parámetros y estado en la pestaña `/reader`
En `src/components/responsive-app-tabs.tsx`, `/reader` está registrado como `<TabTrigger name="reader">` dentro de `<Tabs>`:

- Cuando `openBook` (`src/features/library/open-book.ts`) abría el lector sin `startPage`, omitía `&page=` de la URL. React Navigation conservaba el parámetro `page` de la visita anterior a esa pestaña (por ejemplo `page=55`).
- Al permanecer montada la pestaña `/reader`, el `useEffect` de carga en `src/app/reader.tsx` dependía solo de `[id, logTiming, startPage]`. Al reabrir el mismo libro (`id` y `startPage` sin cambios, pero nuevo `openId`), no se volvía a consultar `getBookById(id)` en SQLite y se reutilizaba un `book.currentPage` obsoleto.

---

## 3. Cambios aplicados

### `native/android/KJExpoPdfView.kt` (sincronizado con `scripts/patch-expo-pdf.js`)
- Se configuró `.defaultPage(defaultPageIndex)` (`(targetPage ?: initialPage).coerceAtLeast(1) - 1`) en `pdfBuilder` dentro de `reloadPdf()`, eliminando el `jumpTo` diferido y el estado `pendingInitialPage` / `applyingInitialPage`.
- Se añadió `hasActiveLoad` (reiniciado en `onDetachedFromWindow()` y al inicio de `reloadPdf()`) para evitar que `onAttachedToWindow()` dispare una recarga duplicada tras `setUri`.
- Se agregaron *early returns* por igualdad en los setters que llaman `reloadPdf()` (`setUri`, `setPassword`, `setPagingEnabled`, `setHorizontalModeEnabled`, `setPageGap`, `setContentPadding`, `setFitMode`, `setPageColorInverted`, `setAutoScaleEnabled`).
- Se mantuvieron logs puntuales bajo el tag `KJExpoPdf` (`initialPage`, `reloadPdf`, `onLoad`, `onPageChanged`) para verificación.

### `src/features/library/open-book.ts`
- Cuando no se recibe `startPage`, se envía explícitamente `&page=` vacío en la URL para limpiar cualquier `page` previo retenido por la pestaña `/reader`.

### `src/app/reader.tsx`
- Se agregó `openInstance` (`openId`) a las dependencias del `useEffect` que ejecuta `getBookById(id)` para recargar siempre el progreso real desde SQLite en cada apertura.
- Se reinician en cada apertura `requestedPage` (`undefined`), `initialTargetPage`, `lastObservedPage` y `pendingProgrammaticPage`.
- Se asigna un identificador a cada instancia del lector y se incluye el contexto de apertura (ruta, libro, `openId` y páginas relevantes) en los registros de diagnóstico. Los callbacks de carga y cambio de página incluyen el identificador de la instancia nativa que los emitió.

### `src/components/reader-pdf-view.tsx`
- Cada visor recibe un identificador propio y registra montaje, desmontaje, cambios en `initialPage`/`targetPage`, URI, carga y cambios de página. Esto permite relacionar eventos nativos con una apertura concreta cuando el lector permanece montado en una pestaña.
- Los callbacks `onLoadComplete` y `onPageChanged` pasan el identificador del visor junto con el evento. El URI sigue asignándose después de la configuración inicial del visor.

### `scripts/patch-expo-pdf.js`
- El script copia `native/android/KJExpoPdfView.kt` al paquete instalado `node_modules/@kishannareshpal/expo-pdf`; así que no contiene una segunda implementación que mantener. `postinstall` vuelve a aplicar esa copia tras instalar dependencias.

### Logs de diagnóstico
- Android usa el tag `KJExpoPdf`; React Native registra eventos con los prefijos `[Reader timing]` y `[PdfView]`. Los registros incluyen IDs de instancia y páginas para reconstruir el orden de apertura/carga. Los logs añadidos son de diagnóstico y se pueden retirar cuando ya no sean necesarios.

---

## 4. Verificación y notas operativas

- El script `scripts/patch-expo-pdf.js` copia `native/android/KJExpoPdfView.kt` al paquete instalado y se ejecuta en `postinstall`. Al modificar la vista nativa, ejecutar `node scripts/patch-expo-pdf.js` para actualizar la copia local antes de compilar.
- `npx tsc --noEmit` se había ejecutado sin errores en la verificación original de la solución; no se afirma aquí que cubra los cambios posteriores de instrumentación.
- La verificación original en dispositivo confirmó la apertura directa en página destino, saltos desde marcadores/frases/highlights, navegación con el botón de ir a página y reapertura desde la última página guardada. La instrumentación de diagnóstico documentada después de esa verificación no queda validada por esa prueba.
