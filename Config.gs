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
  enllacAlumnat: "Enllaç que li hem de passar a l'alumnat"
};

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
