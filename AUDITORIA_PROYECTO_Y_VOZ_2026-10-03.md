# Auditoría del contestador automático

**Fecha:** 3 de octubre de 2026  
**Checkout revisado:** rama `main`, commit `2c9d45c` (`Limit cash change to delivery orders`)  
**Alcance:** lectura del repositorio, configuración local sin revelar secretos, flujo de voz, transcripción, guardado de pedidos y fuentes oficiales para calles/códigos postales de México.  
**Cambios realizados:** sólo este informe. No ejecuté pruebas, no hice llamadas, no cambié configuración ni accedí al servidor.

## Resumen

El proyecto es un sistema de pedidos para restaurantes con panel web, API, PostgreSQL y un contestador telefónico. Twilio recibe la llamada y transporta el audio por Media Streams; el backend Flask convierte el audio y mantiene una sesión de voz en tiempo real con Gemini Live. Gemini conversa y solicita al backend buscar productos, armar el carrito, cotizar, confirmar y crear el pedido.

La ruta de voz y pedidos está implementada, pero hay una debilidad concreta en el armado del transcript: se pegan fragmentos con una heurística que intenta adivinar si el texto nuevo repite el final del anterior. Esa operación puede borrar repeticiones o producir texto distinto de lo que el proveedor emitió. Además, sólo se guarda el resultado ya armado, sin una bitácora de fragmentos que permita reconstruir qué pasó.

Las direcciones se separan en calle, número, colonia, ciudad y referencias antes de guardarse, pero luego se convierten en una sola cadena. El servidor sólo verifica que haya texto; no coteja la calle o colonia con un catálogo, no revisa el código postal ni valida que la dirección esté dentro de una zona de reparto. La instrucción “esto es Mexicali” está fija en el prompt, no sale de los datos del negocio.

No es posible atribuir todos los errores reportados al reconocimiento de voz sin revisar ejemplos reales. Gemini recibe el audio directo para entender y responder; el transcript también se genera para mostrarlo y guardarlo. Por eso, arreglar cómo se pega el transcript puede corregir el registro sin necesariamente corregir lo que el agente entendió para tomar decisiones.

## Qué hay hoy

| Parte | Implementación observada |
|---|---|
| Panel web | Next.js 16, React 19 y TypeScript. Incluye inicio, pedidos, menú, información del negocio, clientes, llamadas, POS, cocina/KDS, promociones e inventario. |
| Backend | Flask, SQLAlchemy y PostgreSQL. Gestiona autenticación, negocios, menú, pedidos, clientes, inventario y llamadas. |
| Telefonía | Webhook Twilio `/voice/incoming`; sesión bidireccional `<Connect><Stream>`; WebSocket `/api/v1/voice/twilio/media-stream`. |
| Conversación | `gemini-3.1-flash-live-preview`, configurado para español de México, entrada y salida de audio, transcripción de ambos lados, detección automática de voz, interrupciones y herramientas. La página oficial todavía lo lista como modelo Live en vista previa, actualizado en marzo de 2026. [Ficha oficial del modelo](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview) |
| Audio | Twilio entrega µ-law mono a 8 kHz; `AudioBridge` lo convierte a PCM a 16 kHz para Gemini. El audio de salida se convierte de PCM a 24 kHz a µ-law a 8 kHz. El procesamiento ocurre en memoria. |
| Pedidos por voz | Gemini no debe fijar precios ni crear pedidos directamente: usa herramientas del backend. El servidor valida menú, modificadores, carrito, cotización, confirmación y creación idempotente. |
| Datos de llamada | `CallLog` conserva transcript final, resumen, carrito preliminar, errores y llamadas a herramientas. No conserva el audio original ni un registro independiente de cada evento de transcripción. |
| Despliegue | Compose declara web, API y PostgreSQL; Nginx sirve de proxy, incluido el upgrade del WebSocket. Gunicorn se configura con un worker. |

El flujo de una llamada es, en corto: **Twilio → WebSocket Flask → conversión de audio → Gemini Live → herramientas Flask/servicio de pedidos → PostgreSQL → transcript y pedido en el panel**.

## Hallazgos

### 1. El ensamblado del transcript puede cambiar lo que se guarda — prioridad alta

En `backContestador/app/services/voice_realtime.py:27-43`, `_merge_transcript_chunk` elimina un fragmento si el texto acumulado ya termina con ese fragmento, reemplaza el acumulado si el texto nuevo empieza con él, y en otros casos elimina el mayor solapamiento de caracteres que encuentra. No usa identificadores de segmento, secuencia, indicador de texto parcial/final ni límites de turno para decidir si debe reemplazar o agregar.

