/**
 * Calendario di famiglia - backend su Google Sheet
 * 1. Cambia la password qui sotto e lancia una volta la funzione "impostaPassword".
 * 2. Pubblica come App web (Esegui come: Me, Chi ha accesso: Chiunque).
 * Notifiche (facoltative):
 * 3. Impostazioni progetto → Proprietà script → aggiungi FIREBASE_SA con tutto il contenuto
 *    del file .json dell'account di servizio Firebase. Fuso orario del progetto: Europe/Rome.
 * 4. Lancia una volta la funzione "attivaPromemoria" (controlla ogni 5 minuti i promemoria da mandare).
 */
function impostaPassword() {
  const PASSWORD = 'cambiami';            // <-- scrivi qui la password di famiglia
  PropertiesService.getScriptProperties().setProperty('PASSWORD', PASSWORD);
  sheet_('people'); sheet_('events');     // crea i fogli se non ci sono
  Logger.log('Password impostata.');
}

const SHEETS = { people: 'Persone', events: 'Impegni', devices: 'Dispositivi' };
const APP_URL = 'https://biassoniluca-cpu.github.io/calendario-familiare/';

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
  if (p.action === 'testpush') {
    if (typeof p.token !== 'string' || !p.token) return out_({ ok: false, error: 'bad_item' });
    try {
      const r = send_([{ token: p.token, title: '🔔 Notifiche attive', body: 'Da ora riceverai qui i promemoria del calendario.', tag: 'test' }]);
      return out_(r.sent ? { ok: true } : { ok: false, error: 'fcm_error', detail: r.error });
    } catch (err) { return out_({ ok: false, error: err.message === 'no_firebase' ? 'no_firebase' : 'fcm_error', detail: String(err.message) }); }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let announce = null;
  try {
    if (p.action === 'subscribe') {
      if (typeof p.token !== 'string' || !p.token) return out_({ ok: false, error: 'bad_item' });
      const persons = Array.isArray(p.persons) ? p.persons.map(String) : [];
      put_('devices', { id: p.token, persons: persons });
      return out_({ ok: true });
    }
    if (p.action === 'unsubscribe') {
      del_('devices', String(p.token || ''));
      return out_({ ok: true });
    }
    if (p.coll !== 'people' && p.coll !== 'events') return out_({ ok: false, error: 'bad_collection' });
    if (p.action === 'put') {
      if (!p.item || typeof p.item.id !== 'string' || !p.item.id) return out_({ ok: false, error: 'bad_item' });
      put_(p.coll, p.item);
      if (p.coll === 'events' && p.announce) announce = p;
    } else if (p.action === 'delete') {
      del_(p.coll, String(p.id || ''));
    } else {
      return out_({ ok: false, error: 'bad_action' });
    }
  } finally {
    lock.releaseLock();
  }
  // "Avvisa subito": fuori dal lock, un errore di invio non annulla il salvataggio
  if (announce) {
    try {
      const ev = announce.item, title = (announce.announce === 'edit' ? '✏️ Modificato: ' : '📅 Nuovo: ') + ev.title;
      send_(messagesFor_(ev, title, whenLabel_(ev, ev.date), announce.from, 'new-' + ev.id));
    } catch (err) { Logger.log('Avviso non inviato: ' + err.message); }
  }
  return out_({ ok: true });
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

/* ---------- promemoria ---------- */

// Da lanciare una volta dall'editor: crea il controllo automatico ogni 5 minuti
function attivaPromemoria() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'inviaPromemoria').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('inviaPromemoria').timeBased().everyMinutes(5).create();
  sheet_('devices');
  fcmAccessToken_();   // verifica subito la chiave FIREBASE_SA
  Logger.log('Promemoria attivati. Fuso orario: ' + Session.getScriptTimeZone());
}

// Manda i promemoria la cui ora è caduta dall'ultimo controllo a ora
function inviaPromemoria() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const now = Date.now();
    let from = Number(props.getProperty('LAST_RUN')) || now - 5 * 60000;
    if (now - from > 30 * 60000) from = now - 30 * 60000;   // dopo una pausa lunga non recupera avvisi vecchi
    props.setProperty('LAST_RUN', String(now));
    const msgs = [], t0 = new Date(now), today = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate());
    readAll_('events').forEach(ev => {
      const before = ((ev.notify && ev.notify.before) || []).map(Number).filter(n => n >= 0);
      if (!before.length) return;
      const span = Math.ceil(Math.max.apply(null, before) / 1440) + 1;
      for (let i = -1; i <= span; i++) {
        const d = addDays_(today, i), ds = iso_(d);
        if (!occursOn_(ev, d, ds)) continue;
        const base = startOf_(ev, d).getTime();
        before.forEach(b => {
          const at = base - b * 60000;
          if (at > from && at <= now) msgs.push.apply(msgs, messagesFor_(ev, (TYPE_ICONS[ev.type] || '📌') + ' ' + ev.title + ' — ' + beforeLabel_(b), whenLabel_(ev, ds), null, ev.id + ds + b));
        });
      }
    });
    if (msgs.length) send_(msgs);
  } finally {
    lock.releaseLock();
  }
}

