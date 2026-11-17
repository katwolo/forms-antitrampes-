/**
 * Aquest projecte ja no serveix cap pàgina HTML: l'alumnat obre un
 * index.html estàtic allotjat a GitHub Pages, i aquest Web App només fa
 * de API JSON (consultada per fetch des d'un altre origen).
 *
 * MULTI-EXAMEN: un sol Sheet + un sol desplegament serveixen tants exàmens
 * com calgui (un per mòdul/classe/professor). Cada examen és una fila de la
 * pestanya "Examens" identificada per un ID curt, i cada examen té la seva
 * pròpia pestanya de registre "Registre_<ID>". L'alumnat rep l'enllaç
 * index.html?examen=<ID>, i totes les peticions porten aquest ID.
 *
 * Accés del professorat:
 *  - "Codi professor" (columna de cada examen): dona accés NOMÉS als
 *    exàmens que tenen aquest codi. Un professor pot fer servir el mateix
 *    codi a tots els seus exàmens i així els veu tots junts al panell.
 *  - "Codi administrador" (pestanya Configuracio): dona accés a tots els
 *    exàmens i permet crear-ne per a qualsevol professor.
 * Els codis es validen sempre aquí, al servidor, mai al client.
 *
 * Com que la identificació de l'alumne no ve de Session.getActiveUser()
 * (no funciona en una petició fetch feta des d'un altre domini), l'alumne
 * s'identifica escrivint nom i correu a la pàgina estàtica.
 */

var SHEET_CONFIG = 'Configuracio';
var SHEET_EXAMENS = 'Examens';
var SHEET_REGISTRE_PREFIX = 'Registre_';
var SHEET_REGISTRE_ANTIC = 'Registre';

// Etiquetes globals de Configuracio (columna A = etiqueta, B = valor).
var GLOBAL_LABELS = {
  codiAdmin: 'Codi administrador',
  urlPagina: "URL pàgina alumnat"
};

