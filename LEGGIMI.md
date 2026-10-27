# Calendario di famiglia – installazione

Tutto gratis: i dati stanno in un Foglio Google, l'app è ospitata su GitHub Pages.
Serve farlo una volta sola (circa 15 minuti), poi i familiari usano solo link + password.

## 1. Il foglio e lo script (backend)
1. Crea un nuovo Foglio Google, ad esempio "Calendario famiglia".
2. Menu **Estensioni → Apps Script**. Cancella il contenuto e incolla tutto `apps-script/Code.gs`.
3. Nella funzione `impostaPassword` sostituisci `cambiami` con la password di famiglia.
4. In alto scegli la funzione `impostaPassword` e premi **Esegui**. Autorizza l'accesso con il tuo account Google
   (se compare "App non verificata": Avanzate → Vai al progetto).
5. **Esegui il deployment → Nuovo deployment → tipo "App web"**:
   - Esegui come: **Me**
   - Chi ha accesso: **Chiunque**
6. Copia l'URL che finisce con `/exec`.

## 2. L'app (frontend)
1. Apri `index.html` con un editor di testo, cerca `INCOLLA_QUI_URL_SCRIPT` e sostituiscilo con l'URL `/exec`.
2. Crea un account su github.com (se non ce l'hai) e un nuovo repository pubblico, es. `calendario`.
3. **Add file → Upload files**: carica tutti i file della cartella (index.html, sw.js, manifest.webmanifest, icone).
4. **Settings → Pages**: Source "Deploy from a branch", branch `main`, cartella `/ (root)` → Save.
5. Dopo un minuto l'app è su `https://biassoniluca-cpu.github.io/calendario-familiare/`.

## 3. In famiglia
Manda a tutti l'indirizzo e la password. Sul telefono:
- Android (Chrome): menu ⋮ → **Installa app**
- iPhone (Safari): Condividi → **Aggiungi alla schermata Home**

## Note
- Per cambiare password: modifica `impostaPassword`, eseguila di nuovo. Tutti dovranno reinserirla.
- Numero di versione: è in basso a sinistra in ogni schermata. A ogni modifica dell'app aumentalo in `index.html` (riga `class="ver"`) e usa lo stesso numero in `CACHE` dentro `sw.js`.
- Se modifichi `apps-script/Code.gs`: Esegui il deployment → Gestisci deployment → modifica → Nuova versione (così l'URL resta lo stesso).
- I dati sono leggibili nel foglio (schede "Persone" e "Impegni"): non modificare a mano la colonna "dati".
- Le modifiche degli altri compaiono entro ~30 secondi, o subito riaprendo l'app.

## Notifiche (facoltative)
L'app usa Firebase Cloud Messaging (progetto `calendario-famiglia-4b9ff`). I dati pubblici dell'app web sono già in `index.html` e `sw.js`.
1. In Firebase: Impostazioni progetto → Account di servizio → **Genera nuova chiave privata** (file `.json`). **Non metterlo nel repository.**
2. In Apps Script: incolla il nuovo `apps-script/Code.gs`; in ⚙ Impostazioni progetto imposta il fuso orario **(GMT+01:00) Roma** e in **Proprietà script** aggiungi `FIREBASE_SA` con tutto il contenuto del file `.json`.
3. Esegui una volta la funzione `attivaPromemoria` (accetta le autorizzazioni), poi Esegui il deployment → Gestisci deployment → modifica → **Nuova versione**.
4. Su ogni telefono: scheda Famiglia 👥 → scegli di chi è il telefono → **Attiva notifiche** → **Manda una prova**. Su iPhone serve iOS 16.4+ e l'app aggiunta alla schermata Home.
