# Examen antitrampes (Google Forms + GitHub Pages + Apps Script)

Página estática (`index.html`, hospedada en GitHub Pages) que sirve un
Google Forms en pantalla completa "vigilada": detecta si el alumnado sale
de pantalla completa, cambia de pestaña/ventana o (best-effort) conecta una
segunda pantalla, y lo suspende automáticamente al superar el número de
avisos configurado. Apps Script actúa solo como API (config del examen +
registro de avisos), consultada por `fetch` desde `index.html`.

**Multi-examen:** un solo Sheet y un solo despliegue sirven tantos exámenes
como haga falta (uno por módulo, clase o profesor). Cada examen tiene su
propio ID, su propio Forms, su propia configuración, su propio registro de
alumnado, su propio código de profesor y su propio enlace
(`.../?examen=<ID>`). Así otros profesores pueden usarlo sin tocar tu Forms
ni tus datos.

## Limitación importante (léela antes de usarlo)

**Ningún navegador permite bloquear de verdad** Alt+Tab, Cmd+Tab, cerrar una
pestaña o impedir que alguien conecte una segunda pantalla — son
restricciones de seguridad del propio navegador, no de esta aplicación.
Esta web **detecta** esos eventos justo después de que ocurren (perder el
foco, salir de pantalla completa, ocultar la pestaña) y **reacciona** con
un aviso; al llegar al máximo configurado, suspende al alumno. No es un
lockdown a nivel de sistema operativo (para eso existen herramientas
dedicadas tipo Safe Exam Browser).

La detección de una segunda pantalla conectada (`getScreenDetails()`) solo
funciona en Chrome/Edge y requiere que el propio alumno conceda un permiso
del navegador — trátala como señal complementaria, no como garantía.

## Cómo se identifica y controla el acceso del alumnado

Como `index.html` vive en GitHub Pages (un dominio distinto al de Google),
**no hay forma de identificar automáticamente al alumno por su cuenta de
Google** como sí se podía hacer sirviendo la página desde el propio Apps
Script. Este proyecto asume el modelo que se acordó:

- El **enlace de GitHub Pages** se distribuye dentro de un documento de
  Google (Doc, Sheet, Classroom, etc.) cuyo acceso ya está restringido a
  las cuentas del alumnado — ese es el control de acceso real.
- Dentro de la página, el alumno simplemente **escribe su nombre y
  correo** al empezar; ese dato es el que se guarda en `Registre_<ID>` de ese examen.

Esto implica que, si alguien consigue el enlace sin pasar por ese
documento, podría escribir cualquier nombre/correo — es un modelo de
confianza más débil que la identificación por cuenta de Google, aceptado
aquí porque el enlace nunca se publica fuera de un documento ya
restringido.

## Estructura del Google Sheet

- **Examens** (una fila por examen; cabeceras en la fila 1, se buscan por
  nombre, así que puedes reordenar columnas o añadir otras tuyas):

  | Columna | Contenido |
  |---|---|
  | `ID` | Identificador corto y único, p. ej. `DAW1-M06-UF2`. Solo letras sin acentos, números, `-` y `_`. Aparece en el enlace y en el nombre de la pestaña de registro, por eso no se puede cambiar desde el panel. |
  | `Mòdul`, `Classe`, `Professor` | Informativos, para organizar la lista. |
  | `Titol examen`, `Descripció`, `Normes` | Lo que ve el alumno antes de empezar. |
  | `Avisos` | Número máximo de avisos antes de suspender (0 = sin límite). |
  | `Temps (minuts)` | Duración del examen. |
  | `Enllaç forms` | URL del Google Forms de **ese** examen (solo se aceptan `docs.google.com/forms/...` o `forms.gle/...`). |
  | `Estat` | `ACTIU` / `INACTIU`. |
  | `Codi professor` | Código con el que el profesor de ese examen entra al panel ⚙️. Si un profesor usa el mismo código en todos sus exámenes, los ve todos juntos. |
  | `Enllaç alumnat` | Se rellena solo (a partir de `URL pàgina alumnat`). |

