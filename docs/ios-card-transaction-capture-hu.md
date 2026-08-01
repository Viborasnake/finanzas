# Captura asistida de transacciones desde iOS

## Ficha de decisión

- Producto: MisFinanzas
- Plataforma actual: web app responsive
- Stack actual: React 19, TypeScript, Vite y Supabase
- Fecha de revisión: 15 de julio de 2026
- Estado: análisis de viabilidad e Historia de Usuario, sin implementación
- Evidencia visual revisada: captura de Apple Wallet con una tarjeta terminada en `1918` y varias transacciones visibles

## Decisión ejecutiva

MisFinanzas no puede leer de forma pasiva las notificaciones de Apple Wallet ni de aplicaciones bancarias mediante APIs públicas de iOS. Tampoco existe en PassKit una API pública para consultar libremente el historial de compras de las tarjetas que una persona ve en Wallet.

La solución viable debe comenzar siempre con una acción explícita de la persona:

1. seleccionar una captura desde MisFinanzas;
2. compartir una imagen o texto con una futura Share Extension nativa;
3. ejecutar una acción de MisFinanzas desde Atajos mediante una futura app iOS;
4. completar un ingreso manual asistido.

Para el MVP del repositorio actual se recomienda **importar una captura desde la web app, analizarla, mostrar borradores y pedir revisión antes de guardar**. Una app iOS nativa con Vision, Share Extension y App Intents es una evolución posterior, no una dependencia del primer lanzamiento.

La captura nunca debe convertirse directamente en movimientos financieros. El resultado del OCR es un borrador incierto. Solo las filas seleccionadas y confirmadas por la persona ingresan a `public.transactions` usando la misma frontera de ingesta idempotente de las cartolas.

## 1. Diagnóstico del estado actual

### 1.1 Arquitectura

| Área | Estado actual | Consecuencia para esta iniciativa |
|---|---|---|
| Cliente | React + TypeScript + Vite | Se puede construir la selección, análisis y revisión de capturas en la web actual. |
| Backend | Supabase Auth, PostgreSQL, RLS y RPC | Debe autenticar el análisis y ejecutar la persistencia final. |
| Aplicación iOS | No existe un target Xcode ni cliente Swift | Share Extension, Vision y App Intents no pueden agregarse solo desde esta web app. |
| PWA | No hay manifest, service worker ni share target | No se debe depender de recibir contenido desde el Share Sheet como PWA. |
| Fuente financiera de verdad | `public.transactions` | Los borradores OCR no deben alimentar dashboard, cuentas ni reportes. |
| Bancos | `Scotiabank`, `Itaú`, `Mach` y `Consorcio` en `BankContext` | La tarjeta detectada debe asociarse a un banco conectado antes de guardar. |
| Cuentas o tarjetas | No existe una entidad propia para cuentas o tarjetas | En el MVP solo puede guardarse banco y últimos cuatro dígitos como metadato enmascarado. |
| Categorías | Taxonomía base más categorías personalizadas | La revisión puede reutilizar el selector de categorías actual. |
| Reglas | Palabras clave globales en `classification_rules` | Pueden sugerir una categoría, pero no deben guardar automáticamente una fila OCR. |
| OCR | No existe | Se requiere un adaptador nuevo de análisis de imagen. |
| Imágenes | No existe almacenamiento ni política de retención | Debe definirse procesamiento efímero y eliminación por defecto. |

### 1.2 Ingestas existentes

El flujo principal está en `src/components/ImportModal.tsx`:

1. recibe archivos CSV, XLS/XLSX, DAT, TXT o PDF;
2. detecta el banco;
3. parsea las filas;
4. aplica reglas de clasificación;
5. presenta una vista previa editable;
6. calcula el hash SHA-256 del archivo;
7. llama a `ingest_statement_transactions` para guardar el lote.

Existen además inserciones directas desde pagos manuales de Cuentas y ajustes iniciales. Esos flujos deben considerarse cuando una captura encuentre un movimiento similar.

### 1.3 Modelo de transacciones

El modelo remoto documentado utiliza, entre otros, estos campos:

- `id`, `user_id`, `date`, `description`, `amount`, `type`;
- `bank`, `tipo_movimiento`, `categoria_principal`, `categoria_secundaria`;
- `raw_data`, `created_at`.

La migración local `supabase/migrations/20260715000000_transaction_ingestion_integrity.sql` prepara:

- `source_kind`;
- `source_external_id`;
- `source_file_hash`;
- `source_row_key`;
- `candidate_fingerprint`;
- `ingestion_batch_id`;
- una tabla de lotes;
- índices de identidad fuerte;
- una RPC de ingesta atómica e idempotente.

Esa migración aparece en el repositorio como preparada y debe verificarse y desplegarse antes de habilitar una nueva fuente. La importación OCR no debe apoyarse solo en controles del navegador.

### 1.4 Duplicados

`src/utils/transactionIdentity.ts` diferencia correctamente:

- identidad fuerte: identificador externo estable o combinación de hash de archivo y clave de fila;
- huella candidata: banco, fecha, monto, tipo y descripción normalizada.

La huella candidata sirve para pedir revisión, no para eliminar. Esta regla debe mantenerse para capturas, porque dos compras reales pueden tener el mismo monto, fecha y comercio.

### 1.5 Evidencia de la captura revisada

La captura de Apple Wallet permite observar:

- una tarjeta terminada en `1918` en el encabezado;
- varias filas dentro de una misma imagen;
- descripciones originales como `SumUp * BALI MARKET SP` y `Mercadopago*dany`;
- montos con punto como separador de miles;
- ubicaciones truncadas visualmente;
- fechas absolutas y relativas como `Ayer`, `Lunes`, `Viernes` y `08-07-26`;
- ausencia de un código de moneda visible;
- ausencia de un identificador bancario estable por transacción.

