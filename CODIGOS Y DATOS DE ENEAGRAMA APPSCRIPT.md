Todos datos Plataform Eneag


AdminDashboard: Platform - Eneagrama
// ============================================
// GOOGLE APPS SCRIPT - GESTIÓN DE USUARIOS (Admin)
// Spreadsheet separado del SuperAdmin
// Original: solo doGet + appendRow
// Nuevo: + editarUser, toggleUserStatus, resetUserPass
// ============================================

function doGet(e) {
  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = doc.getSheetByName("Admins");
    var data = sheet.getDataRange().getValues();
    
    if (data.length === 0) return createCORSResponse(JSON.stringify([]));
    
    var headers = data[0];
    var rows = data.slice(1);
    
    var jsonData = rows.map(function(row) {
      var obj = {};
      headers.forEach(function(header, index) {
        obj[header] = row[index];
      });
      return obj;
    });
    
    return createCORSResponse(JSON.stringify(jsonData));
  } catch (error) {
    return createCORSResponse(JSON.stringify({status: 'error', message: error.toString()}));
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = doc.getSheetByName("Admins");
    var datosRecibidos;
    
    // Parsear datos (form data o JSON directo)
    if (e.parameter && e.parameter.data) {
      datosRecibidos = JSON.parse(e.parameter.data);
    } else if (e.postData && e.postData.contents) {
      datosRecibidos = JSON.parse(e.postData.contents);
    }

    if (!datosRecibidos) {
      throw new Error("No se recibieron datos válidos");
    }

    var accion = datosRecibidos.accion || '';

    // ─────────────────────────────────────────
    // CREAR USUARIO (sin acción = append row) — lógica original
    // ─────────────────────────────────────────
    if (!accion && datosRecibidos.fila && Array.isArray(datosRecibidos.fila)) {
      sheet.appendRow(datosRecibidos.fila);
      return createCORSResponse(JSON.stringify({
        status: 'success',
        message: 'Guardado correctamente'
      }));
    }

    // ─────────────────────────────────────────
    // EDITAR USER (email, nombre, contraseña)
    // Usuario es ID único → no se modifica
    // ─────────────────────────────────────────
    if (accion === 'editarUser') {
      var fila = findRowByUserAndAdmin(sheet, datosRecibidos.usuario, datosRecibidos.adminId);
      if (fila === -1) throw new Error("Usuario no encontrado: " + datosRecibidos.usuario);

      var headers = getHeaders(sheet);
      if (datosRecibidos.nuevoEmail) setCell(sheet, fila, headers, 'Email_User', datosRecibidos.nuevoEmail);
      if (datosRecibidos.nuevoNombre) setCell(sheet, fila, headers, 'Nombre_User', datosRecibidos.nuevoNombre);
      if (datosRecibidos.nuevaPass) setCell(sheet, fila, headers, 'Pass_User', datosRecibidos.nuevaPass);

      return createCORSResponse(JSON.stringify({
        status: 'success',
        message: 'Usuario actualizado correctamente'
      }));
    }



    // ─────────────────────────────────────────
    // TOGGLE USER STATUS (activar / inactivar)
    // ─────────────────────────────────────────
    if (accion === 'toggleUserStatus') {
      var fila = findRowByUserAndAdmin(sheet, datosRecibidos.usuario, datosRecibidos.adminId);
      if (fila === -1) throw new Error("Usuario no encontrado: " + datosRecibidos.usuario);

      var headers = getHeaders(sheet);
      var colEstado = headers.indexOf('Estado_User');

      if (colEstado === -1) {
        // Crear columna si no existe
        var lastCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, lastCol).setValue('Estado_User');
        sheet.getRange(fila, lastCol).setValue(datosRecibidos.nuevoEstado);
      } else {
        sheet.getRange(fila, colEstado + 1).setValue(datosRecibidos.nuevoEstado);
      }

      return createCORSResponse(JSON.stringify({
        status: 'success',
        message: 'Estado actualizado a ' + datosRecibidos.nuevoEstado
      }));
    }

    // ─────────────────────────────────────────
    // RESET USER PASSWORD
    // ─────────────────────────────────────────
    if (accion === 'resetUserPass') {
      var fila = findRowByUserAndAdmin(sheet, datosRecibidos.usuario, datosRecibidos.adminId);
      if (fila === -1) throw new Error("Usuario no encontrado: " + datosRecibidos.usuario);

      var headers = getHeaders(sheet);
      var colPass = headers.indexOf('Pass_User');
      if (colPass === -1) throw new Error("Columna Pass_User no encontrada");

      sheet.getRange(fila, colPass + 1).setValue(datosRecibidos.nuevaPass);

      return createCORSResponse(JSON.stringify({
        status: 'success',
        message: 'Contraseña actualizada correctamente'
      }));
    }



    // ─────────────────────────────────────────
    // ✅ NUEVA ACCIÓN: EDITAR PACK LÍDER
    // ─────────────────────────────────────────
    if (accion === 'editarUserPack') {
      var fila = findRowByUserAndAdmin(sheet, datosRecibidos.usuario, datosRecibidos.adminId);
      if (fila === -1) throw new Error("Usuario no encontrado");

      var headers = getHeaders(sheet);
      var colPack = headers.indexOf('Pack_Status');

      if (colPack === -1) {
        var lastCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, lastCol).setValue('Pack_Status');
        sheet.getRange(fila, lastCol).setValue(datosRecibidos.valor);
      } else {
        sheet.getRange(fila, colPack + 1).setValue(datosRecibidos.valor);
      }

      return createCORSResponse(JSON.stringify({
        status: 'success',
        message: 'Pack actualizado correctamente'
      }));
    }

    // Si llegó aquí sin match
    if (!accion && !datosRecibidos.fila) {
      throw new Error("No se recibió ni 'fila' ni 'accion' válida");
    }
    throw new Error("Acción no reconocida: " + accion);

  } catch (error) {
    return createCORSResponse(JSON.stringify({status: 'error', message: error.toString()}));
  } finally {
    lock.releaseLock();
  }
}



