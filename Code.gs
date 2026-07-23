function doGet(e) {
  try {
    var config = getExamConfig_();

    if (config.estat !== 'ACTIU') {
      return renderMessage_(
        'Examen no disponible',
        'Aquest examen no està actiu ara mateix. Parla amb el professor/a.'
      );
    }

    var email = Session.getActiveUser().getEmail();
    if (!email) {
      return renderMessage_(
        'Cal iniciar sessió',
        "Has d'accedir amb el teu compte de correu del centre per fer l'examen."
      );
    }

    var student = findOrCreateStudent_(email);

    if (config.avisosMax > 0 && student.avisos >= config.avisosMax) {
      return renderMessage_(
        'Has estat suspès',
        "Has superat el nombre màxim d'avisos (" + student.avisos + '/' + config.avisosMax + '). ' +
        'Parla amb el professor/a.'
      );
    }

    var template = HtmlService.createTemplateFromFile('Exam');
    template.config = config;
    template.student = student;
    template.scriptUrl = ScriptApp.getService().getUrl();

    return template.evaluate()
      .setTitle(config.titol || 'Examen')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return renderMessage_('Error', String(err));
  }
}

/**
 * El client no fa servir google.script.run: crida per fetch a aquesta
 * mateixa URL desplegada, amb un POST JSON { action, token, ... }.
 */
function doPost(e) {
  var response;
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'warning') {
      response = registerWarning_(body.token, body.reason);
    } else if (body.action === 'finish') {
      response = finishExam_(body.token, body.status);
    } else {
      response = { error: 'Acció desconeguda' };
    }
  } catch (err) {
    response = { error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function renderMessage_(title, message) {
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>' +
    'body{font-family:Arial,sans-serif;background:#1c1c1c;color:#fff;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;' +
    'margin:0;text-align:center;padding:24px;box-sizing:border-box}' +
    '.box{max-width:480px}h1{font-size:1.4em}' +
    '</style></head><body>' +
    '<div class="box"><h1>' + escapeHtml_(title) + '</h1><p>' + escapeHtml_(message) + '</p></div>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title);
}

function escapeHtml_(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Examen antitrampes')
    .addItem('Activar examen', 'activarExamen')
    .addItem('Desactivar examen', 'desactivarExamen')
    .addItem("Copiar enllaç per l'alumnat", 'copiarEnllacAlumnat')
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

function copiarEnllacAlumnat() {
  var url = ScriptApp.getService().getUrl();
  setStudentLink_(url);
  SpreadsheetApp.getUi().alert("Enllaç per l'alumnat", url, SpreadsheetApp.getUi().ButtonSet.OK);
}
