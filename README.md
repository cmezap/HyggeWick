# HyggeWick

HyggeWick es una aplicación personal de lectura digital, pensada primero para Android y diseñada para teléfonos y tablets. La dirección del producto es ofrecer una experiencia de lectura tranquila, con biblioteca y progreso disponibles localmente. La lectura EPUB, la gestión de libros y la persistencia offline todavía no están implementadas.

## Tecnologías

- Expo SDK 58 y Expo Router
- React 19 y React Native 0.88
- TypeScript 6 en modo estricto
- npm
- Navegación adaptativa implementada con `expo-router/ui`

## Estado del desarrollo

La base visual y de navegación está en construcción. El código actual incluye una pantalla de inicio inicial, tres destinos de navegación y componentes visuales reutilizables. La biblioteca y la actividad son placeholders; todavía no hay un flujo de importación de libros, un lector EPUB ni almacenamiento de datos de usuario.

### Implementado actualmente

- Pantalla Inicio en español con estado vacío y enlace a Biblioteca.
- Navegación con Inicio, Biblioteca y Actividad: barra inferior en pantallas estrechas y panel lateral en pantallas anchas.
- Sistema de tema claro/oscuro con colores semánticos y tokens de espaciado, tipografía, superficies, bordes y layout.
- Componentes UI reutilizables: `Button`, `Surface`, `Badge`, `Divider`, `IconButton` y `ProgressBar`.
- Componentes base `ThemedText`, `ThemedView` y un componente común para pantallas placeholder.
- Configuración de Expo Router con rutas tipadas y alias TypeScript `@/`.

### Pendiente

- Biblioteca real: importar, listar, ordenar y quitar libros.
- Lectura de EPUB, navegación por tabla de contenidos, ajustes de lectura y persistencia de la posición.
- Metadatos, portadas, progreso, marcadores e historial de sesiones.
- Persistencia offline-first y recuperación de datos después de cerrar la app.
- Pruebas de integración y validación en dispositivos Android de teléfono y tablet.
- Retirar o sustituir restos visuales y de contenido del starter de Expo.

## Requisitos

- Node.js compatible con Expo SDK 58 y npm.
- Android con Expo Go compatible con SDK 58 o una compilación de desarrollo.
- Para probar en un teléfono físico, instala Expo Go desde Google Play. Expo Go debe ser compatible con la versión SDK del proyecto.

## Instalar y ejecutar

Instala las dependencias:

```bash
npm install
```

Inicia el servidor de desarrollo:

```bash
npx expo start
```

Abre Expo Go en Android y escanea el código QR. En una red local, el teléfono y el equipo deben poder comunicarse entre sí. Si el router, firewall o la red impiden esa conexión, inicia Expo con túnel:

```bash
npx expo start --tunnel
```

También puedes usar el script npm para abrir la interfaz web:

```bash
npm run web
```

El soporte web es secundario frente al objetivo Android. El comando `npm run lint` está configurado para ejecutar Expo lint.