- **Registre_&lt;ID&gt;** (una pestaña por examen, se crea sola): `Nom`,
  `Correu`, `Avisos`, `Última acció`, `Historial`, `Token`,
  `Timestamp Inici`. Un mismo alumno puede hacer varios exámenes: cada uno
  tiene su registro independiente, y reiniciar un examen no toca los demás.

- **Configuracio** (solo ajustes globales; columna A = etiqueta,
  columna B = valor):
  - `Codi administrador`: da acceso a **todos** los exámenes desde el panel
    ⚙️ y permite crear exámenes para cualquier profesor.
  - `URL pàgina alumnat`: la URL de GitHub Pages (sin `?examen=`), para
    rellenar la columna `Enllaç alumnat`.

El menú **Examen antitrampes** del Sheet tiene: *Activar / Desactivar
examen* (actúa sobre la fila seleccionada de `Examens` o pregunta el ID),
*Crear / reparar plantilla*, *Migrar l'examen antic* y *Regenerar
enllaços de l'alumnat*.

### Quién puede hacer qué

| | Profesor (su `Codi professor`) | Administrador (`Codi administrador`) |
|---|---|---|
| Ver y editar exámenes | Solo los que tienen su código | Todos |
| Crear exámenes | Sí, siempre con su propio código | Sí, para cualquier código |
| Cambiar el código de un examen | No | Sí |
| Reiniciar alumnos / eliminar el examen | Solo de sus exámenes | De todos |

Un profesor nuevo (sin ningún examen todavía) no tiene código: el
administrador le crea el primer examen con el código que acuerden y, a
partir de ahí, ese profesor puede crear los siguientes él mismo. Cada
profesor debe usar un código distinto: dos profesores con el mismo código
verían los exámenes del otro.

## 1. Desplegar el backend de Apps Script

1. Abre el Google Sheet.
2. Extensiones → Apps Script.
3. Copia `Code.gs` al proyecto (todo el backend está en un único archivo),
   y sustituye el contenido de `appsscript.json` (Ver → Mostrar manifest de
   projecto) por el de este repo.
4. Implementar → Nueva implementación → tipo **Aplicación web**.
   - **Ejecutar como**: *Yo (tu cuenta)* — el script siempre corre con tus
     permisos para poder escribir en el Sheet, independientemente de quién
     llame a la API.
   - **Quién tiene acceso**: *Cualquier usuario* (sin necesidad de iniciar
     sesión) — imprescindible para que `fetch` desde GitHub Pages funcione
     sin toparse con una pantalla de login de Google.
5. Copia la URL `.../exec` que te da el despliegue.
6. Cada vez que cambies el código de Apps Script, para que los cambios
   lleguen a los alumnos hace falta gestionar la implementación
   (Implementar → Gestionar implementaciones → editar la existente y elegir
   **Versión nueva**, para no cambiar la URL) o crear una nueva y
   actualizar `API_URL` en `index.html`.

## 2. Preparar el Sheet (instalación nueva o migración)

Recarga el Sheet para que aparezca el menú **Examen antitrampes**.

- **Si ya tenías un examen con el formato antiguo** (una sola
  `Configuracio` + `Registre`): menú → *Migrar l'examen antic*. Te pide un
  ID para ese examen y entonces:
  - crea la pestaña `Examens` con una fila con tu configuración actual;
  - renombra `Registre` a `Registre_<ID>` (conserva los datos);
  - tu antiguo `Codi d'accés professor` pasa a ser el código de ese examen
    y, si aún no había, también el `Codi administrador` (cámbialo después
    si quieres que sean distintos);
  - copia la URL de GitHub Pages que tenías a `URL pàgina alumnat`.

  Las filas antiguas de `Configuracio` (`Titol examen`, `Normes`, …) dejan
  de usarse y puedes borrarlas. **Importante:** el enlace antiguo (sin
  `?examen=`) deja de funcionar; reparte el nuevo enlace que aparece en
  `Enllaç alumnat`.
