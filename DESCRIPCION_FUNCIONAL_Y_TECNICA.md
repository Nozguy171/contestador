# Descripción funcional y técnica del contestador automático

**Fecha de revisión:** 21 de julio de 2026
**Proyecto:** VoiceOrder AI / contestador automático para restaurantes
**Alcance de esta revisión:** repositorio completo, servicios Docker, interfaz de escritorio y móvil, integración Twilio/Gemini, herramientas de pedido, persistencia y operación multi-tenant.

## 1. Resumen ejecutivo

El proyecto es un monorepo para atender llamadas telefónicas de restaurantes, conversar por voz con el cliente, consultar el menú y construir pedidos. Twilio recibe la llamada y únicamente transporta el audio; Gemini Live entiende y genera el audio, administra la conversación y solicita acciones mediante herramientas controladas por el backend. El backend conserva la autoridad sobre el menú, precios, reglas, carrito y creación final del pedido.

El sistema tiene tres piezas desplegables desde un solo `docker-compose.yml`:

- Un frontend administrativo en Next.js.
- Una API y gateway de voz en Flask.
- Una base de datos PostgreSQL.

El flujo de voz de tiempo real ya está implementado en el código: webhook entrante, TwiML con Media Streams bidireccional, WebSocket con Twilio, sesión con Gemini Live, conversión de audio en memoria, interrupciones, function calling, carrito preliminar y confirmación idempotente del pedido. Sin embargo, la prueba telefónica completa sigue dependiendo de que la cuenta de Twilio tenga saldo y permita `<Connect><Stream>`; una cuenta Trial puede reproducir el aviso de prueba y terminar la llamada antes de abrir el stream.

La aplicación administrativa incluye inicio, POS, KDS, pedidos, menú, inventario, venta y entrega, información del negocio, clientes, asistente telefónico opcional y registro de llamadas. Las vistas principales y sus ventanas se revisaron también en un viewport móvil de 390 × 844 px.

## 2. Arquitectura actual

```text
Cliente telefónico
       |
       v
Twilio Programmable Voice
  POST /voice/incoming
       |
       | TwiML: <Connect><Stream>
       v
WebSocket Flask
  /api/v1/voice/twilio/media-stream
       |
       +--> TwilioVoiceAdapter
       +--> CallSession
       +--> AudioBridge
       +--> GeminiLiveProvider <----> Gemini Live API
                                      |
                                      | function calls
                                      v
                                  OrderTools
                                      |
                                      v
                                  OrderService
                                      |
                                      v
                                  PostgreSQL
                                      |
                                      v
                        Dashboard Next.js (consulta cada 3 s)
```

### Estructura del monorepo

| Carpeta/archivo | Responsabilidad |
|---|---|
| `contestador/` | Frontend Next.js, React, TypeScript, Tailwind y componentes shadcn/Radix. |
| `backContestador/` | API Flask, autenticación, modelos, servicios de pedido y gateway de voz. |
| `docker-compose.yml` | Orquesta PostgreSQL, backend y frontend. |
| `.env.example` | Catálogo de variables necesarias, sin llaves reales. |
| `deploy/nginx/` | Configuración de proxy para HTTP, API y upgrade de WebSocket. |
| `scripts/setup_env.py` | Generación/preparación de variables locales. |

### Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix/shadcn y Recharts.
- Backend: Python, Flask 3, SQLAlchemy, Flask-Migrate, JWT, Flask-CORS y Flask-Sock.
- Tiempo real: WebSocket servido con Gunicorn/gevent.
- Telefonía: Twilio Programmable Voice y Media Streams bidireccional.
- IA: Google Gemini Live mediante `google-genai`.
- Persistencia: PostgreSQL 16.
- Infraestructura: Docker Compose y Nginx.

## 3. Flujo real de una llamada

### 3.1 Entrada y resolución del negocio

1. Twilio envía un `POST` a `/voice/incoming`.
2. Si la validación de firma está habilitada, el backend verifica la firma de Twilio.
3. El backend normaliza el número destino (`To`) y busca un negocio cuyo `twilio_phone_number` coincida.
4. El `tenantId` se obtiene exclusivamente de ese número. Gemini nunca decide ni proporciona el tenant.
5. Si no existe negocio, falta configuración de Twilio/Gemini o no se puede construir una URL WSS pública, el backend responde con TwiML de rechazo.
6. Si todo está listo, crea o reutiliza un `CallLog`, relaciona al cliente por teléfono y deja la sesión en estado de conexión.
7. Devuelve TwiML con `<Connect><Stream>` hacia `/api/v1/voice/twilio/media-stream` y agrega un token temporal firmado que vincula llamada, negocio y número.

