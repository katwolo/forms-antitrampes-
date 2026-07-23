var REG_COLS = {
  nom: 1,
  correu: 2,
  avisos: 3,
  ultimaAccio: 4,
  historial: 5,
  token: 6,
  timestampInici: 7
};

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