- **Si es una instalación nueva**: crea un Google Sheet en blanco, pega el
  código (paso 1), recarga y usa el menú → **Crear / reparar plantilla**
  (la primera vez Google pedirá autorizar el script). La función
  `crearPlantilla()` deja el Sheet tal cual lo necesita el proyecto:
  - **Configuracio** con las columnas `Paràmetre | Valor | Explicació` y
    las filas `Codi administrador` y `URL pàgina alumnat` (te pregunta
    ambos valores si están vacíos; la URL puedes dejarla para después).
  - **Examens** con todas las cabeceras, una nota explicativa en cada una
    (pasa el ratón por encima), columnas fijadas y con anchura ajustada,
    desplegable `ACTIU`/`INACTIU` con colores, validación de `Avisos` (≥ 0)
    y `Temps (minuts)` (≥ 1), y aviso (triángulo rojo, sin bloquear) si el
    `ID` o el `Enllaç forms` no tienen el formato correcto.
  - Una fila de ejemplo **EXEMPLE** (INACTIVA) con su pestaña
    `Registre_EXEMPLE`, para ver cómo se rellena. Bórrala cuando quieras
    (o elimínala desde el panel ⚙️, que borra también su registro).
  - Elimina la pestaña vacía por defecto (`Full 1` / `Hoja 1` / `Sheet1`).

  Después crea los exámenes desde el panel ⚙️ (o escribiendo filas en
  `Examens`).

  Se puede ejecutar tantas veces como quieras: **no borra datos**, solo
  crea lo que falte (pestañas, filas de `Configuracio`, columnas de
  `Examens` que alguien haya borrado, que se añaden al final) y vuelve a
  aplicar formato y validaciones. Úsala también para "reparar" el Sheet si
  alguien ha estropeado el formato. La fila de ejemplo solo se crea si
  `Examens` está vacía.

## 3. Configurar y publicar `index.html` en GitHub Pages

1. En `index.html`, la constante al principio del `<script>`:
   ```js
   var API_URL = '...';
   ```
   debe ser la URL `.../exec` copiada en el paso 1.
2. Sube el cambio a este repositorio (rama que sirva GitHub Pages, o la
   rama por defecto tras el merge).
3. En GitHub: Settings → Pages → Build and deployment → Source:
   *Deploy from a branch* → elige la rama y carpeta raíz (`/`).
4. GitHub publicará `index.html` en la URL `https://<usuario>.github.io/<repo>/`
   (o el dominio propio si has configurado uno). Pégala en
   `URL pàgina alumnat` y usa el menú *Regenerar enllaços de l'alumnat*.
5. Cada profesor coloca el enlace de **su** examen
   (`https://<usuario>.github.io/<repo>/?examen=<ID>`) dentro del documento
   de Google que ya tiene restringido a su alumnado.

## Alternativa: un profesor con su propio Sheet (`?api=`)

Si un profesor prefiere que sus datos no estén en tu Sheet, puede hacer una
copia del Sheet, desplegar su propio Apps Script (pasos 1 y 2) y usar
**la misma página de GitHub Pages** añadiendo su URL de despliegue al
enlace:

```
https://<usuario>.github.io/<repo>/?examen=<ID>&api=<su URL .../exec>
```

(la URL de `api` conviene codificarla, el botón "Copiar enllaç" del panel ya
lo hace). Por seguridad, `index.html` solo acepta en `api` direcciones
`https://script.google.com/macros/s/.../exec` (o
`script.google.com/a/macros/<dominio>/s/.../exec`); cualquier otra se
ignora y se usa la API por defecto.

## Límites de Google a tener en cuenta

- Apps Script admite unas **30 ejecuciones simultáneas** por cuenta. Con
  todos los exámenes en tu despliegue, si muchas clases empiezan a la vez
  (sobre todo en el momento de pulsar "Comenzar examen"), algunas
  peticiones pueden fallar puntualmente; el alumno solo tiene que volver a
  intentarlo. Si se queda corto, la alternativa `?api=` reparte la carga
  entre cuentas.