### 3.2 Apertura del WebSocket

Twilio abre el WebSocket y manda eventos `connected`, `start`, `media`, `mark` y `stop`.

En `start`, el backend valida:

- Token temporal y vigencia.
- `CallSid`.
- Número llamado.
- Negocio resuelto.
- Firma de Twilio cuando está habilitada.

Después crea una `CallSession` con identificadores de llamada y stream, tenant, estado, carrito, revisión del carrito, cotización, marcas de audio pendientes y datos de transferencia.

### 3.3 Sesión Gemini Live

El backend abre una sesión Live configurada para:

- Entrada y salida de audio.
- Idioma `es-MX`.
- Voz configurable; actualmente la predeterminada es `Aoede`.
- Transcripción de entrada y salida.
- Detección automática de actividad de voz.
- Interrupción de la respuesta cuando comienza a hablar el cliente.
- Herramientas de menú, carrito, pedido y transferencia.

El prompt de sistema se arma con datos del negocio: nombre, dirección, horarios, configuración de entrega, métodos de pago, zonas, promociones, políticas, reglas del menú, preguntas frecuentes, mensajes del bot, tono e instrucciones especiales.

### 3.4 Audio de entrada y salida

**Cliente hacia Gemini:**

1. Twilio entrega audio base64 en μ-law de 8 kHz.
2. `AudioBridge` lo decodifica en memoria.
3. Lo convierte a PCM16 de 16 kHz.
4. Envía fragmentos pequeños a Gemini.

**Gemini hacia el cliente:**

1. Gemini genera PCM, aproximadamente a 24 kHz.
2. `AudioBridge` reduce la frecuencia a 8 kHz.
3. Codifica a μ-law.
4. Divide en bloques de 160 bytes, equivalentes a unos 20 ms.
5. Envía eventos `media` a Twilio para que el audio se reproduzca en la llamada.

Todo se procesa en memoria. No se crean archivos temporales y no se ejecuta ffmpeg por fragmento.

### 3.5 Interrupciones

Cuando el cliente habla mientras Gemini está respondiendo:

- Gemini notifica la nueva actividad.
- El backend descarta el audio pendiente.
- Limpia su buffer y las marcas de reproducción.
- Envía `clear` a Twilio.
- Evita que se reproduzca audio viejo antes de continuar el nuevo turno.

### 3.6 Cierre

Al recibir `stop` o terminar cualquiera de las tareas principales:

- Se cierran ambas conexiones.
- Se calcula duración y estado.
- Se guarda el transcript disponible.
- Se persiste el carrito preliminar y el estado de sesión.
- Se relaciona el pedido si la llamada lo produjo.
- Se registran flags de error y llamadas a herramientas con campos sensibles redactados.

## 4. Herramientas disponibles para Gemini

Gemini no consulta directamente la base de datos, no calcula precios y no crea pedidos por su cuenta. Sólo puede pedir al backend que ejecute estas operaciones:

| Herramienta | Función real |
|---|---|
| `search_menu(query)` | Busca categorías y productos activos; limita los resultados. |
| `get_item_options(id)` | Obtiene disponibilidad y modificadores válidos de un producto. |
| `add_to_cart(id, qty, modifiers)` | Valida producto, cantidad y modificadores; agrega o combina una línea del carrito. |
| `remove_item(line_id)` | Elimina una línea concreta del carrito preliminar. |
| `quote_order()` | Valida modalidad, dirección, pago y reglas; calcula importes en el backend. |
| `submit_order()` | Exige confirmación explícita y token vigente; vuelve a cotizar y crea el pedido una sola vez. |
| `transfer_to_human(reason)` | Actualiza la llamada en Twilio para ejecutar un `<Dial>` al número humano configurado. |

### Controles importantes al confirmar

- El carrito debe tener artículos.
- El producto debe seguir activo y no agotado.
- Los modificadores deben pertenecer al producto.
- La cantidad debe estar dentro de límites.
- Entrega, mínimo, dirección y forma de pago deben ser válidos.
- Se aplican tarifa de entrega y umbral de envío gratis.
- Se valida el umbral de efectivo y si se requiere prepago.
- Se comprueba que la cotización siga correspondiendo a la revisión actual del carrito.
- Si cambió el menú o el precio, se obliga a volver a confirmar.
- Un mismo `CallLog` no puede generar pedidos duplicados.

