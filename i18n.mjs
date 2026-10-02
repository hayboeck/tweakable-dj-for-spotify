// Sprachen und alle Texte, die die Node-Dateien ausgeben (Konsole, Fehlermeldungen, Antworten an die Oberfläche).
//   t(lang, 'run.summary', { name: 'Tweakable DJ', songs: 50, … }) → Text mit eingesetzten {Platzhaltern}

export const LANGS = ['de', 'en'];

// Für Zahlen und Datum (z. B. 1.234 bzw. 1,234).
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

// Text in der Sprache lang (unbekannt oder fehlend: Englisch); {name} wird durch params.name ersetzt.
export function t(lang, key, params = {}) {
  const text = MESSAGES[valid(lang) ?? 'en'][key] ?? MESSAGES.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

// Fehler mit übersetzter Meldung und Zusatzangaben, z. B. { errorCode: 'login_expired' }.
export const tError = (lang, key, params, props = {}) => Object.assign(new Error(t(lang, key, params)), props);

export const MESSAGES = {
  de: {
    // --- Allgemein ---
    'node.tooOld': 'Tweakable DJ braucht Node.js 18 oder neuer, installiert ist {version}. Bitte die aktuelle LTS-Version von https://nodejs.org installieren.',

    // --- config.mjs ---
    'config.invalid': 'config.jsonc ist fehlerhaft ({detail}). Häufige Ursache: fehlendes oder überzähliges Komma.',
    'config.created': 'config.jsonc wurde angelegt – bitte in der Oberfläche (Tweakable DJ.cmd) einrichten oder die Datei ausfüllen: {file}',
    'config.incomplete': 'Einrichtung nicht abgeschlossen – in der Oberfläche (Tweakable DJ.cmd) einrichten oder in config.jsonc ausfüllen: {missing}',
    'config.userOrEmpty': 'lastfm.user (oder leer lassen)',
    'config.unknownSetting': 'Unbekannte Einstellung: {key}',
    'config.unknownField': 'Unbekanntes Feld: {name}',
    'config.listExpected': '{key}: Liste von Texten erwartet',
    'config.entryTooLong': '{key}: Eintrag zu lang',
    'config.typeExpected': '{key}: {type} erwartet',
    'config.badNumber': '{key}: ungültige Zahl',
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
    'lastfm.badKey': 'Der Last.fm-API-Key ist ungültig. Prüfe lastfm.apiKey in config.jsonc (neuen Key anlegen: https://www.last.fm/api/account/create).',

    // --- dj.mjs ---
    'run.loggedIn': 'Angemeldet ✓  Jetzt "node dj.mjs" ausführen.',
    'run.seedEmpty': 'Die Seed-Playlist ist leer oder nicht lesbar. Spotify gibt Inhalte nur für Playlists heraus, die dir gehören oder bei denen du mitarbeitest.',
    'run.loadingFavorites': 'Lade Lieblingssongs …',
    'run.songs': '  {count} Songs',
    'run.loadingHistory': 'Lade Hörverlauf von Last.fm …',
    'run.userUnknown': 'Den Last.fm-Benutzer "{user}" gibt es nicht. Prüfe lastfm.user in config.jsonc. Ohne Hörverlauf greifen die Regeln zum aktuellen Hören nicht.',
    'run.noScrobbles': 'Last.fm hat in den letzten {days} Tagen keine Scrobbles von "{user}". Vermutlich ist Spotify nicht mit Last.fm verbunden: https://www.last.fm/settings/applications – ohne Hörverlauf greifen die Regeln zum aktuellen Hören nicht.',
    'run.scrobbles': '  {total} Scrobbles, davon {current} in den letzten {days} Tagen ({artists} Künstler)',
    'run.startingPoints': '  {current} von {total} Ausgangspunkten aus deinem aktuellen Hören (Faktor {factor})',
    'run.searchingSimilar': 'Suche ähnliche Songs …',
    'run.cacheNotSaved': 'Last.fm-Cache nicht gespeichert: {message}',
    'run.candidates': '  {count} Kandidaten ({hits} von {total} Last.fm-Abfragen aus dem Cache)',
    'run.blockedOne': '  {count} Song wegen der Sperrliste aussortiert',
    'run.blockedMany': '  {count} Songs wegen der Sperrliste aussortiert',
    'run.favorite': 'Favorit',
    'run.new': 'neu, über {via}',
    'run.current': ' · aktuell',
    'run.searchingSpotify': 'Suche die Songs auf Spotify …',
    'run.noSongs': 'Kein einziger Song gefunden – die Playlist bleibt, wie sie ist. Ist die Quelle leer (z. B. noch keine Lieblingssongs) oder sperren Sperrliste und Wiederholungsregeln alles?',
    'run.summary': '{name}: {songs} Songs ({fresh} neu, davon {freshCurrent} über aktuelles Hören; {familiar} Favoriten)',
    'run.windowRule': 'Regel "max. {max} aus {window}" ließ sich nicht überall einhalten.',
    'run.dry': '--dry: Playlist nicht verändert.',
    'run.newPlaylist': 'Wird von Tweakable DJ befüllt.',
    'run.created': 'Playlist "{name}" angelegt.',
    'run.description': 'Tweakable DJ · {date}, {time} Uhr · {fresh} neue Songs, {familiar} Favoriten',
    'run.descriptionFailed': 'Beschreibung nicht gesetzt: {message}',
    'run.done': 'Fertig ✓  {url}',
    'run.error': 'Fehler: {message}',
    'run.redirectHint': 'Prüfe im Spotify-Dashboard die Redirect URI: {uri}',
    'run.forbidden': 'Spotify verweigert den Zugriff (403). Häufige Ursachen:\n'
      + '  – Der Besitzer der Spotify-App hat kein Premium. Seit Februar 2026 ist das für Apps im Entwicklermodus Pflicht.\n'
      + '  – Dein Spotify-Konto fehlt im Spotify-Dashboard deiner App unter "User Management": https://developer.spotify.com/dashboard',

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
    'ui.lastfmOk': 'Passt ✓ „{name}“ hat {scrobbles} Scrobbles.',
    'ui.noScrobbles': 'Der API-Key passt ✓ Aber „{name}“ hat noch keine Scrobbles – Last.fm weiß also noch nicht, was du hörst.',
  },

  en: {
    // --- General ---
    'node.tooOld': 'Tweakable DJ needs Node.js 18 or newer, but {version} is installed. Please install the current LTS version from https://nodejs.org.',

    // --- config.mjs ---
    'config.invalid': 'config.jsonc is invalid ({detail}). Common cause: a missing or extra comma.',
    'config.created': 'config.jsonc has been created – set up Tweakable DJ in its interface (Tweakable DJ.cmd) or fill in the file: {file}',
    'config.incomplete': 'Setup not finished – complete it in the interface (Tweakable DJ.cmd) or fill in config.jsonc: {missing}',
    'config.userOrEmpty': 'lastfm.user (or leave it empty)',
    'config.unknownSetting': 'Unknown setting: {key}',
    'config.unknownField': 'Unknown field: {name}',
    'config.listExpected': '{key}: expected a list of texts',
    'config.entryTooLong': '{key}: entry too long',
    'config.typeExpected': '{key}: expected {type}',
    'config.badNumber': '{key}: invalid number',
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
    'lastfm.badKey': 'The Last.fm API key is invalid. Check lastfm.apiKey in config.jsonc (create a new key: https://www.last.fm/api/account/create).',

    // --- dj.mjs ---
    'run.loggedIn': 'Logged in ✓  Now run "node dj.mjs".',
    'run.seedEmpty': 'The seed playlist is empty or can’t be read. Spotify only returns the contents of playlists you own or collaborate on.',
    'run.loadingFavorites': 'Loading your favorites …',
    'run.songs': '  {count} songs',
    'run.loadingHistory': 'Loading listening history from Last.fm …',
    'run.userUnknown': 'The Last.fm user "{user}" doesn’t exist. Check lastfm.user in config.jsonc. Without listening history, the rules for current listening don’t apply.',
    'run.noScrobbles': 'Last.fm has no scrobbles from "{user}" in the last {days} days. Spotify is probably not connected to Last.fm: https://www.last.fm/settings/applications – without listening history, the rules for current listening don’t apply.',
    'run.scrobbles': '  {total} scrobbles, {current} of them in the last {days} days ({artists} artists)',
    'run.startingPoints': '  {current} of {total} starting points from your current listening (factor {factor})',
    'run.searchingSimilar': 'Finding similar songs …',
    'run.cacheNotSaved': 'Last.fm cache not saved: {message}',
    'run.candidates': '  {count} candidates ({hits} of {total} Last.fm requests from the cache)',
    'run.blockedOne': '  {count} song left out because of the block list',
    'run.blockedMany': '  {count} songs left out because of the block list',
    'run.favorite': 'favorite',
    'run.new': 'new, via {via}',
    'run.current': ' · current',
    'run.searchingSpotify': 'Looking up the songs on Spotify …',
    'run.noSongs': 'Not a single song found – the playlist stays as it is. Is the source empty (e.g. no Liked Songs yet), or do the block list and the no-repeat rules block everything?',
    'run.summary': '{name}: {songs} songs ({fresh} new, {freshCurrent} of them via current listening; {familiar} favorites)',
    'run.windowRule': 'The rule "at most {max} in {window}" couldn’t be kept everywhere.',
    'run.dry': '--dry: playlist not changed.',
    'run.newPlaylist': 'Filled by Tweakable DJ.',
    'run.created': 'Created playlist "{name}".',
    'run.description': 'Tweakable DJ · {date}, {time} · {fresh} new songs, {familiar} favorites',
    'run.descriptionFailed': 'Description not set: {message}',
    'run.done': 'Done ✓  {url}',
    'run.error': 'Error: {message}',
    'run.redirectHint': 'Check the redirect URI in the Spotify dashboard: {uri}',
    'run.forbidden': 'Spotify denies access (403). Common causes:\n'
      + '  – The owner of the Spotify app has no Premium. Since February 2026, it is required for apps in development mode.\n'
      + '  – Your Spotify account is missing from your app’s Spotify dashboard under "User Management": https://developer.spotify.com/dashboard',

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
    'ui.lastfmOk': 'All good ✓ “{name}” has {scrobbles} scrobbles.',
    'ui.noScrobbles': 'The API key works ✓ But “{name}” has no scrobbles yet – so Last.fm doesn’t know yet what you listen to.',
  },
};
