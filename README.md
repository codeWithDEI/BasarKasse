# Basarkasse Rötgesbüttel

Eine erste durchgängig nutzbare Webanwendung für einen Nummernbasar. Alle Veranstaltungen befinden sich in dieser Version im **Übungsbetrieb**. Die Vorschau ist privat. Ein Einsatz mit echtem Bargeld ist damit noch nicht freigegeben.

## Ausprobieren

1. In der Kasse auf **Anmelden & Kasse öffnen** tippen.
2. **Übung als Kassenleitung** wählen. Alternativ: Kassenleitung auswählen und Übungs-PIN `1234` eingeben. Auch die Rolle „Kassiererin“ hat im Übungsbetrieb die PIN `1234`.
3. Eine Kasse mit Anfangswechselgeld öffnen.
4. Verkäufernummer und Preis eingeben. Enter wechselt vom Verkäuferfeld zum Preis; das nächste Enter fügt die Position hinzu.
5. Optional unter **Aufrunden auf** den gewünschten Gesamtbetrag eingeben. Beispiel: 6,50 € Warenwert, auf 7 € aufrunden, 10 € erhalten ergibt 0,50 € Trinkgeld für den Verein und 3 € Rückgeld. Der Verkäufererlös bleibt 6,50 €. Danach erhaltenes Bargeld eingeben oder „Passend“, 10 €, 20 €, 50 € wählen. Verkauf abschließen, Rückgeld herausgeben, „Nächster Einkauf“ wählen.
6. Unter „Verkäufe“ lassen sich Einkäufe ansehen und durch die Kassenleitung vollständig stornieren.
7. Die Kassenleitung beendet die Verkaufsphase. Danach werden Verkäufer ausgezahlt. Jede Auszahlung wird einer offenen Geldkasse zugeordnet.
8. Kassen zählen und abschließen. Abweichungen benötigen eine Notiz. Anschließend die Veranstaltung schließen.

Die vorgegebene Übungsveranstaltung hat Verkäufernummern 1–150, drei Kassen und 15 % Vereinsanteil. Diese Werte sind Beispiele. Neue Veranstaltungen und eigene Teammitglieder können in der Verwaltung angelegt werden. Einstellungen werden mit Öffnung der ersten Kasse gesperrt.

## Umgesetzte Funktionen

- Tablet- und Mobiloberfläche mit vier Bereichen: Kasse, Verkäufe, Abrechnung, Verwaltung.
- Mehrere Veranstaltungen und Kassen; Geldkassette und angemeldete Person sind getrennte Identitäten.
- Persönliche PIN-Anmeldung, gehashte PINs mit PBKDF2, zeitlich befristete HttpOnly-Sitzungen und serverseitige Rollenprüfung.
- Manueller Warenkorb aus Verkäufernummer und Preis, Korrektur vor Abschluss, Bargeld und Rückgeld.
- Aufrunden / Trinkgeld wird separat für den Verein gespeichert, ohne den Verkäufererlös oder dessen Provision zu erhöhen. Kassenbestand, Stornos, Verkaufsdetails, Gesamtabrechnung und CSV-Export berücksichtigen den Betrag.
- Ausschließlich ganzzahlige Centbeträge. Vereinsanteil wird einmal je Verkäufer auf die Summe berechnet, kaufmännisch auf Cent gerundet.
- Zentrale, persistente Speicherung. Geschützte Mehrfachbuchung bei Netzunterbrechung: jeder Auftrag hat eine Vorgangskennung.
- Gleichzeitige Kassenbuchungen werden über eine Veranstaltungsrevision und atomare Datenbanktransaktionen koordiniert.
- Lokale Entwürfe und zuletzt angezeigtes Rückgeld überstehen Neuladen. Das sind keine Offlinebuchungen.
- Vollstorno mit Person, Zeitpunkt und Grund; keine Löschung des ursprünglichen Verkaufs. Nach Kassenabschluss oder Verkäuferauszahlung sind betroffene Stornos gesperrt.
- Einlagen, Entnahmen, Verkäuferauszahlungen und Kassenabschluss mit Soll/Ist und Differenz.
- Eine Auszahlung pro Verkäufer und Veranstaltung, durch Datenbank und Buchungslogik abgesichert.
- Verkäuferabrechnung, CSV-Exporte, Druck / PDF über den Browser, JSON-Datenexport und Aktivitätsprotokoll.
- Automatische Aktualisierung der zentralen Übersicht alle zwölf Sekunden; vor jeder Buchung wird der aktuelle Zustand serverseitig geprüft.

## Geschützte Vorführung für den Förderverein

Die separate Demo-Installation für den Portal-Server ist in [selfhost/README-demo.md](selfhost/README-demo.md) beschrieben. Sie verwendet `/basarkasse`, einen zusätzlichen HTTPS-Zugangsschutz und eine eigene Testdatenbank. Die Betriebs- und Sicherheitskorrekturen werden durch zusätzliche HTTP- und Buchungstests abgesichert.

## Eigenen Server verwenden

Die Oberfläche und Buchungslogik sind dieselben wie in der gehosteten Vorschau. Lokal arbeitet Next.js mit einer SQLite-Datei; die Vorschau verwendet D1. Die SQLite-Datei liegt außerhalb des Quellcodes. Es gibt keine Abhängigkeit von WordPress oder einem ChatGPT-Login für die eigene Installation.

