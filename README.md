# HyggeWick

HyggeWick es una aplicación personal de lectura digital, pensada primero para Android y adaptada a teléfonos y tablets. Reúne una biblioteca privada de PDF, un lector con progreso local y herramientas para guardar partes importantes de cada lectura. La experiencia busca sentirse tranquila y cercana, con una compañera visual en forma de vela.

## Estado del proyecto

La aplicación ya cuenta con los flujos principales de biblioteca, lectura y seguimiento. Los datos se guardan localmente en SQLite y los documentos se copian al almacenamiento privado de la app. La implementación del lector y de la selección de texto nativa está preparada en el workspace, pero varias funciones de Android todavía requieren una build instalada y validación física. El estado detallado y el historial de trabajo están en [`docs/BUILD_5.0_PROGRESS.md`](docs/BUILD_5.0_PROGRESS.md); la evolución previa del lector se conserva en [`docs/BUILD_4.0_PROGRESS.md`](docs/BUILD_4.0_PROGRESS.md).

### Funciones implementadas

- Inicio con acceso a lecturas recientes y biblioteca.
- Importación de PDF, búsqueda, filtros, orden, favoritos y eliminación con opción breve para deshacer.
- Ficha del libro con edición de metadatos y portada.
- Lector PDF nativo Android con progreso y restauración de página, controles de navegación, marcadores y copia de texto.
- Selección de texto PDFium y highlights persistentes con cuatro colores; acceso a frases y notas de lectura desde la selección.
- Frases favoritas, notas y marcadores asociados al libro.
- Actividad de lectura, estadísticas, perfil editable, avatar, racha y calendario semanal.
- Persistencia offline-first mediante SQLite y almacenamiento privado local.
- Navegación adaptable, tema claro/oscuro y componentes de interfaz reutilizables.

### Límites actuales

- El contenido compatible es PDF; EPUB no está implementado.
- El lector PDF y la selección nativa requieren Android y un Development Build; la ruta web informa que el lector está disponible en Android.
- La selección comienza con pulsación larga y se amplía tocando otra palabra de la misma página. No hay controles de arrastre; los PDFs escaneados sin capa de texto no tienen OCR.
- No se ha documentado una validación física completa de gestos, zoom, rotación, alineación de highlights ni ciclo de vida del lector. Consulta la lista QA al final de Build 5.0.
- La app no sincroniza datos entre dispositivos ni guarda duración de sesiones.

## Tecnologías

- Expo SDK 58, Expo Router y React Native 0.88
- React 19 y TypeScript 6 estricto
- SQLite (`expo-sqlite`) para catálogo y datos de lectura
- `@kishannareshpal/expo-pdf` con extensión local del bridge y código Kotlin/PDFium para Android
- npm

## Requisitos y ejecución

Se necesita Node.js compatible con Expo SDK 58 y npm. Instala dependencias:

```bash
npm install
```

El `postinstall` ejecuta `scripts/patch-expo-pdf.js`, que extiende el paquete PDF instalado y copia los fuentes nativos locales. Para desarrollo de interfaz:

```bash
npx expo start
```

Para abrir el lector PDF en Android hace falta compilar e instalar un Development Build con los módulos nativos del proyecto; Expo Go por sí solo no incluye esa extensión. El perfil EAS `development` está configurado para APK interno. Consulta el estado de builds enlazado en la documentación antes de iniciar otra compilación.

La interfaz web puede iniciarse con `npm run web`, pero no incluye el lector PDF. `npm run lint` ejecuta Expo lint.

## Documentación

- [`docs/BUILD_5.0_PROGRESS.md`](docs/BUILD_5.0_PROGRESS.md): arquitectura de selección PDF, highlights, perfil, QA y pendientes de dispositivo.
- [`docs/BUILD_4.0_PROGRESS.md`](docs/BUILD_4.0_PROGRESS.md): cambios anteriores de navegación y persistencia del lector; su bloqueo de selección quedó resuelto en Build 5.0.
- [`src/features/library/PERSISTENCE.md`](src/features/library/PERSISTENCE.md): esquema, migraciones, archivos locales y reglas de persistencia.