Es una regla de texto, no una garantía de que dos mensajes sean duplicados. Por ejemplo, si llegan dos segmentos independientes iguales, el segundo se pierde. Si el proveedor entrega una hipótesis parcial seguida de la frase final, el resultado dependerá de cómo se solapen las cadenas. El mismo método se usa para texto del cliente y del asistente (`voice_realtime.py:293-314`).

**Mejora:** guardar cada transcripción final como un segmento inmutable, con emisor, orden, hora, tipo de evento y modelo. Si se recibe texto provisional, mantenerlo como provisional y reemplazarlo sólo por la versión final correspondiente; no combinarlo por coincidencia de letras. Mantener el texto crudo y una versión de presentación separada. Confirmar primero el contrato exacto de eventos para el modelo seleccionado.

La documentación actual de Gemini Live distingue en su flujo de transcripción dedicado las hipótesis provisionales (`interim_input_transcription`) y los segmentos ya finalizados (`input_transcription`). El código actual sólo maneja `input_transcription` y no conserva metadatos que permitan auditar si el evento fue parcial o final. [Documentación oficial de transcripción en vivo](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe)

### 2. Falta evidencia para distinguir reconocimiento, interpretación y audio perdido — prioridad alta

El puente manda el audio a Gemini y guarda el transcript que recibe, pero no guarda el audio ni eventos crudos de transcripción. `CallLog.confidence` existe en la base de datos, pero el flujo de voz inspeccionado no la asigna. Así, un transcript incorrecto puede venir de la conversión/cola, del reconocimiento acústico o del ensamblado; una acción incorrecta también puede ocurrir aunque el transcript se vea bien, porque el modelo interpreta el audio para decidir qué decir o qué herramienta llamar.

Además, la cola de entrada admite diez fragmentos y elimina el más antiguo cuando se llena (`voice_realtime.py:223-249`). Con fragmentos telefónicos de 20 ms eso equivale aproximadamente a 200 ms de audio. La pérdida se marca como `inbound_audio_backpressure`, pero no se cuantifica ni se relaciona con el texto que faltó.

**Mejora:** registrar por llamada el modelo/versión, secuencia y hora de eventos, segmentos provisionales y finales, cambios de turno, llamadas/resultados de herramientas, latencia y eventos de backpressure. Evitar guardar audio por defecto; si se necesitan muestras para diagnóstico, definir acceso limitado y retención corta. Mostrar la confianza sólo si se obtiene una medida real y se explica qué mide.

### 3. La dirección se captura, pero no se verifica — prioridad alta

`delivery_address_parts` pide calle, número exterior, colonia y ciudad (`voice_tools.py:106-120`). El backend comprueba que esos campos no estén vacíos y los concatena en una cadena (`voice_tools.py:394-413`). `quote_voice_order` vuelve a comprobar sólo que exista una dirección (`orders.py:158-162`). El modelo recibe la instrucción de repetir cada componente, pero esa confirmación de dirección no está representada ni exigida como estado del pedido en el backend.

La columna `orders.delivery_address` es texto libre (`models/order.py:31`). No hay campos de código postal, localidad/municipio/estado, identificador de vialidad ni resultado de validación. Las zonas de entrega se pasan al prompt como nombres; el servicio de cotización no coteja la dirección contra una de ellas.

**Mejora:** guardar por separado lo que dijo la persona y los valores normalizados/verificados; buscar candidatos por localidad y colonia; confirmar con el cliente el candidato elegido y el número; y hacer que el servidor impida cotizar o enviar una dirección no confirmada o fuera de cobertura. Si no hay candidato claro, pedir que repita o transfiera a una persona; no completar nombres de calles por intuición.

### 4. Mexicali está fijado en el prompt global — prioridad alta para crecer

`voice_runtime.py:366-369` le dice a todas las llamadas que el negocio atiende en Mexicali y que asuma esa ciudad si el cliente no menciona otra. La ciudad no se deriva del negocio que Twilio resolvió para la llamada. Esto sirve como supuesto provisional para una sola operación local, pero se vuelve incorrecto en cuanto haya negocios de otra ciudad o más de una zona.

**Mejora:** configurar la ubicación por negocio (país, estado, municipio y localidad) y usarla tanto en la conversación como en la validación de la dirección. En la primera etapa se puede restringir el catálogo a Mexicali; la estructura de datos y la API deben guardar claves geográficas con jerarquía nacional para extenderse después.

### 5. La instrucción conversacional no sustituye validaciones del servidor — prioridad media-alta

El prompt pide recolectar los datos de entrega por partes y repetirlos. El servidor, en cambio, acepta cualquier calle/colonia/ciudad siempre que haya texto. También existe un endpoint de runtime que reporta configuración como “ready” mediante comprobaciones de presencia y formato; no comprueba que el dominio resuelva, que WSS acepte conexiones o que Gemini/Twilio completen una llamada (`voice_runtime.py:118-151`).

