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
