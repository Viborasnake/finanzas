# Plan de investigación, reparación y prevención de transacciones duplicadas

## Estado del documento

- Producto: MisFinanzas
- Alcance: ingesta, persistencia, cálculo financiero y resolución funcional de posibles duplicados
- Estado: diagnóstico del repositorio y auditoría del esquema remoto completados; caso concreto pendiente
- Implementación: contención cliente y migración de ingesta idempotente preparadas, aún no desplegadas
- Reparación de datos: no ejecutada
- Causa del caso observado: no confirmada, porque todavía no se cuenta con el par concreto de transacciones, sus identificadores ni evidencia de producción

Este trabajo debe ejecutarse antes de seguir ampliando las fuentes de importación. El riesgo no es solamente visual: los registros duplicados alimentan directamente dashboard, cuentas, categorías y reportes.

## 1. Diagnóstico preliminar

### Qué está confirmado en el código

La importación actual aplica una comprobación de duplicados en el navegador y luego realiza un `insert` independiente en Supabase.

Flujo actual:

1. Los parsers de `src/components/ImportModal.tsx` transforman CSV, Excel o PDF en objetos de transacción.
2. `handleSave` consulta transacciones existentes del usuario, banco y rango de fechas.
3. El cliente construye una firma con fecha, monto y descripción original.
4. El cliente filtra coincidencias encontradas antes de insertar.
5. Las transacciones restantes se insertan con una llamada directa a `transactions`.
6. Los pagos manuales considerados equivalentes se eliminan después, en una operación separada.

Esta secuencia es una operación `buscar -> decidir -> insertar`, no atómica. Dos pestañas, dos clics suficientemente cercanos, un reintento tras timeout o dos clientes pueden leer el mismo estado inicial y luego insertar el mismo movimiento.

Además:

- no existe en el esquema versionado una clave de idempotencia ni una restricción única de identidad de origen;
- el filtro no elimina necesariamente filas repetidas dentro del mismo archivo, porque compara cada fila solo contra lo que ya existía en la base;
- la descripción se normaliza de forma distinta según parser y registro existente;
- los parsers conservan la fila original en `raw_data`, pero no extraen de forma consistente un identificador estable entregado por el banco;
- los pagos manuales se relacionan por mismo monto y una ventana de cinco días, criterio insuficiente para confirmar identidad;
- el reemplazo de un pago manual inserta primero y elimina después, sin una transacción de base de datos ni validación del error de borrado;
- dashboard y cuentas calculan directamente desde todos los registros de `transactions`, por lo que un duplicado altera totales y estados de pago.

### Qué no está confirmado todavía

No es posible afirmar cuál fue la causa del incidente reportado sin recuperar:

- ID interno de ambas transacciones;
- usuario y banco;
- fecha, monto, tipo y descripción;
- `raw_data` y eventual identificador de la fuente;
- `created_at` de ambos registros;
- archivo o lote de importación, si puede reconstruirse;
- secuencia de acciones de la persona;
- par concreto de transacciones y trazas de la acción que las originó.

El esquema local muestra deriva respecto de la aplicación y el historial remoto no registra las migraciones del repositorio. Esa deriva debe reconciliarse antes de desplegar la migración nueva para evitar que scripts históricos de datos se ejecuten accidentalmente.

### Evidencia remota obtenida el 15 de julio de 2026

La CLI oficial se conectó al proyecto Supabase `MisFinanzas` (`htcvwruezenheyjvqxth`) y permitió contrastar el esquema, sus políticas y sus estadísticas, sin leer filas financieras:

- `public.transactions` contiene aproximadamente 1.463 filas;
- la tabla ocupa aproximadamente 1.184 kB entre datos e índice;
- su único índice remoto es `transactions_pkey` sobre `id`;
- no existe un índice único para identificador bancario, archivo, fila, fingerprint o clave de idempotencia;
- no existen vistas remotas para separar transacciones financieras activas de registros excluidos;
- no existe una función RPC de ingesta, resolución de duplicados o reversión;
- las cuatro migraciones presentes en el repositorio aparecen como locales y no registradas en el historial remoto;
- el esquema remoto de `transactions` contiene: `id`, `user_id`, `date`, `description`, `amount`, `type`, `category_id`, `is_shared`, `shared_with_id`, `raw_data`, `created_at`, `bank`, `tipo_movimiento`, `categoria_principal`, `categoria_secundaria` e `is_internal_transfer`;
- no contiene fuente, lote, identificador externo, fechas efectiva/contable separadas, moneda, estado de duplicado, relación con el registro conservado ni auditoría.
- el volcado de esquema confirma RLS en `transactions` y políticas por `auth.uid()`, pero no existe trigger, RPC ni restricción adicional que vuelva atómica o idempotente la creación;
- las funciones administrativas remotas corresponden a la versión centralizada en `admin_users`, aunque sus migraciones no aparecen registradas;
- la migración histórica `20260713000000_normalize_legacy_data.sql` contiene actualizaciones de datos y no debe ejecutarse automáticamente para “rellenar” el historial.