El pedido guarda snapshots del nombre, precio y modificadores, de modo que cambios posteriores en el menú no alteran el histórico.

## 5. Multi-tenant, usuarios y seguridad

- Cada número de Twilio pertenece a un negocio y es único.
- En llamadas, el tenant siempre sale del número marcado.
- En el dashboard, el frontend envía `X-Business-Id` y el backend valida que el usuario pertenezca al negocio.
- Los roles existentes son `owner`, `admin`, `manager`, `agent` y `viewer`.
- La autenticación usa JWT con expiración configurada a 12 horas.
- El frontend conserva el token en `sessionStorage` o `localStorage`, según “Recordarme”.
- Ante un `401`, borra la sesión y regresa al login.
- Las llaves de Twilio, Gemini, JWT y base de datos se leen del entorno; no deben ir en el repositorio.
- El registro crea usuario, negocio, configuración inicial y membresía de propietario.

Limitación actual: el dashboard selecciona automáticamente el primer negocio de la lista. No existe selector visual de negocio y el encabezado muestra “Propietario” de forma fija, aunque el backend sí maneja más roles y membresías.

## 6. Datos persistidos

Las entidades principales son:

- `User`, `Business` y `BusinessUser` para usuarios, negocios y membresías.
- `BusinessHour`, `BusinessSetting`, zonas de entrega, promociones y políticas.
- `Category`, `Product`, `ProductModifier` y `MenuRule`.
- `Customer`, separado por negocio y teléfono.
- `Order`, artículos, snapshots de modificadores e historial de estados.
- `CallLog`, con `CallSid`, `StreamSid`, duración, estado, transcript, carrito preliminar, herramientas, errores, transferencia y pedido relacionado.
- `BotConfig` para mensajes, tono, confirmación, reintentos y comportamiento declarado.
- `FAQ` para información que Gemini puede responder.

## 7. Vistas del sistema

### 7.1 Inicio de sesión (`/login`)

- Correo y contraseña.
- Opción “Recordarme”.
- Manejo de errores del backend.
- Enlace para crear cuenta.
- En escritorio muestra un panel comercial lateral; en móvil queda únicamente el formulario.

### 7.2 Registro (`/signup`)

- Nombre y apellido.
- Nombre del negocio.
- Correo.
- Contraseña y confirmación.
- Aceptación de términos.
- Valida campos obligatorios, coincidencia y mínimo de ocho caracteres.
- Crea el negocio automáticamente y abre sesión.

### 7.3 Inicio / panel (`/`)

- Contadores de pedidos nuevos, preparando, listos, en entrega, entregados y cancelados.
- Conversión de llamadas y fallos.
- Gráfica semanal de pedidos.
- Gráfica de llamadas por hora.
- Productos más vendidos.
- Pedidos y llamadas recientes.
- Carritos preliminares de llamadas activas.

Los datos de llamadas, pedidos y carritos se actualizan mediante polling cada tres segundos; el dashboard no recibe eventos push por WebSocket.

### 7.4 Pedidos por llamada (`/orders`)

- Búsqueda por folio, teléfono o nombre.
- Filtros por estado.
- Tarjetas adaptables en pantallas pequeñas y tabla/estructura amplia en escritorio.
- Acción rápida para mover el pedido al siguiente estado.
- Opción de cancelar.

**Ventana lateral de detalle:** teléfono, cliente, fecha, pago, tipo de entrega, dirección, artículos, modificadores, subtotal, envío, total, notas, resumen/transcript de llamada e historial de estados.

### 7.5 Gestión de menú (`/menu`)

- Búsqueda de productos.
- Filtros por categoría.
- Tarjetas con precio, descripción y modificadores.
- Un único estado de disponibilidad: disponible, agotado u oculto.
- Editar y eliminar.

**Modal “Agregar/Editar producto”:** nombre, descripción, categoría existente, creación rápida sin perder los campos capturados, personalizaciones agrupadas para elegir/agregar/quitar, precio base y un único estado de disponibilidad. En móvil ocupa el ancho disponible, limita su altura al viewport, desplaza internamente el contenido y conserva las acciones al pie; durante la revisión no se observó amontonamiento en 390 × 844 px.

**Confirmación de eliminación:** evita borrar accidentalmente un producto.

### 7.6 Venta y entrega (`/rules`)