// Etiquetes de l'antic format d'un sol examen; només es fan servir per
// migrar-lo a la nova pestanya Examens.
var OLD_CONFIG_LABELS = {
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

// Capçaleres de la pestanya Examens. Es busquen pel nom (no per posició),
// així el professor pot reordenar columnes o afegir-ne de pròpies.
var EXAM_HEADERS = {
  id: 'ID',
  modul: 'Mòdul',
  classe: 'Classe',
  professor: 'Professor',
  titol: 'Titol examen',
  descripcio: 'Descripció',
  normes: 'Normes',
  avisosMax: 'Avisos',
  tempsMinuts: 'Temps (minuts)',
  formsUrl: 'Enllaç forms',
  estat: 'Estat',
  codi: 'Codi professor',
  enllacAlumnat: 'Enllaç alumnat'
};
var EXAM_KEYS_ORDER = ['id', 'modul', 'classe', 'professor', 'titol', 'descripcio', 'normes',
  'avisosMax', 'tempsMinuts', 'formsUrl', 'estat', 'codi', 'enllacAlumnat'];

// Camps que es poden editar des del panell. L'ID no (en depèn el nom de la
// pestanya de registre i l'enllaç ja repartit) i el codi només l'admin.
var EDITABLE_EXAM_KEYS = ['modul', 'classe', 'professor', 'titol', 'descripcio', 'normes',
  'avisosMax', 'tempsMinuts', 'formsUrl', 'estat'];

var REGISTRE_HEADERS = ['Nom', 'Correu', 'Avisos', 'Última acció', 'Historial', 'Token', 'Timestamp Inici'];
var REG_COLS = {
  nom: 1,
  correu: 2,
  avisos: 3,
  ultimaAccio: 4,
  historial: 5,
  token: 6,
  timestampInici: 7
};

var ID_REGEX = /^[A-Za-z0-9_-]{1,40}$/;

// ---------------------------------------------------------------------------
// Entrada HTTP
// ---------------------------------------------------------------------------

function doGet(e) {
  var response;
  try {
    var examenId = e && e.parameter ? e.parameter.examen : '';
    response = publicConfig_(examenId);
  } catch (err) {
    response = { error: String(err) };
  }
  return jsonResponse_(response);
}

function doPost(e) {
  var response;
  try {
    var body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'start':
        response = startExam_(body.examen, body.nom, body.correu); break;
      case 'warning':
        response = registerWarning_(body.examen, body.token, body.reason); break;
      case 'finish':
        response = finishExam_(body.examen, body.token, body.status); break;
      case 'login':
        response = login_(body.codi); break;
      case 'examSave':
        response = examSave_(body.codi, body.examen, body.fields, !!body.nou); break;
      case 'examDelete':
        response = examDelete_(body.codi, body.examen); break;
      case 'configListStudents':
        response = configListStudents_(body.codi, body.examen); break;
      case 'configResetStudent':
        response = configResetStudent_(body.codi, body.examen, body.correu); break;
      case 'configReset':
        response = configReset_(body.codi, body.examen); break;
      default:
        response = { error: 'ACCIO_DESCONEGUDA', missatge: 'Acció desconeguda' };
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

// ---------------------------------------------------------------------------
// Alumnat
// ---------------------------------------------------------------------------

function examNotFound_(examenId) {
  if (!examenId) {
    return { error: 'EXAMEN_REQUERIT', missatge: "A l'enllaç li falta l'identificador de l'examen." };
  }
  return { error: 'EXAMEN_NO_TROBAT', missatge: "No existeix cap examen amb l'identificador \"" + examenId + '".' };
}

function publicConfig_(examenId) {
  var exam = getExam_(examenId);
  if (!exam) return examNotFound_(examenId);
  return {
    id: exam.id,
    modul: exam.modul,
    classe: exam.classe,
    professor: exam.professor,
    titol: exam.titol,
    descripcio: exam.descripcio,
    normes: exam.normes,
    avisosMax: exam.avisosMax,
    tempsMinuts: exam.tempsMinuts,
    estat: exam.estat
  };
}

/**
 * Es crida quan l'alumne prem "Comenzar examen" a la pàgina estàtica,
 * amb el nom i correu que ha escrit ell mateix.
 */
function startExam_(examenId, nom, correu) {
  var exam = getExam_(examenId);
  if (!exam) return examNotFound_(examenId);

  if (exam.estat !== 'ACTIU') {
    return { error: 'INACTIU', missatge: 'Aquest examen no està actiu ara mateix.' };
  }
  correu = String(correu || '').trim();
  if (!correu) {
    return { error: 'CORREU_REQUERIT', missatge: 'Cal indicar un correu.' };
  }

  var student = findOrCreateStudent_(exam.id, correu, nom);

  if (exam.avisosMax > 0 && student.avisos >= exam.avisosMax) {
    return { suspended: true, avisos: student.avisos, avisosMax: exam.avisosMax };
  }

  return {
    suspended: false,
    token: student.token,
    timestampInici: new Date(student.timestampInici).getTime(),
    avisos: student.avisos,
    avisosMax: exam.avisosMax,
    tempsMinuts: exam.tempsMinuts,
    formsUrl: exam.formsUrl
  };
}

/**
 * Busca l'alumne pel correu dins el registre d'aquest examen i el crea si
 * és la primera vegada que entra. El Timestamp Inici es fixa aquí, al
 * servidor, perquè el cronòmetre no es pugui allargar recarregant la
 * pàgina o tocant el rellotge local. Es fa amb lock perquè dos clics
 * seguits no creïn dues files pel mateix alumne.
 */
function findOrCreateStudent_(examenId, email, nom) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getRegistreSheet_(examenId, true);
    var row = findStudentRow_(sheet, email);

    if (row === -1) {
      var name = String(nom || '').trim() || email.split('@')[0];
      var token = Utilities.getUuid();
      var now = new Date();
      sheet.appendRow([name, email, 0, '', '', token, now]);
      return { nom: name, correu: email, avisos: 0, token: token, timestampInici: now };
    }

    var values = sheet.getRange(row, 1, 1, 7).getValues()[0];
    return {
      nom: values[0],
      correu: values[1],
      avisos: Number(values[2]) || 0,
      token: values[5],
      timestampInici: values[6]
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Registra un avís pel token indicat. Si arriba al màxim configurat,
 * marca la fila com a suspesa i ho informa al client perquè bloquegi
 * l'examen. Les tres cel·les (Avisos, Última acció, Historial) són
 * contigües i s'escriuen d'un sol cop per alliberar el lock com abans
 * millor: el lock és compartit per tots els exàmens.
 */
function registerWarning_(examenId, token, reason) {
  var exam = getExam_(examenId);
  if (!exam) return examNotFound_(examenId);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getRegistreSheet_(exam.id, false);
    if (!sheet) return { error: 'Token no vàlid' };
    var row = findRowByToken_(sheet, token);
    if (row === -1) return { error: 'Token no vàlid' };

    var current = sheet.getRange(row, REG_COLS.avisos, 1, 3).getValues()[0];
    var avisos = (Number(current[0]) || 0) + 1;

    var text = 'Avís ' + avisos + '/' + exam.avisosMax + ': ' + String(reason || '');
    var suspended = exam.avisosMax > 0 && avisos >= exam.avisosMax;
    if (suspended) text += ' — SUSPÈS';

    sheet.getRange(row, REG_COLS.avisos, 1, 3)
      .setValues([[avisos, text, afegeixLiniaHistorial_(current[2], text)]]);

    return { avisos: avisos, avisosMax: exam.avisosMax, suspended: suspended };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Registra el final de l'examen (enviat manualment o per esgotament de temps).
 */
function finishExam_(examenId, token, status) {
  var exam = getExam_(examenId);
  if (!exam) return examNotFound_(examenId);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getRegistreSheet_(exam.id, false);
    if (!sheet) return { error: 'Token no vàlid' };
    var row = findRowByToken_(sheet, token);
    if (row === -1) return { error: 'Token no vàlid' };

    var text = status === 'timeout' ? 'Temps exhaurit' : 'Examen enviat';
    var historial = sheet.getRange(row, REG_COLS.historial).getValue();
    sheet.getRange(row, REG_COLS.ultimaAccio, 1, 2)
      .setValues([[text, afegeixLiniaHistorial_(historial, text)]]);

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function afegeixLiniaHistorial_(historial, text) {
  var linia = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss') + ' - ' + text;
  return historial ? historial + '\n' + linia : linia;
}

// ---------------------------------------------------------------------------
// Professorat: autenticació
// ---------------------------------------------------------------------------

function isAdminCode_(codi) {
  var admin = String(getGlobalConfig_().codiAdmin || '').trim();
  return !!admin && String(codi || '').trim() === admin;
}

/**
 * Decideix si el codi dona accés a l'examen: l'admin a tots, un professor
 * només als exàmens amb el seu codi.
 */
function authExam_(codi, examenId) {
  var exam = getExam_(examenId);
  if (!exam) return { ok: false, response: examNotFound_(examenId) };

  var c = String(codi || '').trim();
  if (!c) return { ok: false, response: codiIncorrecte_() };
  if (isAdminCode_(c)) return { ok: true, exam: exam, rol: 'admin' };
  if (exam.codi && c === exam.codi) return { ok: true, exam: exam, rol: 'professor' };
  return { ok: false, response: codiIncorrecte_() };
}

function codiIncorrecte_() {
  return { error: 'CODI_INCORRECTE', missatge: "Codi d'accés incorrecte." };
}

/**
 * Entrada al panell ⚙️: torna el rol i els exàmens que pot gestionar
 * aquest codi (tots si és l'admin).
 */
function login_(codi) {
  var c = String(codi || '').trim();
  if (!c) return codiIncorrecte_();

  var global = getGlobalConfig_();
  var exams = getAllExams_();

  var rol = null;
  var visibles;
  if (global.codiAdmin && c === String(global.codiAdmin).trim()) {
    rol = 'admin';
    visibles = exams;
  } else {
    visibles = exams.filter(function (ex) { return ex.codi && ex.codi === c; });
    if (visibles.length) rol = 'professor';
  }

  if (!rol) {
    if (!global.codiAdmin && !exams.some(function (ex) { return ex.codi; })) {
      return {
        error: 'CODI_NO_CONFIGURAT',
        missatge: 'Encara no hi ha cap codi configurat. Afegeix el "' + GLOBAL_LABELS.codiAdmin +
          '" a la pestanya ' + SHEET_CONFIG + ' (menú Examen antitrampes → Crear / reparar plantilla).'
      };
    }
    return codiIncorrecte_();
  }

  return {
    rol: rol,
    urlPagina: global.urlPagina || '',
    examens: visibles.map(function (ex) { return examForPanel_(ex, rol); })
  };
}

function examForPanel_(exam, rol) {
  var out = {};
  EXAM_KEYS_ORDER.forEach(function (key) { out[key] = exam[key]; });
  // El professor ja coneix el seu codi; no cal tornar-lo. A l'admin sí, per
  // poder veure i canviar de qui és cada examen.
  if (rol !== 'admin') delete out.codi;
  return out;
}

// ---------------------------------------------------------------------------
// Professorat: gestió d'exàmens
// ---------------------------------------------------------------------------

/**
 * Crea (nou = true) o modifica un examen.
 *  - Crear: l'admin pot crear-ne per a qualsevol codi; un professor (que ja
 *    tingui algun examen) només en pot crear amb el seu propi codi.
 *  - Modificar: només els camps d'EDITABLE_EXAM_KEYS; el codi, només l'admin.
 */
function examSave_(codi, examenId, fields, nou) {
  if (!fields || typeof fields !== 'object') {
    return { error: 'DADES_INVALIDES', missatge: 'Falten dades del formulari.' };
  }
  var c = String(codi || '').trim();

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getExamensSheet_(true);
    var cols = getExamColumns_(sheet);
    var faltants = EXAM_KEYS_ORDER.filter(function (k) { return !cols[k]; });
    if (faltants.length) {
      return {
        error: 'CAPCALERES',
        missatge: 'A la pestanya ' + SHEET_EXAMENS + ' hi falten les columnes: ' +
          faltants.map(function (k) { return EXAM_HEADERS[k]; }).join(', ')
      };
    }

    var rol, exam, row;
    if (nou) {
      var id = String(fields.id || '').trim();
      if (!ID_REGEX.test(id)) {
        return {
          error: 'ID_INVALID',
          missatge: "L'ID només pot tenir lletres sense accents, números, guions i guions baixos (màx. 40)."
        };
      }
      if (findExamRow_(sheet, cols, id) !== -1) {
        return { error: 'ID_DUPLICAT', missatge: 'Ja existeix un examen amb l\'ID "' + id + '".' };
      }

      if (isAdminCode_(c)) {
        rol = 'admin';
      } else if (c && getAllExams_().some(function (ex) { return ex.codi === c; })) {
        rol = 'professor';
      } else {
        return codiIncorrecte_();
      }

      var codiExamen = rol === 'admin' ? String(fields.codi || '').trim() : c;
      if (!codiExamen) {
        return { error: 'CODI_REQUERIT', missatge: 'Cal indicar el codi del professor per a aquest examen.' };
      }

      row = Math.max(sheet.getLastRow(), 1) + 1;
      exam = { id: id, codi: codiExamen, estat: 'INACTIU', avisosMax: 3, tempsMinuts: 60 };
    } else {
      var auth = authExam_(c, examenId);
      if (!auth.ok) return auth.response;
      rol = auth.rol;
      exam = auth.exam;
      row = exam.row;
    }

    EDITABLE_EXAM_KEYS.forEach(function (key) {
      if (key in fields) exam[key] = fields[key];
    });
    if (!nou && rol === 'admin' && 'codi' in fields) {
      var nouCodi = String(fields.codi || '').trim();
      if (!nouCodi) return { error: 'CODI_REQUERIT', missatge: 'El codi del professor no pot quedar buit.' };
      exam.codi = nouCodi;
    }

    exam.avisosMax = Number(exam.avisosMax) || 0;
    exam.tempsMinuts = Number(exam.tempsMinuts) || 0;
    exam.estat = String(exam.estat || '').trim().toUpperCase() === 'ACTIU' ? 'ACTIU' : 'INACTIU';
    exam.enllacAlumnat = buildStudentLink_(exam.id);

    writeExamRow_(sheet, cols, row, exam);
    if (nou) getRegistreSheet_(exam.id, true);

    return { ok: true, examen: examForPanel_(normalizeExam_(exam), rol) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Elimina un examen: la seva fila d'Examens i la seva pestanya de registre.
 */
function examDelete_(codi, examenId) {
  var auth = authExam_(codi, examenId);
  if (!auth.ok) return auth.response;

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getExamensSheet_(false);
    var cols = getExamColumns_(sheet);
    var row = findExamRow_(sheet, cols, auth.exam.id);
    if (row !== -1) sheet.deleteRow(row);

    var reg = getRegistreSheet_(auth.exam.id, false);
    if (reg) SpreadsheetApp.getActiveSpreadsheet().deleteSheet(reg);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Llista els alumnes del registre d'aquest examen perquè el professor
 * pugui veure els avisos de cadascú i decidir si en reinicia algun.
 */
function configListStudents_(codi, examenId) {
  var auth = authExam_(codi, examenId);
  if (!auth.ok) return auth.response;

  var sheet = getRegistreSheet_(auth.exam.id, false);
  if (!sheet || sheet.getLastRow() < 2) return { estudiants: [] };

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  var estudiants = values
    .filter(function (row) { return String(row[1]).trim() !== ''; })
    .map(function (row) {
      return {
        nom: row[0],
        correu: row[1],
        avisos: Number(row[2]) || 0,
        ultimaAccio: row[3]
      };
    });

  return { estudiants: estudiants };
}

/**
 * Esborra la fila d'un sol alumne d'aquest examen perquè pugui tornar a
 * començar des de zero, sense tocar la resta.
 */
function configResetStudent_(codi, examenId, correu) {
  var auth = authExam_(codi, examenId);
  if (!auth.ok) return auth.response;

  if (!correu) {
    return { error: 'CORREU_REQUERIT', missatge: 'Cal indicar quin alumne.' };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getRegistreSheet_(auth.exam.id, false);
    var row = sheet ? findStudentRow_(sheet, String(correu)) : -1;
    if (row === -1) {
      return { error: 'NO_TROBAT', missatge: 'No es troba aquest alumne al registre.' };
    }
    sheet.deleteRow(row);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Esborra totes les files del registre d'aquest examen (excepte la
 * capçalera), com si no s'hagués fet mai. Els altres exàmens no es toquen.
 */
function configReset_(codi, examenId) {
  var auth = authExam_(codi, examenId);
  if (!auth.ok) return auth.response;

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getRegistreSheet_(auth.exam.id, false);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Accés al Sheet
// ---------------------------------------------------------------------------

function getGlobalConfig_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
  var out = { codiAdmin: '', urlPagina: '' };
  if (!sheet || sheet.getLastRow() < 1) return out;

  var values = sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues();
  var byLabel = {};
  values.forEach(function (row) {
    var label = String(row[0]).trim();
    if (label) byLabel[label] = row[1];
  });
  out.codiAdmin = String(byLabel[GLOBAL_LABELS.codiAdmin] || '').trim();
  out.urlPagina = String(byLabel[GLOBAL_LABELS.urlPagina] || '').trim();
  return out;
}

function getExamensSheet_(create) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_EXAMENS);
  if (!sheet && create) {
    sheet = ss.insertSheet(SHEET_EXAMENS);
    sheet.getRange(1, 1, 1, EXAM_KEYS_ORDER.length)
      .setValues([EXAM_KEYS_ORDER.map(function (k) { return EXAM_HEADERS[k]; })])
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  if (!sheet) throw new Error('No es troba la pestanya "' + SHEET_EXAMENS + '"');
  return sheet;
}

/** Torna {clau: númeroDeColumna} llegint la fila de capçaleres. */
function getExamColumns_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var byHeader = {};
  headers.forEach(function (h, i) {
    var t = String(h).trim();
    if (t) byHeader[t] = i + 1;
  });
  var cols = {};
  EXAM_KEYS_ORDER.forEach(function (key) {
    if (byHeader[EXAM_HEADERS[key]]) cols[key] = byHeader[EXAM_HEADERS[key]];
  });
  return cols;
}

function normalizeExam_(exam) {
  exam.id = String(exam.id || '').trim();
  exam.codi = String(exam.codi || '').trim();
  exam.avisosMax = Number(exam.avisosMax) || 0;
  exam.tempsMinuts = Number(exam.tempsMinuts) || 0;
  exam.estat = String(exam.estat || '').trim().toUpperCase();
  exam.formsUrl = String(exam.formsUrl || '').trim();
  return exam;
}

function getAllExams_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_EXAMENS);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var cols = getExamColumns_(sheet);
  if (!cols.id) return [];

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var exams = [];
  values.forEach(function (row, i) {
    var exam = { row: i + 2 };
    EXAM_KEYS_ORDER.forEach(function (key) {
      exam[key] = cols[key] ? row[cols[key] - 1] : '';
    });
    normalizeExam_(exam);
    if (exam.id) exams.push(exam);
  });
  return exams;
}

function getExam_(examenId) {
  var id = String(examenId || '').trim();
  if (!id) return null;
  var exams = getAllExams_();
  for (var i = 0; i < exams.length; i++) {
    if (exams[i].id.toLowerCase() === id.toLowerCase()) return exams[i];
  }
  return null;
}

function findExamRow_(sheet, cols, id) {
  if (sheet.getLastRow() < 2) return -1;
  var ids = sheet.getRange(2, cols.id, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim().toLowerCase() === String(id).toLowerCase()) return i + 2;
  }
  return -1;
}

function writeExamRow_(sheet, cols, row, exam) {
  EXAM_KEYS_ORDER.forEach(function (key) {
    if (!cols[key]) return;
    var value = exam[key];
    sheet.getRange(row, cols[key]).setValue(value === undefined || value === null ? '' : value);
  });
}

function buildStudentLink_(examenId) {
  var base = getGlobalConfig_().urlPagina;
  if (!base) return '';
  base = base.split('?')[0].split('#')[0];
  return base + '?examen=' + encodeURIComponent(examenId);
}

/**
 * Pestanya de registre de l'examen. Si create és true i no existeix, la
 * crea amb les capçaleres.
 */
function getRegistreSheet_(examenId, create) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = SHEET_REGISTRE_PREFIX + examenId;
  var sheet = ss.getSheetByName(name);
  if (!sheet && create) {
    sheet = ss.insertSheet(name);
    formatRegistreSheet_(sheet);
  }
  return sheet;
}

function findStudentRow_(sheet, email) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var correus = sheet.getRange(2, REG_COLS.correu, lastRow - 1, 1).getValues();
  var target = String(email).trim().toLowerCase();
  for (var i = 0; i < correus.length; i++) {
    if (String(correus[i][0]).trim().toLowerCase() === target) return i + 2;
  }
  return -1;
}

function findRowByToken_(sheet, token) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !token) return -1;
  var tokens = sheet.getRange(2, REG_COLS.token, lastRow - 1, 1).getValues();
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i][0] === token) return i + 2;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Menú del Sheet
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Examen antitrampes')
    .addItem('Activar examen', 'activarExamen')
    .addItem('Desactivar examen', 'desactivarExamen')
    .addSeparator()
    .addItem('Crear / reparar plantilla', 'crearPlantilla')
    .addItem("Migrar l'examen antic (Configuracio → Examens)", 'migrarExamenAntic')
    .addItem("Regenerar enllaços de l'alumnat", 'regenerarEnllacos')
    .addToUi();
}