Conviene tratar reconocimiento, confirmación de dirección, cobertura y confirmación final del pedido como pasos con estado verificable en backend. El prompt sigue siendo útil para el tono, pero no debería ser la única barrera para guardar un domicilio.

La detección de actividad también está configurada como automática, con sensibilidades `LOW`, 120 ms de padding inicial y 700 ms de silencio (`gemini_live.py:43-51`, `voice_runtime.py:103-107`). No hay evidencia estática de que esos valores sean la causa, pero sí pueden cambiar cuándo se considera terminado el turno. Medir pausas, palabras cortadas e interrupciones antes de ajustarlos; cambiar sensibilidad y duración en llamadas reales sin una muestra de referencia puede empeorar otras voces.

### 6. La configuración local no representa una configuración de producción verificable — prioridad alta si se despliega igual

En el `.env` local de este checkout, `NEXT_PUBLIC_API_URL` apunta a `http://localhost:18763`, `PUBLIC_BASE_URL` contiene un dominio de ejemplo, `TWILIO_VALIDATE_SIGNATURE=false`, `TWILIO_STATUS_CALLBACK_URL` está vacío y CORS sólo enumera orígenes localhost. Compose inserta `NEXT_PUBLIC_API_URL` como argumento de build (`docker-compose.yml:27-36`) y el cliente web lo usa como URL base (`contestador/lib/api.ts:1-2`). Si ese mismo `.env` se usa al construir para el droplet, los navegadores de los clientes intentarían llamar a su propio `localhost` y Twilio recibiría una URL de ejemplo. La firma de Twilio también quedaría sin validación.

Esto describe el archivo local, no prueba que el servidor tenga la misma configuración. El indicador `ready` tampoco detecta el dominio de ejemplo como inválido porque sólo requiere HTTPS y variables no vacías (`voice_runtime.py:133-147`). Antes de tomar el “ready” del panel como prueba, validar la URL pública, DNS/TLS/WSS y una llamada real; habilitar la verificación de firma en producción.

## Propuesta para reconocimiento de calles

### Primera versión: Mexicali