El volcado SQL completo se guardó temporalmente y se cargó correctamente en un PostgreSQL local aislado. La plataforma bloqueó la operación posterior que iba a aplicar la migración nueva en ese contenedor, por lo que su ejecución SQL real permanece pendiente; las pruebas TypeScript, lint y build sí se ejecutaron correctamente.

### Contención implementada localmente

- cada archivo se identifica mediante SHA-256;
- cada parser asigna una clave estable a la fila física;
- el navegador evita el doble envío dentro de la misma instancia;
- fecha, monto y descripción dejaron de usarse para descartar automáticamente una transacción válida;
- los pagos manuales candidatos ya no se eliminan automáticamente;
- la migración `20260715000000_transaction_ingestion_integrity.sql` prepara lote, metadatos de fuente, índices únicos de identidad fuerte, bloqueo transaccional y una RPC idempotente;
- `supabase/diagnostics/transaction_duplicate_candidates.sql` separa coincidencias fuertes de candidatos por similitud y no modifica datos.

Estos cambios todavía no están desplegados. La protección efectiva en producción requiere reconciliar el historial remoto, ejecutar la migración y validar concurrencia en el entorno aislado.

### Clasificación preliminar

- Debilidad general del flujo de ingesta: **sí**.
- Ausencia de idempotencia en servidor/base de datos: **sí, en el código y esquema versionado revisados**.
- Causa raíz del caso observado: **no confirmada**.
- Riesgo de recurrencia con el flujo actual: **medio-alto**.
- Reparación masiva automática basada en similitud: **no segura**.

## 2. Mapa de orígenes y efectos

| Origen | Ruta y símbolo | Persistencia actual | Riesgo relevante |
|---|---|---|---|
| Cartolas bancarias | `src/components/ImportModal.tsx` / `handleSave` | Consulta previa y `insert` desde cliente | Carrera, reintento, reimportación, normalización inconsistente |
| Pago manual de cuenta | `src/pages/Accounts.tsx` / `handleManualPayment` | `insert` directo | Reenvío del formulario o retry sin idempotencia |
| Saldo inicial | `src/components/InitialAdjustmentManager.tsx` / `handleSubmit` | Buscar por descripción y luego `insert` o `update` | Dos saldos iniciales concurrentes; identidad basada en texto |
| División de transacción | `src/pages/Transactions.tsx` / `handleSaveSplit` | `update` del original y luego `insert` de hijos | Estado parcial y repetición de hijos |
| Restauración de división | `src/pages/Transactions.tsx` / `handleRestoreSplit` | `delete` de hijos y luego `update` del original | Estado parcial, pérdida de trazabilidad |

La fuente de verdad financiera actual es `public.transactions`. Dashboard, Cuentas y Transacciones consultan esa tabla directamente y no aplican un estado centralizado de exclusión por duplicado.

## 3. Hipótesis a comprobar

La confianza indicada corresponde a la existencia de la vulnerabilidad, no a que haya causado el incidente concreto.