function activarExamen() {
  setEstatExamen_('ACTIU');
}

function desactivarExamen() {
  setEstatExamen_('INACTIU');
}

/**
 * Si el cursor és en una fila de la pestanya Examens, actua sobre aquell
 * examen; si no, pregunta l'ID.
 */
function setEstatExamen_(estat) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var sheet = getExamensSheet_(false);
  var cols = getExamColumns_(sheet);

  var row = -1;
  var active = ss.getActiveSheet();
  if (active.getName() === SHEET_EXAMENS && active.getActiveRange() && active.getActiveRange().getRow() > 1) {
    row = active.getActiveRange().getRow();
    if (!String(sheet.getRange(row, cols.id).getValue()).trim()) row = -1;
  }
  if (row === -1) {
    var resp = ui.prompt("Quin examen? Escriu l'ID:", ui.ButtonSet.OK_CANCEL);
    if (resp.getSelectedButton() !== ui.Button.OK) return;
    row = findExamRow_(sheet, cols, resp.getResponseText().trim());
    if (row === -1) {
      ui.alert('No existeix cap examen amb aquest ID.');
      return;
    }
  }

  sheet.getRange(row, cols.estat).setValue(estat);
  ss.toast('Examen ' + sheet.getRange(row, cols.id).getValue() + ': ' + estat);
}