- Activar entrega.
- Pedido mínimo, costo de entrega, umbral de envío gratis y preparación estimada.
- Métodos de pago: efectivo, tarjeta y en línea.
- Umbral de efectivo y prepago obligatorio.
- Los importes aceptan decimales.
- Se retiró de la interfaz el JSON técnico de `MenuRule`; sólo se muestran reglas que el backend aplica de forma autoritativa.

### 7.7 Información del negocio (`/business`)

Se divide en bloques:

- Datos generales: nombre, dirección, teléfono y correo.
- Horarios de lunes a domingo, apertura, cierre y día cerrado.
- Entrega: habilitación, tarifa, mínimo, estimación y zonas.
- Promociones.
- Preguntas frecuentes agrupadas por categoría.
- Políticas.

**Modal de FAQ:** permite crear y editar pregunta, respuesta y categoría. También existen confirmaciones/acciones para eliminar registros.

### 7.8 Historial de clientes (`/customers`)

- Métricas de clientes únicos, ingresos y ticket promedio.
- Búsqueda por nombre o teléfono.
- Tarjetas con última actividad, pedidos, gasto, promedio y productos favoritos.

**Ventana lateral de cliente:** teléfono, llamadas, métricas, favoritos, direcciones y últimos pedidos.

### 7.9 Asistente de llamadas (`/bot`)

- Interruptor general para contratar o desactivar voz sin afectar POS, KDS o inventario.
- Indicador de preparación del runtime.
- Número Twilio y teléfono de transferencia.
- Saludo opcional.
- Tono formal, amigable o casual.
- Instrucciones avanzadas dentro de un acordeón opcional.
- Las reglas de seguridad obligatorias ya no se presentan como switches configurables.

### 7.10 Punto de venta (`/pos`)

- Catálogo táctil con búsqueda y categoría.
- Carrito, cantidades, notas y personalizaciones agrupadas.
- Opciones para elegir, agregar y quitar ingredientes.
- Sólo muestra modalidades y pagos habilitados.
- Envía el pedido al mismo servicio autoritativo usado por voz.

### 7.11 Pantalla de cocina (`/kds`)

- Columnas por confirmar, en cocina, listos y en ruta.
- Combina pedidos de voz, POS y futuro kiosco.
- Muestra artículos, personalizaciones, notas y tiempo transcurrido.
- Permite avanzar el estado operativo.

### 7.12 Inventario (`/inventory`)

- Ingredientes, unidad, existencias, mínimo y costo unitario.
- Alertas de stock bajo y valor estimado.
- Ajustes positivos o negativos sin permitir existencias menores a cero.
- El descuento por recetas todavía no es automático.

### 7.13 Registro de llamadas (`/logs`)

- Total de llamadas, porcentaje de conversión, duración promedio y confianza promedio.
- Búsqueda por teléfono.
- Filtro por estado.
- Tarjetas en móvil y tabla desde pantallas amplias.
- Estado, duración, pedido resultante, confianza y flags de error.

**Ventana lateral de llamada:** métricas, carrito preliminar, resultado, resumen, transcript, llamadas a herramientas y errores técnicos.

### 7.14 Navegación general

- Sidebar permanente desde escritorio grande.
- Menú lateral tipo `Sheet` en móvil.
- Menú de cuenta con cierre de sesión.
- Encabezado con negocio actual.
- Padding y tamaños adaptables por breakpoint.

## 8. API actual

Las familias principales de endpoints son:

| Prefijo | Uso |
|---|---|
| `/api/v1/auth` | Registro, login y usuario actual. |
| `/api/v1/businesses` | Negocios, configuración, horarios, zonas, promociones, políticas y FAQ. |
| `/api/v1/menu` | Categorías, productos, modificadores y reglas. |
| `/api/v1/inventory` | Ingredientes, existencias, mínimos, costos y ajustes. |
| `/api/v1/orders` | Listado, detalle, creación y cambios de estado. |
| `/api/v1/calls` | Historial, detalle y actualización de llamadas. |
| `/api/v1/customers` | Clientes y agregados de compra. |
| `/api/v1/businesses/current/bot-config` | Configuración del asistente. |
| `/api/v1/voice/runtime` | Estado/configuración pública no sensible del runtime. |
| `/voice/incoming` | Webhook de voz entrante de Twilio. |
| `/api/v1/voice/twilio/media-stream` | WebSocket de Media Streams. |
| `/api/v1/voice/twilio/status` | Recepción de cambios de estado de Twilio. |

## 9. Estado operativo comprobado

En el entorno local se comprobó:

