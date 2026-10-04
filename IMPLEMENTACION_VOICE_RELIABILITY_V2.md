# Contestador automático: implementación Voice Reliability V2

**Fecha:** 3 de octubre de 2026  
**Checkout:** `main`, base `2c9d45c`; trabajo local sin commit ni despliegue.  
**Propósito:** corregir causas observables de transcripción y pedido, instrumentar llamadas y preparar reconocimiento de domicilios para Mexicali con una ruta extensible a México.

## Estado general

Se mantuvo una sola ruta de reconocimiento: Twilio Media Streams entrega audio al backend y el backend conversa con Gemini Live. No se agregó un proveedor alternativo de STT. La mejora se concentra en conservar mejor los eventos que entrega Gemini, evitar pérdidas silenciosas entre Twilio y Gemini y reforzar las validaciones de menú, carrito y domicilio en el servidor.

Los cambios de base de datos son aditivos. Los modos de domicilio y el menú conversacional nuevo empiezan apagados. El catálogo no se importó a ninguna base de datos: primero se debe revisar la captura que devuelve el servicio vigente de INEGI, aplicar la migración y ejecutar el comando de carga en el entorno elegido.

## Qué cambió

### Audio, transcript y diagnóstico

- Se eliminó la unión por solapamiento de caracteres que podía descartar repeticiones. Los eventos finales se conservan en orden de llegada; la vista de conversación agrega separadores sólo para presentarlos.
- Se añadió una tabla de eventos de voz con tipo, emisor, modelo, secuencia, hora, texto crudo y detalles. La ruta de llamadas muestra estos eventos a personas con rol de manager.
- El almacenamiento de esos eventos crudos está **apagado por omisión** con `VOICE_TRANSCRIPT_EVENTS_V2=false`; para habilitarlo temporalmente se debe configurar `VOICE_TRANSCRIPT_EVENTS_V2=true`. Incluye texto que puede contener nombres, teléfonos o domicilios. No se guarda audio.
- Se añaden métricas por llamada: mensajes y frames de Twilio, frames enviados a Gemini, huecos de secuencia y timestamps, audio recibido/enviado/perdido, espera de cola, latencia de envío, modelo y backpressure.
- El lector de Twilio empieza antes de la conexión y el emisor de audio arranca apenas conecta Gemini, antes del saludo. La cola admite hasta 250 frames (aproximadamente cinco segundos). Si se llena, registra cuántos frames y milisegundos descartó. Se valida el formato mono µ-law a 8 kHz que se espera de Twilio.
- La pantalla de llamadas presenta modelo, métricas y eventos crudos cuando existan. “Confianza” se muestra como “Sin medición” cuando la llamada no tiene ese dato; el flujo no inventa un puntaje.
- Los usuarios con rol `viewer` ven llamadas enmascaradas: teléfono reducido a los últimos cuatro dígitos, sin transcripción, resumen, carrito ni argumentos de herramientas. Roles `agent` y superiores conservan el acceso operacional; eventos crudos siguen limitados a `manager`.
- El historial pagina en bloques de 100. El total viene del servidor; conversión, duración, confianza y búsqueda indican que se calculan sobre las llamadas ya cargadas.

Gemini Live también recibe compresión de ventana de contexto y las herramientas se declaran bloqueantes para que el modelo espere sus resultados. El código registra `GoAway`, cancelación de herramienta y actualizaciones de token de reanudación. **Todavía no hay un ciclo de reconexión automática después de un cierre de Gemini**; si ocurre un cierre inesperado durante una llamada, el backend la marca como fallida. La sesión puede durar lo suficiente para llamadas normales, pero la recuperación transparente queda pendiente de validación con el SDK de producción.

### Menú, carrito y cotización

- Los productos admiten hasta 12 nombres alternativos normalizados para acentos y puntuación. El resolver devuelve coincidencia, candidatos o “sin resultado”; no agrega nada al carrito por sí solo.
- El menú se puede recorrer por categorías y páginas de 12 productos, evitando depender de la primera página como si fuera todo el menú.
- El panel permite activar el menú V2 por negocio; su valor inicial es apagado.
- Las opciones de elección de un modificador pueden marcarse como obligatorias y el backend rechaza cotizaciones donde falte una opción obligatoria.
- Se añadió una operación para reemplazar cantidad y modificadores de una línea. `add_to_cart` sigue sumando una nueva solicitud; `update_cart_line` representa la cantidad final corregida.
- El servidor sigue calculando precios, disponibilidad y cotización, y conserva la confirmación/idempotencia existentes para enviar pedidos.

### Domicilios y cobertura

Se añadieron campos geográficos del negocio (país, estado, municipio, localidad y versión de catálogo), un catálogo local de localidades/vialidades/asentamientos y campos estructurados en la orden. La dirección en texto libre existente sigue siendo compatible.

Modos configurables por negocio:

| Modo | Efecto |
|---|---|
| `off` | Conserva el flujo anterior; valor inicial. |
| `shadow` | Busca candidatos y guarda el estado de diagnóstico, pero usa el texto original para el pedido. |
| `candidate` | Requiere resolver y confirmar por voz un candidato antes de cotizar. |
| `enforce` | Además de confirmar, exige que la localidad configurada y la colonia coincidan con la cobertura. |

Los números exterior/interior, código postal y referencias no se corrigen por similitud. Las coincidencias difusas sólo proponen calles, colonias o localidades; el cliente confirma antes de usarlas. Los candidatos se vuelven a comprobar contra la versión actual del catálogo y las zonas al cotizar y enviar el pedido. La cobertura usa la clave de asentamiento del INEGI, la versión del catálogo y su localidad, así que nombres repetidos no heredan cobertura por accidente. La cobertura actual admite una localidad por negocio; para varias localidades se debe extender la configuración de zonas antes de habilitar `enforce` en ese caso. Las zonas con los nombres libres anteriores deben volver a seleccionar asentamientos del catálogo antes de activar `enforce`.