/**
 * Passa l'examen del format antic (un sol examen a Configuracio + pestanya
 * Registre) al nou format: una fila a Examens i la pestanya Registre_<ID>.
 * L'antic codi del professor passa a ser el codi d'aquest examen i, si
 * encara no hi ha codi d'administrador, també el d'administrador.
 */
function migrarExamenAntic() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var config = ss.getSheetByName(SHEET_CONFIG);
  if (!config || config.getLastRow() < 1) {
    ui.alert('No es troba la pestanya ' + SHEET_CONFIG + ' amb l\'examen antic.');
    return;
  }

  var resp = ui.prompt(
    "ID per a l'examen actual (p. ex. DAW1-M06-UF2). Només lletres sense accents, números, - i _:",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var id = resp.getResponseText().trim();
  if (!ID_REGEX.test(id)) {
    ui.alert('ID no vàlid.');
    return;
  }

  crearPlantilla_({ exemple: false, preguntar: false });

  var values = config.getRange(1, 1, config.getLastRow(), 2).getValues();
  var byLabel = {};
  values.forEach(function (row, i) {
    var label = String(row[0]).trim();
    if (label) byLabel[label] = { value: row[1], row: i + 1 };
  });
  function old(key) {
    var e = byLabel[OLD_CONFIG_LABELS[key]];
    return e ? e.value : '';
  }

  // Cas especial de la plantilla antiga: l'enllaç de l'alumnat era a la
  // columna A de la fila següent a l'etiqueta.
  var enllacEntry = byLabel[OLD_CONFIG_LABELS.enllacAlumnat];
  var urlAntiga = enllacEntry ? String(config.getRange(enllacEntry.row + 1, 1).getValue() || '').trim() : '';

  var codiAntic = String(old('codiAcces') || '').trim();
  setGlobalIfEmpty_(config, GLOBAL_LABELS.codiAdmin, codiAntic);
  setGlobalIfEmpty_(config, GLOBAL_LABELS.urlPagina, urlAntiga.split('?')[0]);

  var sheet = getExamensSheet_(true);
  var cols = getExamColumns_(sheet);
  if (findExamRow_(sheet, cols, id) !== -1) {
    ui.alert('Ja existeix un examen amb aquest ID.');
    return;
  }

  var exam = normalizeExam_({
    id: id,
    modul: '',
    classe: '',
    professor: '',
    titol: old('titol'),
    descripcio: old('descripcio'),
    normes: old('normes'),
    avisosMax: old('avisosMax'),
    tempsMinuts: old('tempsMinuts'),
    formsUrl: old('formsUrl'),
    estat: old('estat') || 'INACTIU',
    codi: codiAntic
  });
  exam.enllacAlumnat = buildStudentLink_(id);
  writeExamRow_(sheet, cols, Math.max(sheet.getLastRow(), 1) + 1, exam);

  var registreAntic = ss.getSheetByName(SHEET_REGISTRE_ANTIC);
  if (registreAntic && !ss.getSheetByName(SHEET_REGISTRE_PREFIX + id)) {
    registreAntic.setName(SHEET_REGISTRE_PREFIX + id);
    formatRegistreSheet_(registreAntic);
  } else {
    getRegistreSheet_(id, true);
  }

  ui.alert('Examen migrat com a "' + id + '".\n\nNou enllaç per a l\'alumnat:\n' +
    (exam.enllacAlumnat || '(omple "' + GLOBAL_LABELS.urlPagina + '" a ' + SHEET_CONFIG +
      ' i fes "Regenerar enllaços")') +
    '\n\nLes files antigues de ' + SHEET_CONFIG + ' (Titol examen, Normes…) ja no es fan servir; les pots esborrar.');
}

