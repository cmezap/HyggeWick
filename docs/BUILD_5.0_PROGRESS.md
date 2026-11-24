# HyggeWick — Etapa 5.0

## Estado

Implementación nativa y de interfaz preparada en el workspace; todavía no validada en un teléfono. La selección real utiliza PDFium. El repositorio SQLite, el Reader y Book Detail ya están conectados. Se registraron envíos a EAS para los builds `6a5380b4-a9a8-4553-be06-a4e1b3561cef` y `b377efb0-98da-492e-83fd-96a4240e4820`, pero esta nota no conserva el resultado final de ninguno. No iniciar otro build sin consultar primero su estado en EAS. Las pruebas físicas siguen pendientes y no se considera verificado el comportamiento de gestos ni la alineación en dispositivo.

## Auditoría de dependencias

- `@kishannareshpal/expo-pdf`: versión instalada `0.3.2`.
- El `build.gradle` del módulo declara `com.github.kishannareshpal:AndroidPdfViewer:2026.02.03.1`.
- El POM exacto de ese artefacto declara `io.legere:pdfiumandroid:1.0.32`.
- Se inspeccionaron los fuentes exactos de esos artefactos, descargados a `/tmp` durante la auditoría. El fork de AndroidPdfViewer no incluye selección de texto, pero sí dispone de `onLongPress`, `onTap` y `onDrawAll`.
- PDFium 1.0.32 expone `PdfiumCore.newDocument(ParcelFileDescriptor, password)`, `PdfDocument.openPage`, `PdfPage.openTextPage`, `PdfTextPage.textPageGetCharIndexAtPos`, `textPageGetText`, `textPageGetRectsForRanges`, `PdfPage.mapDeviceCoordsToPage`, `mapRectToDevice` y `getPageRotation`. La extensión utiliza esos métodos verificados en el código del artefacto exacto.
- No se agregaron dependencias.

## Arquitectura implementada

`native/android/PdfTextSelectionController.kt` abre un segundo handle PDFium sobre el URI local del libro y lo libera al recargar o desmontar el visor. En un long press busca el carácter real bajo el toque, expande inicialmente a su palabra y obtiene texto e intervalos de PDFium. Para ampliar una selección, el usuario toca otro término en la misma página; si el término está antes o después, se extiende el intervalo. Un toque fuera del documento o sobre espacio sin texto cancela la selección. No hay handles arrastrables en esta versión.

La geometría se convierte desde coordenadas PDF mediante `mapRectToDevice`, teniendo en cuenta la rotación de la página. El callback nativo `onDrawAll` comparte la matriz de página, el zoom y el desplazamiento del viewer. Los rectángulos enviados a TypeScript y guardados en SQLite usan `normalizedPageTopLeft`: coordenadas 0–1 respecto al área visible de esa página, origen arriba a la izquierda y rotación del documento ya aplicada. Cada selección puede contener varios rectángulos, uno por segmento devuelto por PDFium. No se guardan coordenadas de pantalla ni se modifica el PDF.

`native/android/KJExpoPdfView.kt` conecta los callbacks del fork, eventos Expo, los highlights y la copia al portapapeles. `native/android/KJExpoPdfModule.kt` declara los eventos y props. `scripts/patch-expo-pdf.js` aplica las props/eventos en los fuentes y declaraciones TS del paquete instalado, y copia los tres fuentes Kotlin locales. El script debe mantenerse idempotente: ejecutar `npm run postinstall` después de instalar dependencias.

## Highlights y flujos existentes

`src/features/library/highlight-repository.ts` agrega `reading_highlights_v1`. La tabla contiene ID, libro, página, texto, índice inicial inclusivo, índice final exclusivo, rectángulos JSON, rotación, color y marcas de tiempo. Usa FK con `ON DELETE CASCADE`, una restricción única por libro/página/rango y un índice por libro/página. Guardar el mismo rango actualiza el registro existente. Se ofrecen cuatro colores suaves.

El Reader carga los highlights del libro y los entrega al overlay nativo; al crear, cambiar color o eliminar, actualiza la base y la vista. Tocar un highlight abre acciones para cambiar color o eliminarlo. Book Detail muestra fragmento, página y fecha, y permite volver a esa página, cambiar color o eliminar.

## Hotfix 5.0.2

