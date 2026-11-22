# Persistencia local de biblioteca

`hyggewick.db` (SQLite) guarda metadatos; los PDF permanecen en `hyggewick-library/` bajo el directorio privado de la aplicación. `file_path` almacena la URI local al archivo, no su contenido. `reading_progress` se almacena para consultas sencillas y se calcula como página actual / páginas totales cuando se conoce el total. El booleano favorito se representa como `INTEGER` (0/1) y las fechas ISO como `TEXT`.

El catálogo `documents.json` de la versión anterior se conserva como respaldo. En el primer acceso al repositorio, los registros válidos cuyos archivos existen se insertan dentro de una transacción SQLite conservando su UUID, nombre, tamaño y fecha. Una migración completa queda anotada en `schema_migrations`; inserciones `OR IGNORE` por ID hacen que reintentar una migración incompleta sea idempotente. Si el JSON es inválido o tiene registros inválidos, los válidos se importan, se recuperan PDFs con nombres administrados cuando sea posible, y se vuelve a intentar en siguientes accesos. No se elimina el JSON ni se borran archivos desconocidos automáticamente.

La lista de biblioteca reconcilia la existencia de archivos marcando registros como `available` o `missing`. Los archivos sin registro se recuperan solo cuando su nombre coincide con el patrón UUID usado por HyggeWick. Si una importación no puede insertar metadatos después de validar y mover el archivo final, elimina ese archivo y el temporal. Al eliminar un libro se borra primero el registro; una interrupción durante el borrado físico puede dejar un PDF huérfano recuperable al cargar la biblioteca.

Las tablas futuras de sesiones, marcadores, colecciones y anotaciones se añadirán cuando esas funciones existan, evitando migraciones vacías prematuras.