function setGlobalIfEmpty_(config, label, value) {
  if (!value) return;
  var labels = config.getRange(1, 1, config.getLastRow(), 1).getValues();
  for (var i = 0; i < labels.length; i++) {
    if (String(labels[i][0]).trim() === label) {
      var cell = config.getRange(i + 1, 2);
      if (!String(cell.getValue()).trim()) cell.setValue(value);
      return;
    }
  }
  config.appendRow([label, value]);
}

/** Torna a escriure la columna "Enllaç alumnat" de tots els exàmens. */
function regenerarEnllacos() {
  regenerarEnllacos_();
  SpreadsheetApp.getActiveSpreadsheet().toast('Enllaços regenerats.');
}

function regenerarEnllacos_() {
  var sheet = getExamensSheet_(false);
  var cols = getExamColumns_(sheet);
  if (!cols.enllacAlumnat || !cols.id) return;
  getAllExams_().forEach(function (ex) {
    sheet.getRange(ex.row, cols.enllacAlumnat).setValue(buildStudentLink_(ex.id));
  });
}

// ---------------------------------------------------------------------------
// Plantilla del Sheet
// ---------------------------------------------------------------------------

// Explicacions que surten com a nota a les capçaleres d'Examens.
var EXAM_NOTES = {
  id: "Identificador curt i únic de l'examen (p. ex. DAW1-M06-UF2). Només lletres sense accents, " +
    "números, - i _. Surt a l'enllaç i al nom de la pestanya Registre_<ID>: no el canviïs un cop repartit.",
  modul: 'Informatiu: mòdul o assignatura.',
  classe: 'Informatiu: grup o classe.',
  professor: 'Informatiu: nom del professor/a.',
  titol: "Títol que veu l'alumne abans de començar.",
  descripcio: "Text que veu l'alumne sota el títol.",
  normes: "Normes de l'examen que veu l'alumne.",
  avisosMax: "Nombre d'avisos (sortir de pantalla completa, canviar de pestanya…) abans de suspendre. 0 = sense límit.",
  tempsMinuts: "Durada de l'examen en minuts. Compta des que l'alumne prem \"Comenzar examen\".",
  formsUrl: 'Enllaç del Google Forms (https://docs.google.com/forms/...).',
  estat: "ACTIU: l'alumnat pot entrar. INACTIU: la pàgina diu que l'examen no està disponible.",
  codi: "Codi amb què el professor/a d'aquest examen entra al panell ⚙️. Fes servir el mateix codi a " +
    'tots els exàmens d\'un mateix professor i un codi diferent per a cada professor.',
  enllacAlumnat: "S'omple sol a partir de \"URL pàgina alumnat\" (Configuracio). És l'enllaç que s'ha de passar a l'alumnat."
};