- Crash `Already closed`: el hotfix inicial quitó la llamada manual a `PDFView.recycle()` después de `super` en `KJExpoPdfView.onDetachedFromWindow()`, pero el crash persistió en el Development Client. Esa explicación no resolvía la causa observada.
- Diagnóstico confirmado en `pdfiumandroid 1.0.32`: AndroidPdfViewer crea su `PdfiumCore` con `AlreadyClosedBehavior.IGNORE`, pero `PdfTextSelectionController` creaba otro con `PdfiumCore(context)`, cuyo `Config` por defecto es `EXCEPTION`. `AlreadyClosedBehavior` se almacena en configuración global. Al desmontar, `PdfFile.dispose()` cierra primero el documento y luego sus páginas; con `EXCEPTION`, el cierre de página lanza y la disposición queda interrumpida. Una llamada posterior a `recycle()` encuentra el documento ya cerrado.
- Corrección aplicada en `native/android/PdfTextSelectionController.kt`: el controlador crea su core con `Config(alreadyClosedBehavior = AlreadyClosedBehavior.IGNORE)`, conservando el comportamiento global que necesita el visor. `scripts/patch-expo-pdf.js` copia este archivo al paquete `@kishannareshpal/expo-pdf`; `postinstall` ejecuta el parche al instalar dependencias.
- Validación reportada en el Development Client: abrir el PDF, salir del Reader y volver al menú ya no produce `Already closed` ni crash. No requiere otra build mientras se use un cliente que incluya la corrección nativa.
- El menú de selección usa el icono de resaltador y abre cuatro muestras táctiles persistidas en SQLite: miel `#EBCB76`, salvia `#A8CFA7`, rosa `#E7AFC3` y lavanda `#D7AFE0`. La selección nativa permanece hasta aplicar el color; highlights existentes conservan su color guardado.
- El control de página redujo alturas, paddings y anchos; el texto de progreso admite truncado y el campo de página ajusta su ancho para pantallas pequeñas. El salto sigue usando la misma prop `targetPage`.
- Book Detail carga las secciones SQLite en serie porque sus repositorios inicializan tablas/migraciones en la misma base. Las listas vacías conservan sus empty states y los errores de consulta reales continúan visibles.
- Reader ignora eventos tardíos después del unmount y evita aplicar respuestas de highlights de una pantalla ya desmontada.

QA del hotfix inicial: TypeScript, patch idempotente, diff y revisión de ownership/callbacks nativos; esas verificaciones no evitaron el crash al salir del Reader. El ajuste posterior de `AlreadyClosedBehavior.IGNORE` sí quedó validado por el usuario en el Development Client: abrir PDF, salir del Reader y volver al menú funciona sin crash.

## Etapa 5.1 — Perfil del lector

