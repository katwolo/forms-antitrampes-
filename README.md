# Examen antitrampes (Google Forms + Apps Script)

Web app de Google Apps Script vinculada a un Google Sheet que sirve un
Google Forms en pantalla completa "vigilada": detecta si el alumnado sale
de pantalla completa, cambia de pestaña/ventana o (best-effort) conecta una
segunda pantalla, y lo suspende automáticamente al superar el número de
avisos configurado.

## Limitación importante (léela antes de usarlo)

**Ningún navegador permite bloquear de verdad** Alt+Tab, Cmd+Tab, cerrar una
pestaña o impedir que alguien conecte una segunda pantalla — son
restricciones de seguridad del propio navegador, no de esta aplicación.
Lo que hace esta web es **detectar** esos eventos justo después de que
ocurren (perder el foco, salir de pantalla completa, ocultar la pestaña) y
**reaccionar** con un aviso; al llegar al máximo configurado, se suspende al
alumno. No es un lockdown a nivel de sistema operativo (para eso existen
herramientas dedicadas tipo Safe Exam Browser).

La detección de una segunda pantalla conectada (`getScreenDetails()`) solo
funciona en Chrome/Edge y requiere que el propio alumno conceda un permiso
del navegador — trátala como señal complementaria, no como garantía.

Un alumno con conocimientos técnicos (inspeccionar código, desactivar
JavaScript, etc.) siempre podría intentar evitar la detección; esto cubre
el uso normal de un examen, no un intento deliberado de sabotaje técnico.

## Estructura del Google Sheet

El proyecto espera un Sheet con dos pestañas, tal como en la plantilla:

- **Configuracio** (columna A = etiqueta, columna B = valor):
  - `Titol examen`, `Descripció`, `Normes`, `Avisos` (número máximo antes de
    suspender), `Temps de l'examen` (minutos), `Enllaç forms` (URL del
    Google Forms), `Estat d'examen` (`ACTIU` / `INACTIU`).
  - `Enllaç que li hem de passar a l'alumnat`: esta etiqueta es un caso
    especial — su valor se escribe en la **columna A de la fila
    siguiente**, no en la columna B de la misma fila (igual que en la
    plantilla original). El menú "Copiar enllaç per l'alumnat" lo rellena
    automáticamente.
- **Registre** (cabeceras en la fila 1): `Nom`, `Correu`, `Avisos`,
  `Última acció`, `Historial`, `Token`, `Timestamp Inici`. No hace falta
  añadir columnas ni tocar el formato.

El profesor sigue configurando el examen **editando directamente estas
celdas**, igual que en la plantilla original — no hay un panel de
administración aparte.

## Instalación

1. Abre (o crea) el Google Sheet con las pestañas `Configuracio` y
   `Registre` descritas arriba.
2. Extensiones → Apps Script.
3. Copia cada archivo de este repositorio al proyecto de Apps Script con el
   mismo nombre: `Code.gs`, `Config.gs`, `Registre.gs`, `Exam.html`,
   `Styles.html`, `Scripts.html`. Sustituye el contenido de `appsscript.json`
   (Ver → Mostrar manifest de projecto) por el de este repo.
4. Guarda todos los archivos.

## Despliegue

1. Implementar → Nueva implementación → tipo **Aplicación web**.
2. **Ejecutar como**: *Usuario que accede a la aplicación web* (necesario
   para identificar a cada alumno con `Session.getActiveUser().getEmail()`
   y no tener que pedirles usuario/contraseña).
3. **Quién tiene acceso**:
   - Si el centro usa Google Workspace con dominio propio (como en la
     plantilla, `ieb.cat`): elige *Cualquier usuario de [tu dominio]* —
     así el alumnado entra ya identificado con su cuenta del centro.
   - Si se usan cuentas de Gmail personales, no hay forma de identificar
     automáticamente al alumno sin pedirle iniciar sesión igualmente, y
     `Session.getActiveUser()` puede no funcionar de forma fiable; en ese
     caso valorar añadir una pantalla previa donde el alumno escriba su
     nombre/correo antes de empezar (cambio menor sobre `doGet`, no incluido
     por defecto).
4. Autoriza los permisos solicitados (acceso a la hoja de cálculo).
5. Copia la URL `.../exec` que te da el despliegue: es el enlace que se le
   pasa al alumnado. Puedes generarlo también desde el menú
   **Examen antitrampes → Copiar enllaç per l'alumnat**, que además lo
   guarda en el Sheet.
6. Cada vez que edites el código, para que los cambios lleguen a los
   alumnos hace falta una **nueva implementación** (o gestionar una
   implementación de "cabecera"/versión desde Implementar → Gestionar
   implementaciones).

## Cómo se identifica y bloquea a un alumno

- Al entrar, `doGet` busca su correo en `Registre`; si no existe, crea la
  fila con `Avisos = 0` y un `Token` único.
- Si el alumno ya tiene `Avisos >= Avisos` (máximo configurado), `doGet` le
  sirve directamente la pantalla de "Has estat suspès" sin cargar el
  examen — así recargar la página no permite saltarse la suspensión.
- Los eventos del navegador (salir de fullscreen, cambiar de pestaña,
  perder el foco de la ventana) llaman por **`fetch`** al propio Web App
  (`doPost`), que incrementa `Avisos` y actualiza `Última acció` /
  `Historial` en `Registre`. Al llegar al máximo, la respuesta indica al
  cliente que muestre la pantalla de suspensión y oculte el formulario.

### Nota técnica sobre el `fetch`

Las páginas servidas por `HtmlService` se cargan en un origen distinto
(`googleusercontent.com`) al de la URL `.../exec`
(`script.google.com`), así que la llamada es cross-origin. Para evitar que
el navegador lance una petición de verificación previa (`preflight`) que
Apps Script no gestiona, el `fetch` se envía con
`Content-Type: text/plain;charset=utf-8` aunque el cuerpo sea JSON;
`doPost` lo parsea igualmente con `JSON.parse(e.postData.contents)`.

## Probar el flujo antes de dárselo al alumnado

1. Pon `Estat d'examen = ACTIU` y un `Avisos` bajo (p. ej. 2) para probar
   rápido.
2. Abre el enlace del alumnado con una cuenta de prueba.
3. Comprueba: entra en pantalla completa al pulsar "Comenzar examen", el
   Forms se ve dentro del iframe, el cronómetro cuenta hacia atrás.
4. Sal de pantalla completa (Esc) → debe aparecer el aviso 1/N y sumar una
   fila en `Registre`.
5. Cambia de pestaña o minimiza → segundo aviso → si coincide con el
   máximo, debe bloquear el examen y marcar "SUSPÈS" en `Última acció`.
6. Recarga la página con la misma cuenta ya suspendida → debe mostrar
   directamente la pantalla de suspensión, no el examen.
7. Deja que se agote el tiempo configurado → debe avisar de que se ha
   acabado el tiempo.