var EXAM_WIDTHS = {
  id: 150, modul: 110, classe: 100, professor: 140, titol: 220, descripcio: 260, normes: 300,
  avisosMax: 70, tempsMinuts: 110, formsUrl: 280, estat: 90, codi: 130, enllacAlumnat: 360
};

var GLOBAL_NOTES = {
  codiAdmin: "Dona accés a TOTS els exàmens des del panell ⚙️ i permet crear-ne per a qualsevol professor. " +
    'No el comparteixis.',
  urlPagina: "URL de GitHub Pages on hi ha index.html, sense ?examen= (p. ex. https://usuari.github.io/repo/). " +
    "Serveix per generar la columna \"Enllaç alumnat\" d'Examens."
};

var COLOR_CAPCALERA = '#3f3d99';
var COLOR_CAPCALERA_TEXT = '#ffffff';

/**
 * Deixa el Sheet tal com el necessita el projecte (menú → "Crear / reparar
 * plantilla"). Es pot executar tantes vegades com calgui: no esborra cap
 * dada, només crea el que falta i torna a aplicar el format.
 *
 *  - Configuracio: Paràmetre | Valor | Explicació, amb "Codi administrador"
 *    i "URL pàgina alumnat".
 *  - Examens: totes les capçaleres (amb una nota explicativa a cadascuna),
 *    validacions (Estat, Avisos, Temps, ID, enllaç del Forms), colors per
 *    a ACTIU/INACTIU i, si està buida, una fila d'exemple INACTIVA.
 *  - Registre_<ID>: capçaleres i format per a cada examen existent.
 *  - Elimina la pestanya buida per defecte ("Full 1", "Hoja 1", "Sheet1").
 *  - Si es llança des del menú, pregunta els valors globals que faltin.
 */
