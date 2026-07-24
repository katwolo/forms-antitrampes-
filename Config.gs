var SHEET_CONFIG = 'Configuracio';
var SHEET_REGISTRE = 'Registre';

var CONFIG_LABELS = {
  titol: 'Titol examen',
  descripcio: 'Descripció',
  normes: 'Normes',
  avisosMax: 'Avisos',
  tempsMinuts: "Temps de l'examen",
  formsUrl: 'Enllaç forms',
  estat: "Estat d'examen",
  enllacAlumnat: "Enllaç que li hem de passar a l'alumnat",
  codiAcces: "Codi d'accés professor"
};

// Camps que el professor pot editar des de la icona de configuració de
// index.html. El codi d'accés en queda fora a propòsit: es canvia
// directament a la cel·la del Sheet, no des del formulari que protegeix.
var EDITABLE_CONFIG_KEYS = ['titol', 'descripcio', 'normes', 'avisosMax', 'tempsMinuts', 'formsUrl', 'estat'];

/**
 * Llegeix la pestanya Configuracio cercant les etiquetes a la columna A,
 * en comptes de dependre de números de fila fixos, per aguantar que el
 * professor reordeni o afegeixi files.
 */
function getExamConfig_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
  if (!sheet) throw new Error('No es troba la pestanya "' + SHEET_CONFIG + '"');

  var values = sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues();
  var byLabel = {};
  values.forEach(function (row, i) {
    var label = String(row[0]).trim();
    if (label) byLabel[label] = { value: row[1], row: i + 1 };
  });

  var config = {};
  Object.keys(CONFIG_LABELS).forEach(function (key) {
    var entry = byLabel[CONFIG_LABELS[key]];
    config[key] = entry ? entry.value : '';
  });

  // Cas especial de la plantilla: el valor d'aquesta etiqueta no és a la
  // columna B de la mateixa fila, sinó a la columna A de la fila següent.
  // Ara hi va l'enllaç de GitHub Pages (el que rep l'alumnat), no l'enllaç
  // d'aquest Apps Script — el professor l'hi enganxa manualment un cop
  // publicada la pàgina.
  var enllacEntry = byLabel[CONFIG_LABELS.enllacAlumnat];
  if (enllacEntry) {
    var nextRowValue = sheet.getRange(enllacEntry.row + 1, 1).getValue();
    config.enllacAlumnat = nextRowValue || config.enllacAlumnat;
  }

  config.avisosMax = Number(config.avisosMax) || 0;
  config.tempsMinuts = Number(config.tempsMinuts) || 0;
  config.estat = String(config.estat || '').trim().toUpperCase();

  return config;
}

/**
 * Compara el codi que ha escrit el professor amb el de la cel·la
 * "Codi d'accés professor". Es valida sempre al servidor: si es comparés
 * al client, qualsevol podria llegir el codi correcte al codi font.
 */
function checkTeacherCode_(codi) {
  var config = getExamConfig_();
  var real = String(config.codiAcces || '').trim();
  if (!real) return { ok: false, reason: 'NO_CONFIGURAT' };
  return { ok: String(codi || '').trim() === real, reason: 'INCORRECTE' };
}

/**
 * Desa els camps editables a les seves cel·les de Configuracio, buscant
 * la fila per l'etiqueta (igual que getExamConfig_) en comptes de números
 * de fila fixos.
 */
function saveExamConfig_(fields) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
    if (!sheet) throw new Error('No es troba la pestanya "' + SHEET_CONFIG + '"');

    var labels = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
    var rowByLabel = {};
    labels.forEach(function (row, i) {
      var label = String(row[0]).trim();
      if (label) rowByLabel[label] = i + 1;
    });

    EDITABLE_CONFIG_KEYS.forEach(function (key) {
      if (!(key in fields)) return;
      var row = rowByLabel[CONFIG_LABELS[key]];
      if (!row) return;

      var value = fields[key];
      if (key === 'avisosMax' || key === 'tempsMinuts') value = Number(value) || 0;
      if (key === 'estat') value = String(value || '').trim().toUpperCase();

      sheet.getRange(row, 2).setValue(value);
    });
  } finally {
    lock.releaseLock();
  }
}
