**English** · [Deutsch](README.de.md)

# Tweakable DJ for Spotify

**Your personal, tweakable DJ for Spotify – no talking, more variety.**

Spotify’s own AI DJ talks between the songs, and its voice can’t be turned off. Tweakable DJ does without announcements: it fills the playlist **“Tweakable DJ”** with a mix of your Liked Songs and new songs that match your taste, most of all what you’re listening to right now.
You decide how much variety you want, how many favorites, and how often the same artist comes up.
The interface is available in English and German; switch at the top right (DE | EN).

<p align="center"><img src="docs/screenshot-main.en.png" width="600" alt="The Tweakable DJ interface: presets such as Discover and My current phase, the playlist settings with sliders, and the buttons Test run and Rebuild playlist"></p>

Tweakable DJ is an independent project and not an official Spotify product (more in [section 10](#10-data-sources-trademarks-and-license)).

> **What you need**
>
> - **Spotify Premium**. Tweakable DJ needs its own Spotify app, and Spotify only allows that with Premium.
> - A free **Last.fm account** connected to Spotify (“scrobbling”). That’s how the DJ knows your listening history.
> - **Node.js 18 or newer** (free, <https://nodejs.org>)
> - A **PC or Mac** with Windows, macOS or Linux. Tweakable DJ runs there, not on the internet.
> - About **10 minutes** for the [setup](#7-setup-one-time)
>
> Everyone sets up Tweakable DJ with their **own Spotify app**. Spotify allows at most 5 users per app in development mode. That’s why Tweakable DJ isn’t a service you sign up for, but a tool you set up on your own computer.

**Contents**

1. [Quick start](#1-quick-start)
2. [How it all fits together](#2-how-it-all-fits-together)
3. [What’s in the folder](#3-whats-in-the-folder)
4. [How a playlist is made](#4-how-a-playlist-is-made)
5. [Rules and settings](#5-rules-and-settings)
6. [Using Tweakable DJ](#6-using-tweakable-dj)
7. [Setup (one time)](#7-setup-one-time)
8. [Troubleshooting](#8-troubleshooting)
9. [Limitations](#9-limitations)
10. [Data sources, trademarks and license](#10-data-sources-trademarks-and-license)

---

## 1. Quick start

First time here? Download Tweakable DJ, install Node.js and start it as described in the [setup](#7-setup-one-time). On the first start, a wizard guides you through the rest (about 10 minutes). After that, it works like this every time:

1. Start Tweakable DJ: double-click **`Tweakable DJ.cmd`** (Windows) or **`Tweakable DJ.command`** (Mac); on Linux, run `./start.sh` in a terminal. The interface with its controls opens in your browser.
2. Pick a **preset** (e.g. “Discover”) or adjust the controls yourself, then click **Test run**. The DJ shows which songs it would pick and doesn’t change anything.
3. If you like the selection, click **Rebuild playlist**. After about a minute, “Tweakable DJ” in Spotify has been refilled.
4. Listen to “Tweakable DJ” in Spotify, ideally without shuffle, because the DJ has already mixed the order.

The console or terminal window that opens must stay open while you use the interface.

---

## 2. How it all fits together

![How Spotify, Last.fm, Tweakable DJ, the interface and the files fit together](overview.en.svg)

The numbers show the order of a run:
① read your Liked Songs from Spotify → ② get listening history and similar songs from Last.fm → ③ pick songs according to your rules → ④ find the songs on Spotify and fill “Tweakable DJ”.

- **Spotify** provides your Liked Songs and receives the finished playlist. Since late 2024, Spotify no longer gives recommendations to third-party apps.
- **Last.fm** provides similar songs for each song and knows your listening history. For this, your Spotify account is connected to Last.fm (“scrobbling”), and every song you play is recorded there.
- **Tweakable DJ** runs on your computer, fetches the data from both services, picks songs according to your rules and writes the result into the playlist.
- **The interface** is a web page that runs only on your computer (<http://127.0.0.1:8899>). It guides you through the setup, changes the settings and starts the DJ.

“Tweakable DJ” is always **the same playlist with the same link**. Each run only replaces its contents.

---

## 3. What’s in the folder

**For using it**

| File | Purpose | Touch it? |
|---|---|---|
| `Tweakable DJ.cmd` | Starts the interface with a double-click (Windows) | yes, to start |
| `Tweakable DJ.command` | Starts the interface with a double-click (Mac) | yes, to start |
| `start.sh` | Starts the interface on Linux (`./start.sh` in a terminal). The Mac uses it too. | yes, to start |
| `config.jsonc` | All settings, each with an explanation on the same line. Also your credentials. Created during setup. | yes: via the interface or directly in an editor |
| `README.md` | This guide | read |
| `README.de.md` | This guide in German | read |

**Program** (only change it if you know what you’re doing)

| File | Purpose |
|---|---|
| `dj.mjs` | The DJ itself: controls a run from start to finish (steps in section 4) |
| `lineup.mjs` | The selection and ordering rules: the draw, “3 in 20”, gaps, comparing song titles |
| `spotify.mjs` | Connection to Spotify: login, reading Liked Songs, finding songs, writing the playlist |
| `lastfm.mjs` | Connection to Last.fm: similar songs and artists, your listening history |
| `config.mjs` | Reads and writes `config.jsonc` without destroying the comments |
| `i18n.mjs` | All messages of the program and the server in English and German (the interface texts are in `ui.html`) |
| `ui.mjs` | Small web server for the interface; starts the DJ at the push of a button |
| `ui.html` | The interface itself (setup wizard, controls, buttons, output), with all texts in English and German |
| `schedule.mjs` | Automatic runs: adds Tweakable DJ to your system’s scheduler (Windows Task Scheduler, macOS launchd, Linux cron) and reads its status |
| `update.mjs` | Checks at most once a day whether a new version is available on GitHub (see [Update check](#update-check)) |
| `package.json` | Shortcuts for developers: `npm start` (interface) and `npm test` (tests). Tweakable DJ needs no additional packages. |
| `tests/` | Automated tests for the rules, the translations, the interface and a test run in which Spotify and Last.fm are only simulated. Only in the GitHub repository, not in the ZIP file. |
| `config.example.jsonc` | Empty settings template with English explanations. It becomes your `config.jsonc` when you set up in English. |
| `config.example.de.jsonc` | The same template with German explanations (for setting up in German) |
| `overview.en.svg`, `overview.de.svg` | The diagram in section 2, in English and German |
| `docs/` | Screenshots of the interface for this guide, in English and German |
| `LICENSE` | The license (MIT), see section 10 |
| `.gitignore` | Makes sure `config.jsonc`, `tokens.json`, `state.json`, `lastfm-cache.json`, the files of automatic runs and the result of the update check are never uploaded |
| `.gitattributes` | Consistent line endings for Windows, Mac and Linux; marks images as binary. Only in the GitHub repository, not in the ZIP file. |
| `.github/` | Templates for bug reports and ideas, automated workflows on GitHub (e.g. the ZIP file for new versions). Only in the GitHub repository, not in the ZIP file. |

**Created automatically** (don’t edit)

| File | Purpose |
|---|---|
| `tokens.json` | Your Spotify login and when you logged in. **Don’t share it** – it would give someone access to your playlists. |
| `state.json` | The DJ’s memory: which songs were in the last runs and which Spotify searches are already done. Deleting it resets both. That does no harm; the next run just takes a little longer. |
| `lastfm-cache.json` | Cached answers from Last.fm (similar songs and artists), each valid for 7 days. Makes runs faster. Deleting it does no harm. |
| `automatik.json` | Result of the last automatic run (time, ✓ or the reason it failed). The interface shows it under *Rebuild automatically*. |
| `automatik.log` | The complete output of the last automatic run, for troubleshooting |
| `update-check.json` | Result of the last [update check](#update-check) (time and newest version). Deleting it does no harm. |

`config.jsonc` contains your Client ID and your Last.fm key. Neither is very sensitive, but you still shouldn’t share them publicly.

---

## 4. How a playlist is made

The numbers are the defaults. Yours are in `config.jsonc` or in the interface.

```
Liked Songs ─────┐
Last.fm top songs┼─► 20 starting points ─► ~150–200 candidates ─► new songs + favorites ─► order ─► “Tweakable DJ”
Listening now ───┘        (draw)              (Last.fm)              (draw + rules)        (rules)
```

1. **Set exclusions:** Whatever you played in the last 14 days, whatever was in the last 3 runs, and everything by artists on your block list stays out.
2. **Draw starting points:** 20 songs are drawn from your Liked Songs, your Last.fm top songs and what you’re listening to right now. If you’ve just been playing a song or its artist, it is 3× as likely to be drawn.
3. **Collect candidates:** For each starting point, Last.fm provides the 30 most similar songs. Sometimes the DJ also takes a detour to a related artist a bit further away. Known Liked Songs and excluded songs are dropped. The DJ remembers Last.fm’s answers for 7 days, so the next run is faster.
4. **Pick favorites:** 15% of the playlist comes from your Liked Songs. Artists you’re listening to right now are preferred.
5. **Draw new songs:** The candidates go into a lottery drum. “Adventure” sets how strongly similar songs are preferred; the factor sets how much current listening counts. Every drawn song has to pass the artist limits and is looked up on Spotify. It only goes in if title and artist match.
6. **Set the order:** The DJ tries up to 200 orders and takes the one that best follows the rules.
7. **Fill the playlist:** The contents of “Tweakable DJ” are replaced, and the new songs are remembered as “already played”.

Chance plays a part in steps 2 to 6, so every run looks different.

Songs from “Tweakable DJ” that you save with the heart become new Liked Songs and therefore starting points from the next run on.

---

## 5. Rules and settings

Every rule can be changed in `config.jsonc` or in the interface. The setting’s name is in parentheses. “Default” is the value the DJ uses if you haven’t set your own.

**What goes into the playlist**

| Rule | Default |
|---|---|
| Name of the playlist (`playlistName`). If it doesn’t exist, it is created. | Tweakable DJ |
| Source of your favorites (`seed`): your Liked Songs (`"liked"`) or one of your own or collaborative playlists. Favorites and most starting points come from here. | Liked Songs |
| Length of the playlist (`size`) | 50 songs |
| Share of favorites (`familiarShare`). The rest are new songs that aren’t in your Liked Songs. | 15% (≈ 8 songs) |
| Adventure (`adventure`): 0 = prefer similar songs, 0.5 = no preference, 1 = prefer distant songs. Also sets for how many starting points the DJ wanders off to related artists. | 0.4 |
| Starting points per run (`seedsPerRun`) | 20 |
| Also use your Last.fm top songs of the last 3 months as starting points (`useLastfmTopTracks`) | on |

**What you’re listening to now counts more**

| Rule | Default |
|---|---|
| “Current” is everything Last.fm says you played in this period (`currentDays`). | 7 days |
| Factor for current listening (`currentFactor`), 1 = off. With factor 3: | 3 |
| – A starting point is drawn 3× as often if you’re currently playing the song or its artist. The songs you’re currently playing are starting points too. | |
| – A new song found via such a starting point is 3× as likely to be drawn. | |
| – Favorites by artists you’re currently playing are picked 3× as often. | |

In the output, such songs are marked with “· current” (in German “· aktuell”).

**What stays out of the playlist**

| Rule | Default |
|---|---|
| Recently played (`excludeRecentDays`): everything Last.fm says you played in this period. 0 = off. | 14 days |
| Recent runs (`noRepeatRuns`): songs from the last N runs. 0 = off. | 3 runs |
| Block list (`blockedArtists`): artists that never come up, neither as a song nor as a starting point nor as a detour. Whole words count: “Macloud” also blocks “Miksu / Macloud” and “feat. Macloud”, but “Rin” doesn’t block “Karin”. | none |
| Songs that can’t be found unambiguously on Spotify (title and artist must match). Additions like “Remastered” or “feat.” are ignored in the comparison. | always |

**How often the same artist comes up**

| Rule | Default |
|---|---|
| At most N songs per artist in the whole playlist (`maxPerArtist`) | 2 |
| In every 20 consecutive songs, at most 3 songs for the same artist (`artistWindow`, `maxPerWindow`). This counts songs *by* the artist and new songs found *via* them (e.g. “new, via artist X”). With 50 songs, that’s at most 8 per artist. | 3 in 20 |
| Gap between two songs by the same artist (`artistGap`) | at least 4 songs in between |

**When not everything is possible at once**

- If the DJ finds too few new songs, it fills up with more favorites. These may include recently played favorites.
- For the order, “3 in 20” takes priority over the minimum gap.
- If a rule is still broken, the DJ shows a warning (⚠).

**Language**

| Setting | Default |
|---|---|
| Language of the interface and the output (`language`): `"en"` = English, `"de"` = German, `""` = not chosen yet. Also applies to automatic runs and the terminal. | `""`: the language of your browser (interface) or your system (terminal, automatic runs) |

---

## 6. Using Tweakable DJ

### With the interface

Double-click `Tweakable DJ.cmd` (Windows) or `Tweakable DJ.command` (Mac); on Linux, run `./start.sh` in a terminal. `node ui.mjs` in a terminal works everywhere too. Your browser opens <http://127.0.0.1:8899>.
On the very first start, your system may ask for confirmation, see [setup](#7-setup-one-time), step 3. If Tweakable DJ isn’t set up yet, the setup wizard appears instead of the controls.

- **Language** (top right, **DE | EN**): switches the whole interface immediately, including the wizard. Your choice is saved in `config.jsonc` (`language`) and then also applies to test runs, rebuilds, automatic runs and the terminal. Until you choose, the interface follows your browser’s language.
- **Presets**: four buttons set all rule controls at once:
  - *Discover*: lots of new songs, also further from your taste
  - *Familiar*: more favorites and very similar songs
  - *My current phase*: closely follows what you’re listening to right now
  - *Default*: the basic settings

  Name, source, number of songs and block list stay as they are. If your settings match a preset exactly, it is highlighted.
- **Controls**: each setting has a control, an explanation and a green hint showing what the value does right now. If a value differs from the default, clicking “Default: …” resets it.
- **Source of your favorites**: a list with your Liked Songs and your playlists. Only playlists you own or collaborate on are offered, because Spotify only shares the contents of those.
- **Block list**: enter an artist name and click *Add*. Remove it again with ×.
- **Save / Discard**: changes are only written to `config.jsonc` when you click *Save*.
- **Test run**: shows the selection without changing the playlist.
- **Rebuild playlist**: refills “Tweakable DJ” and then shows a link to Spotify.
- **Change credentials** (top right): opens the setup wizard with your previous entries.
- **Log in with Spotify**: appears when your Spotify login expires soon or has expired. Spotify requires a new login every 6 months.
- **Rebuild automatically**: *Off*, *Daily* or *Weekly*, plus the time and, if needed, the day of the week. When you click *Save*, Tweakable DJ adds itself to your system’s scheduler and then rebuilds the playlist by itself, even when the interface is closed. Below, you see the next run and the result of the last automatic run (✓ with the number of songs or ✗ with the reason). What happens if your computer is off at the set time:
  - Windows: the run is made up the next time you turn it on.
  - Mac: the run is made up after waking from sleep, but not after being switched off.
  - Linux: the run is skipped.
- **New version**: if a newer version of Tweakable DJ has been released, a notice with a download link appears at the top. Close it with ×; it only comes back for the next version. The bottom of the page shows which version you have (e.g. *v0.1.0*). More in [Update check](#update-check).

Both run buttons save first automatically. The interface can only be reached from your own computer; other devices on the network and other websites have no access.

<p align="center"><img src="docs/screenshot-run.en.png" width="640" alt="Result of a test run: Tweakable DJ with 50 songs, 40 of them new and 31 found via current listening, 10 favorites, followed by the steps of the run and the list of picked songs"></p>

### In the terminal

In the `tweakable-dj` folder ([how to open a terminal there](#open-a-terminal-in-the-folder)):

```
node dj.mjs          # refill the playlist
node dj.mjs --dry    # test run: only show, don't change the playlist
node dj.mjs login    # log in to Spotify (again)
node dj.mjs --auto   # like an automatic run: also writes automatik.log and automatik.json
node ui.mjs          # start the interface (also: npm start)
npm test             # automated tests; Spotify and Last.fm are only simulated
```

The output uses the language from `config.jsonc` (`language`), otherwise your system’s language. Three environment variables help in special cases:

| Variable | Effect |
|---|---|
| `TWEAKABLE_DJ_LANG` | `en` or `de`: language of the output for this call, takes priority over `language` |
| `TWEAKABLE_DJ_PORT` | A different port for the interface instead of 8899, e.g. if 8899 is already in use |
| `TWEAKABLE_DJ_NO_UPDATE_CHECK` | `1`: don’t check for new versions (see [Update check](#update-check)) |

Example on macOS and Linux: `TWEAKABLE_DJ_LANG=de node dj.mjs --dry`. In the Windows command prompt: first `set TWEAKABLE_DJ_LANG=de`, then `node dj.mjs --dry`.

### Update check

When you open the interface, Tweakable DJ checks **at most once a day** whether a new version has been released. For this, it sends a single request to the GitHub Releases API (`api.github.com`) that asks for the newest release of Tweakable DJ. **No personal data is sent**: no settings, credentials, songs or IDs. The answer is stored in `update-check.json`; if the check fails (e.g. offline), it tries again an hour later at the earliest. Only the interface checks, not runs in the terminal or automatic runs. It only shows a notice and never downloads or installs anything by itself.

To turn the check off, set the environment variable `TWEAKABLE_DJ_NO_UPDATE_CHECK=1` before starting:

- macOS and Linux: `TWEAKABLE_DJ_NO_UPDATE_CHECK=1 node ui.mjs`, or permanently with `export TWEAKABLE_DJ_NO_UPDATE_CHECK=1` in your shell profile (e.g. `~/.zshrc` or `~/.profile`)
- Windows: permanently with `setx TWEAKABLE_DJ_NO_UPDATE_CHECK 1` in the command prompt (once), then restart Tweakable DJ

---

## 7. Setup (one time)

You do these steps once before using Tweakable DJ for the first time, and again when you move to a new computer. It takes about 10 minutes.

1. **Download Tweakable DJ**: on the GitHub page of Tweakable DJ, click *Releases* on the right. For the newest version, download the file `tweakable-dj-v….zip` under *Assets* and unzip it (Windows: right-click → *Extract All*, Mac: double-click). Put the `tweakable-dj` folder in a permanent place, e.g. in *Documents*. Don’t start it directly from inside the ZIP file, or your settings will be lost. (If you use git, you can clone the repository instead.)
2. Install **Node.js** (<https://nodejs.org>, version 18 or newer). The DJ needs no other packages.
3. **Start Tweakable DJ** as described in the [quick start](#1-quick-start). The very first time, your system usually asks for confirmation because the file comes from the internet:
   - **Windows**: if “Windows protected your PC” appears, click *More info* → *Run anyway*. If “The publisher could not be verified” appears, click *Run*.
   - **Mac**: start `Tweakable DJ.command` with **right-click → Open** and choose *Open* again in the dialog. If the dialog offers no *Open* (newer macOS versions), close it and click *Open Anyway* further down under *System Settings → Privacy & Security*. After that, a double-click is enough.
   - **Linux**: in a [terminal in the folder](#open-a-terminal-in-the-folder) `tweakable-dj`, enter `./start.sh`.
   - **Mac and Linux, if “permission denied” appears**: the start file has lost its execute permission (happens e.g. when the folder was copied via Windows). In a [terminal in the folder](#open-a-terminal-in-the-folder) `tweakable-dj`, enter `chmod +x "Tweakable DJ.command" start.sh` once. On Linux, `sh start.sh` also works without that.
4. **Go through the setup wizard.** It appears in your browser by itself, explains each step with links and checks your entries right away. You can switch between English and German at the top right at any time.
   1. **Create a Spotify app** in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). The redirect URI `http://127.0.0.1:8888/callback` is important – exactly like this, not with `localhost` (the wizard has a copy button for it). You enter the **Client ID** in the wizard. The client secret isn’t needed.
   2. **Last.fm**: [create an API key](https://www.last.fm/api/account/create) (leave the callback URL empty) and enter it together with your Last.fm username. *Check* shows whether both are right and how many scrobbles Last.fm already knows from you. If it says 0, connect Spotify to Last.fm under [last.fm → Settings → Applications](https://www.last.fm/settings/applications).
   3. **Log in with Spotify**: a Spotify page opens; agree there.
   4. Choose the **source of your favorites**: your Liked Songs or one of your playlists.
   5. **Done**: the controls appear and you can start your first test run.

   The wizard creates the file `config.jsonc` by itself, with explanations in the language you have selected. Later, you can reach it via *Change credentials* at the top right.

   <p align="center"><img src="docs/screenshot-setup.en.png" width="560" alt="Step 1 of the setup wizard: create a Spotify app, with the redirect URI, a Copy button and a field for the Client ID; below it steps 2 to 5"></p>

**Setting up without the interface** (for those who prefer the terminal):

1. Copy `config.example.jsonc` (English explanations) or `config.example.de.jsonc` (German explanations) to `config.jsonc` and fill in:
   - `spotify.clientId`
   - `lastfm.apiKey`
   - `lastfm.user`: your Last.fm username
   - `seed`: `"liked"` for the songs you saved with the heart, or the link to one of your own playlists
   - `language`: `"en"` or `"de"` (empty = your system’s language)
2. Run `node dj.mjs login` and agree in the browser.

<a id="open-a-terminal-in-the-folder"></a>**Open a terminal in the folder**

- Windows: in the `tweakable-dj` folder, type `cmd` into the address bar at the top and press Enter
- Mac: open the *Terminal* app, type `cd ` (with a space), drag the `tweakable-dj` folder into the window and press Enter
- Linux: in the file manager, right-click in the folder → *Open in Terminal*

---

## 8. Troubleshooting

| Message / problem | Solution |
|---|---|
| “Spotify login expired” | Spotify requires a new login every 6 months: click *Log in with Spotify* in the interface (or run `node dj.mjs login`). The interface reminds you about 10 days in advance. |
| “Not logged in to Spotify yet” | `tokens.json` is missing: click *Log in with Spotify* in the interface (or run `node dj.mjs login`) |
| “Spotify denies access (403)” | The owner of the Spotify app needs Premium (required in development mode). If someone else uses your app, their account must be added in the [Spotify dashboard](https://developer.spotify.com/dashboard) under *User Management*. |
| Spotify page shows “INVALID_CLIENT: Invalid client” | The Client ID is wrong: copy it again from the dashboard via *Change credentials* |
| Spotify page shows “INVALID_CLIENT: Invalid redirect URI” | In the dashboard under *Settings*, the redirect URI must be exactly `http://127.0.0.1:8888/callback` (add it with *Add* and save) |
| “Port 8888 is in use” | A login is already running, e.g. in a terminal. Stop it and try again. |
| “The Last.fm API key is invalid” | Copy the key from Last.fm again via *Change credentials*: the *API key* field, not *Shared secret* |
| “The Last.fm user … doesn’t exist” | Check the spelling of your Last.fm username via *Change credentials* |
| “Last.fm has no scrobbles from …” | Spotify is probably not connected to Last.fm: connect it under [last.fm → Settings → Applications](https://www.last.fm/settings/applications). Until then, the rules for current listening don’t apply. |
| “config.jsonc is invalid” | Usually a comma is missing at the end of a line, or there is one too many (there must be none after the last entry) |
| “The seed playlist is empty or can’t be read” | Spotify only returns playlists you own or collaborate on. In the interface, choose a playlist from the list under *Source of your favorites*; only readable ones are listed there. |
| “A run is already in progress” | Wait until the current test run or rebuild is finished (about 1 minute) |
| The interface doesn’t open / page can’t be reached | The console or terminal window of Tweakable DJ was closed: start Tweakable DJ again |
| “Node.js was not found”, “Node.js is not installed” or “'node' is not recognized as an internal or external command” | Install Node.js ([setup](#7-setup-one-time), step 2) and restart Tweakable DJ. If it still doesn’t work, log out and back in once. |
| “Node.js is too old” or “Tweakable DJ needs Node.js 18 or newer” | Install the newest version from <https://nodejs.org> |
| Mac: “… can’t be opened because it is from an unidentified developer” | The first time, start it with right-click → *Open* ([setup](#7-setup-one-time), step 3) |
| Mac/Linux: “permission denied” | Run `chmod +x "Tweakable DJ.command" start.sh` once in the `tweakable-dj` folder ([setup](#7-setup-one-time), step 3) |
| Warning ⚠ “The rule … couldn’t be kept everywhere” | The rules are too strict for the songs found, e.g. “1 in 20” with 50 songs. Relax one rule. |
| Many songs via the same artist | For some artists and genres, Last.fm returns many more similar songs than for others. Reduce “Songs per artist in the window”. |
| Current listening barely counts | Check whether Last.fm records your listening (last.fm → your profile). Increase the factor. |
| A particular song is never found | If Spotify can’t find a song, the DJ remembers that in `state.json` (search errors, e.g. without internet, are not remembered). Delete `state.json` to search again. |
| Similar songs should come fresh from Last.fm | Delete `lastfm-cache.json`. Otherwise the DJ keeps using Last.fm’s answers for up to 7 days. |
| An automatic run didn’t happen | Under *Rebuild automatically* you see the reason for the last run. Common causes: the computer was off (see [Using Tweakable DJ](#with-the-interface)), or the Spotify login has expired (then click *Log in with Spotify*). Details are in `automatik.log`. |
| “Automatic runs still point to a different folder” | The folder was moved or copied. Click *Save automatic runs* once, and the scheduler entry points to the right folder again. |
| “The scheduler still has an entry under the old name …” | Automatic runs were set up under the project’s former name “Mein DJ”. Click *Save automatic runs* once (or *Remove entry* if automatic runs are off), and Tweakable DJ replaces the old entry. |
| Interface or output in the wrong language | Choose **DE** or **EN** at the top right. That saves `language` in `config.jsonc`, which from the next run on also applies to automatic runs and the terminal. |
| Deleting or moving the folder | First set automatic runs to *Off* and save. Otherwise an entry stays behind in the scheduler that leads nowhere. |

---

## 9. Limitations

- **No endless mode:** the playlist has a fixed length. When it has finished, Spotify’s autoplay takes over (if enabled), which doesn’t know your rules. For new songs, click “Rebuild playlist”.
- **Automatic runs need your computer:** Tweakable DJ runs on your PC or Mac, not on the internet. The computer must be on at the set time. Missed runs are made up by Windows the next time it starts, by the Mac only after sleep, and not at all by Linux. Automatic runs haven’t been tested on a real Mac yet.
- **Spotify’s rules:** the Spotify app runs in development mode. This requires a Premium account for the owner, and at most 5 people may use the app.
- **Last.fm as a source:** how good the suggestions are depends on how much data Last.fm has about a song. For very new or little-known songs, Last.fm often finds nothing similar. The DJ caches similar songs and artists for 7 days, as Last.fm requires. New data from Last.fm therefore arrives with up to a week’s delay. Your listening history, on the other hand, is always fetched fresh.
- **Two languages:** interface, messages and output are available in English and German. Names of songs, artists and playlists stay as they are on Spotify and Last.fm.

---

## 10. Data sources, trademarks and license

**Spotify**

- **Tweakable DJ is not an official Spotify product.** It is an independent project. It is not affiliated with Spotify and is neither endorsed nor reviewed by Spotify.
- Spotify is a trademark of Spotify AB. The name is used here only to say which service Tweakable DJ works with.
- Liked Songs, song search and playlist go through the [Spotify Web API](https://developer.spotify.com/documentation/web-api) and your own Spotify app. The [Spotify Developer Terms](https://developer.spotify.com/terms), which you accept when creating the app, apply.

**Last.fm**

- **Similar songs, similar artists and your listening history come from [Last.fm](https://www.last.fm)** (powered by AudioScrobbler).
- According to its [terms of service](https://www.last.fm/api/tos), the [Last.fm API](https://www.last.fm/api) may **only be used non-commercially**. Every user uses their own API key and is responsible for following these terms.
- Tweakable DJ is an independent project and not affiliated with Last.fm.

**License**

- The code is released under the **MIT License** (see [`LICENSE`](LICENSE)). You may use, change and share it freely. The license only covers the code, not the data from Last.fm or Spotify.