function crearPlantilla() {
  crearPlantilla_({ exemple: true, preguntar: true });
}

// Nom antic de la funció; es manté perquè ja està documentat al README.
function inicialitzarFulls() {
  crearPlantilla();
}

function crearPlantilla_(opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var config = preparaConfiguracio_(ss);
  var examens = preparaExamens_(ss, opts.exemple);
  ss.setActiveSheet(examens);
  ss.moveActiveSheet(1);
  ss.setActiveSheet(config);
  ss.moveActiveSheet(1);

  getAllExams_().forEach(function (ex) {
    formatRegistreSheet_(getRegistreSheet_(ex.id, true));
  });

  esborraFullBuitPerDefecte_(ss);

  if (opts.preguntar) preguntaValorsGlobals_(config);

  regenerarEnllacos_();
  ss.setActiveSheet(examens);
  ss.toast('Plantilla preparada.');
}

function preparaConfiguracio_(ss) {
  var sheet = ss.getSheetByName(SHEET_CONFIG);
  if (!sheet) sheet = ss.insertSheet(SHEET_CONFIG);

  // Capçalera només si la pestanya és nova/buida: en un Configuracio antic
  // (format d'un sol examen) la fila 1 ja té dades i no s'ha de trepitjar.
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 3).setValues([['Paràmetre', 'Valor', 'Explicació']]);
    estilCapcalera_(sheet.getRange(1, 1, 1, 3));
    sheet.setFrozenRows(1);
  }

  var labels = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues()
    .map(function (r) { return String(r[0]).trim(); });

  ['codiAdmin', 'urlPagina'].forEach(function (key) {
    var label = GLOBAL_LABELS[key];
    var idx = labels.indexOf(label);
    var row;
    if (idx === -1) {
      sheet.appendRow([label, '', GLOBAL_NOTES[key]]);
      row = sheet.getLastRow();
      labels.push(label);
    } else {
      row = idx + 1;
      sheet.getRange(row, 3).setValue(GLOBAL_NOTES[key]);
    }
    sheet.getRange(row, 1).setFontWeight('bold');
    sheet.getRange(row, 2).setBackground('#fff8e1');
    sheet.getRange(row, 3).setFontColor('#666666').setWrap(true);
  });

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 320);
  sheet.setColumnWidth(3, 480);
  return sheet;
}

