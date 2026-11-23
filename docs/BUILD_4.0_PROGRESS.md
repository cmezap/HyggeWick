# Build 4.0 — Estado histórico del lector PDF nativo

> Esta nota registra el estado al cierre de Build 4.0. La selección de texto que aquí figuraba como bloqueada se implementó en Build 5.0; para el estado vigente, límites y QA pendiente, consulta [`BUILD_5.0_PROGRESS.md`](BUILD_5.0_PROGRESS.md).

**Actualizado:** 2026-11-22  
**Estado:** navegación y persistencia ajustadas en el código fuente; build Android y validación física pendientes. La selección de texto está bloqueada a la espera de verificar APIs nativas compatibles.

## Auditoría

- El workspace ya contenía cambios de biblioteca, catálogo, persistencia y Reader. Se conservaron; no se revirtieron ni limpiaron archivos ajenos a este avance.
- La versión instalada y fijada en el lockfile es `@kishannareshpal/expo-pdf@0.3.2`.
- El módulo declara AndroidPdfViewer `com.github.kishannareshpal:AndroidPdfViewer:2026.02.03.1` y PDFium `io.legere:pdfiumandroid:1.0.32` en su `android/build.gradle`. Esas son las versiones declaradas; la resolución efectiva de Gradle no se inspeccionó.
- El wrapper TypeScript del paquete expone `onLoadComplete`, `onPageChanged` y `onError`, pero no selección de texto, geometría ni eventos de selección.
- No se encontraron los artefactos Android en la caché local para inspeccionar sus APIs. No se asumieron APIs de otros forks.
- El progreso existente cabe en las columnas SQLite actuales (`current_page`, `total_pages`, `reading_progress`, `last_opened_at`); no se añadió una migración para Build 4.0.

## Cambios realizados

- `src/app/reader.tsx`: los eventos de página se ignoran hasta que el visor notifica la carga. La página persistida o solicitada se establece después de la carga. Los saltos de página se rechazan si no son enteros o salen del rango 1..N. La navegación desde controles también programa el guardado, y el progreso pendiente se vacía al salir.
- `scripts/patch-expo-pdf.js`: extiende el wrapper instalado desde `postinstall` con `initialPage`, `targetPage` y `withAnimation`. En Android conserva los destinos que llegan antes de la carga, limita el salto al número de páginas disponible, traduce de base 1 a base 0 y evita contabilizar el salto inicial como un cambio de página del usuario. La recarga reinicia el contador del documento.
- `src/features/library/PERSISTENCE.md`: actualizado para reflejar el comportamiento y el estado de validación.

## Verificaciones

- `npm run postinstall` ejecutado dos veces sin errores para revisar idempotencia.
- `npx tsc --noEmit`: correcto.
- `git diff --check`: correcto.
- Perfil EAS revisado: `development`, `developmentClient: true`, distribución `internal`, Android `apk`.
- Se conserva `com.hyggewick.app`. No hay permisos Android adicionales declarados por la app.
- No se ejecutó Gradle local, Android Studio ni build de EAS. No hay APK ni enlace de descarga.
- No se realizaron pruebas físicas; la navegación tampoco se declara validada en dispositivo.

## Bloqueo: selección, geometría y overlays

No se implementaron. La versión instalada del wrapper no expone selección, texto, índices, rectángulos ni callbacks de dibujo. Como no se verificó la API del artefacto AndroidPdfViewer/PDFium efectivamente resuelto, añadir Kotlin para selección, handles, extracción o overlays podría depender de métodos inexistentes. Se detuvo el trabajo en un estado estable en lugar de aproximar el texto o la geometría.

Antes de continuar, inspeccionar la API del artefacto exacto resuelto por Gradle (por ejemplo, con sus fuentes o el informe de dependencias de EAS) y decidir una integración compatible. Después implementar la selección y repetir las verificaciones antes de iniciar EAS Build.

## Pendiente

- Confirmar el grafo de dependencias Android resuelto en la build y validar el patch nativo mediante compilación remota.
- Implementar selección real de texto, eventos TypeScript, acciones de frase/nota prellenadas, geometría normalizada y overlay temporal solo después de verificar las APIs.
- Ejecutar EAS Build con el perfil `development` y entregar el APK si la compilación termina correctamente.
- Probar físicamente restauración tras salir y reiniciar, anterior/siguiente, salto manual, marcadores, notas, sincronización del progreso en otras pantallas, selección, cancelación, zoom, scroll, orientación y regresiones de biblioteca.

No hay commits asociados a este avance.
