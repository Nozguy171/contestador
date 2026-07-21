# Auditoría técnica — 20 de julio de 2026

## Resultado

El proyecto ya construye y arranca como un stack Docker de tres servicios: Next.js, Flask/Gunicorn y PostgreSQL. La migración de base de datos se aplica automáticamente. La API y el panel responden correctamente en local.

## Hallazgos corregidos

### Voz y backend

- La arquitectura de voz de esta auditoría fue sustituida por la migración documentada en `MIGRATION_PLAN.md`: Twilio ahora sólo transporta audio por Media Streams bidireccional y Gemini Live procesa audio completo.
- El modelo anterior de Gemini estaba obsoleto. Se configuró `gemini-3.1-flash-live-preview` y `google-genai` 2.12.1.
- Las tools actuales mantienen un carrito preliminar, cotizan en backend y exigen confirmación explícita antes de crear un pedido idempotente.
- Los modificadores no incluían su ID en el contexto de Gemini. Ahora sí y también pueden administrarse desde el panel.
- Las transcripciones de entrada y salida de Gemini se guardan por llamada y cliente.
- Los estados no terminales de Twilio ya no marcan una llamada como terminada.
- Los errores del puente y de herramientas se registran sin tumbar toda la conversación.
- El número llamado se resuelve exclusivamente contra el número de Twilio dedicado por negocio, sin fallback de tenant.
- Se añadieron validaciones para impedir asociar productos a categorías de otro negocio.

### Datos

- No existía una entidad cliente: la vista agrupaba pedidos en el navegador y omitía a quien solo había llamado. Se añadió `customers` con relaciones a llamadas y pedidos.
- Se normalizan teléfonos y se guarda nombre, última llamada, último pedido, gasto, favoritos y direcciones por negocio.
- Se añadió una migración que crea clientes, agrega las relaciones y migra llamadas/pedidos existentes.
- La vista de clientes ahora consume `/api/v1/customers` y muestra actividad real.

### Frontend

- El build fallaba en `/login` por usar `useSearchParams` fuera de `Suspense`; quedó corregido.
- TypeScript ya no oculta errores durante producción.
- Se instaló y configuró ESLint; lint, typecheck y build pasan.
- Se eliminaron búsqueda, notificaciones, Google login y enlaces que aparentaban funcionar pero no tenían implementación.
- Se corrigió el sidebar colapsable que dejaba un espacio vacío en el layout.
- Se revisaron visualmente `/`, `/login`, `/signup`, `/orders`, `/menu`, `/rules`, `/business`, `/customers`, `/bot` y `/logs` en navegador real a 320, 375, 768 y 1440 px.
- El modal de producto heredaba `sm:max-w-lg` y activaba dos grids internos según el viewport, aunque el contenido solo tenía 512 px. Eso provocaba el amontonamiento de categoría, precio y modificadores. Ahora sobrescribe el ancho en cada breakpoint, solo usa dos columnas cuando hay espacio real y no presenta overflow a 320, 375, 768 ni 1440 px.
- Se reforzaron los componentes compartidos `Dialog`, `AlertDialog`, `Sheet`, `DropdownMenu`, `Select` y `Card`: altura con `dvh`, scroll interno, anchos máximos, contenido encogible, acciones táctiles y botones de pie a ancho completo en móvil.
- Se probaron el formulario de producto —incluyendo modificadores—, confirmación de borrado, formulario FAQ, detalle de pedido, detalle de cliente, detalle de llamada y navegación lateral móvil.
- Los paneles laterales ya usan encabezado y acciones fijas dentro del flujo, con el contenido central como única zona desplazable; se eliminaron alturas calculadas y pies absolutos que podían encimarse.
- Pedidos tiene una tarjeta móvil reordenada, etiquetas traducidas, teléfono legible y acciones explícitas. El registro de llamadas usa tarjetas en móvil/tablet y conserva la tabla completa en escritorio.
- Las métricas de inicio y llamadas se compactaron a dos columnas en móvil; las tarjetas de clientes y productos eliminaron padding duplicado y respetan textos largos.
- Todos los documentos mantienen `scrollWidth === clientWidth`; el carrusel horizontal de estados de pedido es el único desplazamiento lateral intencional.
- La configuración del bot muestra el estado real de Twilio/Gemini y sus modelos sin revelar secretos.
- Se añadió el número dedicado de Twilio a Información del negocio.
- Se actualizó Next.js y se unificó PostCSS; `npm audit` reporta cero vulnerabilidades.

### Operación

- Se añadió Dockerfile de producción para Next.js con salida standalone.
- Compose levanta web, API y base de datos, aplica migraciones y espera healthchecks.
- Se eliminó el lockfile duplicado de pnpm; el proyecto usa npm de forma consistente.
- Se documentó el alta de Twilio, variables, webhook y comandos de verificación en `README.md`.

## Verificación ejecutada

- `npm audit`: 0 vulnerabilidades.
- `npm run lint`: correcto.
- `npx tsc --noEmit`: correcto.
- `npm run build`: 12 rutas generadas correctamente.
- 14 pruebas de backend: TwiML sin STT/TTS, audio streaming, interrupción/`clear`, tokens de stream, E.164, aislamiento multi-negocio, carrito, confirmación explícita, transferencia y pedido idempotente.
- Alembic en `c734d91a20ef (head)` y `flask db check` sin diferencias.
- Healthcheck API y carga del login por HTTP: correctos.
- Auditoría visual en Chrome: 10 rutas, 4 anchos objetivo y 7 overlays interactivos, sin overflow no intencional.
- Stack final en ejecución y saludable: frontend `:3000`, API `:18763` y PostgreSQL `:28461`.

## Pendiente para una llamada real

No hay credenciales reales en `.env`; los valores actuales son marcadores. Para probar una llamada real hacen falta `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `GEMINI_API_KEY`, un número de Twilio y una `PUBLIC_BASE_URL` HTTPS pública. Después debe configurarse el webhook indicado en `README.md`.

El registro de sesiones de voz es local a un único worker. Es correcto para el despliegue actual; antes de escalar horizontalmente debe moverse a Redis/pub-sub.