- PostgreSQL saludable.
- Backend saludable y accesible en el puerto configurado.
- Frontend accesible en `http://localhost:3000`.
- Registro, login y navegación autenticada.
- Carga de todas las rutas principales.
- Sidebar móvil.
- Vista móvil de pedidos.
- Formularios móviles de login y registro.
- Modal móvil completo de producto.

La inspección visual local se realizó con datos vacíos de una cuenta temporal. Por eso el comportamiento con listas pobladas se verificó principalmente contra los componentes y transformaciones del código. La cuenta y el negocio temporales se eliminaron al terminar.

Contexto del despliegue ya configurado:

- Dominio: `demoagenda.shop`.
- Número Twilio asociado al negocio de prueba: `+1 717 937 2169`.
- Webhook esperado: `https://demoagenda.shop/voice/incoming` por `POST`.
- WebSocket esperado: `wss://demoagenda.shop/api/v1/voice/twilio/media-stream`.
- El proxy Nginx contempla el upgrade de WebSocket y timeouts largos.

No se hizo una llamada telefónica end-to-end durante esta revisión. La limitación observada anteriormente corresponde al estado Trial/saldo de Twilio, no a que se esté usando `<Gather>`, STT o TTS de Twilio.

## 10. Qué funciona y qué es parcial

### Implementado en código

- CRUD administrativo de negocio, menú y configuración.
- Autenticación y aislamiento por membresía de negocio.
- Resolución del tenant por número Twilio.
- TwiML con Media Streams bidireccional.
- Bridge WebSocket Twilio ↔ Gemini Live.
- Audio μ-law/PCM en memoria.
- Interrupción y limpieza de audio.
- Tools de menú y pedido con validación del backend.
- Carrito preliminar persistido.
- Confirmación explícita e idempotencia del pedido.
- Transferencia a humano si existe un número configurado.
- Historial de llamadas, transcript, errores y llamadas a herramientas.
- Dashboard operativo responsive.
- POS interno con cálculo autoritativo en backend.
- KDS interno para voz y POS.
- Inventario básico con ajustes manuales y alertas.
- Personalizaciones agrupadas para elegir, agregar o quitar.
- Módulo de llamadas opcional por negocio.

### Parcial o dependiente de configuración externa

- La llamada real requiere cuenta Twilio habilitada para Media Streams, saldo, número Voice-capable, webhook y credenciales correctas.
- Gemini Live requiere una API key válida y acceso al modelo configurado.
- La transferencia necesita `human_transfer_number` y permisos/saldo de Twilio para la llamada saliente.
- HTTPS y WSS requieren DNS y certificado funcionando en el servidor público.

## 11. Limitaciones y diferencias importantes

1. **Cuenta Trial de Twilio:** puede reproducir el aviso de cuenta de prueba y colgar antes de abrir Media Streams. Para validar voz completa se necesita actualizar la cuenta y tener saldo.
2. **Horario fuera de servicio:** el mensaje se incluye en el contexto del modelo, pero el backend no calcula de manera determinista si el negocio está abierto ni bloquea pedidos fuera de horario.
3. **Confirmación requerida:** el backend exige siempre confirmación explícita en llamadas. El switch confuso fue retirado de la interfaz.
4. **Reintentos:** `retry_count` orienta el prompt, pero no existe un contador determinista que corte o transfiera después de N fallos.
5. **Producto no disponible:** `unavailable_behavior` se guarda, pero actualmente no se incorpora al contexto construido para Gemini. `can_suggest_alternatives` sí aparece, aunque no existe una herramienta especializada de sustituciones.
6. **Reglas de menú:** se mandan como texto/contexto a Gemini; no todas se ejecutan como validaciones del `OrderService`.
7. **Tiempo real del dashboard:** el audio sí es tiempo real, pero el frontend consulta llamadas/pedidos cada tres segundos. No hay push de carritos al navegador.
8. **Confianza:** el campo existe y la UI lo grafica, pero el bridge de Gemini no lo llena actualmente; normalmente aparecerá en 0%.
9. **Resumen de IA:** `ai_summary` usa la última transcripción del asistente; no hay una segunda pasada dedicada a resumir toda la conversación.
10. **Pagos:** se registra la forma elegida y se aplican reglas, pero no hay integración con una pasarela ni cobro real.
11. **POS/KDS:** existen módulos internos funcionales; todavía no hay integración con un POS/KDS externo ni impresoras de tickets.
12. **Callback de estado:** existe el endpoint, pero el campo “Call status changes” de Twilio debe configurarse si se quiere recibir todos los cambios fuera del cierre normal del WebSocket.
13. **Multi-negocio en UI:** el backend soporta membresías, pero no hay selector de tenant y el dashboard usa el primer negocio.
14. **Rol mostrado:** el encabezado presenta “Propietario” de forma fija.
15. **Protección de rutas:** el dashboard verifica el token del lado cliente; no existe middleware de Next.js que proteja rutas antes de renderizar.
16. **Inventario y recetas:** el inventario acepta ajustes manuales, pero todavía no descuenta ingredientes automáticamente por receta al confirmar un pedido.
17. **Compatibilidad futura de audio:** el backend usa `audioop`, disponible en la versión actual del contenedor pero retirado de Python 3.13. Una actualización mayor de Python requerirá sustituirlo.
18. **Backpressure:** la cola de audio de entrada tiene tamaño limitado y descarta el fragmento más antiguo cuando se satura. Evita latencia acumulada, pero una máquina sobrecargada puede perder pequeñas partes de voz.