// ════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ════════════════════════════════════════════

/** Headers de la primera fila */
function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

/**
 * Busca fila por User + Usuario_Admin
 * (seguridad: admin solo modifica SUS usuarios)
 * Retorna fila 1-based o -1
 */
function findRowByUserAndAdmin(sheet, usuario, adminId) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colUser = headers.indexOf('User');
  var colAdmin = headers.indexOf('Usuario_Admin');

  if (colUser === -1) return -1;

  for (var i = 1; i < data.length; i++) {
    var matchUser = String(data[i][colUser]).trim() === String(usuario).trim();
    var matchAdmin = (colAdmin === -1) || String(data[i][colAdmin]).trim() === String(adminId).trim();
    if (matchUser && matchAdmin) {
      return i + 1;
    }
  }
  return -1;
}

/** Actualiza celda si la columna existe */
function setCell(sheet, fila, headers, colName, value) {
  var col = headers.indexOf(colName);
  if (col !== -1 && value !== undefined && value !== null) {
    sheet.getRange(fila, col + 1).setValue(value);
  }
}

function createCORSResponse(content) {
  return ContentService.createTextOutput(content).setMimeType(ContentService.MimeType.JSON);
}
Link: https://script.google.com/macros/s/AKfycbyacVBqleU3QDqIcucMvuRuqh8FBIcvEldEkppl74KCRa0IFlFfe6UUSsimhh9W15zJmw/exec


-----------------------
SuperAdminDashboard: Platform - Eneagrama

// ============================================
// CÓDIGO ORIGINAL RESTAURADO Y ACTUALIZADO
// NO SE ELIMINÓ NINGUNA FUNCIÓN EXISTENTE
// ============================================