| Hipótesis | Evidencia a favor | Evidencia en contra o faltante | Comprobación | Confianza |
|---|---|---|---|---|
| Dos solicitudes concurrentes importaron el mismo lote | El control es `select` seguido de `insert`; no hay garantía atómica versionada | No hay trazas del caso | Prueba de integración con dos llamadas simultáneas y revisión de `created_at` | Alta |
| Reintento después de timeout o respuesta perdida | No existe clave estable de idempotencia | No hay logs de red o lote | Simular persistencia exitosa y fallo antes de responder; repetir la operación | Alta |
| El archivo contenía o el parser produjo dos filas iguales | El `Set` no se actualiza durante el filtrado del lote entrante | No se dispone del archivo original | Fixture con dos filas iguales y prueba del parser/importador | Alta |
| La misma cartola se importó de nuevo con variaciones de formato | La firma depende de texto, tipo y serialización del monto | Una reimportación exactamente igual suele ser filtrada | Probar mayúsculas, espacios, encabezados, monto serializado y parser distinto | Media-alta |
| Dos movimientos legítimos comparten fecha, monto y comercio | Es un caso bancario válido y el modelo no tiene secuencia/referencia explícita | No prueba duplicación técnica | Crear dos movimientos legítimos iguales y verificar que no se autoexcluyan | Alta |
| Un pago manual fue reemplazado parcialmente | Inserción y borrado son operaciones separadas; se ignora error del `delete` | Puede no coincidir con el caso reportado | Forzar fallo de borrado después de insertar | Alta |
| El saldo inicial se creó dos veces | Identidad por búsqueda textual y `insert` separado | Flujo acotado y distinto de cartolas | Dos solicitudes concurrentes para mismo usuario y banco | Media |
| La división de una transacción se ejecutó dos veces o quedó parcial | `update` e `insert` no son atómicos | Es un movimiento derivado, no una reingesta bancaria | Repetir o interrumpir `handleSaveSplit` | Media |
| Webhook, worker o job repitió un evento | No se encontraron webhooks, colas, workers ni jobs de ingesta en el repositorio | Arquitectura actual procesa cartolas en cliente | Confirmar que no exista infraestructura externa fuera del repositorio | Baja |
| Dos fuentes distintas entregaron el mismo movimiento | La vista consolidada combina bancos y orígenes | No hay sincronización externa identificada | Comparar identidad de cuenta, banco y metadatos de fuente | Baja-media |

## 4. Principio de identidad recomendado

No debe existir una única regla basada en “misma fecha + mismo monto + misma descripción”. Se requieren dos niveles:

### Identidad exacta

Permite impedir una segunda inserción de manera automática:

1. identificador estable entregado por la fuente, cuando exista;
2. mismo archivo identificado por hash y misma posición física de la fila;
3. misma clave de operación enviada en un reintento;
4. clave de negocio explícita para movimientos internos, como un único saldo inicial por usuario y banco.

### Similitud o candidatura

Solo crea un caso para revisión, nunca elimina ni excluye automáticamente:

- mismo banco, fecha, monto y descripción normalizada;
- fechas efectiva y contable cercanas;
- mismo comercio o referencia parcial;
- coincidencia entre pago manual y movimiento importado;
- coincidencia entre archivos solapados sin identificador externo confiable;
- coincidencia entre fuentes diferentes.

La opción “ambas son válidas” debe guardar una excepción explícita para no volver a sugerir el mismo par.

## 5. Arquitectura objetivo a validar

Esta propuesta debe ajustarse después de inspeccionar el esquema remoto y ejemplos reales de cada banco.

### Campos de procedencia en `transactions`

- `source_kind`: `statement_import`, `manual_payment`, `initial_balance`, `split_child` o `legacy`;
- `source_transaction_id`: identificador estable entregado por la fuente, nullable;
- `source_file_hash`: hash del archivo importado, nullable;
- `source_row_key`: posición estable de la fila o línea dentro del archivo, nullable;
- `source_fingerprint`: hash normalizado utilizado para buscar candidatos, no necesariamente único;
- `import_batch_id`: referencia al lote;
- `duplicate_state`: `active`, `suspected`, `confirmed_duplicate`, `valid` o `needs_review`;
- `duplicate_of_id`: referencia al registro conservado cuando corresponda.

### Tablas de apoyo

`transaction_import_batches`:

- identifica cada archivo/operación;
- registra banco, hash, estado, cantidades intentadas, insertadas, ya existentes y candidatas;
- permite responder de forma idempotente a un retry;
- no almacena contenido financiero innecesario.

`transaction_duplicate_resolutions`:

- conserva el par relacionado;
- decisión y motivo;
- usuario o proceso que decide;
- estado anterior y posterior;
- fecha de resolución y eventual reversión;
- metadatos mínimos para auditoría.

Según la complejidad final, los candidatos pueden vivir en esta misma tabla con estado `open` o en una tabla separada. No conviene decidirlo sin conocer el volumen y flujo de revisión.

### Restricciones de base de datos

Aplicar índices parciales solamente a identidades fuertes:

- usuario + banco + identificador externo, cuando exista;
- usuario + banco + hash de archivo + clave de fila;
- usuario + banco para `initial_balance`;
- identificador de operación para reintentos manuales o divisiones.

`source_fingerprint` débil no debe transformarse en restricción única si se basa solo en similitud.

### Operaciones atómicas

Mover la persistencia crítica a funciones RPC o una capa de servidor equivalente:

- `ingest_transaction_batch`: valida, normaliza, registra lote e inserta con `ON CONFLICT` en una transacción;
- `resolve_transaction_duplicate`: confirma duplicado, ambas válidas, revisión o reversión y registra auditoría;
- `save_initial_balance`: upsert por clave de negocio;
- la división/restauración debería endurecerse posteriormente con una operación transaccional, sin mezclarla con la primera entrega si no está relacionada con el incidente.

El cliente seguirá parseando archivos localmente, pero no decidirá por sí solo si una fila puede insertarse dos veces.

## 6. Plan de trabajo por fases

### Fase 0 — Contención y preservación de evidencia

Objetivo: reducir riesgo sin alterar históricos.

Acciones:

1. Obtener el par concreto reportado y congelar su revisión: no borrar ni recategorizar hasta capturar evidencia.
2. Exportar de forma segura los campos necesarios, evitando datos sensibles innecesarios.
3. Registrar versión desplegada, navegador, banco, archivo y secuencia de acciones si la persona la recuerda.
4. Si siguen apareciendo duplicados, desplegar una contención temporal:
   - deduplicar dentro del lote en memoria;
   - mantener bloqueado el botón mientras la solicitud está en curso;
   - asignar una clave de operación estable durante el retry;
   - mostrar resumen de “nuevas / ya existentes / requieren revisión”.
5. No ejecutar borrados ni una limpieza automática.

Salida:

- ficha reproducible del incidente o declaración explícita de evidencia insuficiente;
- decisión de si se requiere hotfix inmediato.

### Fase 1 — Auditoría del entorno real

Objetivo: alinear repositorio y Supabase antes de migrar.

Acciones:

1. Capturar esquema remoto de `transactions`, constraints, índices, triggers, funciones y RLS.
2. Compararlo con `supabase_schema.sql` y migraciones versionadas.
3. Medir volumen de transacciones por usuario, banco y periodo sin exponer descripciones ni montos en logs.
4. Revisar muestras controladas de `raw_data` por banco para localizar referencias estables.
5. Confirmar si existe infraestructura externa no presente en el repositorio.
6. Crear una matriz por banco: identificador externo, fecha efectiva, fecha contable, moneda, saldo, secuencia y calidad de datos.

Salida:

- esquema real versionable;
- matriz de identidad por fuente;
- alcance potencial del incidente sin declarar falsos totales.

### Fase 2 — Reproducción y pruebas que fallen

Objetivo: convertir las hipótesis principales en evidencia.

Acciones:

1. Extraer normalización y generación de claves a módulos puros testeables.
2. Crear fixtures anonimizados para cada parser relevante.
3. Reproducir primero:
   - reingesta exacta;
   - dos solicitudes concurrentes;
   - retry después de persistir;
   - duplicado dentro del mismo archivo;
   - variación de texto o formato;
   - dos movimientos legítimos idénticos en monto y fecha.
4. Incorporar un entorno local de integración de Supabase o pruebas SQL para constraints y concurrencia.

Gate de salida:

- existe al menos una prueba que reproduce la vulnerabilidad y falla con la implementación actual;
- los casos legítimos iguales permanecen aceptados.

### Fase 3 — Modelo de datos y migración aditiva

Objetivo: preparar idempotencia y auditoría sin cambiar aún los cálculos.

Acciones:

1. Agregar campos de procedencia y estado como nullable o con defaults compatibles.
2. Crear lotes de importación y registro de resoluciones.
3. Agregar RLS para que cada persona solo acceda a sus casos y decisiones.
4. Agregar índices para consultas y restricciones parciales únicamente sobre claves fuertes nuevas.
5. Marcar datos históricos como `legacy`, sin inferir identidades.
6. Probar migración, rollback lógico y costo de índices sobre una copia o entorno de staging.

Gate de salida:

- migración aplicable sin borrar registros ni cambiar totales;
- inserciones antiguas siguen funcionando durante transición;
- auditoría y RLS verificadas.