function preparaExamens_(ss, ambExemple) {
  var sheet = getExamensSheet_(true);

  // Afegeix al final les capçaleres que faltin (si algú n'ha esborrat o
  // ve d'una versió anterior), sense moure les columnes existents.
  var cols = getExamColumns_(sheet);
  EXAM_KEYS_ORDER.forEach(function (key) {
    if (cols[key]) return;
    var col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue(EXAM_HEADERS[key]);
    cols[key] = col;
  });

  var lastCol = sheet.getLastColumn();
  estilCapcalera_(sheet.getRange(1, 1, 1, lastCol));
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  var maxRows = Math.max(sheet.getMaxRows(), 200);
  if (sheet.getMaxRows() < maxRows) sheet.insertRowsAfter(sheet.getMaxRows(), maxRows - sheet.getMaxRows());
  var n = maxRows - 1;

  EXAM_KEYS_ORDER.forEach(function (key) {
    var c = cols[key];
    sheet.getRange(1, c).setNote(EXAM_NOTES[key]);
    sheet.setColumnWidth(c, EXAM_WIDTHS[key]);
  });

  var col = function (key) { return sheet.getRange(2, cols[key], n, 1); };

  col('descripcio').setWrap(true);
  col('normes').setWrap(true);
  col('avisosMax').setHorizontalAlignment('center');
  col('tempsMinuts').setHorizontalAlignment('center');
  col('estat').setHorizontalAlignment('center').setFontWeight('bold');
  col('id').setFontWeight('bold');
  col('enllacAlumnat').setFontColor('#666666').setFontStyle('italic');
  sheet.getRange(2, 1, n, lastCol).setVerticalAlignment('top');

  // Validacions. Les que podrien quedar massa estrictes per errors de
  // format (ID, URL) només avisen (triangle vermell) en lloc de bloquejar.
  col('estat').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['ACTIU', 'INACTIU'], true)
    .setAllowInvalid(false)
    .setHelpText('ACTIU o INACTIU')
    .build());
  col('avisosMax').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberGreaterThanOrEqualTo(0)
    .setAllowInvalid(false)
    .setHelpText("Nombre enter ≥ 0 (0 = sense límit d'avisos)")
    .build());
  col('tempsMinuts').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberGreaterThanOrEqualTo(1)
    .setAllowInvalid(false)
    .setHelpText('Minuts (≥ 1)')
    .build());
  col('formsUrl').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireTextIsUrl()
    .setAllowInvalid(true)
    .setHelpText('Enllaç del Google Forms (https://docs.google.com/forms/...)')
    .build());
  var idA1 = sheet.getRange(2, cols.id).getA1Notation();
  col('id').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=REGEXMATCH(TO_TEXT(' + idA1 + '),"^[A-Za-z0-9_-]{1,40}$")')
    .setAllowInvalid(true)
    .setHelpText('Només lletres sense accents, números, - i _ (màx. 40)')
    .build());

  // Colors per a l'estat. Abans s'eliminen els que hagués posat una
  // execució anterior, perquè no s'acumulin.
  var estatRange = col('estat');
  var estatA1 = estatRange.getA1Notation();
  var rules = sheet.getConditionalFormatRules().filter(function (rule) {
    return !rule.getRanges().some(function (r) { return r.getA1Notation() === estatA1; });
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('ACTIU').setBackground('#d9ead3').setFontColor('#1e6b2f')
    .setRanges([estatRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('INACTIU').setBackground('#eeeeee').setFontColor('#777777')
    .setRanges([estatRange]).build());
  sheet.setConditionalFormatRules(rules);

  if (ambExemple && getAllExams_().length === 0) {
    var exemple = normalizeExam_({
      id: 'EXEMPLE',
      modul: 'M00',
      classe: '1r',
      professor: 'Nom del professor/a',
      titol: "Examen d'exemple",
      descripcio: "Esborra aquesta fila o fes-la servir per provar. Està INACTIVA.",
      normes: "- No surtis de pantalla completa.\n- No canviïs de pestanya ni d'aplicació.\n" +
        "- Envia el formulari abans que s'acabi el temps.",
      avisosMax: 3,
      tempsMinuts: 60,
      formsUrl: '',
      estat: 'INACTIU',
      codi: ''
    });
    writeExamRow_(sheet, cols, 2, exemple);
  }

  return sheet;
}

/** Capçaleres i format d'una pestanya Registre_<ID>. */
function formatRegistreSheet_(sheet) {
  if (!sheet) return;
  sheet.getRange(1, 1, 1, REGISTRE_HEADERS.length).setValues([REGISTRE_HEADERS]);
  estilCapcalera_(sheet.getRange(1, 1, 1, REGISTRE_HEADERS.length));
  sheet.setFrozenRows(1);
  var widths = [180, 230, 70, 320, 420, 120, 150];
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, REG_COLS.avisos, rows, 1).setHorizontalAlignment('center');
  sheet.getRange(2, REG_COLS.historial, rows, 1).setWrap(true);
  sheet.getRange(2, REG_COLS.timestampInici, rows, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  sheet.getRange(2, REG_COLS.token, rows, 1).setFontColor('#999999');
  sheet.getRange(2, 1, rows, REGISTRE_HEADERS.length).setVerticalAlignment('top');
}

function estilCapcalera_(range) {
  range.setFontWeight('bold')
    .setBackground(COLOR_CAPCALERA)
    .setFontColor(COLOR_CAPCALERA_TEXT)
    .setVerticalAlignment('middle')
    .setWrap(true);
}

function esborraFullBuitPerDefecte_(ss) {
  ['Full 1', 'Full1', 'Hoja 1', 'Hoja1', 'Sheet1', 'Sheet 1', 'Feuille 1'].forEach(function (nom) {
    var s = ss.getSheetByName(nom);
    if (s && s.getLastRow() === 0 && s.getLastColumn() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(s);
    }
  });
}

/**
 * Pregunta els valors globals que estiguin buits. Només funciona si s'ha
 * llançat des del menú del Sheet (des de l'editor no hi ha interfície).
 */
function preguntaValorsGlobals_(config) {
  var ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    return;
  }
  var global = getGlobalConfig_();

  if (!global.codiAdmin) {
    var r1 = ui.prompt('Codi administrador',
      'Escriu el codi que et donarà accés a tots els exàmens des del panell ⚙️ (no el comparteixis):',
      ui.ButtonSet.OK_CANCEL);
    if (r1.getSelectedButton() === ui.Button.OK && r1.getResponseText().trim()) {
      setGlobal_(config, GLOBAL_LABELS.codiAdmin, r1.getResponseText().trim());
    }
  }
  if (!global.urlPagina) {
    var r2 = ui.prompt('URL pàgina alumnat',
      'Enganxa la URL de GitHub Pages on hi ha index.html (p. ex. https://usuari.github.io/repo/). ' +
      'Si encara no la tens, deixa-ho en blanc.',
      ui.ButtonSet.OK_CANCEL);
    if (r2.getSelectedButton() === ui.Button.OK && r2.getResponseText().trim()) {
      setGlobal_(config, GLOBAL_LABELS.urlPagina, r2.getResponseText().trim().split('?')[0]);
    }
  }
}

function setGlobal_(config, label, value) {
  var labels = config.getRange(1, 1, config.getLastRow(), 1).getValues();
  for (var i = 0; i < labels.length; i++) {
    if (String(labels[i][0]).trim() === label) {
      config.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  config.appendRow([label, value]);
}