- Nueva tab **Perfil**, incluida en tabs compactas y sidebar adaptable. La pantalla organiza identidad editable, tres estadísticas y la compañera espiritual con racha/calendario semanal.
- Nombre, frase y URI de avatar viven en `reader_profile`. El picker existente `expo-document-picker` se limita a imágenes; el archivo se copia a almacenamiento privado de la app para conservarlo entre reinicios. Cancelar el picker no cambia el perfil.
- Estadísticas reales: libros terminados y en lectura salen de `books`/`summarizeReadingProgress`; páginas visitadas provienen de destinos de página únicos por libro. No se muestra tiempo: no hay sesiones/tiempos persistidos fiables. Favoritos siguen disponibles en `books.is_favorite`, sin sumar otra card al perfil.
- `reading_activity_days` guarda una fila por fecha local. `reading_page_visits` deduplica páginas por libro y usa FK en cascada. Se registra solo al cambiar de página por lectura/controles anterior-siguiente; abrir/restaurar el PDF y saltos con el campo de página no cuentan. Los saltos de varias páginas solo registran destino, nunca páginas intermedias.
- `recordReadingActivity` serializa las transacciones con una cola de promesas. Cambios rápidos de página no abren transacciones concurrentes sobre la conexión del perfil; un fallo individual se propaga al Reader y no bloquea las escrituras siguientes. `updateReadingProgress` sigue siendo un `UPDATE` asíncrono sin transacción explícita.
- Racha actual admite lectura hoy o ayer; la continuidad se calcula con claves `YYYY-MM-DD` y calendario local. El récord se calcula a partir de días únicos y se persiste en `reader_profile`; no hay actividad retroactiva. Una visita a una página ya contada puede sumar un nuevo día sin aumentar páginas únicas.
- No se alteran filas existentes de libros ni entidades de lectura. Las tablas nuevas se crean idempotentemente cuando se inicializa el repositorio del perfil, una vez cargado el catálogo de libros.
- QA: `npx tsc --noEmit`, `npx expo config --type public` y `git diff --check` correctos. Revisión de flujos, rutas, assets y reglas de actividad; no se hizo prueba física ni verificación de persistencia/reinicio sobre dispositivo.
- EAS Android `development` (APK interno): build [`6a5380b4-a9a8-4553-be06-a4e1b3561cef`](https://expo.dev/accounts/erickbaladi/projects/HyggeWick/builds/6a5380b4-a9a8-4553-be06-a4e1b3561cef), iniciado antes del hotfix. EAS usó las credenciales Android remotas configuradas. El resultado final no quedó anotado.

Desde la selección, “Frase” prellena texto y página en el flujo existente de Quotes; “Nota” inicia el editor existente con la cita distinguida en el contenido para añadir una reflexión. “Copiar” usa el portapapeles Android. Las demás funciones de navegación, marcadores y progreso siguen usando las rutas existentes.

## Reader — apertura, anotaciones y controles

- `src/components/reader-pdf-view.tsx` configura la vista nativa y `initialPage` antes de asignar la URI. Así, la asignación de URI inicia el PDF con la configuración final y evita las recargas de arranque provocadas por setters como `fitMode`/`autoScale`. `autoScale` conserva su valor predeterminado nativo (`true`). No se cambió código nativo.
- La página inicial se aplica con `initialPage` antes de abrir el documento. No se vuelve a pedir un salto inicial desde `onLoad`; los saltos posteriores, incluidos “Ir a página” y las anotaciones, reutilizan `targetPage`/`navigateToPage`.
- Los logs `[Reader timing]` cuentan y timestampan montaje del Reader/PdfView, datos del libro, URI, `onLoad`, solicitud y finalización de página. URI se registra cuando la vista la recibe. `PDF metadata ready` y `PDF onLoad` proceden del mismo callback.
- El menú de anotaciones presenta highlights, marcadores y frases. Highlights usan la consulta ya realizada al abrir; marcadores y frases se cargan una vez al abrir el menú. Elegir una anotación navega con `navigateToPage`.
- Header y controles empiezan ocultos, reaparecen al tocar el área de lectura y se ocultan al cambiar de página. Selección y acciones de anotación los vuelven a mostrar. No se usa un temporizador de ocultación.
- Verificación pendiente de esta iteración: abrir PDFs de varias páginas, confirmar una carga y navegación inicial por apertura en los logs, probar saltos internos, lista de anotaciones, selección y controles en el Development Client. No se ejecutó build.

## Límites conocidos

- La selección empieza por long press sobre texto. El rango se amplía tocando otra palabra de la misma página; no hay handles de arrastre.
- Un toque fuera de la página o sobre una zona sin texto cancela. La selección puede ocupar varias líneas, pero columnas y orden de lectura complejos dependen del orden de caracteres que reporte PDFium.
- Un PDF escaneado sin capa de texto informa que no encontró texto. No se inicia OCR.
- Los cálculos de hit testing y extracción se ejecutan al recibir el gesto; su rendimiento con páginas muy densas debe comprobarse físicamente.
- La lectura y validación de SQLite se hizo de forma aislada. El código Kotlin no se compiló localmente, de acuerdo con la restricción del proyecto de no ejecutar Gradle local.
- No se verificaron todavía toque, scroll, fling, zoom, landscape, páginas rotadas/tamaños mixtos ni recreación repetida del viewer en Android.

## Verificaciones realizadas

- `npx tsc --noEmit`: correcto.
- `npm run postinstall`: correcto en ejecuciones previas y repetidas; el patch y las copias nativas se aplicaron sin error. `AlreadyClosedBehavior.IGNORE` se validó posteriormente en el Development Client según reporte del usuario.
- Prueba SQLite aislada: migración/idempotencia, inserción y upsert, consulta por libro/página, cambio de color y borrado en cascada: correcto.
- `git diff --check`: correcto en la última verificación.
- `npx expo config --type public`: configuración válida; package name `com.hyggewick.app`.
- EAS profile `development`: development client, distribución interna, Android APK. El primer build `6fb501f1-742d-437c-83a9-2ed28f2eb96b` falló en `:kishannareshpal-expo-pdf:compileDebugKotlin`: el adapter pasó tres `EventDispatcher` donde el controlador pedía lambdas. Se envolvieron los dispatchers con lambdas en `KJExpoPdfView.kt`; `postinstall`, TypeScript y `git diff --check` volvieron a pasar. El segundo build se subió como `b377efb0-98da-492e-83fd-96a4240e4820`; se dejó en ejecución sin esperar el resultado, por instrucción del usuario. [Ver logs del primer intento](https://expo.dev/accounts/erickbaladi/projects/HyggeWick/builds/6fb501f1-742d-437c-83a9-2ed28f2eb96b) · [Ver el segundo build](https://expo.dev/accounts/erickbaladi/projects/HyggeWick/builds/b377efb0-98da-492e-83fd-96a4240e4820).
- EAS informó que `cli.appVersionSource` se volverá obligatorio en el futuro. No se cambió esa configuración ni las credenciales para esta etapa.

## QA pendiente en dispositivo

- [ ] Instalar el APK de desarrollo y abrir PDF con texto seleccionable.
- [ ] Long press, selección inicial, ampliar antes y después tocando otro término, varias líneas y cancelar.
- [ ] Confirmar texto extraído, página, índices y rectángulos contra el texto real.
- [ ] Crear highlight; comprobar alineación, scroll, zoom, cambio de página y orientación.
- [ ] Cerrar y reabrir el libro y la app; comprobar persistencia y posición.
- [ ] Cambiar color y eliminar desde Reader y Book Detail.
- [ ] Abrir highlight desde Book Detail y revisar salto de página.
- [ ] Crear Quote y Reading Note desde selección y comprobar texto/página.
- [ ] Probar PDF grande, escaneado, páginas rotadas y tamaños mixtos.
- [ ] Repetir apertura/cierre y confirmar que no hay fugas, bloqueos ni eventos cruzados entre libros.