### Fase 4 — Ingesta idempotente y atómica

Objetivo: impedir nuevas duplicaciones confirmables.

Acciones:

1. Calcular hash del archivo y claves de fila estables durante parsing.
2. Extraer identificadores de fuente solo cuando su semántica sea confiable.
3. Implementar `ingest_transaction_batch` en Supabase.
4. Usar `INSERT ... ON CONFLICT` o equivalente y devolver resultados por fila.
5. Registrar el lote completo con una operación atómica.
6. Eliminar del cliente la responsabilidad final de decidir existencia.
7. Sustituir el borrado automático de pagos manuales por un candidato de vinculación o una resolución explícita y reversible.
8. Mantener las categorías y metadatos del registro principal; ante conflicto, pedir decisión.

Gate de salida:

- la misma operación ejecutada una o varias veces produce el mismo resultado;
- dos llamadas concurrentes no crean dos registros con identidad exacta;
- movimientos legítimos similares siguen entrando;
- no existe borrado posterior no verificado.

### Fase 5 — Detección y reparación histórica en dry run

Objetivo: dimensionar y reparar sin falsos positivos.

Acciones:

1. Crear un script de detección reproducible que clasifique:
   - duplicado exacto por identidad fuerte;
   - candidato de alta similitud;
   - candidato ambiguo;
   - coincidencia legítima conocida.
2. Ejecutar primero en modo de solo lectura y producir conteos agregados.
3. Revisar manualmente una muestra por nivel de confianza.
4. Definir el registro principal por reglas conservadoras:
   - mayor evidencia de origen;
   - metadatos más completos;
   - conservación de categorización, alias y notas;
   - si hay conflictos, no resolver automáticamente.
5. Reparar solo duplicados confirmados marcando `confirmed_duplicate` y `duplicate_of_id`.
6. Registrar cada decisión y permitir rollback.
7. Validar saldos, dashboard, cuentas y reportes antes y después.

Gate de salida:

- ningún registro fue eliminado físicamente;
- todas las exclusiones son trazables y reversibles;
- las diferencias de totales se explican con los IDs resueltos.

### Fase 6 — Gestión funcional de posibles duplicados

Objetivo: dar una salida segura y comprensible al usuario.

Flujo propuesto con progressive disclosure:

1. En la fila de transacción, acción “Revisar posible duplicado”.
2. La primera vista muestra candidatos y nivel de coincidencia, sin afirmar que son duplicados.
3. Al abrir un candidato, comparación lado a lado de:
   - banco y cuenta;
   - monto y moneda;
   - fecha efectiva y fecha contable;
   - descripción/comercio;
   - referencia de fuente;
   - fecha de importación;
   - categoría, alias, notas y origen.
4. Acciones:
   - “Es un duplicado”;
   - “Ambas son válidas”;
   - “No estoy seguro, solicitar revisión”;
   - “Cancelar”.
5. Antes de confirmar, mostrar impacto:
   - cuál movimiento se conserva;
   - cuál se excluye de saldos y reportes;
   - qué categorías o metadatos se conservarán;
   - posibilidad de deshacer.
6. Mostrar estado y relación en Transacciones, con filtro para excluidos y pendientes.
7. Ofrecer “Deshacer resolución” desde el detalle auditado.

No se debe incluir un botón de eliminación como resolución principal.

Gate de salida:

- el flujo completo funciona por teclado y lector de pantalla;
- no depende solo de color;
- se puede resolver y revertir;
- “ambas válidas” evita que el mismo par reaparezca.

### Fase 7 — Integración con cálculos y módulos derivados

Objetivo: evitar contabilización doble de un duplicado confirmado.

Acciones:

1. Centralizar el criterio de transacción financiera activa.
2. Aplicarlo en:
   - Dashboard;
   - Cuentas;
   - lista y categorización;
   - reportes consolidados;
   - cálculos por categoría;
   - sugerencias y automatizaciones.
3. Mantener visibles los duplicados confirmados en su vista de auditoría.
4. Verificar que revertir una resolución reincorpore el movimiento una sola vez.

No conviene dispersar filtros manuales distintos en cada página. Debe usarse una vista segura, RPC o helper de consulta centralizado que respete RLS.

### Fase 8 — Observabilidad, despliegue y rollback

Objetivo: detectar recurrencia y desplegar de forma controlada.

Señales mínimas:

- lotes intentados, completados y fallidos;
- filas nuevas, reintentos exactos y candidatos;
- conflictos de restricción esperados;
- resoluciones, reversas y casos pendientes;
- fallos entre parsing, persistencia y respuesta.

Los logs deben usar IDs, hashes y códigos de resultado; no descripciones, montos o datos bancarios completos.

Despliegue:

1. migración aditiva;
2. función/RPC y pruebas en staging;
3. cliente nuevo bajo feature flag;
4. monitoreo de lotes nuevos;
5. dry run histórico;
6. resolución de confirmados;
7. habilitación de UX y exclusión de cálculos;
8. retiro del flujo vulnerable cuando la telemetría sea estable.

Rollback:

- desactivar el nuevo cliente por flag sin borrar columnas ni tablas;
- conservar los lotes y auditoría generados;
- revertir exclusiones mediante una nueva resolución, no mediante `DELETE`;
- no eliminar índices o columnas en el rollback inmediato salvo que exista un problema de compatibilidad comprobado;
- mantener un script de validación que compare totales antes y después de cada reversa.

## 7. Matriz obligatoria de pruebas

| Nivel | Casos principales |
|---|---|
| Unitarias | normalización por banco, hash, clave de fila, fingerprint, selección de candidato, conservación de metadatos |
| Parser | CSV/Excel/PDF reales anonimizados, filas repetidas, fechas, montos, texto extremo, referencia externa |
| Integración DB | inserción normal, reingesta, `ON CONFLICT`, RLS, resolución, reversa, exclusión de consultas |
| Concurrencia | dos imports simultáneos, dos tabs, retry, timeout posterior a persistencia, mismo evento repetido |
| Negocio | dos transacciones legítimas mismo monto/fecha, mismo comercio, fuentes diferentes, pago manual frente a oficial |
| Auditoría | actor, fecha, motivo, principal, excluida, estados anterior/posterior y reversión |
| Regresión | importación, categorización, división, saldo inicial, dashboard consolidado, cuentas y reportes |
| UX/A11y | teclado, foco, loading, error, empty state, impacto previo, cancelar y deshacer |

Comandos base del repositorio después de implementar:

```bash
npm test
npm run lint
npm run build
```

Además deben agregarse y ejecutarse pruebas SQL/integración; la suite actual solo cubre utilidades puras y no verifica persistencia, RLS ni concurrencia.

## 8. Entregables por etapa

1. Diagnóstico del caso observado con evidencia y nivel de confianza.
2. Diagrama del flujo real y matriz de identidad por banco.
3. Prueba fallida que reproduce el defecto.
4. Migración aditiva con validación y rollback.
5. RPC de ingesta idempotente y cliente adaptado.
6. Script histórico `dry-run` y reporte de candidatos.
7. Script de reparación solo para confirmados.
8. Flujo de comparación, decisión y reversa.
9. Consulta centralizada de transacciones activas.
10. Suite de pruebas y reporte de validación.
11. Señales de observabilidad y procedimiento operativo.
12. Informe final con causa confirmada o limitación explícita.

## 9. Prioridad recomendada

### Bloqueante antes de ampliar ingestas

- evidencia del caso y auditoría del esquema remoto;
- prueba de concurrencia/reintento;
- identidad de origen por banco;
- persistencia atómica e idempotente;
- fin del borrado automático no auditado de pagos manuales.

### Importante después de detener recurrencia

- detección histórica en dry run;
- exclusión reversible de duplicados confirmados;
- integración consistente con dashboard y cuentas;
- interfaz para resolver casos ambiguos.

### Mejora posterior

- endurecer división/restauración como operación transaccional;
- panel administrativo de casos “solicitar revisión”;
- alertas avanzadas de calidad por fuente.

## 10. Criterio para cerrar el incidente

El problema solo puede declararse resuelto cuando:

1. la causa del caso observado esté confirmada o se documente honestamente que no pudo confirmarse;
2. reintentos y concurrencia no creen una segunda transacción con identidad exacta;
3. coincidencias similares no bloqueen movimientos legítimos;
4. los datos históricos confirmados estén excluidos sin ser borrados;
5. dashboard, cuentas y reportes contabilicen solo registros activos;
6. toda resolución tenga auditoría y reversa;
7. las pruebas de integración y concurrencia se hayan ejecutado;
8. el despliegue tenga señales para detectar recurrencia.