El encabezado puede aportar contexto para todas las filas, pero no se debe asumir que `1918` identifica por sí solo al banco ni que `$` significa siempre CLP.

## 2. Restricciones reales de iOS

### 2.1 Matriz de viabilidad

| Mecanismo | Viabilidad | Restricción real | Uso recomendado |
|---|---|---|---|
| Leer notificaciones de Wallet o bancos en segundo plano | No viable con API pública | UserNotifications permite que una app gestione sus propias notificaciones. Una Notification Service Extension modifica notificaciones remotas dirigidas a su propia app. No entrega acceso general a notificaciones de terceros. | No diseñar esta dependencia. |
| Leer directamente el historial de tarjetas de Wallet | No viable con API pública general | PassKit permite Apple Pay y gestionar pases o capacidades autorizadas, pero la documentación pública no expone un historial libre de compras de tarjetas ajenas a la app. | Usar captura o integración bancaria oficial futura. |
| Seleccionar una captura desde Fotos | Viable | Requiere acción explícita. En una app nativa, Photos Picker permite compartir activos seleccionados con control de privacidad. | Entrada principal del MVP web y del futuro cliente nativo. |
| Compartir una captura con MisFinanzas | Viable con app nativa | Una Share Extension pertenece a una app contenedora y recibe solo los adjuntos que la app anfitriona comparte. No puede observar contenido por sí sola. | Fase nativa posterior. |
| Ejecutar “Importar en MisFinanzas” desde Atajos | Viable con app nativa | App Intents expone acciones con parámetros admitidos, por ejemplo archivos o imágenes. La ejecución sigue siendo iniciada o configurada por la persona. | Fase nativa posterior. |
| OCR local en iPhone | Viable con app nativa | Vision reconoce texto, devuelve confianza y regiones, y procesa en el dispositivo. | Opción preferida de privacidad para la app iOS. |
| OCR en la web actual | Viable con servicio adicional | Safari no expone Vision como API web del proyecto. Se necesita OCR en servidor o una biblioteca OCR web, con costo, peso y privacidad a evaluar. | MVP web mediante adaptador backend, sujeto a decisión de proveedor. |

### 2.2 Conclusión sobre notificaciones

La falta de una API que lea notificaciones de terceros es una inferencia de alta confianza basada en el alcance documentado de UserNotifications y de las extensiones de notificación. El sistema solo entrega a la extensión de una app la notificación remota destinada a esa app y configurada para ser modificable. Por lo tanto, MisFinanzas no debe prometer “importación automática desde notificaciones”.

La promesa correcta es: **“Comparte o selecciona una captura y MisFinanzas te ayuda a revisarla antes de guardarla.”**

### 2.3 Fuentes oficiales