function doGet(e) {
  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = doc.getSheetByName("Admins");
    
    var data = sheet.getDataRange().getValues();
    
    if (data.length === 0) {
      return createCORSResponse(JSON.stringify([]));
    }
    
    var headers = data[0];
    var rows = data.slice(1);
    
    var jsonData = rows.map(function(row) {
      var obj = {};
      headers.forEach(function(header, index) {
        obj[header] = row[index];
      });
      return obj;
    });
    
    return createCORSResponse(JSON.stringify(jsonData));
    
  } catch (error) {
    return createCORSResponse(JSON.stringify({
      status: 'error',
      message: error.toString()
    }));
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = doc.getSheetByName("Admins");
    var datosRecibidos;
    
    // 1. TUS 3 MÉTODOS DE PARSEO ORIGINALES (INTACTOS)
    if (e.postData && e.postData.contents) {
      try {
        datosRecibidos = JSON.parse(e.postData.contents);
      } catch (jsonError) {}
    }
    
    if (!datosRecibidos && e.parameter && e.parameter.data) {
      try {
        datosRecibidos = JSON.parse(e.parameter.data);
      } catch (formError) {
        throw new Error("No se pudo parsear los datos: " + formError.toString());
      }
    }
    
    if (!datosRecibidos && e.parameters) {
      datosRecibidos = {
        fila: [
          e.parameters.Email_SuperAdmin ? e.parameters.Email_SuperAdmin[0] : '',
          e.parameters.Usuario_Admin ? e.parameters.Usuario_Admin[0] : '',
          e.parameters.Pass_Admin ? e.parameters.Pass_Admin[0] : '',
          e.parameters.Email_Admin ? e.parameters.Email_Admin[0] : '',
          e.parameters.Fecha_Alta ? e.parameters.Fecha_Alta[0] : '',
          e.parameters.Estado ? e.parameters.Estado[0] : 'activo'
        ]
      };
    }
    
    if (!datosRecibidos) {
      throw new Error("No se recibieron datos válidos");
    }
    
    if (datosRecibidos.nombreHoja) {
       sheet = doc.getSheetByName(datosRecibidos.nombreHoja);
    }

    // --- DEFINICIÓN DE ACCIÓN ---
    var accion = datosRecibidos.accion || '';

    // ──────────────────────────────────────────────────────────
    // ✅ NUEVA ACCIÓN AGREGADA: editarAdmin (PARA EL PACK LÍDER)
    // ──────────────────────────────────────────────────────────
    if (accion === 'editarAdmin') {
      var fila = findRowByUsuario(sheet, datosRecibidos.usuario);
      if (fila === -1) throw new Error("Usuario no encontrado: " + datosRecibidos.usuario);

      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var colPack = headers.indexOf('Pack_Status');

      // Si la columna no existe, la crea
      if (colPack === -1) {
        var lastCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, lastCol).setValue('Pack_Status');
        sheet.getRange(fila, lastCol).setValue(datosRecibidos.valor);
      } else {
        sheet.getRange(fila, colPack + 1).setValue(datosRecibidos.valor);
      }

      return createCORSResponse(JSON.stringify({
        status: 'success',
        message: 'Permisos de Pack actualizados'
      }));
    }

    // ──────────────────────────────────────────────────────────
    // TUS ACCIONES ORIGINALES (INTACTAS)
    // ──────────────────────────────────────────────────────────

    // ACCIÓN: CREAR
    if (!accion && Array.isArray(datosRecibidos.fila)) {
      sheet.appendRow(datosRecibidos.fila);
      return createCORSResponse(JSON.stringify({
        status: 'success',
        message: 'Administrador creado correctamente'
      }));
    }

    // ACCIÓN: EDITAR
    if (accion === 'editar') {
      var fila = findRowByUsuario(sheet, datosRecibidos.usuario);
      if (fila === -1) throw new Error("Usuario no encontrado: " + datosRecibidos.usuario);

      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var colEmail = headers.indexOf('Email_Admin');
      var colPass = headers.indexOf('Pass_Admin');

      if (datosRecibidos.nuevoEmail && colEmail !== -1) {
        sheet.getRange(fila, colEmail + 1).setValue(datosRecibidos.nuevoEmail);
      }
      if (datosRecibidos.nuevaPass && colPass !== -1) {
        sheet.getRange(fila, colPass + 1).setValue(datosRecibidos.nuevaPass);
      }

      return createCORSResponse(JSON.stringify({
        status: 'success',
        message: 'Administrador actualizado correctamente'
      }));
    }

    // ACCIÓN: TOGGLE STATUS
    if (accion === 'toggleStatus') {
      var fila = findRowByUsuario(sheet, datosRecibidos.usuario);
      if (fila === -1) throw new Error("Usuario no encontrado: " + datosRecibidos.usuario);

      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var colEstado = headers.indexOf('Estado');

      if (colEstado === -1) {
        var lastCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, lastCol).setValue('Estado');
        sheet.getRange(fila, lastCol).setValue(datosRecibidos.nuevoEstado);
      } else {
        sheet.getRange(fila, colEstado + 1).setValue(datosRecibidos.nuevoEstado);
      }

      return createCORSResponse(JSON.stringify({
        status: 'success',
        message: 'Estado actualizado'
      }));
    }

    // ACCIÓN: RESET PASS
    if (accion === 'resetPass') {
      var fila = findRowByUsuario(sheet, datosRecibidos.usuario);
      if (fila === -1) throw new Error("Usuario no encontrado");

      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var colPass = headers.indexOf('Pass_Admin');
      sheet.getRange(fila, colPass + 1).setValue(datosRecibidos.nuevaPass);

      return createCORSResponse(JSON.stringify({
        status: 'success',
        message: 'Contraseña actualizada'
      }));
    }

    // ACCIÓN: BORRAR
    if (accion === 'borrar') {
      var fila = findRowByUsuario(sheet, datosRecibidos.usuario);
      if (fila === -1) throw new Error("Usuario no encontrado");
      sheet.deleteRow(fila);
      return createCORSResponse(JSON.stringify({
        status: 'success',
        message: 'Eliminado correctamente'
      }));
    }

    throw new Error("Acción no reconocida: " + accion);

  } catch (error) {
    return createCORSResponse(JSON.stringify({
      status: 'error',
      message: error.toString()
    }));
  } finally {
    lock.releaseLock();
  }
}

