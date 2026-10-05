// Sprachen und alle Texte, die die Node-Dateien ausgeben (Konsole, Fehlermeldungen, Antworten an die Oberfläche).
//   t(lang, 'run.summary', { name: 'Tweakable DJ', songs: 50, … }) → Text mit eingesetzten {Platzhaltern}
// Einzahl und Mehrzahl: {songs|# Song|# Songs} → "1 Song" bzw. "50 Songs"; # = die Zahl im Format der Sprache (de-AT: 1 234 mit geschütztem Leerzeichen, en-US: 1,234).
// Nur die Zahl im Format der Sprache, ohne Wort danach: {hits|#|#}. {name} allein setzt den Wert unverändert ein (z. B. Fehlercodes).

export const LANGS = ['de', 'en'];

// Für Zahlen und Datum (z. B. 1 234 bzw. 1,234; 5.10.2026 bzw. 10/5/2026). ui.html verwendet dieselben.
const LOCALES = { de: 'de-AT', en: 'en-US' };

const valid = v => (typeof v === 'string' && LANGS.includes(v.toLowerCase()) ? v.toLowerCase() : null);

// Sprache des Systems: TWEAKABLE_DJ_LANG, sonst LC_ALL/LC_MESSAGES/LANG, sonst die Spracheinstellung von Node.js.
export function systemLang(env = process.env) {
  let value = env.TWEAKABLE_DJ_LANG || env.LC_ALL || env.LC_MESSAGES || env.LANG;
  if (!value) {
    try {
      value = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      value = '';
    }
  }
  return /^de/i.test(value) ? 'de' : 'en';
}

// 'de'/'en' gewinnt, sonst der Hinweis (z. B. cfg.language), sonst die Systemsprache.
export const resolveLang = (value, hint) => valid(value) ?? valid(hint) ?? systemLang();

export const locale = lang => LOCALES[valid(lang) ?? 'en'];