const TYPE_ICONS = { partita: '⚽', allenamento: '🏃', scadenza: '⏰', scuola: '🎒', salute: '🩺', altro: '📌' };
const DAYS_ = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MONTHS_ = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const pad_ = n => String(n).padStart(2, '0');
const iso_ = d => d.getFullYear() + '-' + pad_(d.getMonth() + 1) + '-' + pad_(d.getDate());
const parse_ = s => { const a = String(s).split('-').map(Number); return new Date(a[0], (a[1] || 1) - 1, a[2] || 1); };
const addDays_ = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const wd_ = d => (d.getDay() + 6) % 7;   // lun = 0
const weekStart_ = d => addDays_(d, -wd_(d));

// Stesse regole di ripetizione dell'app (index.html, occursOn)
function occursOn_(ev, d, ds) {
  if (!ev.date || ds < ev.date) return false;
  if ((ev.skip || []).indexOf(ds) >= 0) return false;
  const r = ev.rep || { freq: 'none' };
  if (!r.freq || r.freq === 'none') return ds === ev.date;
  if (r.until && ds > r.until) return false;
  const start = parse_(ev.date);
  if (r.freq === 'weekly') {
    const days = (r.days && r.days.length) ? r.days : [wd_(start)];
    if (days.indexOf(wd_(d)) < 0) return false;
    const weeks = Math.round((weekStart_(d) - weekStart_(start)) / 6048e5);
    return weeks % (r.interval || 1) === 0;
  }
  if (r.freq === 'monthly') return d.getDate() === start.getDate();
  return false;
}

// Gli impegni di tutto il giorno contano dalle 8 del mattino
function startOf_(ev, d) {
  const t = (!ev.allDay && /^\d{2}:\d{2}$/.test(ev.start || '')) ? ev.start.split(':').map(Number) : [8, 0];
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t[0], t[1]);
}

function beforeLabel_(b) {
  if (b === 0) return 'adesso';
  if (b < 60) return 'tra ' + b + ' minuti';
  if (b < 1440) return b === 60 ? 'tra 1 ora' : 'tra ' + (b / 60) + ' ore';
  if (b === 1440) return 'domani';
  if (b === 10080) return 'tra una settimana';
  return 'tra ' + (b / 1440) + ' giorni';
}

function whenLabel_(ev, ds) {
  const d = parse_(ds);
  let s = DAYS_[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_[d.getMonth()];
  if (!ev.allDay && ev.start) s += ', ' + ev.start;
  const names = (ev.who || []).map(id => { const p = PEOPLE_().filter(x => x.id === id)[0]; return p ? p.name : ''; }).filter(Boolean);
  s += ' · ' + (names.length ? names.join(', ') : 'tutta la famiglia');
  if (ev.place) s += ' · 📍 ' + ev.place;
  return s;
}
let people_ = null;
function PEOPLE_() { return people_ || (people_ = readAll_('people')); }

// Un messaggio per ogni telefono che deve ricevere l'avviso dell'impegno
function messagesFor_(ev, title, body, skipToken, tag) {
  const n = ev.notify || {};
  const to = Array.isArray(n.to) ? n.to : (ev.who || []);   // to non impostato = le persone dell'impegno
  return readAll_('devices')
    .filter(dv => dv.id !== skipToken && (!to.length || (dv.persons || []).some(id => to.indexOf(id) >= 0)))
    .map(dv => ({ token: dv.id, title: title, body: body, tag: tag }));
}

/* ---------- invio con Firebase Cloud Messaging ---------- */

function serviceAccount_() {
  const raw = PropertiesService.getScriptProperties().getProperty('FIREBASE_SA');
  if (!raw) throw new Error('no_firebase');
  return JSON.parse(raw);
}

// Token OAuth dell'account di servizio (JWT firmato RS256), tenuto in cache 50 minuti
function fcmAccessToken_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('FCM_TOKEN');
  if (hit) return hit;
  const sa = serviceAccount_(), now = Math.floor(Date.now() / 1000);
  const enc = o => Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, '');
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  });
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(unsigned, sa.private_key)).replace(/=+$/, '');
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }
  });
  const j = JSON.parse(r.getContentText());
  if (!j.access_token) throw new Error('Chiave Firebase non valida: ' + r.getContentText());
  cache.put('FCM_TOKEN', j.access_token, 3000);
  return j.access_token;
}

// msgs: [{token, title, body, tag}]. I telefoni che non esistono più vengono tolti dal foglio.
function send_(msgs) {
  if (!msgs.length) return { sent: 0 };
  const sa = serviceAccount_(), auth = 'Bearer ' + fcmAccessToken_();
  const url = 'https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send';
  const res = UrlFetchApp.fetchAll(msgs.map(m => ({
    url: url, method: 'post', contentType: 'application/json', headers: { Authorization: auth }, muteHttpExceptions: true,
    payload: JSON.stringify({ message: { token: m.token, webpush: {
      notification: { title: m.title, body: m.body, icon: APP_URL + 'icon-192.png', tag: m.tag },
      fcm_options: { link: APP_URL }
    } } })
  })));
  let sent = 0, error = '';
  res.forEach((r, i) => {
    const code = r.getResponseCode();
    if (code === 200) { sent++; return; }
    error = r.getContentText();
    if (code === 404 || /UNREGISTERED|registration token is not a valid/i.test(error)) del_('devices', msgs[i].token);
  });
  return { sent: sent, error: error };
}
