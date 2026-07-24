/**
 * Aquest projecte ja no serveix cap pàgina HTML: l'alumnat obre un
 * index.html estàtic allotjat a GitHub Pages, i aquest Web App només fa
 * de API JSON (consultada per fetch des d'un altre origen).
 *
 * Com que la identificació ja no ve de Session.getActiveUser() (no
 * funciona en una petició fetch feta des d'un altre domini), l'alumne
 * s'identifica escrivint nom i correu a la pàgina estàtica; el control de
 * qui pot arribar-hi es fa fora d'aquí, restringint l'accés al document on
 * es publica l'enllaç de GitHub Pages.
 */

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

var REG_COLS = {
  nom: 1,
  correu: 2,
  avisos: 3,
  ultimaAccio: 4,
  historial: 5,
  token: 6,
  timestampInici: 7
};

function doGet(e) {
  return jsonResponse_(publicConfig_());
}

function doPost(e) {
  var response;
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'start') {
      response = startExam_(body.nom, body.correu);
    } else if (body.action === 'warning') {
      response = registerWarning_(body.token, body.reason);
    } else if (body.action === 'finish') {
      response = finishExam_(body.token, body.status);
    } else if (body.action === 'configGet') {
      response = configGet_(body.codi);
    } else if (body.action === 'configSave') {
      response = configSave_(body.codi, body.fields);
    } else {
      response = { error: 'Acció desconeguda' };
    }
  } catch (err) {
    response = { error: String(err) };
  }
  return jsonResponse_(response);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function publicConfig_() {
  var config = getExamConfig_();
  return {
    titol: config.titol,
    descripcio: config.descripcio,
    normes: config.normes,
    avisosMax: config.avisosMax,
    tempsMinuts: config.tempsMinuts,
    estat: config.estat
  };
}

/**
 * Es crida quan l'alumne prem "Comenzar examen" a la pàgina estàtica,
 * amb el nom i correu que ha escrit ell mateix.
 */
function startExam_(nom, correu) {
  var config = getExamConfig_();

  if (config.estat !== 'ACTIU') {
    return { error: 'INACTIU', missatge: 'Aquest examen no està actiu ara mateix.' };
  }
  if (!correu) {
    return { error: 'CORREU_REQUERIT', missatge: 'Cal indicar un correu.' };
  }

  var student = findOrCreateStudent_(correu, nom);

  if (config.avisosMax > 0 && student.avisos >= config.avisosMax) {
    return { suspended: true, avisos: student.avisos, avisosMax: config.avisosMax };
  }

  return {
    suspended: false,
    token: student.token,
    timestampInici: student.timestampInici.getTime(),
    avisos: student.avisos,
    avisosMax: config.avisosMax,
    tempsMinuts: config.tempsMinuts,
    formsUrl: config.formsUrl
  };
}

function codeErrorResponse_(check) {
  if (check.reason === 'NO_CONFIGURAT') {
    return {
      error: 'CODI_NO_CONFIGURAT',
      missatge: "Cal afegir la fila \"Codi d'accés professor\" a Configuracio abans de poder entrar."
    };
  }
  return { error: 'CODI_INCORRECTE', missatge: "Codi d'accés incorrecte." };
}

/**
 * Es crida en obrir la icona de configuració: torna els camps editables
 * perquè el formulari es pugui omplir amb els valors actuals.
 */
function configGet_(codi) {
  var check = checkTeacherCode_(codi);
  if (!check.ok) return codeErrorResponse_(check);

  var config = getExamConfig_();
  return {
    titol: config.titol,
    descripcio: config.descripcio,
    normes: config.normes,
    avisosMax: config.avisosMax,
    tempsMinuts: config.tempsMinuts,
    formsUrl: config.formsUrl,
    estat: config.estat
  };
}

function configSave_(codi, fields) {
  var check = checkTeacherCode_(codi);
  if (!check.ok) return codeErrorResponse_(check);

  if (!fields || typeof fields !== 'object') {
    return { error: 'DADES_INVALIDES', missatge: 'Falten dades del formulari.' };
  }

  saveExamConfig_(fields);
  return { ok: true };
}

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

function getRegistreSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REGISTRE);
  if (!sheet) throw new Error('No es troba la pestanya "' + SHEET_REGISTRE + '"');
  return sheet;
}

function findStudentRow_(email) {
  var sheet = getRegistreSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var correus = sheet.getRange(2, REG_COLS.correu, lastRow - 1, 1).getValues();
  for (var i = 0; i < correus.length; i++) {
    if (String(correus[i][0]).trim().toLowerCase() === email.toLowerCase()) {
      return i + 2;
    }
  }
  return -1;
}

function findRowByToken_(token) {
  var sheet = getRegistreSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var tokens = sheet.getRange(2, REG_COLS.token, lastRow - 1, 1).getValues();
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i][0] === token) return i + 2;
  }
  return -1;
}

/**
 * Busca l'alumne pel correu (escrit per ell mateix a la pàgina estàtica) i
 * el crea si és la primera vegada que entra. El Timestamp Inici es fixa
 * aquí, al servidor, perquè el cronòmetre del client no es pugui allargar
 * recarregant la pàgina o tocant el rellotge local.
 */
function findOrCreateStudent_(email, nom) {
  var sheet = getRegistreSheet_();
  var row = findStudentRow_(email);

  if (row === -1) {
    var name = nom || email.split('@')[0];
    var token = Utilities.getUuid();
    var now = new Date();
    sheet.appendRow([name, email, 0, '', '', token, now]);
    return {
      row: sheet.getLastRow(),
      nom: name,
      correu: email,
      avisos: 0,
      ultimaAccio: '',
      historial: '',
      token: token,
      timestampInici: now
    };
  }

  var values = sheet.getRange(row, 1, 1, 7).getValues()[0];
  return {
    row: row,
    nom: values[0],
    correu: values[1],
    avisos: Number(values[2]) || 0,
    ultimaAccio: values[3],
    historial: values[4],
    token: values[5],
    timestampInici: values[6]
  };
}

/**
 * Registra un avís pel token indicat. Si arriba al màxim configurat,
 * marca la fila com a suspesa i ho informa al client perquè bloquegi l'examen.
 */
function registerWarning_(token, reason) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getRegistreSheet_();
    var row = findRowByToken_(token);
    if (row === -1) return { error: 'Token no vàlid' };

    var config = getExamConfig_();
    var avisos = (Number(sheet.getRange(row, REG_COLS.avisos).getValue()) || 0) + 1;

    var text = 'Avís ' + avisos + '/' + config.avisosMax + ': ' + reason;
    var suspended = config.avisosMax > 0 && avisos >= config.avisosMax;
    if (suspended) text += ' — SUSPÈS';

    sheet.getRange(row, REG_COLS.avisos).setValue(avisos);
    sheet.getRange(row, REG_COLS.ultimaAccio).setValue(text);
    afegirHistorial_(sheet, row, text);

    return { avisos: avisos, avisosMax: config.avisosMax, suspended: suspended };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Registra el final de l'examen (enviat manualment o per esgotament de temps).
 */
function finishExam_(token, status) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getRegistreSheet_();
    var row = findRowByToken_(token);
    if (row === -1) return { error: 'Token no vàlid' };

    var text = status === 'timeout' ? 'Temps exhaurit' : 'Examen enviat';
    sheet.getRange(row, REG_COLS.ultimaAccio).setValue(text);
    afegirHistorial_(sheet, row, text);

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function afegirHistorial_(sheet, row, text) {
  var historial = sheet.getRange(row, REG_COLS.historial).getValue() || '';
  var linia = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss') + ' - ' + text;
  sheet.getRange(row, REG_COLS.historial).setValue(historial ? historial + '\n' + linia : linia);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Examen antitrampes')
    .addItem('Activar examen', 'activarExamen')
    .addItem('Desactivar examen', 'desactivarExamen')
    .addToUi();
}

function activarExamen() {
  setEstatExamen_('ACTIU');
}

function desactivarExamen() {
  setEstatExamen_('INACTIU');
}

function setEstatExamen_(estat) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
  var values = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === CONFIG_LABELS.estat) {
      sheet.getRange(i + 1, 2).setValue(estat);
      SpreadsheetApp.getActiveSpreadsheet().toast('Examen ' + estat);
      return;
    }
  }
}