- [UserNotifications: solicitar permiso para las notificaciones de la propia app](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)
- [UNNotificationServiceExtension: modificar notificaciones remotas de la propia app](https://developer.apple.com/documentation/usernotifications/unnotificationserviceextension)
- [Share Extension](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html)
- [Ciclo y límites de App Extensions](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionOverview.html)
- [App Intents y Atajos](https://developer.apple.com/documentation/appintents/app-intents)
- [Parámetros admitidos por App Intents](https://developer.apple.com/documentation/appintents/adding-parameters-to-an-app-intent)
- [Photos Picker](https://developer.apple.com/documentation/photokit/selecting-photos-and-videos-in-ios)
- [Vision: reconocimiento de texto en imágenes](https://developer.apple.com/documentation/vision/recognizing-text-in-images)
- [PassKit](https://developer.apple.com/documentation/passkit)
- [Wallet y pases accesibles por una app](https://developer.apple.com/documentation/passkit/wallet)

## 3. Historia de Usuario definitiva

### HU IOS-01: importar movimientos desde una captura

**Como** persona que revisa movimientos de una tarjeta en una notificación, en Apple Wallet o en otra aplicación financiera,

**quiero** seleccionar o compartir una captura para que MisFinanzas detecte uno o varios movimientos y me permita corregirlos,

**para** registrarlos rápidamente sin perder control sobre lo que se guarda ni contabilizar una compra dos veces.

### Jobs to be Done

**Trabajo funcional**

Cuando veo un cobro reciente fuera de MisFinanzas, quiero transformarlo en un movimiento revisado con el menor ingreso manual posible, para mantener mis datos al día.

**Trabajo de control**

Cuando el reconocimiento no es confiable o el movimiento se parece a uno existente, quiero comparar la evidencia antes de decidir, para no inventar datos ni borrar una compra válida.

**Trabajo de confianza**

Cuando comparto una captura financiera, quiero saber qué se procesa y qué se conserva, para mantener la privacidad de la información que no pertenece a la transacción.

### Resultado esperado

El usuario termina el flujo con una de estas salidas explícitas:

- movimientos seleccionados y guardados;
- algunos movimientos guardados y otros pendientes de corrección;
- captura descartada sin crear movimientos;
- posible duplicado enviado a revisión;
- importación cancelada sin persistencia financiera.

## 4. Alcance funcional

### Primera versión

- Abrir “Importar” y elegir “Captura de tarjeta”.
- Seleccionar una imagen JPG, PNG o HEIC desde el dispositivo.
- Calcular un hash del archivo antes de procesarlo.
- Detectar una o varias filas de transacción.
- Extraer descripción, monto, fecha, moneda sugerida, ubicación opcional y últimos cuatro dígitos cuando aparezcan.
- Mostrar confianza por campo, no solo una confianza global.
- Resolver fechas relativas usando fecha, hora, locale y zona horaria de captura como contexto.
- Permitir editar todos los campos requeridos.
- Permitir seleccionar qué filas se importan.
- Sugerir banco y categoría sin aplicarlos silenciosamente.
- Mostrar posibles duplicados antes de guardar.
- Guardar solo después de una confirmación final.
- Eliminar la imagen después del procesamiento por defecto.
- Mantener procedencia mínima y auditable en los movimientos guardados.

## 5. Fuera de alcance de la primera versión

- Leer notificaciones de terceros en segundo plano.
- Sincronizar directamente Apple Wallet.
- Importar automáticamente cada captura nueva de Fotos.
- Guardar movimientos sin revisión humana.
- Marcar como duplicado solo por monto y fecha.
- Conservar capturas de forma permanente por defecto.
- Soportar imágenes con varias tarjetas sin pedir asignación por fila.
- Crear inicialmente una app iOS, Share Extension o App Intent.
- Conciliar automáticamente una captura con una sincronización bancaria futura sin evidencia fuerte o decisión explícita.
- Inferir la moneda solo por el símbolo `$` cuando existan alternativas plausibles.

## 6. Flujo principal

### Flujo A: captura de Apple Wallet con varias transacciones

1. La persona entra a `Importar`.
2. Ve dos opciones primarias: “Cartola bancaria” y “Captura de tarjeta”.
3. Selecciona “Captura de tarjeta”.
4. Elige una imagen y ve una previsualización con acciones “Usar esta captura” y “Elegir otra”.
5. MisFinanzas calcula el hash y crea un trabajo temporal, todavía sin movimientos.
6. La interfaz muestra “Analizando captura” con progreso por etapas: preparando, leyendo y organizando.
7. El OCR devuelve regiones de texto con confianza y posición.
8. El agrupador identifica el encabezado de tarjeta y separa las filas por geometría visual.
9. La persona ve un resumen: “Detectamos 8 movimientos de la tarjeta terminada en 1918”.
10. Las filas completas de confianza alta o media aparecen seleccionadas. Las incompletas quedan sin seleccionar y con acción “Completar”.
11. Cada fila muestra solo comercio, monto, fecha y banco/tarjeta. “Ver detalle” revela texto original, ubicación, procesador, confianza y procedencia.
12. Si una fila tiene candidato duplicado, aparece “Revisar coincidencia” y se abre una comparación de ambos registros.
13. La persona corrige, excluye o confirma las filas.
14. Una pantalla final resume nuevas, omitidas, incompletas y candidatas a duplicado.
15. Al presionar “Guardar X movimientos”, el servidor ejecuta una operación idempotente.
16. La interfaz informa qué se guardó y qué no, con enlace a Transacciones.
17. La imagen temporal se elimina; se conserva solo la procedencia mínima autorizada.

### Progressive disclosure

| Nivel | Contenido visible | Objetivo |
|---|---|---|
| 1. Resumen | Cantidad detectada, tarjeta, filas seleccionadas y alertas | Permitir una decisión rápida. |
| 2. Edición de fila | Comercio, monto, fecha, moneda, banco y categoría | Corregir lo necesario sin abrir información técnica. |
| 3. Evidencia | Texto OCR original, región, confianza, procesador y ubicación | Explicar por qué se propuso cada dato. |
| 4. Duplicado | Comparación con registros existentes y efecto de cada decisión | Resolver excepciones sin frenar las demás filas. |

La información técnica no debe ocupar la vista principal. Solo se revela cuando hay baja confianza, una inconsistencia o cuando la persona pide verla.

## 7. Flujos alternativos

### Flujo B: captura de una notificación

1. La persona selecciona la captura.
2. El sistema detecta un solo bloque probable.
3. Si faltan comercio o fecha, muestra un formulario breve con el dato faltante en foco.
4. La persona confirma banco, monto, fecha y tipo.
5. El sistema revisa candidatos duplicados y permite guardar.

### Flujo C: Share Extension futura

1. La persona toma o abre una captura.
2. Usa Compartir y elige “MisFinanzas”.
3. La extensión valida que exista una imagen y prepara un borrador autenticado.
4. La extensión no guarda una transacción ni muestra un formulario completo.
5. MisFinanzas abre la revisión mediante un enlace universal o deja el borrador pendiente para la próxima apertura.
6. La revisión y persistencia siguen el mismo flujo principal.

### Flujo D: Atajo futuro

1. La persona ejecuta “Importar captura en MisFinanzas”.
2. El App Intent recibe explícitamente un `IntentFile`, `PHAsset` o imagen admitida.
3. Crea un borrador de captura.
4. Abre la pantalla de revisión.
5. Nunca confirma movimientos en segundo plano.

### Flujo E: ingreso manual asistido

1. La persona elige “Ingresar manualmente”.
2. Completa monto y descripción; fecha, banco y moneda usan valores sugeridos editables.
3. El sistema revisa candidatos duplicados.
4. La persona confirma el movimiento.

### Flujo F: análisis fallido

1. El OCR no encuentra una transacción confiable.
2. MisFinanzas no crea movimientos.
3. Ofrece “Recortar y reintentar”, “Elegir otra imagen” o “Ingresar manualmente”.

## 8. Criterios de aceptación

### CA01: acción explícita

**Dado** que iOS no entrega a MisFinanzas las notificaciones de otras aplicaciones,

**cuando** la persona quiera importar un cobro,

**entonces** el flujo debe comenzar con una selección, compartición o acción explícita.

### CA02: no hay persistencia durante el OCR

**Dado** que una captura puede contener errores o información no financiera,

**cuando** el sistema la analice,

**entonces** debe crear solo borradores temporales y ningún registro en `transactions`.

### CA03: una transacción detectada

**Dado** que la imagen contiene una sola transacción reconocible,

**cuando** finalice el análisis,

**entonces** debe mostrarse una ficha editable con descripción, monto, fecha, moneda, banco/tarjeta y categoría sugerida.

### CA04: varias transacciones detectadas

**Dado** que una captura de Wallet contiene varias filas,

**cuando** finalice el análisis,

**entonces** cada fila debe aparecer como un borrador independiente y seleccionable.

### CA05: contexto compartido de tarjeta

**Dado** que los últimos cuatro dígitos aparecen solo en el encabezado,

**cuando** las filas estén dentro de la misma sección visual,

**entonces** el sistema puede proponer ese contexto a todas las filas y debe permitir corregirlo.

### CA06: fechas relativas

**Dado** que una fecha aparece como `Ayer`, `Lunes` o `Viernes`,

**cuando** se convierta a una fecha calendario,

**entonces** la resolución debe usar la fecha de captura, locale y zona horaria, indicar que fue inferida y pedir confirmación si existe ambigüedad.

### CA07: confianza por campo

**Dado** que Vision u otro OCR devuelve distinta confianza para cada región,

**cuando** monto, fecha o comercio estén bajo el umbral definido,

**entonces** el campo debe quedar marcado para revisión y no puede asumirse como correcto.

### CA08: selección múltiple

**Dado** que se detectaron varios movimientos,

**cuando** la persona llegue a la revisión,

**entonces** debe poder seleccionar todos, ninguno o un subconjunto, sin perder sus correcciones.

### CA09: datos requeridos incompletos

**Dado** que una fila no tiene monto, fecha, descripción o banco asignado,

**cuando** la persona intente guardarla,

**entonces** debe bloquearse solo esa fila, llevar el foco al primer dato faltante y permitir importar las demás.

### CA10: privacidad

**Dado** que la imagen contiene información adicional no necesaria,

**cuando** el sistema termine de procesarla,

**entonces** debe eliminar el original por defecto y almacenar únicamente los datos necesarios, salvo consentimiento explícito y revocable para conservarla.

### CA11: repetición exacta de una captura

**Dado** que la misma imagen ya fue procesada para el mismo usuario,

**cuando** vuelva a enviarse por cualquier canal,

**entonces** el servidor debe reconocer el mismo hash de artefacto, no duplicar filas y mostrar el resultado anterior o una advertencia de repetición.

### CA12: dos compras legítimas iguales

**Dado** que existen dos compras con igual comercio, monto y fecha,

**cuando** no compartan una identidad de fuente estable,

**entonces** ambas deben conservarse como válidas o candidatas a revisión, nunca excluirse automáticamente.

### CA13: posible duplicado con un movimiento existente

**Dado** que una fila OCR coincide aproximadamente con un movimiento manual, una cartola o una sincronización,

**cuando** la persona revise la fila,

**entonces** debe poder comparar ambas, mantener ambas, vincular la evidencia al movimiento existente o solicitar revisión.

### CA14: importación parcial

**Dado** que algunas filas son válidas y otras tienen errores,

**cuando** la persona confirme las válidas,

**entonces** el sistema debe guardar solo las seleccionadas y entregar un resumen preciso de guardadas, omitidas y pendientes.

### CA15: cancelación

**Dado** que existe un trabajo de análisis abierto,

**cuando** la persona lo cancele o cierre antes de confirmar,

**entonces** no debe crearse ningún movimiento financiero y el artefacto temporal debe eliminarse según la política de retención.

### CA16: reintento concurrente

**Dado** que dos solicitudes intentan guardar el mismo lote al mismo tiempo,

**cuando** lleguen al servidor,

**entonces** una operación debe insertar y la otra debe devolver una repetición idempotente sin filas adicionales.

## 9. Campos y estructura de datos

### 9.1 Trabajo temporal de captura

Se recomienda una tabla de staging, no financiera, `transaction_capture_jobs`:

| Campo | Tipo sugerido | Uso |
|---|---|---|
| `id` | UUID | Identificador del trabajo. |
| `user_id` | UUID | Propietario con RLS. |
| `artifact_hash` | text | SHA-256 de la imagen original. |
| `source_kind` | text | Tipo canónico, por ejemplo `card_activity_screenshot`. |
| `source_channel` | text | `web_upload`, `ios_share`, `ios_shortcut` o `ios_picker`. |
| `status` | text | `queued`, `analyzing`, `ready`, `partial`, `failed`, `confirmed`, `discarded`. |
| `captured_at` | timestamptz nullable | Fecha de captura obtenida del sistema o confirmada. |
| `timezone` | text | Zona usada para fechas relativas. |
| `locale` | text | Locale usado para fechas y montos. |
| `image_retention` | text | `discard_after_processing` o `consented`. |
| `expires_at` | timestamptz | Eliminación automática del trabajo temporal. |
| `created_at` | timestamptz | Auditoría operacional. |

Restricción recomendada: `UNIQUE (user_id, source_kind, artifact_hash)`.

`source_kind` debe describir el artefacto y no el canal. Así, la misma captura enviada por web y por Share Extension mantiene la misma identidad fuerte.

### 9.2 Candidato OCR

Se recomienda `transaction_capture_candidates`:

| Campo | Tipo sugerido | Uso |
|---|---|---|
| `id` | UUID | Identificador del borrador. |
| `job_id` | UUID | Trabajo padre. |
| `source_row_key` | text | Identidad determinista de la región dentro de la captura. |
| `ordinal` | integer | Orden visual. |
| `selected` | boolean | Selección del usuario. |
| `status` | text | `detected`, `needs_input`, `duplicate_candidate`, `confirmed`, `discarded`. |
| `raw_text` | text nullable | Solo el fragmento mínimo que explica la fila. |
| `description_original` | text | Texto original reconocido. |
| `merchant_normalized` | text nullable | Comercio sugerido. |
| `payment_processor` | text nullable | SumUp, MercadoPago u otro. |
| `amount` | numeric nullable | Monto absoluto. |
| `currency` | text nullable | Código ISO, no solo símbolo. |
| `effective_date` | date nullable | Fecha de la compra. |
| `date_resolution` | text | `explicit`, `relative`, `inferred` o `user_confirmed`. |
| `location_text` | text nullable | Ubicación visible, sin completar texto truncado. |
| `bank_hint` | text nullable | Banco propuesto. |
| `card_last4` | text nullable | Solo cuatro dígitos. |
| `transaction_status` | text | `unknown`, `pending` o `posted`. |
| `field_confidence` | JSONB | Confianza y origen por campo. |
| `bounding_region` | JSONB nullable | Región normalizada para explicar el OCR. |
| `candidate_fingerprint` | text nullable | Búsqueda de similitudes, no unicidad. |

Restricción recomendada: `UNIQUE (job_id, source_row_key)`.

### 9.3 Movimiento financiero confirmado

Los candidatos seleccionados se convierten al contrato existente de ingesta. En `raw_data` debe conservarse solo procedencia mínima:

```json
{
  "_source": {
    "kind": "card_activity_screenshot",
    "channel": "web_upload",
    "file_hash": "sha256",
    "row_key": "region-0003",
    "capture_job_id": "uuid",
    "card_last4": "1918",
    "captured_at": "2026-07-15T10:37:00-04:00"
  },
  "merchant": {
    "original": "SumUp * BALI MARKET SP",
    "normalized": "Bali Market",
    "processor": "SumUp"
  },
  "recognition": {
    "engine": "provider-and-version",
    "date_resolution": "relative_user_confirmed",
    "confidence": {
      "description": 0.97,
      "amount": 0.99,
      "date": 0.78
    }
  }
}
```

No se deben guardar el número completo de tarjeta, capturas de otras aplicaciones, nombres de cuenta visibles ni texto ajeno a las regiones necesarias.

### 9.4 Evolución del modelo de cuentas

Si MisFinanzas debe manejar varias cuentas o tarjetas del mismo banco, el siguiente paso es una entidad `financial_accounts` con `id`, `user_id`, `institution`, `kind`, `display_name`, `currency` y `masked_last4`. Hasta entonces, `bank` sigue siendo obligatorio y `card_last4` es un indicio enmascarado, no una cuenta de verdad.

## 10. Estrategia de normalización

### 10.1 Principio

Conservar siempre tres valores separados:

- descripción original: evidencia textual sin alterar;
- comercio normalizado: nombre legible y reutilizable;
- procesador: intermediario de pago detectado.

### 10.2 Ejemplos

| Original | Comercio sugerido | Procesador | Confianza esperada |
|---|---|---|---|
| `SumUp * BALI MARKET SP` | `Bali Market` | `SumUp` | Alta para procesador, media para comercio. |
| `Mercadopago*dany` | `Dany` | `MercadoPago` | Alta para procesador, media para comercio. |
| `Mercadopago*comercialgold` | `Comercial Gold` | `MercadoPago` | Alta para procesador, media para comercio. |
| `14086-Bk Plaza Vespuci` | `BK Plaza Vespucio` | Sin determinar | Baja o media; requiere corrección ortográfica explícita. |

### 10.3 Pipeline

1. Normalizar Unicode y espacios solo para comparar.
2. Detectar un prefijo de procesador mediante reglas versionadas.
3. Separar el descriptor restante sin sobrescribir el original.
4. Aplicar alias confirmados previamente por el usuario.
5. Proponer capitalización y limpieza visual.
6. Aplicar reglas de clasificación sobre descripción original y normalizada.
7. Mostrar la sugerencia y permitir corregirla.
8. Guardar una nueva regla solo con consentimiento explícito.

No se deben expandir ubicaciones truncadas ni completar nombres comerciales mediante imaginación del modelo.

## 11. Estrategia de prevención de duplicados

### 11.1 Defensa por capas

| Capa | Regla |
|---|---|
| Artefacto | SHA-256 de la captura para reconocer reenvíos exactos. |
| Fila | `source_row_key` determinista por región y orden visual. |
| Servidor | Restricción única por usuario, tipo canónico de fuente, hash y fila. |
| Aplicación | Operación idempotente, atómica y protegida ante doble clic. |
| Similitud | Huella candidata para revisión, nunca restricción única. |
| UX | Comparación explícita cuando existe un movimiento parecido. |

### 11.2 Identidad fuerte

Orden de precedencia:

1. `source_external_id` cuando una fuente oficial lo entrega;
2. `artifact_hash + source_row_key` para la misma captura;
3. ninguna deduplicación automática cuando solo existe similitud financiera.

### 11.3 Clave de fila

La clave debe ser estable para la misma imagen. Propuesta:

```text
sha256(normalized-bounding-box + visual-ordinal + normalized-row-text)
```

El índice visual no debe depender de la posición en un array retornado por un proveedor si ese orden puede variar.

### 11.4 Coincidencias entre fuentes

Una captura editada, un ingreso manual y una cartola pueden representar la misma compra sin compartir hash. Se crea un candidato si coinciden varios atributos:

- usuario;
- banco o cuenta;
- últimos cuatro dígitos cuando existan;
- monto y moneda;
- fecha o ventana temporal;
- comercio normalizado;
- estado pendiente o confirmado.

El resultado debe ser uno de estos:

- vincular la nueva evidencia al movimiento existente;
- guardar ambas como válidas;
- mantener en revisión;
- confirmar duplicado mediante el flujo auditable definido en el plan de duplicados.

### 11.5 Pendiente y confirmado

Una operación `pending` que luego aparece `posted` no debe convertirse automáticamente en dos egresos. Sin identificador externo estable, el sistema debe mostrar la pareja y explicar que la confirmación puede reemplazar o completar la evidencia del registro pendiente.

## 12. Estados de interfaz

| Estado | Mensaje principal | Acción disponible | Persistencia financiera |
|---|---|---|---|
| Seleccionando imagen | `Elige una captura legible` | Elegir, cancelar | No |
| Analizando captura | `Estamos leyendo la captura` | Cancelar | No |
| Transacción detectada | `Detectamos 1 movimiento` | Revisar | No |
| Varias transacciones detectadas | `Detectamos X movimientos` | Seleccionar y revisar | No |
| Datos incompletos | `Falta información en X filas` | Completar o excluir | No |
| Baja confianza | `Revisa los campos marcados` | Corregir | No |
| Posible duplicado | `Encontramos un movimiento parecido` | Comparar | No |
| Duplicado confirmado | `Este movimiento ya estaba registrado` | Vincular evidencia o deshacer decisión | No nuevo movimiento |
| Error de lectura | `No pudimos leer esta captura` | Reintentar o manual | No |
| Formato no compatible | `Usa JPG, PNG o HEIC` | Elegir otra | No |
| Sin transacciones reconocibles | `No encontramos movimientos` | Recortar, otra imagen o manual | No |
| Guardando | `Guardando X movimientos` | Sin doble envío | Operación en curso |
| Guardado exitoso | `X movimientos guardados` | Ver transacciones | Sí, confirmados |
| Importación parcial | `Guardamos X; Y necesitan revisión` | Revisar pendientes | Solo seleccionados válidos |
| Sesión expirada | `Vuelve a iniciar sesión para continuar` | Iniciar sesión | No |

### Reglas de interacción

- Monto, fecha, moneda, descripción y banco deben tener etiqueta visible.
- El color no puede ser la única señal de confianza o error.
- El foco debe avanzar al primer campo inválido de la primera fila seleccionada.
- El análisis debe anunciarse con `aria-live="polite"` y `aria-busy`.
- Las filas deben poder seleccionarse y editarse por teclado.
- En móvil, cada objetivo táctil debe medir al menos 44 por 44 puntos CSS.
- El botón final debe decir cuántos movimientos guardará.
- Cerrar o volver debe pedir confirmación solo si existen correcciones no guardadas.

## 13. Casos límite

| Caso | Comportamiento esperado |
|---|---|
| No aparece comercio | Solicitar descripción; no inventarla. |
| Nombre técnico distinto al comercio | Conservar original y proponer alias editable. |
| Fecha `Ayer`, `Lunes` o `Viernes` | Resolver contra `captured_at`, locale y zona; marcar como inferida. |
| No aparece año | Inferir el año más plausible respecto de la captura y pedir confirmación si cruza diciembre/enero. |
| Tarjeta solo en encabezado | Propagar como contexto visual, no como dato confirmado. |
| Dos compras iguales en minutos | Mantener ambas salvo identidad fuerte compartida. |
| Pendiente y luego confirmada | Proponer vínculo o actualización, no sumar dos veces automáticamente. |
| Separadores de miles | Interpretar según locale y validar magnitud antes de guardar. |
| Moneda ausente | Proponer la moneda de la cuenta o del usuario con etiqueta `inferida`. |
| CLP y otra moneda en la misma imagen | Requerir moneda por fila; no usar una moneda global sin evidencia. |
| Imagen recortada | Procesar lo visible y señalar campos faltantes. |
| Texto oculto | Mostrar baja confianza y exigir corrección de campos requeridos. |
| Varias tarjetas | Agrupar por encabezado; si no hay separación fiable, pedir tarjeta por fila. |
| Misma captura repetida | Reproducir el lote idempotente sin nuevas filas. |
| Ya existe manualmente | Mostrar comparación y permitir vincular evidencia. |
| Aparece luego en cartola o sincronización | Proponer reconciliación entre fuentes. |
| Prefijo SumUp o MercadoPago | Separar procesador, comercio y original. |
| OCR confunde `0/O`, `1/I`, `$` o puntos | Marcar campo y mostrar imagen/región de apoyo. |
| Ubicación truncada con `...` | Conservar texto visible; no completar. |
| Captura muy larga | Procesar por regiones y mantener posición para evitar mezclar filas. |
| Imagen rotada o con zoom | Normalizar orientación y pedir recorte si la lectura sigue baja. |
| Captura sin movimientos seleccionados | Deshabilitar guardado y explicar `Selecciona al menos uno`. |

## 14. Riesgos técnicos y de privacidad

### Riesgos bloqueantes

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Migración idempotente no desplegada | Duplicación por reintentos o concurrencia | Verificar y desplegar antes de habilitar capturas. |
| Proveedor OCR no definido | No existe análisis web implementable | Elegir proveedor o decidir cliente iOS con Vision. |
| Imagen financiera enviada a terceros | Riesgo legal y de confianza | Procesamiento local cuando sea posible; contrato, región y no retención para servidor. |
| Moneda o fecha inferida como cierta | Totales incorrectos | Confianza por campo y confirmación obligatoria cuando falte evidencia. |
| Sin entidad de cuenta/tarjeta | Asociación bancaria ambigua | Banco obligatorio en MVP y últimos cuatro solo como indicio. |

### Política mínima de privacidad

- Bucket privado y acceso por URL firmada de corta duración si se usa almacenamiento temporal.
- Eliminación del original inmediatamente después del análisis exitoso.
- Eliminación automática dentro de 24 horas ante trabajos fallidos o abandonados.
- Consentimiento separado y revocable para conservar una imagen con fines de soporte.
- Solo últimos cuatro dígitos; nunca almacenar PAN completo, CVV ni credenciales.
- No incluir montos, comercios, imágenes ni OCR completo en logs operacionales.
- Logs con `job_id`, estado, duración, proveedor, conteo de filas y códigos de error.
- RLS para trabajos y candidatos.
- Cifrado en tránsito y en reposo.
- Explicar antes de enviar si el OCR ocurre fuera del dispositivo.

## 15. Propuesta de MVP

### MVP recomendado: web primero

**Entrada**

Agregar “Captura de tarjeta” a `/import` usando el selector de archivos del navegador.

**Análisis**

Crear una Supabase Edge Function autenticada que reciba la imagen y metadatos mínimos, invoque un adaptador OCR y devuelva candidatos estructurados. La elección del motor queda pendiente. El contrato debe permitir reemplazarlo por Vision cuando exista un cliente iOS.

**Revisión**

Crear una pantalla dedicada de revisión múltiple. Reutilizar el selector de categorías, las reglas, el banco activo y los patrones de diálogo existentes. No agregar toda la lógica al componente monolítico `ImportModal`.

**Persistencia**

Generalizar la frontera de ingesta para aceptar `source_kind = card_activity_screenshot` y el mismo esquema de lote, hash y clave de fila. La operación debe mantener la transacción atómica y los índices de identidad fuerte.

**Privacidad**

No guardar la imagen original. Si el proveedor exige una URL, usar almacenamiento temporal privado con borrado verificable.

### Por qué este MVP

- aprovecha el producto existente;
- valida el valor del reconocimiento antes de financiar una app nativa;
- mantiene la revisión humana;
- reutiliza categorías, bancos, transacciones y deduplicación;
- permite medir exactitud real con capturas chilenas.

## 16. Evolución futura

### Fase nativa 1: app contenedora iOS

- Inicio de sesión Supabase.
- Photos Picker.
- Vision OCR en el dispositivo.
- Revisión nativa o apertura de revisión web mediante enlace universal autenticado.

### Fase nativa 2: Share Extension

- Aceptar `public.image` y texto explícitamente compartido.
- Crear un borrador, no una transacción.
- Compartir código de parsing y contratos con la app contenedora.
- Usar App Group/Keychain solo después de una revisión de seguridad.

### Fase nativa 3: App Intents y Atajos

- Acción `Importar captura` con archivo o foto como parámetro.
- Acción `Abrir borradores pendientes`.
- Enlace universal al trabajo de revisión.
- Confirmación siempre dentro de MisFinanzas.

### Fase de integración financiera

- Entidad formal de cuentas y tarjetas.
- Integraciones bancarias oficiales cuando existan y sean contratadas.
- Tabla de procedencias para vincular varias evidencias a un mismo movimiento.
- Reconciliación de pendiente/confirmado y captura/cartola.

## 17. Plan técnico de implementación

### Fase 0: decisiones y seguridad

1. Confirmar si el MVP será web o si existe presupuesto para una app iOS.
2. Elegir motor OCR para web y revisar tratamiento de datos.
3. Definir umbrales iniciales por campo.
4. Aprobar política de retención.
5. Desplegar y validar la migración de ingesta idempotente.

### Fase 1: dominio y contratos

1. Definir `CaptureJob`, `CaptureCandidate`, `FieldEvidence` y `CaptureAnalysisResult`.
2. Implementar parseo de montos CLP y monedas ISO.
3. Implementar resolución de fechas relativas con reloj inyectable.
4. Implementar agrupación por regiones visuales.
5. Implementar normalización de procesadores y comercios.
6. Extender la huella candidata con moneda y contexto de cuenta cuando exista.

### Fase 2: backend de análisis

1. Crear migración de trabajos/candidatos temporales y RLS.
2. Crear Edge Function autenticada.
3. Validar MIME, tamaño, dimensiones y orientación.
4. Integrar el adaptador OCR.
5. Estructurar candidatos sin guardar movimientos.
6. Programar eliminación del artefacto temporal.
7. Agregar métricas sin datos financieros sensibles.

### Fase 3: revisión web

1. Agregar la entrada “Captura de tarjeta”.
2. Construir selección y previsualización.
3. Construir estados de análisis.
4. Construir revisión de una y varias filas.
5. Reutilizar el selector de categorías.
6. Agregar edición y confianza por campo.
7. Agregar selección múltiple y resumen final.
8. Agregar comparación de posibles duplicados.

### Fase 4: persistencia

1. Extraer una frontera de ingesta común para cartolas y capturas.
2. Mantener `source_kind` canónico y `source_channel` separado.
3. Guardar solo filas seleccionadas y válidas.
4. Verificar idempotencia ante doble envío y replay.
5. Registrar resultado por fila para importación parcial.
6. Eliminar artefactos temporales después de confirmar o descartar.

### Fase 5: QA y lanzamiento controlado

1. Crear un set anonimizado de capturas reales de bancos y Wallet.
2. Medir precisión por campo y formato.
3. Probar Safari móvil, escritorio y tablet.
4. Ejecutar pruebas de accesibilidad y teclado.
5. Lanzar detrás de feature flag.
6. Revisar falsos positivos y abandonos.
7. Ajustar umbrales antes de habilitar a todos.

### Fase 6: iOS nativo

1. Crear app contenedora y autenticación.
2. Implementar Vision y Photos Picker.
3. Implementar Share Extension.
4. Implementar App Intents.
5. Reutilizar el contrato de candidatos y la misma RPC final.

## 18. Archivos y componentes a modificar

### Existentes

| Archivo | Cambio futuro |
|---|---|
| `src/pages/ImportRoute.tsx` | Mostrar las fuentes de importación y enrutar a captura o cartola. |
| `src/components/ImportModal.tsx` | Extraer la interfaz común de preview e ingesta; no incorporar aquí todo el OCR. |
| `src/utils/importFileTypes.ts` | Añadir formatos de imagen admitidos y mensajes específicos. |
| `src/utils/transactionIdentity.ts` | Admitir la fuente canónica de captura, moneda y cuenta en candidatos. |
| `src/hooks/useTaxonomy.ts` | Sin cambio de dominio; reutilizar opciones para sugerencias. |
| `src/contexts/BankContext.tsx` | Ofrecer banco conectado como selección obligatoria. |
| `src/pages/Transactions.tsx` | Mostrar procedencia de captura y acceso a evidencia mínima. |
| `supabase/migrations/20260715000000_transaction_ingestion_integrity.sql` | Verificar despliegue y extraer una función de ingesta común si se generaliza. |

### Nuevos sugeridos

| Archivo | Responsabilidad |
|---|---|
| `src/components/TransactionCaptureImport.tsx` | Orquestar selección, análisis y revisión. |
| `src/components/CaptureCandidateList.tsx` | Revisión múltiple con selección. |
| `src/components/CaptureCandidateEditor.tsx` | Edición de una fila y evidencia progresiva. |
| `src/components/DuplicateCandidateReview.tsx` | Comparación entre movimientos. |
| `src/services/transactionCapture.ts` | Cliente del análisis y guardado. |
| `src/utils/captureAmounts.ts` | Moneda y separadores. |
| `src/utils/captureDates.ts` | Fechas absolutas y relativas. |
| `src/utils/merchantNormalization.ts` | Procesadores, alias y comercio normalizado. |
| `src/utils/captureGrouping.ts` | Agrupación de OCR por regiones. |
| `supabase/functions/analyze-transaction-capture/index.ts` | Endpoint autenticado y adaptador OCR. |
| `supabase/migrations/<fecha>_transaction_capture_jobs.sql` | Staging temporal, RLS, índices y expiración. |

### Futuros nativos

| Módulo | Responsabilidad |
|---|---|
| App iOS | Sesión, Photos Picker, Vision y revisión. |
| Share Extension | Recibir imagen explícitamente compartida y crear borrador. |
| App Intents | Exponer “Importar captura” a Atajos. |
| Shared Core | Contratos, normalización y cliente de API reutilizables. |

## 19. Pruebas necesarias

### Unitarias

- `$4.450` en locale `es-CL` produce `4450 CLP` solo cuando la moneda fue confirmada o sugerida con evidencia.
- `$4,450.50` no se interpreta usando reglas CLP incorrectas.
- `Ayer` se resuelve con fecha de captura y zona horaria inyectadas.
- `Viernes` cruza correctamente semanas y años.
- `08-07-26` se interpreta de acuerdo con locale y se marca como fecha explícita.
- Se agrupan correctamente encabezado, descripción, ubicación, fecha y monto de una fila.
- Dos montos iguales en filas distintas generan claves de fila diferentes.
- `SumUp * BALI MARKET SP` conserva original y separa procesador/comercio.
- `Mercadopago*dany` conserva original y detecta procesador.
- Confianza baja en monto bloquea esa fila.
- El fingerprint no actúa como identidad fuerte.
- La misma imagen y región producen la misma identidad.

### Integración

- La Edge Function rechaza usuarios no autenticados.
- Rechaza MIME, tamaño o dimensiones no admitidos.
- No persiste movimientos al analizar.
- El trabajo solo es visible por su propietario.
- El original se elimina al terminar o expirar.
- Un lote con ocho filas devuelve ocho candidatos independientes.
- La misma captura por dos canales reutiliza el lote.
- Guardar dos veces el mismo lote no duplica movimientos.
- Dos solicitudes concurrentes producen un solo conjunto de filas.
- Una importación parcial informa el resultado por fila.
- Una coincidencia manual hereda sugerencias, pero conserva ambos registros hasta resolución.

### End-to-end web

- Captura de una notificación con todos los campos.
- Captura de una notificación sin comercio.
- Captura de Wallet con varias filas.
- Selección de un subconjunto.
- Corrección de fecha relativa.
- Moneda ausente.
- Imagen recortada.
- Varias tarjetas.
- Baja confianza y navegación de teclado.
- Posible duplicado con comparación.
- Cancelar antes de guardar.
- Sesión expirada durante el análisis.
- Reintento tras error de red.
- Guardado exitoso y aparición en Transacciones.

### Regresión

- Cartolas Scotiabank, Itaú y Mach siguen importando.
- Las reglas de clasificación se aplican como sugerencias.
- Dashboard y Cuentas solo leen movimientos confirmados.
- No cambian totales al analizar o descartar una captura.
- Los registros confirmados mantienen banco y categoría correctos.

### Nativas futuras

- Photos Picker entrega solo el activo seleccionado.
- Vision funciona sin red.
- Share Extension acepta imagen y rechaza formatos no admitidos.
- App Intent recibe archivo y abre revisión.
- La extensión no guarda movimientos por sí sola.
- Tokens y archivos compartidos respetan el modelo de seguridad aprobado.

## 20. Preguntas y decisiones pendientes

1. ¿Se desea validar primero la función en la web o ya existe decisión de crear una app iOS?
2. ¿Qué proveedor OCR puede procesar datos financieros y en qué región?
3. ¿Se exige OCR completamente local desde la primera versión?
4. ¿Cuál será el tamaño máximo y formatos definitivos de imagen?
5. ¿La moneda por defecto del usuario puede proponerse como CLP cuando solo aparece `$`?
6. ¿Qué fecha representa `date`: compra, autorización o contabilización?
7. ¿Se incorporará `transaction_status` para pendiente/confirmada?
8. ¿La persona puede tener varias tarjetas del mismo banco?
9. ¿Se requiere una entidad formal de cuenta/tarjeta antes de este MVP?
10. ¿Qué confianza mínima debe permitir preseleccionar una fila?
11. ¿Las filas completas deben venir seleccionadas o debe seleccionarlas la persona una por una?
12. ¿Se permitirá conservar una captura para soporte y por cuánto tiempo?
13. ¿La migración idempotente local ya fue desplegada y validada en producción?
14. ¿Se implementará primero el flujo funcional de resolución de duplicados?
15. ¿Existen capturas reales de notificaciones bancarias además del ejemplo de Wallet?
16. ¿Qué bancos y diseños de Wallet son prioritarios para el set inicial de pruebas?

## Recomendación final

La secuencia segura es:

1. desplegar y verificar la ingesta idempotente;
2. construir el MVP web de captura, OCR y revisión sin retención de imagen;
3. medir precisión con casos reales;
4. recién entonces decidir si una app iOS con Vision, Share Extension y App Intents justifica su costo.

La experiencia debe vender rapidez, pero operar con prudencia: **MisFinanzas propone; la persona confirma; el servidor evita repeticiones.**
