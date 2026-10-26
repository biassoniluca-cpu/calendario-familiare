/**
 * Calendario di famiglia - backend su Google Sheet
 * 1. Cambia la password qui sotto e lancia una volta la funzione "impostaPassword".
 * 2. Pubblica come App web (Esegui come: Me, Chi ha accesso: Chiunque).
 */
function impostaPassword() {
  const PASSWORD = 'cambiami';            // <-- scrivi qui la password di famiglia
  PropertiesService.getScriptProperties().setProperty('PASSWORD', PASSWORD);
  sheet_('people'); sheet_('events');     // crea i fogli se non ci sono
  Logger.log('Password impostata.');
}

const SHEETS = { people: 'Persone', events: 'Impegni' };

function doGet() {
  return out_({ ok: true, info: 'Calendario di famiglia attivo' });
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_request' }); }
  const pw = PropertiesService.getScriptProperties().getProperty('PASSWORD');
  if (!pw) return out_({ ok: false, error: 'no_password' });
  if (p.password !== pw) { Utilities.sleep(800); return out_({ ok: false, error: 'wrong_password' }); }

  if (p.action === 'list') {
    return out_({ ok: true, people: readAll_('people'), events: readAll_('events') });
  }
  if (!SHEETS[p.coll]) return out_({ ok: false, error: 'bad_collection' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (p.action === 'put') {
      if (!p.item || typeof p.item.id !== 'string' || !p.item.id) return out_({ ok: false, error: 'bad_item' });
      put_(p.coll, p.item);
      return out_({ ok: true });
    }
    if (p.action === 'delete') {
      del_(p.coll, String(p.id || ''));
      return out_({ ok: true });
    }
    return out_({ ok: false, error: 'bad_action' });
  } finally {
    lock.releaseLock();
  }
}

function sheet_(coll) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEETS[coll]);
  if (!sh) {
    sh = ss.insertSheet(SHEETS[coll]);
    sh.appendRow(['id', 'dati', 'aggiornato']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ids_(sh) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0]));
}

function readAll_(coll) {
  const sh = sheet_(coll);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 2).getValues()
    .filter(r => r[0])
    .map(r => { try { const o = JSON.parse(r[1]); o.id = String(r[0]); return o; } catch (e) { return null; } })
    .filter(Boolean);
}

function put_(coll, item) {
  const sh = sheet_(coll);
  const body = Object.assign({}, item); delete body.id;
  const json = JSON.stringify(body);
  if (json.length > 45000) throw new Error('troppo grande');
  const row = [item.id, json, new Date()];
  const i = ids_(sh).indexOf(item.id);
  if (i >= 0) sh.getRange(i + 2, 1, 1, 3).setValues([row]);
  else sh.appendRow(row);
}

function del_(coll, id) {
  const sh = sheet_(coll);
  const i = ids_(sh).indexOf(id);
  if (i >= 0) sh.deleteRow(i + 2);
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