- Las escrituras usan un bloqueo (`LockService`) común a todos los
  exámenes. Para que se note lo menos posible, cada aviso se escribe en una
  sola operación y cada examen busca solo en su propia pestaña de registro.
- Como propietario del Sheet, ves los registros de todos los exámenes.

## Cómo funciona el flujo

- `index.html` lee el ID del examen de la URL (`?examen=<ID>`). Si falta,
  muestra "Enllaç incomplet"; si no existe, "Examen no trobat".
- Hace `GET` a `API_URL?examen=<ID>` para obtener el título, descripción,
  normas, avisos máximos, tiempo y estado de ese examen (JSON).
- Si el `Estat` del examen no es `ACTIU`, muestra "examen no disponible" y
  no deja continuar.
- Todas las peticiones siguientes (`start`, `warning`, `finish`) llevan el
  ID del examen, y el backend trabaja solo con su pestaña `Registre_<ID>`.
- El alumno escribe nombre y correo y pulsa "Comenzar examen": se envía un
  `POST` con `action: "start"`. El backend busca su fila en `Registre_<ID>` (por
  correo) o la crea, fija el `Timestamp Inici` en el servidor (para que el
  cronómetro no se pueda alargar tocando el reloj del cliente ni
  recargando), y si ya estaba suspendido lo indica de inmediato.
- Los eventos del navegador (salir de fullscreen, cambiar de pestaña o
  minimizar) cuentan el aviso al instante en el cliente y lo envían al
  backend con `action: "warning"`; al llegar al máximo, el cliente bloquea
  el examen.
- Deliberadamente **no** se usa `window.blur` para detectar cambio de
  ventana/app: como el Forms se muestra en un `<iframe>`, el navegador
  dispara `blur` en la ventana superior cada vez que el alumno toca una
  pregunta del formulario (el foco pasa al iframe), lo que generaba avisos
  falsos en cada toque. `visibilitychange` (cambiar de pestaña/minimizar) y
  `fullscreenchange` (salir de pantalla completa) ya cubren esos casos sin
  ese falso positivo.
- Al enviar el Google Forms, `index.html` lo detecta escuchando el segundo
  evento `load` del `<iframe>` (el primero es la carga inicial del
  formulario; avanzar de sección dentro del propio Forms no recarga el
  iframe, solo el envío final navega a la página de confirmación). No se
  puede leer la URL del iframe por ser de otro dominio (CORS), así que esto
  es lo único observable desde fuera. Al detectarlo, deja de contar avisos,
  sale de pantalla completa automáticamente y muestra "Examen enviat" — así
  el alumno no se queda atrapado en pantalla completa después de enviar (lo
  mismo ocurre si se acaba el tiempo o si se suspende: siempre se libera la
  pantalla completa).

### Icona de configuración (profesorado)

El icono ⚙️ (arriba a la derecha, oculto mientras el examen está en curso;
visible también en la página sin `?examen=`) pide un código, que se valida
siempre en el backend (`authExam_` / `login_` en `Code.gs`) — nunca se
compara en el cliente, para que no se pueda leer en el código fuente.

- Con un **código de profesor** se ven solo los exámenes que tienen ese
  código; con el **código de administrador**, todos. El examen del enlace
  actual aparece el primero y resaltado.
- Cada examen de la lista tiene **Editar** y **Copiar enllaç** (copia el
  enlace del alumnado, `?examen=<ID>`, y el `&api=` si lo hubiera).
- **➕ Nou examen** crea una fila nueva en `Examens` y su pestaña
  `Registre_<ID>`. Se crea en estado `INACTIU` si no eliges otro.