function findRowByUsuario(sheet, usuario) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colUsuario = headers.indexOf('Usuario_Admin');
  if (colUsuario === -1) return -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colUsuario]).trim() === String(usuario).trim()) {
      return i + 1; 
    }
  }
  return -1;
}

function createCORSResponse(content) {
  return ContentService.createTextOutput(content).setMimeType(ContentService.MimeType.JSON);
}
Link: https://script.google.com/macros/s/AKfycbyv5RTuSa-NVRVpsLMseHf1raa3DK5bS7MB63Jw9WIIN3Q-w3haCR38imPBz1Cx_XZd/exec

--------------------------------------

Respuestas Test: Platform - Eneagrama
/**
 * ============================================
 * GOOGLE APPS SCRIPT - RESPUESTAS TEST ENEAGRAMA
 * Escencial Consultora
 * --------------------------------------------
 * Flujo robusto en 2 pasos + envío de emails:
 *
 * PASO 1 (sin accion):
 *  - Recibe {nombreHoja, fila:[...]}
 *  - Agrega columnas: Eneagrama_Id, Informe_Pdf, Email_Enviado
 *  - appendRow(...)
 *  - Devuelve JSON: {success:true, eneagrama_id, row}
 *
 * PASO 2 (accion:'guardarPdf'):
 *  - Sube PDF a Drive, actualiza fila
 *  - Devuelve JSON: {success:true, url, row, eneagrama_id}
 *
 * TRIGGER (cada 30 min):
 *  - enviarInformesPendientes()
 *  - Busca filas con Informe_Pdf lleno y Email_Enviado vacío
 *  - Descarga PDF de Drive, envía email estilizado a Admin y Usuario
 *  - Marca Email_Enviado con fecha/hora
 *  - Deduplicación: solo envía el informe MÁS RECIENTE por evaluado
 *
 * ============================================
 */

var CARPETA_PDF_ID = '1nqvwnhaYNbwTPHOqd7lwuANtyimVk993';

var HEADER_ENEAGRAMA_ID = 'Eneagrama_Id';
var HEADER_PDF_URL = 'Informe_Pdf';
var HEADER_EMAIL_SENT = 'Email_Enviado';

// ─── Utilidades ───────────────────────────────────────

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function autorizarDrive() {
  var folder = DriveApp.getFolderById(CARPETA_PDF_ID);
  Logger.log('OK folder name: ' + folder.getName());
  GmailApp.getAliases();
  Logger.log('OK Gmail autorizado');
}

function parsePayload(e) {
  var datos = null;
  if (e && e.parameter && e.parameter.data) {
    try {
      datos = JSON.parse(e.parameter.data);
      Logger.log('Parseado desde e.parameter.data');
    } catch (err) {
      Logger.log('Error parseando e.parameter.data: ' + err);
    }
  }
  if (!datos && e && e.postData && e.postData.contents) {
    try {
      datos = JSON.parse(e.postData.contents);
      Logger.log('Parseado desde e.postData.contents');
    } catch (err) {
      Logger.log('Error parseando e.postData.contents: ' + err);
    }
  }
  return datos;
}

// ─── Headers / Columnas ───────────────────────────────

function ensureHeadersAndGetCols(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) lastCol = 1;

  var headerRange = sheet.getRange(1, 1, 1, lastCol);
  var headers = headerRange.getValues()[0];

  var hasAnyHeader = headers.some(function (h) { return String(h || '').trim() !== ''; });

  if (!hasAnyHeader) {
    headers = [];
    for (var c = 1; c <= lastCol; c++) headers.push('Col_' + c);
    headers.push(HEADER_ENEAGRAMA_ID);
    headers.push(HEADER_PDF_URL);
    headers.push(HEADER_EMAIL_SENT);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    Logger.log('Headers creados automaticamente');
  } else {
    var newHeaders = headers.slice();
    if (newHeaders.indexOf(HEADER_ENEAGRAMA_ID) === -1) newHeaders.push(HEADER_ENEAGRAMA_ID);
    if (newHeaders.indexOf(HEADER_PDF_URL) === -1) newHeaders.push(HEADER_PDF_URL);
    if (newHeaders.indexOf(HEADER_EMAIL_SENT) === -1) newHeaders.push(HEADER_EMAIL_SENT);

    if (newHeaders.length !== headers.length) {
      sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
      Logger.log('Headers extendidos: ' + newHeaders.join(', '));
    }
    headers = newHeaders;
  }

  return {
    headers: headers,
    colEneagrama: headers.indexOf(HEADER_ENEAGRAMA_ID) + 1,
    colPdf: headers.indexOf(HEADER_PDF_URL) + 1,
    colSent: headers.indexOf(HEADER_EMAIL_SENT) + 1
  };
}