El importador usa los servicios tabulares del Catálogo Único del INEGI para localidades, vialidades y asentamientos. La documentación oficial publica consultas por claves de entidad y municipio y los campos `cve_loc`, `nomgeo`, `nomvial`, `cvevial`, `nom_asen` y `cve_asen`. [Servicio web del Catálogo Único de INEGI](https://www.inegi.org.mx/servicios/catalogounico.html). Esos endpoints consultan el servicio vigente y no aceptan una edición como parámetro; por eso el catálogo guarda `live-AAAA-MM-DD` como fecha de captura y un checksum para identificar los bytes importados, sin afirmar que la respuesta corresponde a una edición declarada por quien ejecuta el comando.

Ejemplo para Mexicali (Baja California = `02`, municipio = `002`; ejecutar desde `backContestador/`):

```sh
flask --app run.py import-inegi-address-catalog \
  --entity 02 --municipality 002 \
  --entity-name "Baja California" --municipality-name "Mexicali"
```

Después de importar, una persona manager selecciona y guarda la versión y localidad del negocio en **Información del negocio → Reconocimiento de voz y domicilios**. Luego selecciona asentamientos identificados del catálogo en sus zonas de entrega y empieza en `shadow`. Conviene comparar candidatos con domicilios reales corregidos antes de pasar a `candidate` y sólo después a `enforce`.

No se importa SEPOMEX automáticamente. Sus condiciones oficiales indican restricciones de comercialización total o parcial del catálogo; hay que validar licencia antes de incorporarlo o redistribuirlo en un producto comercial. [Descarga y condiciones del catálogo postal de Correos de México](https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx). Los términos de INEGI y la atribución aplicable deben revisarse al actualizar datos. [Términos de uso de INEGI](https://www.inegi.org.mx/inegi/terminos.html).

## Migración y configuración

Nueva migración: `9a41c8d75e20_voice_quality_address_menu_v2.py`, encadenada después de `e4b7c9d2f6a1_add_cash_change_for.py`. Añade tablas de catálogo y eventos, columnas nullable de ubicación y dirección estructurada, claves de cobertura, banderas/alias y métricas con defaults compatibles.

Antes de desplegar código nuevo, aplicar la migración en una ventana controlada y confirmar respaldo/restore de la base. No se hicieron operaciones en producción desde esta tarea. Valores iniciales:

- `voice_address_mode=off`
- `voice_menu_v2_enabled=false`
- `VOICE_TRANSCRIPT_EVENTS_V2=false`
- `VOICE_AUDIO_DIAGNOSTICS=true`

`VOICE_LIVE_MODEL` permite fijar explícitamente `gemini-3.8-live`; si ya existe `GEMINI_MODEL`/`VOICE_LIVE_MODEL` en el entorno, ese valor configura el modelo. La referencia vigente de Gemini Live describe `gemini-3.8-live` y su configuración de voz. [Ficha oficial de modelos Gemini Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live). La reanudación de sesiones requiere manejar el token con el ciclo de conexión según la [guía oficial de manejo de sesiones](https://ai.google.dev/gemini-api/docs/live-api/session-management); esa reconexión aún no está implementada aquí.

## Pruebas añadidas y verificaciones

Se añadió `backContestador/tests/test_voice_quality.py` con casos para:

- conservar dos eventos finales iguales;
- unir puntuación sin introducir un espacio;
- normalizar tipo de vialidad y acentos;
- aceptar cobertura por clave de asentamiento, localidad y versión de catálogo;
- ocultar transcript, resumen, carrito y herramientas al rol `viewer`, y limitar su búsqueda telefónica a los últimos cuatro dígitos;
- resolver un alias sin convertirlo en alta de carrito;
- mantener ambiguos dos nombres de menú similares.
- rechazar una cotización sin elegir un modificador obligatorio.

Verificaciones realizadas en este checkout:

- `python3 -m compileall -q backContestador/app backContestador/migrations`: pasó.
- `git diff --check`: pasó.

No se pudieron correr `unittest`, ESLint ni TypeScript: este entorno no tiene instaladas las dependencias de Python del proyecto y no hay `contestador/node_modules`. La configuración local tampoco permitió una verificación end-to-end contra Twilio/Gemini/PostgreSQL. No se levantó Docker ni se accedió al droplet durante esta implementación.

## Riesgos y trabajo pendiente

1. Implementar y probar reconexión Gemini Live con `session_resumption`/`GoAway`; ahora sólo se registran señales, no se retoma una sesión caída.
2. Ejecutar el importador para Mexicali en una base de staging, revisar conteos, claves y nombres, volver a asignar las zonas por clave y medir precisión con llamadas de prueba consentidas.
3. Validar contratos del SDK instalado en el despliegue y realizar llamadas end-to-end. La captura inicial conserva hasta cinco segundos mientras conecta Gemini; sus descartes se miden, pero la recuperación automática ante demoras mayores queda pendiente. Esta verificación no se puede inferir del análisis estático.
4. Definir retención y borrado de transcript y eventos. Si se activa el flag V2, limitarlo a un periodo de diagnóstico, restringir roles y borrar eventos al vencer la retención.
5. Revisar migración, logs y carga de base de datos bajo llamadas reales. El acceso de DB y algunas acciones de herramientas siguen siendo síncronos dentro del procesamiento asíncrono.
6. Cuando se extienda a otros municipios o estados, importar sus ediciones verificadas y resolver siempre por estado → municipio → localidad; no usar una coincidencia de nombre global.