// Text in der Sprache lang (unbekannt oder fehlend: Englisch); {name} wird durch params.name ersetzt,
// {name|eins|mehr} durch "eins" (genau 1) bzw. "mehr" (sonst), # darin durch die Zahl.
export function t(lang, key, params = {}) {
  const l = valid(lang) ?? 'en';
  const text = MESSAGES[l][key] ?? MESSAGES.en[key] ?? key;
  return text.replace(/\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g, (m, name, one, many) => {
    if (!(name in params)) return m;
    if (one === undefined) return String(params[name]);
    const n = Number(params[name]);
    return (n === 1 ? one : many).replace(/#/g, n.toLocaleString(LOCALES[l]));
  });
}

// Fehler mit übersetzter Meldung und Zusatzangaben, z. B. { errorCode: 'login_expired' }.
export const tError = (lang, key, params, props = {}) => Object.assign(new Error(t(lang, key, params)), props);

export const MESSAGES = {
  de: {
    // --- Allgemein ---
    'node.tooOld': 'Tweakable DJ braucht Node.js 18 oder neuer, installiert ist {version}. Bitte die aktuelle LTS-Version von https://nodejs.org installieren.',

    // --- config.mjs ---
    'config.invalid': 'config.jsonc ist fehlerhaft ({detail}). Häufige Ursache: fehlendes oder überzähliges Komma.',
    'config.created': 'config.jsonc wurde angelegt – bitte in der Oberfläche (Tweakable DJ.cmd bzw. .command, unter Linux start.sh) einrichten oder die Datei ausfüllen: {file}',
    'config.incomplete': 'Einrichtung nicht abgeschlossen – in der Oberfläche (Tweakable DJ.cmd bzw. .command, unter Linux start.sh) einrichten oder in config.jsonc ausfüllen: {missing}',
    'config.userOrEmpty': 'lastfm.user (oder leer lassen)',
    'config.unknownSetting': 'Unbekannte Einstellung: {key}',
    'config.unknownField': 'Unbekanntes Feld: {name}',
    'config.listExpected': '{key}: Liste von Texten erwartet',
    'config.entryTooLong': '{key}: Eintrag zu lang',
    'config.typeExpected': '{key}: {type} erwartet',
    'config.badInteger': '{key} in config.jsonc muss eine ganze Zahl von {min} bis {max} sein (derzeit {value}).',
    'config.badNumber': '{key} in config.jsonc muss eine Zahl von {min} bis {max} sein (derzeit {value}).',
    'config.badText': '{key}: ungültiger Text',
    'config.badSchedule': 'schedule: "off", "daily" oder "weekly" erwartet',
    'config.badTime': 'scheduleTime: Uhrzeit als HH:MM erwartet, z. B. "07:00"',
    'config.badDay': 'scheduleDay: einer von {days} erwartet',
    'config.badLanguage': 'language: "de", "en" oder "" erwartet',
    'config.badClientId': 'Die Client ID hat genau 32 Zeichen aus 0–9 und a–f.',
    'config.badApiKey': 'Der Last.fm-API-Key hat genau 32 Zeichen aus 0–9 und a–f.',
    'config.badUser': 'Ungültiger Last.fm-Benutzername.',
    'config.badSeed': 'Quelle: "liked" oder Link zu einer Spotify-Playlist erwartet.',
    'config.missing': 'config.jsonc fehlt – bitte zuerst die Einrichtung abschließen.',
    'config.unsafe': 'Die Änderung konnte nicht sicher gespeichert werden – config.jsonc bleibt unverändert.',
    'config.unexpectedChar': 'config.jsonc: unerwartetes Zeichen an Stelle {pos}',
    'config.notObject': 'config.jsonc: oberste Ebene ist kein Objekt',

    // --- spotify.mjs ---
    'spotify.loginAgain': 'In der Oberfläche neu bei Spotify anmelden oder "node dj.mjs login" ausführen.',
    'spotify.notLoggedIn': 'Noch nicht bei Spotify angemeldet. {again}',
    'spotify.expired': 'Spotify-Anmeldung abgelaufen ({detail}). {again}',
    'spotify.rateLimit': 'Spotify-Rate-Limit: bitte in {minutes} Minuten erneut versuchen.',
    'spotify.tooManyAttempts': 'Spotify {method} {path}: zu viele Versuche',
    'login.tokenFailed': 'Token-Tausch fehlgeschlagen: {detail}',
    'login.staleTitle': 'Veralteter Link',
    'login.staleText': 'Dieser Link gehört zu keiner laufenden Anmeldung. Starte die Anmeldung in Tweakable DJ neu.',
    'login.failedTitle': 'Anmeldung fehlgeschlagen',
    'login.failedText': 'Die Meldung steht in Tweakable DJ bzw. im Terminal. Du kannst dieses Fenster schließen.',
    'login.denied': 'Du hast die Anmeldung bei Spotify abgelehnt.',
    'login.failed': 'Spotify-Anmeldung fehlgeschlagen: {detail}',
    'login.noCode': 'kein Code',
    'login.okTitle': 'Angemeldet ✓',
    'login.okText': 'Du kannst dieses Fenster schließen und zu Tweakable DJ zurückkehren.',
    'login.aborted': 'Anmeldung abgebrochen.',
    'login.timeout': 'Keine Zustimmung innerhalb von {minutes} Minuten – Anmeldung abgebrochen. Bitte noch einmal versuchen.',
    'login.portBusy': 'Port 8888 ist belegt – läuft schon eine Anmeldung, z. B. im Terminal? Diese beenden und noch einmal versuchen.',
    'login.browser': 'Browser öffnet sich für die Spotify-Anmeldung. Falls nicht, diesen Link öffnen:',

    // --- lastfm.mjs ---
    'lastfm.suspendedKey': 'Last.fm hat deinen API-Key gesperrt. Lege einen neuen an (https://www.last.fm/api/account/create) und trage ihn in der Oberfläche unter „Zugangsdaten ändern“ bzw. als lastfm.apiKey in config.jsonc ein.',
    'lastfm.badKey': 'Der Last.fm-API-Key ist ungültig. Prüfe lastfm.apiKey in config.jsonc (neuen Key anlegen: https://www.last.fm/api/account/create).',

    // --- dj.mjs ---
    'run.loggedIn': 'Angemeldet ✓  Jetzt "node dj.mjs" ausführen.',
    'run.seedEmpty': 'Die Quelle deiner Favoriten (Playlist) ist leer oder nicht lesbar. Spotify gibt Inhalte nur für Playlists heraus, die dir gehören oder bei denen du mitarbeitest.',
    'run.loadingFavorites': 'Lade deine Favoriten …',
    'run.songs': '  {count|# Song|# Songs}',
    'run.loadingHistory': 'Lade Hörverlauf von Last.fm …',
    'run.userUnknown': 'Den Last.fm-Benutzer "{user}" gibt es nicht. Prüfe lastfm.user in config.jsonc. Ohne Hörverlauf greifen die Regeln zum aktuellen Hören nicht.',
    'run.noScrobbles': 'Last.fm hat {days|in den letzten 24 Stunden|in den letzten # Tagen} keine Scrobbles von "{user}". Vermutlich ist Spotify nicht mit Last.fm verbunden: https://www.last.fm/settings/applications – ohne Hörverlauf greifen die Regeln zum aktuellen Hören nicht.',
    'run.scrobbles': '  {total|# Scrobble|# Scrobbles}, davon {current|#|#} {days|in den letzten 24 Stunden|in den letzten # Tagen} ({artists|#|#} Künstler)',
    'run.startingPoints': '  {current|#|#} von {total|# Ausgangspunkt|# Ausgangspunkten} aus deinem aktuellen Hören (Faktor {factor|#|#})',
    'run.searchingSimilar': 'Suche ähnliche Songs …',
    'run.cacheNotSaved': 'Last.fm-Cache nicht gespeichert: {message}',
    'run.candidates': '  {count|# Kandidat|# Kandidaten} ({hits|#|#} von {total|# Last.fm-Abfrage|# Last.fm-Abfragen} aus dem Cache)',
    'run.blocked': '  {count|# Song|# Songs} wegen der Sperrliste aussortiert',
    'run.followed': '  {count|# gefolgter Künstler|# gefolgte Künstler}',
    'run.followedOut': '  {count|# Song|# Songs} von gefolgten Künstlern ausgelassen',
    'run.followedScope': 'Für "Gefolgte Künstler" bitte einmal neu bei Spotify anmelden (in der Oberfläche oder mit "node dj.mjs login"). Bis dahin zählen gefolgte Künstler nicht, der Lauf geht normal weiter.',
    'run.followedFailed': 'Gefolgte Künstler nicht abrufbar ({message}). Bei diesem Lauf zählen sie nicht.',
    'run.favorite': 'Favorit',
    'run.new': 'neu, über {via}',
    'run.current': ' · aktuell',
    'run.searchingSpotify': 'Suche die Songs auf Spotify …',
    'run.noSongs': 'Kein einziger Song gefunden – die Playlist bleibt, wie sie ist. Ist die Quelle leer (z. B. noch keine Lieblingssongs) oder sperren Sperrliste und Wiederholungsregeln alles?',
    'run.summary': '{name}: {songs|# Song|# Songs} ({fresh|#|#} neu, davon {freshCurrent|#|#} über aktuelles Hören; {familiar|# Favorit|# Favoriten})',
    'run.windowRule': 'Regel "max. {max} aus {window}" ließ sich nicht überall einhalten.',
    'run.dry': '--dry: Playlist nicht verändert.',
    'run.newPlaylist': 'Wird von Tweakable DJ befüllt.',
    'run.created': 'Playlist "{name}" angelegt.',
    'run.description': 'Tweakable DJ · {date}, {time} Uhr · {fresh|# neuer Song|# neue Songs}, {familiar|# Favorit|# Favoriten}',
    'run.descriptionFailed': 'Beschreibung nicht gesetzt: {message}',
    'run.done': 'Fertig ✓  {url}',
    'run.error': 'Fehler: {message}',
    'run.redirectHint': 'Prüfe im Spotify-Dashboard die Redirect URI: {uri}',
    'run.forbidden': 'Spotify verweigert den Zugriff (403). Häufige Ursachen:\n'
      + '  – Der Besitzer der Spotify-App hat kein Premium. Seit Februar 2026 ist das für Apps im Entwicklermodus Pflicht.\n'
      + '  – Dein Spotify-Konto fehlt im Spotify-Dashboard deiner App unter "User Management": https://developer.spotify.com/dashboard',
    'run.trialSaved': 'Genau diese Liste lässt sich 24 Stunden lang übernehmen: „Diese Liste übernehmen“ in der Oberfläche bzw. "node dj.mjs --apply".',
    'run.trialNotSaved': 'Probelauf nicht gemerkt, „Diese Liste übernehmen“ geht diesmal nicht: {message}',

    // --- Probelauf übernehmen (dj.mjs --apply, trial.mjs) ---
    'apply.start': 'Übernehme den Probelauf vom {date}, {time} Uhr ({count|# Song|# Songs}), ohne neu zu losen …',
    'trial.missing': 'Es gibt keinen Probelauf zum Übernehmen: Noch keiner gelaufen, oder die Playlist wurde seitdem neu erstellt. Starte einen neuen Probelauf.',
    'trial.invalid': 'probelauf.json ist beschädigt oder stammt von einer anderen Version. Starte einen neuen Probelauf.',
    'trial.replaced': 'Seitdem gab es einen neueren Probelauf (z. B. in einem anderen Fenster). Starte einen neuen Probelauf, dann passen Anzeige und Liste zusammen.',
    'trial.old': 'Der Probelauf ist älter als 24 Stunden. Starte einen neuen Probelauf.',
    'trial.settings': 'Die Einstellungen haben sich seit dem Probelauf geändert. Starte einen neuen Probelauf.',

    // --- Textdatei (dj.mjs export/import, playlist.mjs) ---
    'export.header': '{name} – exportiert am {date}, {time}',
    'export.trial': 'Probelauf vom {date}, {time} – noch nicht in der Playlist',
    'export.format': '{count|# Song|# Songs} · eine Zeile pro Song: Künstler – Titel, Tabulator, Link zu Spotify',
    'export.trialSuffix': 'probelauf',
    'export.noPlaylist': 'Die Playlist "{name}" gibt es in deinem Spotify noch nicht. Erstelle sie zuerst (Playlist neu erstellen).',
    'export.txtOnly': 'Der Dateiname muss auf .txt enden: {file}',
    'export.saved': 'Gespeichert: {file} ({count|# Song|# Songs})',
    'import.usage': 'Aufruf: node dj.mjs import <Datei.txt> (mit --dry nur anzeigen)',
    'import.fileMissing': 'Datei nicht gefunden: {file}',
    'import.tooLarge': 'Die Datei ist zu groß (höchstens 1 MB).',
    'import.empty': 'Die Datei enthält keine Songs. Leere Zeilen und Kommentarzeilen zählen nicht.',
    'import.tooMany': 'Die Datei enthält {count|# Song|# Songs}, in die Playlist passen höchstens {max|#|#}.',
    'import.reading': 'Suche {count|# Song|# Songs} aus der Datei …',
    'import.searching': '  {done|#|#} von {total|# Suche|# Suchen} auf Spotify …',
    'import.found': '{found|#|#} von {total|# Song|# Songs} gefunden',
    'import.notFound': 'Nicht übernommen:',
    'import.notFoundLine': '  Zeile {line}: {text} ({reason})',
    'import.reason.notFound': 'auf Spotify nicht gefunden',
    'import.reason.format': 'weder Link noch „Künstler – Titel“',
    'import.reason.link': 'Link zu keinem Song',
    'import.reason.error': 'Suche fehlgeschlagen',
    'import.noneFound': 'Kein einziger Song gefunden – die Playlist bleibt, wie sie ist.',
    'import.badList': 'Ungültige Liste: erwartet sind 1 bis 500 Spotify-Songs (spotify:track:…).',
    'import.description': 'Tweakable DJ · aus einer Textdatei, {date}, {time} Uhr · {count|# Song|# Songs}',
    'import.done': '"{name}" enthält jetzt {count|# Song|# Songs} aus der Datei ✓  {url}',

    // --- schedule.mjs ---
    'schedule.off': 'Die Automatik ist aus, dafür gibt es keinen Eintrag.',
    'schedule.newline': 'Der Pfad enthält einen Zeilenumbruch, damit kann cron nicht umgehen.',
    'schedule.reports': '{who} meldet: {message}',
    'schedule.exitCode': 'Fehlercode {code}',
    'schedule.windows': 'Die Aufgabenplanung',
    'schedule.noCrontab': 'Auf diesem PC fehlt der Befehl „crontab“. Installiere das Paket „cron“ (Debian, Ubuntu) bzw. „cronie“ (Fedora, Arch) und starte Tweakable DJ neu.',
    'schedule.platform': 'Die Automatik gibt es nur unter Windows, macOS und Linux.',
    'schedule.notMatching': 'Der Eintrag im Zeitplaner stimmt danach nicht ({problem}).',
    'schedule.description': 'Erstellt die Playlist von Tweakable DJ automatisch neu. Ordner: {dir}. Ändern oder ausschalten in der Oberfläche von Tweakable DJ.',
    'schedule.aborted': 'Beendet mit Fehlercode {code}',

    // --- ui.mjs ---
    'ui.tooLarge': 'Anfrage zu groß',
    'ui.wrongHost': 'Falscher Host',
    'ui.notAllowed': 'Nicht erlaubt',
    'ui.notFound': 'Nicht gefunden',
    'ui.clientIdFirst': 'Trage zuerst die Client ID ein (Schritt 1).',
    'ui.loginFirst': 'Melde dich zuerst bei Spotify an, dann erscheinen hier deine Playlists.',
    'ui.likedSongs': 'Lieblingssongs',
    'ui.busy': 'Es läuft bereits ein Durchgang.',
    'ui.importBusy': 'Gerade läuft ein Import aus einer Textdatei. Warte, bis er fertig ist.',
    'ui.loginBusy': 'Gerade läuft eine Anmeldung bei Spotify. Schließe sie ab oder brich sie ab.',
    'ui.badRequest': 'Ungültige Anfrage',
    'ui.exited': '(beendet mit Fehlercode {code})',
    'ui.loggedIn': 'Angemeldet ✓',
    'ui.scheduleNotSaved': 'Die Automatik ließ sich nicht einrichten, deshalb ist nichts gespeichert. {message}',
    'ui.scheduleFailed': 'Die Automatik ließ sich nicht einrichten. {message}',
    'ui.alreadyRunning': 'Die Oberfläche läuft bereits: {url}',
    'ui.listening': 'Tweakable DJ – Oberfläche läuft auf {url}',
    'ui.stopHint': 'Die Oberfläche öffnest du im Browser unter dieser Adresse.\n'
      + 'Dieses Fenster muss offen bleiben, solange du Tweakable DJ benutzt – wird es geschlossen, ist das Programm beendet.\n'
      + 'Beenden mit Strg+C oder durch Schließen des Fensters.',
    'ui.badPort': 'TWEAKABLE_DJ_PORT muss eine Zahl von 1 bis 65535 sein, nicht "{value}".',
    'ui.keyFormat': 'Ein API-Key hat genau 32 Zeichen aus 0–9 und a–f.',
    'ui.userFormat': 'Dieser Benutzername enthält Zeichen, die es bei Last.fm nicht gibt.',
    'ui.lastfmOffline': 'Last.fm ist gerade nicht erreichbar ({detail}). Prüfe deine Internetverbindung.',
    'ui.keyInvalid': 'Dieser API-Key ist ungültig. Kopiere ihn noch einmal von Last.fm – das Feld „API key“, nicht „Shared secret“.',
    'ui.keySuspended': 'Dieser API-Key wurde von Last.fm gesperrt. Lege einen neuen an.',
    'ui.userUnknown': 'Den Last.fm-Benutzer „{user}“ gibt es nicht. Prüfe die Schreibweise.',
    'ui.lastfmReports': 'Last.fm meldet: {message}',
    'ui.lastfmError': 'Fehler {code}',
    'ui.keyOkNoUser': 'Der API-Key passt ✓ Ohne Benutzernamen kann der DJ deinen Hörverlauf nicht nutzen.',
    'ui.lastfmOk': 'Passt ✓ „{name}“ hat {scrobbles|# Scrobble|# Scrobbles}.',
    'ui.noScrobbles': 'Der API-Key passt ✓ Aber „{name}“ hat noch keine Scrobbles – Last.fm weiß also noch nicht, was du hörst.',

    // --- install-update.mjs („Jetzt aktualisieren“ in der Oberfläche) ---
    'update.stepCheck': 'Frage GitHub nach der neuesten Version …',
    'update.stepDownload': 'Lade {file} ({size}) …',
    'update.stepVerify': 'Prüfe {count|# Datei|# Dateien} (Größe und SHA-256) …',
    'update.stepBackup': 'Sichere {count|# Programmdatei|# Programmdateien} nach {dir} …',
    'update.stepCopy': 'Ersetze {count|# Datei|# Dateien} ({same|# ist|# sind} unverändert) …',
    'update.done': 'Version {version} ist installiert ✓',
    'update.restarting': 'Update auf Version {version} installiert – Tweakable DJ startet neu …',
    'update.startAgain': 'Update auf Version {version} installiert. Bitte Tweakable DJ neu starten.',
    'update.disabled': 'Updates sind abgeschaltet (TWEAKABLE_DJ_NO_UPDATE_CHECK), oder package.json nennt kein GitHub-Repository bzw. keine Version.',
    'update.gitCheckout': 'Dieser Ordner ist ein git-Repository. Aktualisiere ihn mit „git pull“.',
    'update.runBusy': 'Gerade läuft ein Durchgang. Warte, bis er fertig ist, und aktualisiere dann.',
    'update.autoBusy': 'Gerade läuft ein automatischer Lauf (seit {time} Uhr). Warte, bis er fertig ist, und aktualisiere dann.',
    'update.loginBusy': 'Gerade läuft eine Anmeldung bei Spotify. Schließe sie ab oder brich sie ab und aktualisiere dann.',
    'update.importBusy': 'Gerade läuft ein Import aus einer Textdatei. Warte, bis er fertig ist, und aktualisiere dann.',
    'update.inProgress': 'Gerade läuft ein Update. Warte, bis es fertig ist.',
    'update.offline': 'GitHub ist gerade nicht erreichbar ({detail}). Prüfe deine Internetverbindung.',
    'update.rateLimit': 'GitHub nimmt gerade keine weiteren Anfragen an (Limit). Versuche es in einer Stunde noch einmal.',
    'update.github': 'GitHub antwortet bei {file} mit Fehler {status}.',
    'update.noRelease': 'Auf GitHub gibt es keine veröffentlichte Version.',
    'update.notNewer': 'Version {latest} ist nicht neuer als deine ({current}).',
    'update.otherVersion': 'Inzwischen gibt es Version {latest} statt {expected}. Lade die Seite neu und versuche es noch einmal.',
    'update.noAssets': 'Version {version} hat keine Dateien für das automatische Update ({file} fehlt). Lade sie bitte von Hand herunter (README, Abschnitt „Aktualisieren“).',
    'update.missingAsset': '{file} gibt es auf GitHub nicht (mehr).',
    'update.badHost': 'Download von {host} abgelehnt: Erlaubt ist nur HTTPS zu GitHub.',
    'update.tooLarge': '{file} ist größer als erlaubt ({limit}).',
    'update.badManifest': 'manifest.json ist ungültig ({detail}).',
    'update.forbiddenPath': 'manifest.json nennt „{path}“ ({reason}). So eine Datei schreibt ein Update nie.',
    'update.reasonPersonal': 'persönliche Datei',
    'update.reasonOutside': 'außerhalb des Ordners',
    'update.reasonName': 'unzulässiger Name',
    'update.badZip': 'Die ZIP-Datei ist beschädigt oder hat ein unerwartetes Format ({detail}).',
    'update.missingFile': '{file} fehlt in der ZIP-Datei.',
    'update.badChecksum': '{file} stimmt nicht mit manifest.json überein (Größe oder SHA-256).',
    'update.versionMismatch': 'package.json in der ZIP-Datei nennt Version {found} statt {version}.',
    'update.symlink': '„{path}“ ist ein symbolischer Link. Durch Links schreibt das Update nicht.',
    'update.notAFile': '„{path}“ ist keine normale Datei bzw. kein Ordner.',
    'update.unexpected': 'Unerwarteter Fehler ({detail}).',
    'update.failedUnchanged': 'Update fehlgeschlagen: {message} Es wurde nichts geändert.',
    'update.failedRestored': 'Update fehlgeschlagen: {message} Die alte Version ist wiederhergestellt, alles ist wie vorher.',
    'update.failedRestore': 'Update fehlgeschlagen: {message} Beim Zurückholen der alten Version gab es Probleme ({detail}). Die alten Programmdateien liegen in {backup}. Deine persönlichen Dateien wurden nicht angefasst.',
  },

  en: {
    // --- General ---
    'node.tooOld': 'Tweakable DJ needs Node.js 18 or newer, but {version} is installed. Please install the current LTS version from https://nodejs.org.',

    // --- config.mjs ---
    'config.invalid': 'config.jsonc is invalid ({detail}). Common cause: a missing or extra comma.',
    'config.created': 'config.jsonc has been created – set up Tweakable DJ in its interface (Tweakable DJ.cmd or .command, on Linux start.sh) or fill in the file: {file}',
    'config.incomplete': 'Setup not finished – complete it in the interface (Tweakable DJ.cmd or .command, on Linux start.sh) or fill in config.jsonc: {missing}',
    'config.userOrEmpty': 'lastfm.user (or leave it empty)',
    'config.unknownSetting': 'Unknown setting: {key}',
    'config.unknownField': 'Unknown field: {name}',
    'config.listExpected': '{key}: expected a list of texts',
    'config.entryTooLong': '{key}: entry too long',
    'config.typeExpected': '{key}: expected {type}',
    'config.badInteger': '{key} in config.jsonc must be a whole number from {min} to {max} (currently {value}).',
    'config.badNumber': '{key} in config.jsonc must be a number from {min} to {max} (currently {value}).',
    'config.badText': '{key}: invalid text',
    'config.badSchedule': 'schedule: expected "off", "daily" or "weekly"',
    'config.badTime': 'scheduleTime: expected a time as HH:MM, e.g. "07:00"',
    'config.badDay': 'scheduleDay: expected one of {days}',
    'config.badLanguage': 'language: expected "de", "en" or ""',
    'config.badClientId': 'The Client ID has exactly 32 characters from 0–9 and a–f.',
    'config.badApiKey': 'The Last.fm API key has exactly 32 characters from 0–9 and a–f.',
    'config.badUser': 'Invalid Last.fm username.',
    'config.badSeed': 'Source: expected "liked" or a link to a Spotify playlist.',
    'config.missing': 'config.jsonc is missing – please finish the setup first.',
    'config.unsafe': 'The change could not be saved safely – config.jsonc stays unchanged.',
    'config.unexpectedChar': 'config.jsonc: unexpected character at position {pos}',
    'config.notObject': 'config.jsonc: the top level is not an object',

    // --- spotify.mjs ---
    'spotify.loginAgain': 'Log in to Spotify again in the interface, or run "node dj.mjs login".',
    'spotify.notLoggedIn': 'Not logged in to Spotify yet. {again}',
    'spotify.expired': 'Spotify login expired ({detail}). {again}',
    'spotify.rateLimit': 'Spotify rate limit: please try again in {minutes} minutes.',
    'spotify.tooManyAttempts': 'Spotify {method} {path}: too many attempts',
    'login.tokenFailed': 'Token exchange failed: {detail}',
    'login.staleTitle': 'Outdated link',
    'login.staleText': 'This link doesn’t belong to a login in progress. Start the login again in Tweakable DJ.',
    'login.failedTitle': 'Login failed',
    'login.failedText': 'The message is shown in Tweakable DJ or in the terminal. You can close this window.',
    'login.denied': 'You declined the Spotify login.',
    'login.failed': 'Spotify login failed: {detail}',
    'login.noCode': 'no code',
    'login.okTitle': 'Logged in ✓',
    'login.okText': 'You can close this window and return to Tweakable DJ.',
    'login.aborted': 'Login cancelled.',
    'login.timeout': 'No consent within {minutes} minutes – login cancelled. Please try again.',
    'login.portBusy': 'Port 8888 is in use – is a login already running, e.g. in a terminal? Stop it and try again.',
    'login.browser': 'Your browser opens for the Spotify login. If it doesn’t, open this link:',

    // --- lastfm.mjs ---
    'lastfm.suspendedKey': 'Last.fm has suspended your API key. Create a new one (https://www.last.fm/api/account/create) and enter it in the interface under “Change credentials” or as lastfm.apiKey in config.jsonc.',
    'lastfm.badKey': 'The Last.fm API key is invalid. Check lastfm.apiKey in config.jsonc (create a new key: https://www.last.fm/api/account/create).',

    // --- dj.mjs ---
    'run.loggedIn': 'Logged in ✓  Now run "node dj.mjs".',
    'run.seedEmpty': 'The source of your favorites (playlist) is empty or can’t be read. Spotify only returns the contents of playlists you own or collaborate on.',
    'run.loadingFavorites': 'Loading your favorites …',
    'run.songs': '  {count|# song|# songs}',
    'run.loadingHistory': 'Loading listening history from Last.fm …',
    'run.userUnknown': 'The Last.fm user "{user}" doesn’t exist. Check lastfm.user in config.jsonc. Without listening history, the rules for current listening don’t apply.',
    'run.noScrobbles': 'Last.fm has no scrobbles from "{user}" {days|in the last 24 hours|in the last # days}. Spotify is probably not connected to Last.fm: https://www.last.fm/settings/applications – without listening history, the rules for current listening don’t apply.',
    'run.scrobbles': '  {total|# scrobble|# scrobbles}, {current|#|#} of them {days|in the last 24 hours|in the last # days} ({artists|# artist|# artists})',
    'run.startingPoints': '  {current|#|#} of {total|# starting point|# starting points} from your current listening (factor {factor|#|#})',
    'run.searchingSimilar': 'Finding similar songs …',
    'run.cacheNotSaved': 'Last.fm cache not saved: {message}',
    'run.candidates': '  {count|# candidate|# candidates} ({hits|#|#} of {total|# Last.fm request|# Last.fm requests} from the cache)',
    'run.blocked': '  {count|# song|# songs} left out because of the block list',
    'run.followed': '  {count|# followed artist|# followed artists}',
    'run.followedOut': '  {count|# song|# songs} by followed artists left out',
    'run.followedScope': 'For "Followed artists", please log in to Spotify again once (in the interface or with "node dj.mjs login"). Until then, followed artists don’t count; the run continues as usual.',
    'run.followedFailed': 'Couldn’t get your followed artists ({message}). They don’t count in this run.',
    'run.favorite': 'favorite',
    'run.new': 'new, via {via}',
    'run.current': ' · current',
    'run.searchingSpotify': 'Looking up the songs on Spotify …',
    'run.noSongs': 'Not a single song found – the playlist stays as it is. Is the source empty (e.g. no Liked Songs yet), or do the block list and the no-repeat rules block everything?',
    'run.summary': '{name}: {songs|# song|# songs} ({fresh|#|#} new, {freshCurrent|#|#} of them via current listening; {familiar|# favorite|# favorites})',
    'run.windowRule': 'The rule "at most {max} in {window}" couldn’t be kept everywhere.',
    'run.dry': '--dry: playlist not changed.',
    'run.newPlaylist': 'Filled by Tweakable DJ.',
    'run.created': 'Created playlist "{name}".',
    'run.description': 'Tweakable DJ · {date}, {time} · {fresh|# new song|# new songs}, {familiar|# favorite|# favorites}',
    'run.descriptionFailed': 'Description not set: {message}',
    'run.done': 'Done ✓  {url}',
    'run.error': 'Error: {message}',
    'run.redirectHint': 'Check the redirect URI in the Spotify dashboard: {uri}',
    'run.forbidden': 'Spotify denies access (403). Common causes:\n'
      + '  – The owner of the Spotify app has no Premium. Since February 2026, it is required for apps in development mode.\n'
      + '  – Your Spotify account is missing from your app’s Spotify dashboard under "User Management": https://developer.spotify.com/dashboard',
    'run.trialSaved': 'You can apply exactly this list within 24 hours: “Use this list” in the interface or "node dj.mjs --apply".',
    'run.trialNotSaved': 'Test run not saved, so “Use this list” won’t work this time: {message}',

    // --- Apply a test run (dj.mjs --apply, trial.mjs) ---
    'apply.start': 'Applying the test run from {date}, {time} ({count|# song|# songs}) without drawing again …',
    'trial.missing': 'There’s no test run to apply: none has run yet, or the playlist has been rebuilt since. Start a new test run.',
    'trial.invalid': 'probelauf.json is damaged or comes from a different version. Start a new test run.',
    'trial.replaced': 'A newer test run has happened since (e.g. in another window). Start a new test run so the list and what you see match.',
    'trial.old': 'The test run is more than 24 hours old. Start a new test run.',
    'trial.settings': 'The settings have changed since the test run. Start a new test run.',

    // --- Text file (dj.mjs export/import, playlist.mjs) ---
    'export.header': '{name} – exported on {date}, {time}',
    'export.trial': 'Test run from {date}, {time} – not in the playlist yet',
    'export.format': '{count|# song|# songs} · one line per song: artist – title, tab, Spotify link',
    'export.trialSuffix': 'test-run',
    'export.noPlaylist': 'The playlist "{name}" doesn’t exist in your Spotify yet. Create it first (Rebuild playlist).',
    'export.txtOnly': 'The file name must end in .txt: {file}',
    'export.saved': 'Saved: {file} ({count|# song|# songs})',
    'import.usage': 'Usage: node dj.mjs import <file.txt> (add --dry to only show the result)',
    'import.fileMissing': 'File not found: {file}',
    'import.tooLarge': 'The file is too large (1 MB at most).',
    'import.empty': 'The file contains no songs. Empty lines and comment lines don’t count.',
    'import.tooMany': 'The file contains {count|# song|# songs}; the playlist holds at most {max|#|#}.',
    'import.reading': 'Looking up {count|# song|# songs} from the file …',
    'import.searching': '  {done|#|#} of {total|# search|# searches} on Spotify …',
    'import.found': '{found|#|#} of {total|# song|# songs} found',
    'import.notFound': 'Not included:',
    'import.notFoundLine': '  Line {line}: {text} ({reason})',
    'import.reason.notFound': 'not found on Spotify',
    'import.reason.format': 'neither a link nor “artist – title”',
    'import.reason.link': 'link to something other than a song',
    'import.reason.error': 'search failed',
    'import.noneFound': 'Not a single song found – the playlist stays as it is.',
    'import.badList': 'Invalid list: expected 1 to 500 Spotify songs (spotify:track:…).',
    'import.description': 'Tweakable DJ · from a text file, {date}, {time} · {count|# song|# songs}',
    'import.done': '"{name}" now contains {count|# song|# songs} from the file ✓  {url}',

    // --- schedule.mjs ---
    'schedule.off': 'Automatic runs are off, so there is no scheduler entry.',
    'schedule.newline': 'The path contains a line break, which cron can’t handle.',
    'schedule.reports': '{who} reports: {message}',
    'schedule.exitCode': 'exit code {code}',
    'schedule.windows': 'Task Scheduler',
    'schedule.noCrontab': 'The “crontab” command is missing on this PC. Install the package “cron” (Debian, Ubuntu) or “cronie” (Fedora, Arch) and restart Tweakable DJ.',
    'schedule.platform': 'Automatic runs are only available on Windows, macOS and Linux.',
    'schedule.notMatching': 'The scheduler entry still doesn’t match afterwards ({problem}).',
    'schedule.description': 'Recreates the Tweakable DJ playlist automatically. Folder: {dir}. Change or turn off in the Tweakable DJ interface.',
    'schedule.aborted': 'Exited with error code {code}',

    // --- ui.mjs ---
    'ui.tooLarge': 'Request too large',
    'ui.wrongHost': 'Wrong host',
    'ui.notAllowed': 'Not allowed',
    'ui.notFound': 'Not found',
    'ui.clientIdFirst': 'Enter the Client ID first (step 1).',
    'ui.loginFirst': 'Log in to Spotify first, then your playlists will appear here.',
    'ui.likedSongs': 'Liked Songs',
    'ui.busy': 'A run is already in progress.',
    'ui.importBusy': 'An import from a text file is in progress. Wait until it’s finished.',
    'ui.loginBusy': 'A Spotify login is in progress. Finish or cancel it first.',
    'ui.badRequest': 'Invalid request',
    'ui.exited': '(exited with error code {code})',
    'ui.loggedIn': 'Logged in ✓',
    'ui.scheduleNotSaved': 'Automatic runs couldn’t be set up, so nothing was saved. {message}',
    'ui.scheduleFailed': 'Automatic runs couldn’t be set up. {message}',
    'ui.alreadyRunning': 'The interface is already running: {url}',
    'ui.listening': 'Tweakable DJ – interface running at {url}',
    'ui.stopHint': 'Open the interface in your browser at this address.\n'
      + 'Keep this window open while you use Tweakable DJ – closing it stops the program.\n'
      + 'To stop, press Ctrl+C or close this window.',
    'ui.badPort': 'TWEAKABLE_DJ_PORT must be a number from 1 to 65535, not "{value}".',
    'ui.keyFormat': 'An API key has exactly 32 characters from 0–9 and a–f.',
    'ui.userFormat': 'This username contains characters that Last.fm doesn’t allow.',
    'ui.lastfmOffline': 'Last.fm can’t be reached right now ({detail}). Check your internet connection.',
    'ui.keyInvalid': 'This API key is invalid. Copy it again from Last.fm – the “API key” field, not “Shared secret”.',
    'ui.keySuspended': 'Last.fm has suspended this API key. Create a new one.',
    'ui.userUnknown': 'The Last.fm user “{user}” doesn’t exist. Check the spelling.',
    'ui.lastfmReports': 'Last.fm reports: {message}',
    'ui.lastfmError': 'error {code}',
    'ui.keyOkNoUser': 'The API key works ✓ Without a username, the DJ can’t use your listening history.',
    'ui.lastfmOk': 'All good ✓ “{name}” has {scrobbles|# scrobble|# scrobbles}.',
    'ui.noScrobbles': 'The API key works ✓ But “{name}” has no scrobbles yet – so Last.fm doesn’t know yet what you listen to.',

    // --- install-update.mjs ---
    'update.stepCheck': 'Asking GitHub for the newest version …',
    'update.stepDownload': 'Downloading {file} ({size}) …',
    'update.stepVerify': 'Checking {count|# file|# files} (size and SHA-256) …',
    'update.stepBackup': 'Backing up {count|# program file|# program files} to {dir} …',
    'update.stepCopy': 'Replacing {count|# file|# files} ({same|# is|# are} unchanged) …',
    'update.done': 'Version {version} is installed ✓',
    'update.restarting': 'Update to version {version} installed – Tweakable DJ is restarting …',
    'update.startAgain': 'Update to version {version} installed. Please start Tweakable DJ again.',
    'update.disabled': 'Updates are turned off (TWEAKABLE_DJ_NO_UPDATE_CHECK), or package.json names no GitHub repository or version.',
    'update.gitCheckout': 'This folder is a git repository. Update it with “git pull”.',
    'update.runBusy': 'A run is in progress. Wait until it’s finished, then update.',
    'update.autoBusy': 'An automatic run is in progress (since {time}). Wait until it’s finished, then update.',
    'update.loginBusy': 'A Spotify login is in progress. Finish or cancel it, then update.',
    'update.importBusy': 'An import from a text file is in progress. Wait until it’s finished, then update.',
    'update.inProgress': 'An update is in progress. Wait until it’s finished.',
    'update.offline': 'GitHub can’t be reached right now ({detail}). Check your internet connection.',
    'update.rateLimit': 'GitHub isn’t accepting more requests right now (rate limit). Try again in an hour.',
    'update.github': 'GitHub answers with error {status} for {file}.',
    'update.noRelease': 'There is no published version on GitHub.',
    'update.notNewer': 'Version {latest} isn’t newer than yours ({current}).',
    'update.otherVersion': 'There is now version {latest} instead of {expected}. Reload the page and try again.',
    'update.noAssets': 'Version {version} has no files for the automatic update ({file} is missing). Please download it manually (README, section “Updating”).',
    'update.missingAsset': '{file} doesn’t exist on GitHub (anymore).',
    'update.badHost': 'Download from {host} refused: only HTTPS to GitHub is allowed.',
    'update.tooLarge': '{file} is larger than allowed ({limit}).',
    'update.badManifest': 'manifest.json is invalid ({detail}).',
    'update.forbiddenPath': 'manifest.json lists “{path}” ({reason}). An update never writes such a file.',
    'update.reasonPersonal': 'personal file',
    'update.reasonOutside': 'outside the folder',
    'update.reasonName': 'invalid name',
    'update.badZip': 'The ZIP file is damaged or has an unexpected format ({detail}).',
    'update.missingFile': '{file} is missing from the ZIP file.',
    'update.badChecksum': '{file} doesn’t match manifest.json (size or SHA-256).',
    'update.versionMismatch': 'package.json in the ZIP file says version {found} instead of {version}.',
    'update.symlink': '“{path}” is a symbolic link. The update doesn’t write through links.',
    'update.notAFile': '“{path}” isn’t a regular file or folder.',
    'update.unexpected': 'Unexpected error ({detail}).',
    'update.failedUnchanged': 'Update failed: {message} Nothing was changed.',
    'update.failedRestored': 'Update failed: {message} The old version has been restored; everything is as before.',
    'update.failedRestore': 'Update failed: {message} Restoring the old version ran into problems ({detail}). The old program files are in {backup}. Your personal files were not touched.',
  },
};