- En **Editar** se cambian módulo, clase, profesor, título, descripción,
  normas, avisos, tiempo, Forms y estado (ACTIU/INACTIU) — útil, por
  ejemplo, para activar el examen desde el móvil sin abrir el Sheet. El ID
  no se puede cambiar; el código del profesor, solo el administrador.

Dentro de **Editar** hay un botón **"⚠️ Zona perillosa: resetear examen"**
que abre una pantalla aparte con dos formas de reiniciar **ese examen**
(los demás no se tocan):

- **Reiniciar TOTS els alumnes d'aquest examen**: borra todas las filas de
  su `Registre_<ID>` (menos la cabecera), como si no se hubiera hecho nunca.
- **Lista de alumnos registrados**: cada persona con su nombre, correo y
  avisos, con su propio botón **Reiniciar** — borra solo la fila de ese
  alumno para que pueda volver a empezar desde cero.

Y **🗑 Eliminar aquest examen** borra su fila de `Examens` y su pestaña de
registro; pide escribir el ID para confirmar.

Todas estas acciones piden confirmación porque no se pueden deshacer.

### Nota técnica sobre CORS

`index.html` y la API de Apps Script viven en dominios distintos, así que
todas las llamadas son cross-origin. Para evitar que el navegador lance una
petición de verificación previa (`preflight`) que Apps Script no gestiona,
los `POST` se envían con `Content-Type: text/plain;charset=utf-8` aunque el
cuerpo sea JSON; `doPost` lo parsea igualmente con
`JSON.parse(e.postData.contents)`. Los `GET` no necesitan este truco.

### Fiabilidad en móvil

En móvil, cambiar de app suele cortar la red de la pestaña casi al
instante, antes de que un `fetch` normal complete su respuesta. Por eso
`registrarAvis` no espera al servidor: cuenta el aviso y actualiza la
pantalla en el momento (optimista), y envía el registro con
`navigator.sendBeacon` (con `fetch({keepalive: true})` como reserva si
`sendBeacon` no está disponible) — ambos están pensados para seguir
enviándose aunque la página quede oculta o se cierre. Como consecuencia,
el contador que ve el alumno es siempre local; si por lo que sea el envío
al servidor se perdiera, el recuento de `Registre_<ID>` podría quedar un aviso
por detrás del que vio el alumno, un compromiso aceptado a cambio de que
la detección en móvil sea fiable.

## Probar el flujo antes de dárselo al alumnado

1. Crea un examen de prueba desde ⚙️ (o migra el tuyo), con `Estat = ACTIU`
   y un `Avisos` bajo (p. ej. 2) para probar rápido.
2. Abre su enlace (`.../?examen=<ID>`), rellena nombre/correo y empieza.
3. Comprueba: entra en pantalla completa al pulsar "Comenzar examen", el
   Forms se ve dentro del iframe, el cronómetro cuenta hacia atrás.
4. Sal de pantalla completa (Esc) → debe aparecer el aviso 1/N y sumar una
   fila en `Registre_<ID>`.
5. Cambia de pestaña o minimiza → segundo aviso → si coincide con el
   máximo, debe bloquear el examen y marcar "SUSPÈS" en `Última acció`.
6. Vuelve a entrar con el mismo correo → debe mostrar directamente la
   pantalla de suspensión, no el examen.
7. Deja que se agote el tiempo configurado → debe avisar de que se ha
   acabado el tiempo (y salir de pantalla completa).
8. Rellena y envía el propio Forms embebido → debe mostrar "Examen enviat"
   y salir de pantalla completa, sin seguir contando avisos.
9. Abre la página sin `?examen=` → debe mostrar "Enllaç incomplet"; con un
   ID inexistente → "Examen no trobat".
10. Prueba el icono ⚙️: un código incorrecto debe rechazarse; con el código
    de un profesor solo deben verse sus exámenes; con el de administrador,
    todos. Guarda un cambio y comprueba que se refleja en `Examens`.
11. Con un segundo examen, haz el mismo correo en los dos: cada uno debe
    tener su propio registro, y reiniciar uno no debe tocar el otro.
