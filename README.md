# Examen antitrampes (Google Forms + GitHub Pages + Apps Script)

Página estática (`index.html`, hospedada en GitHub Pages) que sirve un
Google Forms en pantalla completa "vigilada": detecta si el alumnado sale
de pantalla completa, cambia de pestaña/ventana o (best-effort) conecta una
segunda pantalla, y lo suspende automáticamente al superar el número de
avisos configurado. Apps Script actúa solo como API (config del examen +
registro de avisos), consultada por `fetch` desde `index.html`.

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
  correo** al empezar; ese dato es el que se guarda en `Registre`.

Esto implica que, si alguien consigue el enlace sin pasar por ese
documento, podría escribir cualquier nombre/correo — es un modelo de
confianza más débil que la identificación por cuenta de Google, aceptado
aquí porque el enlace nunca se publica fuera de un documento ya
restringido.

## Estructura del Google Sheet

Sin cambios respecto a la plantilla original — dos pestañas:

- **Configuracio** (columna A = etiqueta, columna B = valor):
  `Titol examen`, `Descripció`, `Normes`, `Avisos` (número máximo antes de
  suspender), `Temps de l'examen` (minutos), `Enllaç forms` (URL del
  Google Forms), `Estat d'examen` (`ACTIU` / `INACTIU`).
  `Enllaç que li hem de passar a l'alumnat`: caso especial — su valor va en
  la **columna A de la fila siguiente**, no en la B de la misma fila (igual
  que en la plantilla). Ahora aquí va la **URL de GitHub Pages**, no la de
  Apps Script — el profesor la pega manualmente una vez publicada la página
  (ver más abajo).
- **Registre** (cabeceras en la fila 1): `Nom`, `Correu`, `Avisos`,
  `Última acció`, `Historial`, `Token`, `Timestamp Inici`.

El profesor sigue configurando el examen **editando directamente estas
celdas**.

## 1. Desplegar el backend de Apps Script

1. Abre el Google Sheet con las pestañas `Configuracio` y `Registre`.
2. Extensiones → Apps Script.
3. Copia `Code.gs`, `Config.gs`, `Registre.gs` al proyecto, y sustituye el
   contenido de `appsscript.json` (Ver → Mostrar manifest de projecto) por
   el de este repo.
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
   (Implementar → Gestionar implementaciones → editar la existente, para
   no cambiar la URL) o crear una nueva y actualizar `API_URL` en
   `index.html`.

## 2. Configurar y publicar `index.html` en GitHub Pages

1. En `index.html`, sustituye la constante al principio del `<script>`:
   ```js
   var API_URL = 'PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE';
   ```
   por la URL `.../exec` copiada en el paso anterior.
2. Sube el cambio a este repositorio (rama que sirva GitHub Pages, o la
   rama por defecto tras el merge).
3. En GitHub: Settings → Pages → Build and deployment → Source:
   *Deploy from a branch* → elige la rama y carpeta raíz (`/`).
4. GitHub publicará `index.html` en la URL `https://<usuario>.github.io/<repo>/`
   (o el dominio propio si has configurado uno).
5. Pega esa URL en el Sheet, en la celda bajo
   `Enllaç que li hem de passar a l'alumnat` (o usa el menú del Sheet si
   prefieres automatizarlo más adelante).
6. Coloca esa URL de GitHub Pages dentro del documento de Google que ya
   tienes restringido al alumnado.

## Cómo funciona el flujo

- `index.html` al cargar hace `GET` a `API_URL` para obtener el título,
  descripción, normas, avisos máximos, tiempo y estado del examen (JSON).
- Si `Estat d'examen` no es `ACTIU`, muestra "examen no disponible" y no
  deja continuar.
- El alumno escribe nombre y correo y pulsa "Comenzar examen": se envía un
  `POST` con `action: "start"`. El backend busca su fila en `Registre` (por
  correo) o la crea, fija el `Timestamp Inici` en el servidor (para que el
  cronómetro no se pueda alargar tocando el reloj del cliente ni
  recargando), y si ya estaba suspendido lo indica de inmediato.
- Los eventos del navegador (salir de fullscreen, cambiar de pestaña,
  perder el foco) llaman por `fetch` con `action: "warning"`; al llegar al
  máximo de avisos, el backend responde `suspended: true` y el cliente
  bloquea el examen.

### Nota técnica sobre CORS

`index.html` y la API de Apps Script viven en dominios distintos, así que
todas las llamadas son cross-origin. Para evitar que el navegador lance una
petición de verificación previa (`preflight`) que Apps Script no gestiona,
los `POST` se envían con `Content-Type: text/plain;charset=utf-8` aunque el
cuerpo sea JSON; `doPost` lo parsea igualmente con
`JSON.parse(e.postData.contents)`. Los `GET` no necesitan este truco.

## Probar el flujo antes de dárselo al alumnado

1. Pon `Estat d'examen = ACTIU` y un `Avisos` bajo (p. ej. 2) para probar
   rápido.
2. Abre la URL de GitHub Pages, rellena nombre/correo y empieza.
3. Comprueba: entra en pantalla completa al pulsar "Comenzar examen", el
   Forms se ve dentro del iframe, el cronómetro cuenta hacia atrás.
4. Sal de pantalla completa (Esc) → debe aparecer el aviso 1/N y sumar una
   fila en `Registre`.
5. Cambia de pestaña o minimiza → segundo aviso → si coincide con el
   máximo, debe bloquear el examen y marcar "SUSPÈS" en `Última acció`.
6. Vuelve a entrar con el mismo correo → debe mostrar directamente la
   pantalla de suspensión, no el examen.
7. Deja que se agote el tiempo configurado → debe avisar de que se ha
   acabado el tiempo.