// ─── doPost ──────────────────────────────────────────

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(60000);

  try {
    var datosRecibidos = parsePayload(e);
    if (!datosRecibidos) {
      return jsonOut({ success: false, error: 'No se pudieron parsear los datos' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var nombreHoja = datosRecibidos.nombreHoja || 'Respuestas';
    var sheet = ss.getSheetByName(nombreHoja);
    if (!sheet) {
      return jsonOut({ success: false, error: 'No existe la hoja: ' + nombreHoja });
    }

    var accion = datosRecibidos.accion || '';
    Logger.log('Accion: ' + (accion || 'PASO 1 (appendRow)'));

    var cols = ensureHeadersAndGetCols(sheet);

// ── PASO 1: Guardar fila ──
if (!accion && Array.isArray(datosRecibidos.fila)) {
  var filaEntrante = datosRecibidos.fila;
  var userEvaluado = String(filaEntrante[3] || '').trim(); // Col D = User/Username

  // ✅ Buscar si ya existe fila para este usuario evaluado
  if (userEvaluado) {
    var lastRow2 = sheet.getLastRow();
    if (lastRow2 >= 2) {
      var allData = sheet.getRange(2, 1, lastRow2 - 1, sheet.getLastColumn()).getValues();
      var colsH   = ensureHeadersAndGetCols(sheet);
      var colUser = colsH.headers.indexOf('User');
      var colId   = colsH.headers.indexOf('Eneagrama_Id');

      if (colUser >= 0 && colId >= 0) {
        for (var i2 = allData.length - 1; i2 >= 0; i2--) {
          var userExistente = String(allData[i2][colUser] || '').trim();
          var idExistente2  = String(allData[i2][colId]   || '').trim();
          if (userExistente.toLowerCase() === userEvaluado.toLowerCase() && idExistente2) {
            Logger.log('Duplicado detectado para user: ' + userEvaluado + ' → row=' + (i2 + 2));
            return jsonOut({ success: true, eneagrama_id: idExistente2, row: i2 + 2, _duplicado: true });
          }
        }
      }
    }
  }

  // No existe → insertar nueva fila
  var eneagramaId = Utilities.getUuid();
  var filaCompleta = filaEntrante.slice();
  filaCompleta.push(eneagramaId);
  filaCompleta.push('');
  filaCompleta.push('');

  sheet.appendRow(filaCompleta);
  var row = sheet.getLastRow();

  Logger.log('Fila guardada. Row=' + row + ' Eneagrama_Id=' + eneagramaId);
  return jsonOut({ success: true, eneagrama_id: eneagramaId, row: row });
}

    // ── PASO 2: Subir PDF ──
    if (accion === 'guardarPdf') {
      var pdfBase64 = datosRecibidos.pdfBase64;
      var nombrePdf = datosRecibidos.pdfNombre || 'Informe_Eneagrama.pdf';
      var targetRow = parseInt(datosRecibidos.row, 10);
      var eneagramaId2 = datosRecibidos.eneagrama_id || '';

      if (!pdfBase64 || pdfBase64.length < 100) {
        return jsonOut({ success: false, error: 'pdfBase64 vacio o muy corto', len: pdfBase64 ? pdfBase64.length : 0 });
      }
      if (!targetRow || targetRow < 2) {
        return jsonOut({ success: false, error: 'Falta row valido para actualizar Informe_Pdf' });
      }

      Logger.log('PDF recibido: ' + Math.round(pdfBase64.length / 1024) + ' KB');

      var bytes = Utilities.base64Decode(pdfBase64);
      var blob = Utilities.newBlob(bytes, 'application/pdf', nombrePdf);
      var folder = DriveApp.getFolderById(CARPETA_PDF_ID);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var pdfUrl = file.getUrl();
      Logger.log('PDF en Drive: ' + pdfUrl);

      sheet.getRange(targetRow, cols.colPdf).setValue(pdfUrl);
      if (eneagramaId2 && cols.colEneagrama) {
        sheet.getRange(targetRow, cols.colEneagrama).setValue(eneagramaId2);
      }

      return jsonOut({ success: true, url: pdfUrl, row: targetRow, eneagrama_id: eneagramaId2 || null });
    }

    return jsonOut({ success: false, error: 'Accion no reconocida', accion: accion });

  } catch (error) {
    Logger.log('ERROR: ' + error);
    return jsonOut({ success: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════
// TRIGGER: ENVIAR INFORMES PENDIENTES (cada 30 min)
// ═══════════════════════════════════════════════════════

/**
 * Ejecutar manualmente UNA VEZ para crear el trigger de 30 min.
 */
function crearTrigger30Min() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'enviarInformesPendientes') {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log('Trigger anterior eliminado');
    }
  }
  ScriptApp.newTrigger('enviarInformesPendientes')
    .timeBased()
    .everyMinutes(30)
    .create();
  Logger.log('Trigger creado: enviarInformesPendientes cada 30 minutos');
}


/**
 * Busca filas con PDF listo y email no enviado.
 * DEDUPLICACION: si hay varias filas pendientes para el mismo evaluado
 * (mismo Correo), solo envia la MAS RECIENTE y marca todas como enviadas.
 */
function enviarInformesPendientes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Respuestas');
  if (!sheet) { Logger.log('No existe hoja Respuestas'); return; }

  var cols = ensureHeadersAndGetCols(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('Sin datos'); return; }

  var headers = cols.headers;

  // Mapear columnas por nombre (0-based)
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[String(headers[h]).trim()] = h;
  }

  // Verificar columnas necesarias
  var requiredCols = ['Email_Admin', 'Correo', 'Nombre', 'Apellido', 'Usuario_Admin', 'Fecha', HEADER_PDF_URL, HEADER_EMAIL_SENT];
  for (var r = 0; r < requiredCols.length; r++) {
    if (colMap[requiredCols[r]] === undefined) {
      Logger.log('Falta columna: ' + requiredCols[r]);
      return;
    }
  }

  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  // ────────────────────────────────────────────────
  // DEDUPLICACION: agrupar filas pendientes por Correo del evaluado.
  // Solo se envia la ultima (mas reciente) de cada evaluado.
  // Las anteriores se marcan como "Omitido (duplicado)".
  // ────────────────────────────────────────────────
  var pendientesPorCorreo = {};

  for (var i = 0; i < data.length; i++) {
    var fila = data[i];
    var pdfUrl = String(fila[colMap[HEADER_PDF_URL]] || '').trim();
    var yaEnviado = String(fila[colMap[HEADER_EMAIL_SENT]] || '').trim();

    if (!pdfUrl || pdfUrl.length < 10 || yaEnviado !== '') continue;

    var emailUser = String(fila[colMap['Correo']] || '').trim().toLowerCase();
    var clave = emailUser || ('fila_' + i);

    if (!pendientesPorCorreo[clave]) {
      pendientesPorCorreo[clave] = [];
    }
    pendientesPorCorreo[clave].push(i);
  }

  var enviados = 0;
  var ahora = new Date().toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });

  for (var clave in pendientesPorCorreo) {
    var indices = pendientesPorCorreo[clave];

    // La ultima fila (mas reciente) es la que enviamos
    var idxEnviar = indices[indices.length - 1];

    // Marcar las anteriores como duplicado sin enviar email
    for (var d = 0; d < indices.length - 1; d++) {
      var rowDup = indices[d] + 2;
      sheet.getRange(rowDup, cols.colSent).setValue('Omitido (duplicado) - ' + ahora);
      Logger.log('Fila ' + rowDup + ' marcada como duplicado');
    }

    // Enviar solo la mas reciente
    var fila = data[idxEnviar];
    var rowNum = idxEnviar + 2;
    var pdfUrl = String(fila[colMap[HEADER_PDF_URL]] || '').trim();
    var emailAdmin = String(fila[colMap['Email_Admin']] || '').trim();
    var emailUser = String(fila[colMap['Correo']] || '').trim();
    var nombre = String(fila[colMap['Nombre']] || '').trim();
    var apellido = String(fila[colMap['Apellido']] || '').trim();
    var adminName = String(fila[colMap['Usuario_Admin']] || '').trim();
    var fecha = String(fila[colMap['Fecha']] || '').trim();

    var nombreCompleto = (nombre + ' ' + apellido).trim() || 'Evaluado';

    // Recopilar destinatarios (sin duplicar)
    
    //var destinatarios = [];
    //if (emailAdmin && emailAdmin.indexOf('@') > 0) destinatarios.push(emailAdmin);
    //if (emailUser && emailUser.indexOf('@') > 0 && emailUser.toLowerCase() !== emailAdmin.toLowerCase()) {
     // destinatarios.push(emailUser);
    //}
    // Enviar solo al admin
// Enviar solo al usuario evaluado
var destinatarios = [];
if (emailUser && emailUser.indexOf('@') > 0) {
  destinatarios.push(emailUser);
}

    if (destinatarios.length === 0) {
      Logger.log('Fila ' + rowNum + ': sin emails validos. Saltando.');
      sheet.getRange(rowNum, cols.colSent).setValue('Sin emails - ' + ahora);
      continue;
    }

    try {
      // NO descargar PDF, NO adjuntar

      var subject = 'Informe Eneagrama | ' + nombreCompleto;
      var htmlBody = construirEmailHTML(nombreCompleto, adminName, fecha, pdfUrl);

var mailOptions = {
    htmlBody: htmlBody,
    name: 'Escencial Consultora - Test Eneagrama',
    cc: emailAdmin
};

      // Cuerpo de texto plano (fallback si el cliente no soporta HTML)
      var plainBody = 'Su Informe Eneagrama ya está disponible. Acceda aquí: ' + pdfUrl;

      GmailApp.sendEmail(destinatarios.join(','), subject, plainBody, mailOptions);

      sheet.getRange(rowNum, cols.colSent).setValue('Enviado - ' + ahora);

      enviados++;
      Logger.log('Email enviado fila ' + rowNum + ' -> ' + destinatarios.join(', '));

    } catch (err) {
      Logger.log('Error enviando fila ' + rowNum + ': ' + err);
      sheet.getRange(rowNum, cols.colSent).setValue('Error: ' + String(err).slice(0, 80));
    }

  }

  Logger.log('Envio finalizado. Total enviados: ' + enviados);
}