## 12. Evaluación responsive

Las rutas y ventanas usan breakpoints consistentes y actualmente tienen una estructura responsive razonable:

- Sidebar de escritorio y `Sheet` de navegación móvil.
- Tablas convertidas en tarjetas en pedidos y llamadas.
- Drawers de detalle de ancho completo en móvil.
- Grids de una columna que pasan a dos o más en pantallas grandes.
- Modal de producto con ancho relativo al viewport, altura máxima, scroll interno y pie de acciones.
- Login y registro de una columna en móvil y composición dividida en escritorio.
- Filtros de pedidos utilizables mediante disposición horizontal adaptable.
- POS, KDS e inventario apilados correctamente en móvil.

La comprobación directa a 390 × 844 px no mostró controles superpuestos en el modal de producto, personalizaciones, menú móvil, POS, KDS, pedidos, login o registro. Esto no sustituye una matriz visual con contenido extremo; conviene volver a probar con nombres muy largos, numerosas personalizaciones, muchos estados y teclado móvil abierto.

## 13. Prioridades recomendadas para la siguiente etapa

1. Actualizar Twilio, cargar saldo y ejecutar la primera llamada completa observando logs de webhook, WebSocket y Gemini.
2. Confirmar en Twilio el webhook de voz y agregar el callback de estados.
3. Hacer deterministas los horarios, reintentos, reglas de menú y comportamiento ante productos no disponibles.
4. Definir recetas, unidades y mermas antes de activar descuento automático de inventario.
5. Decidir si el KDS interno se conectará a impresoras o pantallas externas.
6. Reutilizar el flujo táctil del POS para un kiosco público después de definir autenticación y pagos.
7. Agregar eventos push para carritos y pedidos si tres segundos de retraso no son aceptables.
8. Integrar una pasarela si se aceptarán pagos “online”.
9. Añadir selector de negocio y mostrar el rol real.
10. Probar carga, latencia, interrupciones, silencios, ruido, llamadas simultáneas y cambios de precio durante una llamada.

## 14. Resumen listo para pasar a otro ChatGPT

> Tenemos un monorepo Docker con frontend Next.js, backend Flask y PostgreSQL. El sistema recibe llamadas mediante Twilio Programmable Voice. El webhook `/voice/incoming` resuelve el negocio usando exclusivamente el número Twilio marcado y responde TwiML con `<Connect><Stream>`. Twilio abre un WebSocket bidireccional con el backend. El backend convierte audio μ-law 8 kHz a PCM16 para Gemini Live y convierte el PCM de Gemini nuevamente a μ-law 8 kHz para Twilio, todo en memoria. Gemini Live maneja audio, turnos e interrupciones, pero usa herramientas del backend para menú, carrito, cotización, pedido y transferencia. El mismo menú y servicio autoritativo alimentan voz y un POS interno. Los pedidos llegan a un KDS con columnas operativas y conservan su origen (`voice`, `pos` o `kiosk`). Los productos tienen un único estado de disponibilidad y personalizaciones agrupadas para elegir, agregar o quitar. Existe inventario básico con existencias, mínimos, costos y ajustes manuales; aún faltan recetas para descuento automático. El módulo de llamadas puede desactivarse sin afectar POS, KDS o inventario. Sigue pendiente validar telefonía end-to-end con una cuenta Twilio pagada, integrar cobro real, selector multi-negocio y cualquier POS/KDS externo.
