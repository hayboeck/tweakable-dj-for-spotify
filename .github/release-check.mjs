#!/usr/bin/env node
// Prüft vor dem Veröffentlichen Tag, package.json und CHANGELOG.md und sagt, wie das Release angelegt wird (aufgerufen von
// .github/workflows/release.yml als erster Schritt, im Ordner des Repositorys):
//   node .github/release-check.mjs <Tag> [<alle Tags v* des Repositorys> …]
// Ausgabe (auf die Konsole und, im Ablauf auf GitHub, in die Datei $GITHUB_OUTPUT):
//   version=0.4.0-beta.1
//   prerelease=true            true = Vorabversion: Release als „Pre-release“, nie als „Latest“
//   title=Tweakable DJ for Spotify v0.4.0-beta.1 (Vorabversion / pre-release)
//   previous=v0.1.0 v0.2.0 …   frühere Releases für die Liste überholter Dateien (obsolete in manifest.json)
// Bei einem Problem: Meldung als ::error:: und Exit-Code 1, dann wird nichts veröffentlicht.
//
// Regeln:
//   - Der Tag ist v + eine Versionsnummer nach SemVer: v1.2.3 (reguläre Version) oder v1.2.3-<Vorab-Kennung> wie
//     v0.4.0-beta.1 oder v0.4.0-rc.1 (Vorabversion). Ohne Build-Angabe (+…) und ohne führende Nullen.
//   - "version" in package.json ist genau diese Versionsnummer. Sonst sähe man den Hinweis auf die neue Version (update.mjs
//     vergleicht den Tag des neuesten Releases mit package.json) auch mit der neuen ZIP-Datei immer wieder.
//   - CHANGELOG.md hat einen Abschnitt „## [<Version>] …“ mit Punkten auf Englisch und Deutsch: Daraus zeigt die Oberfläche
//     nach dem Update „Neu in v…“ (whatsnew.mjs); [Unreleased] allein genügt nicht.
//   - Frühere Releases (previous) sind alle Tags mit gültiger, kleinerer Versionsnummer – Vorabversionen eingeschlossen. Ihre
//     Dateien, die es jetzt nicht mehr gibt, kommen mit Prüfsumme in obsolete; „Jetzt aktualisieren“ löscht sie nur, wenn sie
//     Byte für Byte so im Programmordner liegen. Wer eine Vorabversion von Hand installiert hat und auf die reguläre Version
//     aktualisiert, wird so auch deren überholte Dateien los; bei allen anderen liegen sie gar nicht im Ordner, es passiert
//     also nichts. Neuere Tags zählen nicht (z. B. eine Fehlerbehebung 0.3.4 nach 0.4.0-beta.1: Die Dateien der Vorabversion
//     sind für 0.3.4 nicht „überholt“, sondern noch gar nicht erschienen).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions, isPrerelease } from '../update.mjs';
import { parseChangelog } from '../whatsnew.mjs';

export const APP_NAME = 'Tweakable DJ for Spotify';
// SemVer 2.0.0 ohne Build-Angabe: Kern ohne führende Nullen, Vorab-Kennungen aus [0-9A-Za-z-], numerische ohne führende Nullen
const IDENT = '(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)';
export const SEMVER = new RegExp(`^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-${IDENT}(?:\\.${IDENT})*)?$`);
const TAG = new RegExp(`^v(${SEMVER.source.slice(1, -1)})$`);

// Versionsnummer zu einem Tag (ohne v) oder null.
export function tagVersion(tag) {
  return TAG.exec(String(tag ?? ''))?.[1] ?? null;
}

// Prüft Tag, Version aus package.json und Text von CHANGELOG.md; wirft mit verständlicher Meldung.
// Ergebnis: { version, prerelease, title }
export function releaseInfo(tag, pkgVersion, changelog) {
  const version = tagVersion(tag);
  if (!version) {
    throw new Error(`Tag ${tag} ist keine Versionsnummer nach SemVer (erwartet z. B. v1.2.3 oder v1.2.3-beta.1).`);
  }
  if (pkgVersion !== version) {
    throw new Error(`Tag ${tag} passt nicht zu "version": "${pkgVersion}" in package.json (erwartet: "${version}").`);
  }
  for (const [lang, name] of [['en', 'English'], ['de', 'Deutsch']]) {
    if (!parseChangelog(changelog, version, lang)) {
      throw new Error(`CHANGELOG.md hat keinen Abschnitt „## [${version}] …“ mit Punkten unter „### ${name}“.`);
    }
  }
  const prerelease = isPrerelease(version);
  const title = `${APP_NAME} v${version}${prerelease ? ' (Vorabversion / pre-release)' : ''}`;
  return { version, prerelease, title };
}

// Frühere Releases zu tag: alle Tags mit gültiger Versionsnummer, die kleiner ist (siehe oben), aufsteigend sortiert.
export function previousTags(tag, tags) {
  const version = tagVersion(tag);
  return [...new Set(tags)]
    .filter(t => tagVersion(t) && compareVersions(tagVersion(t), version) < 0)
    .sort((a, b) => compareVersions(tagVersion(a), tagVersion(b)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [tag, ...tags] = process.argv.slice(2);
  try {
    if (!tag) throw new Error('Aufruf: node .github/release-check.mjs <Tag> [<Tags früherer Releases> …]');
    let pkgVersion;
    try {
      pkgVersion = JSON.parse(fs.readFileSync('package.json', 'utf8').replace(/^﻿/, '')).version;
    } catch (e) {
      throw new Error(`package.json nicht lesbar: ${e.message}`);
    }
    const changelog = fs.existsSync('CHANGELOG.md') ? fs.readFileSync('CHANGELOG.md', 'utf8') : null;
    const info = releaseInfo(tag, pkgVersion, changelog);
    const lines = [`version=${info.version}`, `prerelease=${info.prerelease}`, `title=${info.title}`,
      `previous=${previousTags(tag, tags).join(' ')}`];
    // Im Ablauf auf GitHub direkt nach $GITHUB_OUTPUT (die Ausgabe bleibt fürs Protokoll), sonst nur auf die Konsole
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
    console.log(lines.join('\n'));
  } catch (e) {
    console.log(`::error::${e.message}`);
    process.exit(1);
  }
}