/**
 * Descarga el PDF desde Google Drive a partir de su URL.
 */
function obtenerPdfDesdeDrive(url) {
  try {
    // Primero intentar extraer ID del formato /d/FILE_ID/
    var match = url.match(/\/d\/([-\w]+)/);
    if (!match) {
      // Fallback: buscar cualquier string largo tipo ID
      match = url.match(/([-\w]{25,})/);
    }
    if (!match) return null;
    var fileId = match[1];
    var file = DriveApp.getFileById(fileId);
    return file.getBlob().setName(file.getName());
  } catch (err) {
    Logger.log('No se pudo descargar PDF: ' + err);
    return null;
  }
}


// ═══════════════════════════════════════════════════════
// EMAIL HTML ESTILIZADO ENEAGRAMA
// Sin caracteres emoji Unicode (compatibilidad total)
// ═══════════════════════════════════════════════════════

function construirEmailHTML(nombreCompleto, adminName, fecha, pdfUrl) {

  // Formatear fecha legible
  var fechaMostrar = fecha;
  try {
    var d = new Date(fecha);
    if (!isNaN(d.getTime())) {
      fechaMostrar = d.toLocaleDateString('es-AR', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
    }
  } catch (e) {
    // Usar fecha tal cual viene
  }

  return '<!DOCTYPE html>' +
  '<html><head><meta charset="UTF-8"></head>' +
  '<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:Segoe UI,Helvetica,Arial,sans-serif;">' +

  '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:30px 0;">' +
  '<tr><td align="center">' +
  '<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">' +

  // ── Header con gradiente ──
  '<tr><td style="background:linear-gradient(135deg,#0b4a6e 0%,#020f27 100%);padding:40px 30px;text-align:center;">' +
  '<h1 style="color:#ffffff;margin:0;font-size:32px;font-weight:700;letter-spacing:2px;">Eneagrama</h1>' +
  '<p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;letter-spacing:0.5px;">Informe de Perfil Profesional</p>' +
  '</td></tr>' +

  // ── Badge principal Eneagrama ──
  '<tr><td style="padding:20px 30px 10px;text-align:center;">' +
  '<span style="display:inline-block;background:#eef2ff;color:#1e3a8a;padding:8px 18px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.5px;">' +
  'INFORME PERSONALIZADO DE ENEAGRAMA' +
  '</span>' +
  '</td></tr>' +

  // ── Separador ──
  '<tr><td style="padding:0 30px;"><hr style="border:none;height:1px;background:#e2e8f0;margin:15px 0;"></td></tr>' +

  // ── Saludo ──
  '<tr><td style="padding:10px 30px 5px;">' +
  '<p style="color:#1e293b;font-size:16px;margin:0;">Estimado/a <strong>' + nombreCompleto + '</strong>,</p>' +
  '</td></tr>' +

  // ── Mensaje principal ──
  '<tr><td style="padding:10px 30px;">' +
  '<p style="color:#475569;font-size:15px;line-height:1.7;margin:0;">' +
  'Le informamos que su <strong>Informe de Perfil Profesional Eneagrama</strong> ha sido generado exitosamente. ' +
  'Este documento contiene el an&aacute;lisis completo de su eneatipo dominante, la distribuci&oacute;n de sus puntajes entre los nueve tipos, visualizaciones detalladas y recomendaciones personalizadas para su desarrollo personal y profesional.' +
  '</p>' +
  '</td></tr>' +

  // ── Tarjeta de datos ──
  '<tr><td style="padding:15px 30px;">' +
  '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">' +
  '<tr><td style="padding:20px;">' +
  '<table width="100%" cellpadding="0" cellspacing="0">' +
  '<tr>' +
  '<td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;width:140px;">Evaluado:</td>' +
  '<td style="padding:6px 0;color:#1e293b;font-size:14px;font-weight:500;">' + nombreCompleto + '</td>' +
  '</tr>' +
  '<tr>' +
  '<td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;">Administrador:</td>' +
  '<td style="padding:6px 0;color:#1e293b;font-size:14px;font-weight:500;">' + (adminName || '&mdash;') + '</td>' +
  '</tr>' +
  '<tr>' +
  '<td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;">Fecha:</td>' +
  '<td style="padding:6px 0;color:#1e293b;font-size:14px;font-weight:500;">' + (fechaMostrar || '&mdash;') + '</td>' +
  '</tr>' +
  '</table>' +
  '</td></tr>' +
  '</table>' +
  '</td></tr>' +

  // ── Nota acceso online ──
  '<tr><td style="padding:10px 30px;">' +
  '<p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">' +
  'Su informe Eneagrama est&aacute; disponible en l&iacute;nea. Puede acceder al documento completo desde el siguiente bot&oacute;n:' +
  '</p>' +
  '</td></tr>' +

  // ── Botón PDF ──
  '<tr><td style="padding:10px 30px 20px;text-align:center;">' +
  '<a href="' + pdfUrl + '" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#0b4a6e 0%,#020f27 100%);color:#ffffff;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">' +
  'Ver Informe Eneagrama' +
  '</a>' +
  '</td></tr>' +

  // ── Separador final ──
  '<tr><td style="padding:0 30px;"><hr style="border:none;height:1px;background:#e2e8f0;margin:10px 0;"></td></tr>' +

  // ── Footer ──
  '<tr><td style="padding:20px 30px 30px;text-align:center;">' +
  '<p style="color:#94a3b8;font-size:12px;margin:0 0 4px;">Este es un correo autom&aacute;tico generado por el sistema de evaluaciones ENEAGRAMA.</p>' +
  '<p style="color:#94a3b8;font-size:12px;margin:0 0 10px;">Por favor no responda a este mensaje.</p>' +
  '<p style="color:#0b4a6e;font-size:13px;font-weight:600;margin:0;">Escencial Consultora</p>' +
  '</td></tr>' +

  '</table>' +
  '</td></tr></table>' +
  '</body></html>'; 
}

Link: https://script.google.com/macros/s/AKfycbwiNTw_bEsfSyzQmRKbvaXO2eqVFVlNheSHLAQi5-YYMVkyaBCJdO0aaf786N8-a3b1/exec

------------------------------------

Visualizacion Test: Platform - Eneagrama
function doGet(e) {

  var sheetId = "1hxhEZbQTstsdSEtDySjU108GNoPgotsHAW-mLtPovok";
  var nombreHoja = "Respuestas";

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(nombreHoja);

  var userParam = e && e.parameter && e.parameter.user 
    ? String(e.parameter.user).trim() 
    : null;

  var data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: "Sin datos" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var headers = data[0];
  var rows = data.slice(1);

  for (var i = 0; i < rows.length; i++) {

    var row = rows[i];
    var obj = {};

    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }

    // 🔎 Si coincide el User, devolvemos TODO el objeto completo
    if (userParam && String(obj.User).trim() === userParam) {

      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          data: obj
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ❌ Si no lo encontró
  return ContentService
    .createTextOutput(JSON.stringify({
      success: false,
      message: "Usuario no encontrado"
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

Link: https://script.google.com/macros/s/AKfycbyYy3Wgyqr5h60eaSuCAds9zu1i2vpN1pTuTl31HGh33V7KiSzMuwilnog2UCNw78SKMA/exec

----------

Link de la carpeta donde caen los informes: https://drive.google.com/drive/folders/1nqvwnhaYNbwTPHOqd7lwuANtyimVk993