1. **Crear un catálogo local indexado** de vialidades y asentamientos por localidad, municipio y estado. El Marco Geoestadístico del INEGI publica un catálogo de vialidades por localidad y un catálogo de asentamientos humanos; su servicio también permite consultar vialidades por clave geoestadística. [Marco Geoestadístico y descargas del INEGI](https://www.inegi.org.mx/programas/mg/default.html) · [Servicio del Catálogo Único](https://www.inegi.org.mx/servicios/catalogounico.html)
2. **Cruzar con códigos postales/asentamientos** para generar candidatos más útiles. Correos de México permite descargar el Catálogo Nacional de Códigos Postales por entidad o para todo el país. Su página dice que se proporciona sin costo y que no está permitida su comercialización total o parcial; revisar las condiciones antes de incorporarlo o redistribuirlo en un producto comercial. [Descarga oficial de SEPOMEX](https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx)
3. **Añadir alias de habla local** a partir de errores confirmados: abreviaturas (“boulevard”, “blvd.”), nombres alternos, pronunciaciones y variantes de acentos/ortografía. No sustituir automáticamente un nombre dudoso; conservar candidatos y pedir al cliente que elija.
4. **Separar campos hablados**: tipo y nombre de vialidad, número exterior, colonia/fraccionamiento, localidad, municipio, estado, código postal y referencias. El número y las referencias tienen tratamientos distintos; no deben mezclarse con el nombre oficial de la calle.
5. **Confirmar la dirección completa en voz alta** antes de cotizar. La confirmación debe guardar qué versión leyó el asistente y qué respuesta dio la persona. Si el reconocimiento del número es dudoso, pedirlo dígito por dígito o transferir.

No usaría DENUE como catálogo principal de calles: sirve para establecimientos económicos y puede aportar puntos de referencia, pero el catálogo vial/geoestadístico es la fuente más directa para nombres de vialidad.

### Extensión a todo México

- Mantener el país → estado → municipio → localidad como claves estructuradas; no codificar la ciudad en un prompt general.
- Importar catálogos por fuente y versión, guardar fecha de actualización y registrar de dónde salió cada candidato.
- Definir una interfaz de catálogo nacional para poder cambiar o combinar proveedores de calles, asentamientos, códigos postales y geocodificación sin acoplar el modelo de voz a uno solo.
- Resolver primero dentro de la localidad del negocio y ampliar la búsqueda sólo cuando el cliente indique otra ciudad. Una coincidencia de nombre de calle sin localidad no basta.
- Revisar términos/licencias de cada conjunto antes de descargarlo de forma recurrente, almacenarlo o ofrecer resultados dentro de un producto comercial.

Gemini documenta vocabulario personalizado para términos propios; la documentación del modelo dedicado de transcripción indica un máximo de 1,000 términos y que los mejores resultados suelen obtenerse con listas más pequeñas, de hasta unos 100. Vale la pena probar el vocabulario local de Mexicali en una evaluación controlada. Esa función se documenta para el modelo dedicado `gemini-3.5-transcribe-live`; no asumir que sea una configuración intercambiable con el agente conversacional actual. [Transcripción en vivo y vocabulario personalizado](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe)

## Orden recomendado de trabajo

| Orden | Acción | Para qué |
|---|---|---|
| 1 | Revisar una muestra de llamadas fallidas con audio y transcript, si existe, y anotar qué falló: palabras, números, dirección, artículo/cantidad, turno cortado o acción del modelo. | No atribuir todos los síntomas al mismo componente. |
| 2 | Corregir el modelo de datos/eventos del transcript para guardar segmentos finales sin deduplicación aproximada; medir eventos de cola llena y latencia. | Que el texto guardado corresponda a lo emitido y que los problemas puedan diagnosticarse. |
| 3 | Construir un conjunto de evaluación de llamadas de Mexicali con transcripción esperada y campos correctos de pedido/dirección. Incluir ruido, distintas velocidades, números, nombres de calles y repeticiones. | Comparar cambios con la misma evidencia. |
| 4 | Añadir catálogo de vialidades/asentamientos, normalización conservadora y confirmación de candidatos; mantener el texto original. | Reducir domicilios mal escritos sin inventar correcciones. |
| 5 | Comparar el agente actual con una ruta de transcripción dedicada con vocabulario local, si el baseline demuestra errores acústicos en calles. | Separar reconocimiento de voz de razonamiento conversacional antes de asumir una arquitectura nueva. |
| 6 | Probar WSS, webhook/callback de Twilio y una llamada end-to-end; decidir si el registro público debe seguir abierto. | Verificar el flujo real de voz después de validar dominio, HTTPS y API. |

Métricas mínimas: tasa de error de caracteres/palabras de la transcripción; exactitud por campo (calle, número, colonia, producto, cantidad); cuántas veces se corrige o repite; domicilios candidatos aceptados; pedidos transferidos; llamadas con `inbound_audio_backpressure`; latencia hasta respuesta; pedidos creados con dirección verificada. No usar únicamente una “confianza promedio” si el proveedor no entrega una confianza real comparable.

## Verificación de producción — 2026-10-04

- El droplet `pulsor` sirve `https://demoagenda.shop`; el sitio y `https://demoagenda.shop/api/v1/health` devolvieron HTTP 200 con TLS válido.
- La configuración observada en el servidor usa `https://demoagenda.shop` para `PUBLIC_BASE_URL`, `NEXT_PUBLIC_API_URL` y CORS. `TWILIO_VALIDATE_SIGNATURE=true`; la configuración de callback no se verificó.
- Después del despliegue, API y panel quedaron activos, y la base confirmó la migración `9a41c8d75e20` y la tabla `call_log_transcript_events`.
- La configuración de producción tiene `REGISTER_OPEN=true`. El endpoint de registro crea usuario y negocio sin exigir autenticación; si el alta debe ser privada, hay que cerrar el registro.
- La consulta agregada de producción encontró 13 llamadas entre el 4 y el 10 de agosto: 10 `COMPLETED`, 3 `INCOMPLETE`, 5 asociadas a pedidos y 2 sin transcript. Esos registros no tienen `voice_metrics`, no hay filas en `call_log_transcript_events` y no se guardaron `call_log_error_flags`. Todas anteceden al despliegue del 4 de octubre, así que no permiten medir la versión nueva ni atribuir la causa de los fallos reportados.
- El build de Next.js terminó correctamente. Durante `npm ci`, npm reportó 13 vulnerabilidades en dependencias: 2 moderadas, 10 altas y 1 crítica. Los avisos no se clasificaron por paquete/advisory en esta auditoría.
- Los valores del `.env` local siguen siendo de desarrollo y no son los de producción; usar ese archivo local para construir el sitio rompería el acceso remoto al API y desactivaría la validación de firmas.

## Comprobaciones pendientes

- No se hizo una llamada telefónica end-to-end después del despliegue ni se probó el handshake WSS/webhook de Twilio.
- No se inspeccionaron transcripts crudos ni audio. Para establecer si falla el reconocimiento, el manejo de turnos o la captura al guardar, hace falta evaluar una muestra autorizada y etiquetada; hoy no hay telemetría de voz histórica para separarlos.
- La verificación HTTP confirma disponibilidad, no el flujo visual de login, pedidos ni captura de llamadas.

El documento no incluye contraseñas, tokens ni llaves privadas.
