# MisFinanzas: línea base de QA de diseño

## Objetivo

Elevar la calidad UI sin perder la identidad neo-brutalista, aplicando progressive disclosure, accesibilidad y estados consistentes en Web, tablet y móvil.

## Criterios de aceptación transversales

- Navegación completa por teclado con foco visible.
- Modales con foco atrapado, cierre con Escape, cierre por fondo y retorno del foco.
- Controles táctiles principales de al menos 44 x 44 px.
- Contraste WCAG AA en texto y estados importantes.
- Ningún flujo crítico depende solo del color.
- Sin scroll horizontal en 390, 430, 768, 1024 y 1440 px.
- Estados loading, empty, error, disabled y success identificables y recuperables.
- Banco y periodo visibles en vistas consolidadas.
- Las acciones secundarias aparecen solo cuando el usuario las solicita.

## Pantallas de regresión

1. Login y registro.
2. Dashboard por banco y consolidado.
3. Lista y asistente de transacciones.
4. Selector y creación de categorías.
5. Cuentas, detalle mensual y corrección de asociaciones.
6. Importación de cartolas.
7. Configuración y administración.

## Orden de ejecución

1. Fundaciones UI y accesibilidad.
2. Navegación y contexto bancario.
3. Progressive disclosure en categorización.
4. Explicabilidad de Cuentas.
5. Dashboard y consolidación.
6. Responsive, performance percibida y QA final.

## Fase 6: criterios implementados

- Rutas pesadas separadas por pantalla con `React.lazy` y un fallback estable para evitar una carga inicial monolítica.
- Parsers de PDF, Excel y CSV cargados solo al elegir el formato correspondiente.
- Layout sin desborde horizontal en móvil y tablet; tablas críticas cambian a fichas antes de 1024 px.
- Menú móvil con bloqueo de scroll, cierre con Escape, retorno de foco y respeto de safe areas.
- Diálogos críticos con foco atrapado, cierre por fondo/Escape y acciones apiladas en pantallas estrechas.
- Controles principales con objetivo táctil de 44 px, estados de foco visibles y botones con tipo explícito.
- Formularios y controles de periodo se reorganizan a una columna en móvil sin alterar la jerarquía.
- Estados de carga de rutas y módulos pesados reservan espacio para reducir saltos de layout.

## Evidencia técnica de cierre

- `npm run lint`: sin errores; se mantienen advertencias heredadas registradas fuera del alcance de esta fase.
- `npm run build`: build de producción exitoso y bundle inicial reducido mediante separación por ruta.
- `git diff --check`: sin errores de espacios o marcadores de conflicto.
- QA visual autenticado: validar manualmente en 390, 430, 768, 1024 y 1440 px antes del cierre de entrega.

## Fase 7: estabilización

- Los cambios de banco y alcance invalidan consultas anteriores en Cuentas y Transacciones; una respuesta tardía ya no puede sobrescribir la selección vigente.
- Los indicadores de configuración ignoran resultados asíncronos después de cambiar de banco o desmontar la pantalla.
- Las dependencias de efectos críticos quedaron explícitas y sin advertencias de hooks.
- La vinculación de gastos fijos se aisló en `src/utils/fixedExpenseMatching.ts` para compartir una única fuente de verdad.
- `npm test` verifica coincidencias exactas, categorías principales, normalización, sugerencias por palabra clave y rechazo de ingresos.
- Las advertencias restantes de lint corresponden a scripts auxiliares heredados y al patrón Provider + hook de los contextos; no afectan el build de producción.

## Fase 7: cierre de QA visual y accesibilidad

Fecha de cierre: 14 de julio de 2026.
Entorno autenticado: `https://finanzas-blue-nu.vercel.app`.

- Se recorrieron Dashboard, Transacciones, Cuentas, Importar cartola, Configuración y Administración en 390, 430, 768, 1024 y 1440 px: 30 combinaciones sin desborde horizontal.
- Todas las rutas terminaron de cargar, conservaron un `h1` de página y no expusieron controles visibles sin nombre accesible.
- Login y recuperación se revisaron sin sesión en móvil, tablet y escritorio; tabs, validación, estados de enlace inválido y retorno al formulario funcionan con teclado.
- El menú móvil cierra con `Escape` y devuelve el foco al botón que lo abrió.
- El selector de categorías atrapa el foco, cierra con `Escape` y devuelve el foco a la transacción correspondiente.
- La importación conserva un único `h1` de página, usa `h2` en el diálogo y nombra explícitamente el selector de archivo.
- La ruta 404 móvil quedó sin desborde y ofrece dos salidas visibles y táctiles.
- Los textos críticos de éxito y error cumplen AA en las muestras medidas: montos 7,13:1 y 8,31:1; cerrar sesión 6,8:1; zona peligrosa 7,87:1.
- Los encabezados plegables de Configuración miden 44 px y los filtros, diálogos y estados vacíos mantienen progressive disclosure.

### Evidencia final

- `npm test`: 14 pruebas aprobadas.
- `npm run lint`: sin errores; solo advertencias heredadas no bloqueantes.
- `npm run build`: compilación de producción exitosa.
- `git diff --check`: sin errores.
- Despliegue de producción: `dpl_5uDmxD9duCSNCS1qmxqyeEEmmwwh`.