Voraussetzung: Linux mit Docker Compose oder Node.js 24 und pnpm 11.25.0. Vor einer öffentlich erreichbaren Testinstallation den Zugang zusätzlich über den bestehenden Server schützen, etwa durch vorgeschaltete Anmeldung. Die bekannten Übungsrollen bleiben in dieser ersten Version bewusst verfügbar.

### Mit Docker Compose

```sh
docker compose up -d --build
```

Für einen HTTPS-Reverse-Proxy muss `BASAR_PUBLIC_ORIGIN` auf die öffentliche HTTPS-Origin gesetzt werden, etwa `https://kasse.example.org`, ohne Pfad.

Die Anwendung lauscht danach nur am Host-Loopback unter `127.0.0.1:3000`. Das benannte Volume `basar-data` enthält die SQLite-Datenbank und bleibt bei Containerwechsel erhalten. Für den Zugang auf Tablets einen HTTPS-Reverse-Proxy auf dem vorhandenen Server konfigurieren. Ein Beispiel für den `location`-Block liegt in `selfhost/nginx.example.conf`. Die konkrete Domain und TLS-Konfiguration gehören zum vorhandenen Server.

Das Docker-Image baut die getestete Next.js-Variante. Docker selbst wurde in der Entwicklungsumgebung nicht ausgeführt.

### Ohne Docker

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm run build:selfhost
BASAR_PUBLIC_ORIGIN=http://127.0.0.1:3000 HOSTNAME=127.0.0.1 PORT=3000 BASAR_DATABASE=/var/lib/basarkasse/basarkasse.sqlite pnpm run start:selfhost
```

Der Dienst benötigt Schreibrechte auf das Datenverzeichnis und sollte über systemd oder einen vergleichbaren Dienstmanager gestartet werden. Datenbankmigrationen werden beim Start in einer Transaktion angewendet. Bei Schemaänderungen werden neue Migrationen ergänzt, bestehende Migrationen nicht verändert.

### Sicherung und Wiederherstellung

Für eine konsistente Sicherung einer laufenden selbst gehosteten Datenbank:

```sh
BASAR_DATABASE=/var/lib/basarkasse/basarkasse.sqlite node selfhost/backup.mjs /sicherungen/basarkasse.sqlite
```

Für die Wiederherstellung den Dienst anhalten, Datenbank **einschließlich vorhandener `-wal`- und `-shm`-Dateien** beiseitelegen, die Sicherung an den konfigurierten Datenbankpfad kopieren und die Dateirechte wiederherstellen. Danach den Dienst starten und Veranstaltungen, Anzahl der Verkäufe und Kassenabschlüsse prüfen. Der JSON-Export enthält die Daten einer Veranstaltung und dient zur zusätzlichen Kontrolle; ein automatischer JSON-Import ist nicht enthalten. Technische SQLite-Sicherung und Wiederöffnung einer Sicherung werden im Test geprüft.

## Aufbau

- `app/page.tsx`, `app/globals.css`: Tablet-Oberfläche.
- `app/api/basar/route.ts`: zentraler API-Endpunkt, Sitzungs- und Ursprungsprüfung.
- `lib/basar/domain.ts`: Centberechnung, Validierung und Abrechnungsformeln.
- `lib/basar/service.ts`: Berechtigungen und atomare Buchungen.
- `db/schema.ts`, `drizzle/`: versioniertes Datenbankschema.
- `worker/index.ts`: gehostete D1-Anbindung.
- `selfhost/`: SQLite-Adapter, Serverstart und Sicherung für den eigenen Server.
- `compose.yaml`, `Dockerfile`: vorbereitete Serverinstallation.

## Prüfen

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm run build:selfhost
```

Die Tests prüfen Rundung, Eingabevalidierung, Stornos, Kassenbestände, Rechte, Sitzungen, parallele Verkäufe, doppelte Anfragen, Auszahlungssperren, Veranstaltungsabschluss und Transaktions-Rollback. Die Browserprüfung umfasst Anmeldung, Kassenöffnung, manuellen Einkauf, Rückgeld und Abrechnung gegen eine echte lokale D1-Datenbank.

## Abgrenzung dieser Version

- **Übungsbetrieb:** keine TSE-Anbindung, keine fiskalische Belegausgabe und kein Finanzamtsexport. Die Anforderungen für den konkreten Veranstalter müssen vor einem echten Einsatz verbindlich feststehen.
- **Ohne Artikelnummern:** keine automatische Erkennung eines erneut erfassten physischen Artikels und keine Bestandsführung unverkaufter Ware.
- **Verbindung erforderlich:** bei Netzausfall bleibt der Entwurf erhalten, neue Verkäufe werden pausiert. Noch nicht bestätigte Anfragen können mit derselben Kennung sicher wiederholt werden.
- **Vollstorno:** Teilrückgaben, nachträgliche Auszahlungsberichtigungen und Korrekturen bereits abgeschlossener Kassen sind noch nicht enthalten.
- **Erste Teamverwaltung:** Teammitglieder können angelegt werden; PIN-Wechsel und Deaktivierung über die Oberfläche sind noch nicht enthalten.
- Es wurden keine Änderungen am Server oder an WordPress des Rötgesportals vorgenommen. Die Installation dort benötigt den vorhandenen Deploymentzugang und die konkrete Serverkonfiguration.

## Hosted-Entwicklung

Die gehostete Variante verwendet den mitgelieferten Vinext-Workflow. Die Hosting-Konfiguration steht in `.openai/hosting.json`, Datenbankmigrationen werden aus `drizzle/` angewendet. Secrets, Laufzeitdaten und Entwicklungszustand sind aus Git ausgeschlossen.
