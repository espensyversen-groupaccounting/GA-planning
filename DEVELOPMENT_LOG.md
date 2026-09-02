# Development Log

## v1.7.1 - 2026-09-02

### Ombrekking av ToDo-titler
- Lar ToDo-titler brytes naturlig over opptil tre linjer i sidepanelet, ToDo-fanen, Oppgaver-fanen og mobilarket.
- Bruker `-webkit-line-clamp: 3` med ellipse for svært lange titler og `overflow-wrap: anywhere` for lange ord og URL-er uten mellomrom.
- Kort med korte titler beholder sin naturlige høyde. Kortstrukturen, drahåndtaket, avkryssingen, slettingen, beskrivelsesforhåndsvisningen og badges er uendret.

### Avgrensning og versjon
- Den eneste funksjonelle UI-endringen er i `.todo-title` i `styles.css`. `app.js`, `service-worker.js` og `firestore.js` har kun versjonsbump; `js/todos.js`, `index.html`, Firestore-regler og tester er urørt.
- Versjon bumpet til `1.7.1` i alle tre versjonskilder; klientbuild er `1701`.

### Kontroll
- Isolert Chrome-layouttest består med 13 assertions for normal tittel, trelinjers clamp, ca. 470 tegn, langt ord/URL, naturlig korthøyde, kontrollplassering, mobil-/panelbredde, bred ToDo-visning og plassholderhøyde ved draging.
- Hashkontroll mot v1.7.0 bekrefter at `js/todos.js`, `index.html`, `firestore.rules` og regeltestene er byte-for-byte uendret.
- `node --check` består for alle fire JavaScript-filer, og Firestore-emulatortestene består 19 av 19.

## v1.7.0 - 2026-09-02

### Manuell ToDo-prioritering
- La til én delt `sortOrder`-rekkefølge for åpne ToDo-er i sidepanelet og ToDo-fanen. Hastesignaler beholdes som fakta på kortene, men styrer ikke lenger rekkefølgen i disse listene.
- La Admin og Teamleder flytte åpne kort fra et eget 44 x 44 px drahåndtak med Pointer Events, 200 ms trykk-og-hold på berøring, automatisk rulling og dempet visuell plassholder.
- La Enter/mellomrom aktivere tastaturflytting, pil opp/ned endre plass, Enter bekrefte og Escape avbryte. Flyttestatus annonseres i en `aria-live`-region.
- Fullførte ToDo-er beholder tidligere sortering og kan ikke flyttes. Klikk på kort, avkryssing, sletting og redigering er ellers uendret.

### Lagring og synkronisering
- La første flytting normalisere alle åpne ToDo-er i den globale teamrekkefølgen når ett eller flere dokumenter mangler `sortOrder`. Dette unngår kollisjoner mellom synlige og skjulte elementer i filtrerte visninger.
- Senere flyttinger skriver kun det flyttede ToDo-dokumentet ved å plassere det mellom de faktiske globale naboene. Listen normaliseres på nytt bare når tallavstanden er blitt for liten.
- Holder aktiv draoperasjon stabil mot sanntids-rerender, viser endringen optimistisk og gjenoppretter forrige rekkefølge med norsk feilmelding dersom lagringen feiler.

### Avgrensning og versjon
- Ingen endringer i Firestore-regler, regeltester, oppgaver, dashboardtall, tellevilkår, filtre eller eksportlogikk. JSON-eksporten inkluderer `sortOrder` automatisk som del av rådataene.
- Versjon bumpet til `1.7.0` i `app.js`, `service-worker.js` og `firestore.js`; klientbuild er `1700`.

### Kontroll
- Firestore-emulatortestene består uendret: 19 av 19.
- `node --check` består for `app.js`, `js/todos.js`, `firestore.js` og `service-worker.js`.
- Isolert Chrome-test består med 24 assertions for mus, 200 ms berøringsforsinkelse, mobilrulling, berøringsflytting, tastatur, Escape, slipp utenfor listen, fullførte kort, global rekkefølge fra filtrert visning, normalisering, én-dokumentskriving og rollback etter simulert state-erstatning.
- Visuell mobilkontroll bekrefter at 44 x 44 px-håndtaket ikke overlapper tittel, metadata, avkryssing eller sletting.

## v1.6.2 - 2026-09-02

### Rettet
- Fjernet den ekstra `unassigned-chip`-fallbacken fra både oppgave- og ToDo-kort, slik at `Ikke tildelt` bare kommer fra `taskSignals()`.
- Beholder ett `Ikke tildelt`-signal også på fullførte kort uten ansvarlig, uten å endre telling, filter eller hastepoeng.
- Fjernet den nå ubrukte `.unassigned-chip`-stylingen.

### Standardtildeling i ToDo-panelet
- La til en synlig, kompakt ansvarligbrikke som er synkronisert med ansvarlig-feltet under `Flere valg`.
- Bruker innlogget bruker som standard i Dashboardets `Mine`-visning, og `Ikke tildelt` i `Team` og Oppgaver.
- Bevarer manuell overstyring ved Team/Mine-bytte og går tilbake til gjeldende standard etter opprettelse, mens tittelfeltet beholder fokus.

### Avgrensning og versjon
- Ingen endringer i datamodell, eksport, toppkort, filtre, hasteberegning, kollapslogikk, Firestore-regler eller regeltester.
- Versjon bumpet til `1.6.2` i `app.js`, `service-worker.js` og `firestore.js`; klientbuild er `1602`.

### Kontroll
- Firestore-emulatortestene består uendret: 19 av 19.
- `node --check` består for `app.js`, `js/todos.js`, `firestore.js` og `service-worker.js`.
- Isolert UI-test består med 24 assertions for én `Ikke tildelt`-markering, tildelt bruker, Mine/Team/Oppgaver-standarder, manuell overstyring, synkroniserte felt og reset/fokus etter opprettelse.
- Kodekontroll bekrefter at toppkortets opptelling og hurtigfilterets `!assignedTo`-vilkår er uendret.

## v1.6.1 - 2026-09-02

### Rettet
- Lar hovedinnholdet utvide seg inn i plassen som frigjøres når desktop-panelet kollapses.
- Holder den kollapsede panelstripen helt inntil høyre skjermkant uten et tomt område etter stripen.
- Synkroniserer overgangene for innholdets maksimumsbredde og panelbredden, slik at kortene utvider seg jevnt.
- Korrigerer pilretningen: innover når panelet er utvidet og utover når det er kollapset.

### Avgrensning og versjon
- Mobilarket, ToDo-funksjonalitet, `localStorage`, eksport, Dashboard, Oppgaver, hasteberegning, Firestore-regler og testfiler er uendret.
- Versjon bumpet til `1.6.1` i `app.js`, `service-worker.js` og `firestore.js`; klientbuild er `1601`.

### Kontroll
- Firestore-emulatortestene består uendret: 19 av 19.
- `node --check` består for `app.js`, `js/todos.js`, `firestore.js` og `service-worker.js`.
- Hashkontroll mot v1.6.0 bekrefter at `index.html`, `js/todos.js`, `firestore.rules` og regeltesten er byte-for-byte uendret.
- Desktopberegning bekrefter at innhold, sidebar og 56 px panelstripe fyller hele tilgjengelig bredde i kollapset tilstand.

## v1.6.0 - 2026-09-02

### ToDo-panel og arbeidsflyt
- La til et vedvarende ToDo-panel på Dashboard og Oppgaver for Admin og Teamleder, med rask opprettelse via tittel og Enter.
- La ansvarlig, frist og prioritet ligge i en kompakt «Flere valg»-utvidelse, og behold fokus i tittelfeltet etter opprettelse.
- Panelet følger `Team`/`Mine`, bruker eksisterende hastegradssortering og husker kollapstilstand i `localStorage`.
- Bruker responsivt panel på mellomstore skjermer og bunnark på mobil, med X, Escape og beskyttet backdrop-lukking over bunnnavigasjonen.
- Fjernet den tidligere `Korte ToDo's`-seksjonen fra dashboardet. ToDo-bidrag til toppkort og prioriteringsvisning er uendret.

### ToDo-kort og data
- Gjorde hele ToDo-kortet klikkbart og tastaturtilgjengelig; avkryssing og sletting stopper hendelsespropagering.
- La til valgfri, escapet beskrivelse med kompakt forhåndsvisning og støtte for eldre ToDo-er uten feltet.
- La til `Beskrivelse` etter `Tittel` i ToDo-CSV. JSON-eksporten får feltet automatisk.

### Arkitektur og versjon
- Flyttet eksisterende ToDo-funksjoner rent ut av `app.js` før funksjonelle endringer og samlet dem med ny panellogikk i `js/todos.js`.
- La `js/todos.js` inn i klassisk scriptrekkefølge etter `firestore.js` og før `app.js`, og i service workerens app-cache.
- Ingen endringer i Firestore-regler, regeltester, oppgavedatamodell eller hasteberegning.
- Versjon bumpet til `1.6.0` i `app.js`, `service-worker.js` og `firestore.js`; klientbuild er `1600`.

### Kontroll
- Firestore-emulatortestene består uendret: 19 av 19.
- `node --check` består for `app.js`, `js/todos.js`, `firestore.js` og `service-worker.js`.
- Isolert UI-/DOM-test består med 24 assertions for panel, scope, kollaps, kortinteraksjon, escaping, beskrivelse, rask opprettelse, CSV og script/cache-rekkefølge.
- Lokal HTTP-kontroll returnerer 200 for `index.html`, `js/todos.js` og `service-worker.js`.

## v1.5.1 - 2026-09-02

### Rettet
- Legger `sep=;` på første tekstlinje i begge CSV-eksportene, slik at Excel deler innholdet i riktige kolonner også når Windows er konfigurert med komma som listeskilletegn.
- Beholder den kritiske rekkefølgen UTF-8 BOM, `sep=;`, kolonneoverskrifter og datarader, med `CRLF` som linjeskift.
- JSON-eksport, CSV-kolonner, kolonnerekkefølge, datoformat, siteringslogikk og filnavn er uendret.

### Avgrensning og versjon
- Ingen endringer i Firestore-regler, tester, HTML, styling, datamodell eller øvrig funksjonalitet.
- Versjon bumpet til `1.5.1` i `app.js`, `service-worker.js` og `firestore.js`; klientbuild er `1501`.

## v1.5.0 - 2026-09-02

### Eksport og sikkerhetskopi
- La til et Admin-kort for manuell eksport under Administrasjon, med fremdrift, resultat og tydelig beskjed om at kopien ikke er automatisk.
- Henter komplette rå snapshots av `tasks`, `todos`, `categories`, `users`, `allowedUsers` og `comments` med ett engangsoppslag per samling.
- Beholder soft-slettede oppgaver og ToDo-er i eksporten; avledede varsler er utelatt.
- Lager én autoritativ JSON-fil med dokument-ID-er, metadata, tellinger og rekursiv ISO 8601-konvertering av Firestore-timestamps.
- Lager norske CSV-uttrekk for oppgaver og ToDo-er med semikolon, UTF-8 BOM, korrekt sitering, lesbare datoer, ansvarlignavn og arkivmarkering.
- Klargjør alle filer etter vellykket datainnhenting og starter deretter tre nedlastinger med kort mellomrom. Objekt-URL-er tilbakekalles etter bruk.
- Avbryter før filgenerering dersom én samling ikke kan leses, og gir egen norsk melding ved `permission-denied`.

### Tilgang og avgrensning
- Eksportkortet og eksporthandleren er kun tilgjengelige for rollen Admin i klienten.
- Dagens Firestore-regler gir alle allowlistede roller lesetilgang til samlingene. Admin-only er derfor en UI-/arbeidsflytbegrensning i denne fasen, ikke en ny serverside-sikkerhetsgrense.
- Ingen endringer i Firestore-regler, regeltester, datamodell, eksisterende skriving, dashboard, filtre, sortering eller oppgavemodal.

### Versjon
- Versjon bumpet til `1.5.0` i `app.js`, `service-worker.js` og `firestore.js`; klientbuild er `1500`.

## v1.4.3 - 2026-09-02

### Rettet
- Bevarer valgt ansvarlig i oppgavemodal, ToDo-skjemaer og ansvarligfiltre når brukerlisten oppdateres i sanntid, inkludert filterverdien `__unassigned`.
- Samler oppdatering av select-alternativer i én hjelper og fjerner den ubrukte `filterOpts`-variabelen.
- Gjør bekreftelsesdialogen til en enkelt aktiv instans og rydder alle lyttere ved OK, Avbryt og Escape.
- Behandler Escape som en dialogstabel: bekreftelsesdialog først, deretter ToDo- eller oppgavemodal.
- Gir norsk feiltilbakemelding for alle deloppgaveoperasjoner og gjenoppretter UI fra oppdatert oppgavetilstand ved feil.
- Deaktiverer deloppgaveavkryssing og skjuler redigeringskontroller for brukere uten `canEdit()`.
- Korrigerer headeroppslaget slik at brukerens fornavn vises.
- Sikrer inline admin-handlere med `JSON.stringify()` før HTML-escaping, og utvider vanlig HTML-escaping med apostrof.

### Avgrensning
- Ingen endringer i Firestore-regler, datamodell, feltnavn, dashboardlogikk, hasteberegning, filtre eller sorteringsrekkefølge.
- `firestore.js` er bare endret i klientversjon og buildnummer.
- Ingen endringer i `index.html`, `styles.css` eller `firebase-config.js`.

### Kontroll
- Versjon bumpet til `1.4.3` i `app.js`, `service-worker.js` og `firestore.js`; klientbuild er `1403`.
- Eksisterende Firestore-emulatortester skal fortsatt kjøres uendret.
- Målrettede tester dekker select-bevaring, dialogopprydding/Escape-stabel, deloppgavefeil og trygg inline-argumentkoding.

## v1.4.2 - 2026-08-31

### Sikkerhet
- Flyttet autoritativ rolle og tilgangskontroll fra `users/{uid}` til `allowedUsers/{sanitizedEmail}`.
- Krever verifisert token-e-post og aktiv allowlist-oppføring for all lesing og skriving.
- Låste egen profilskriving til e-post og rolle som samsvarer med token og allowlist.
- Forhindrer privilegie-eskalering via brukerens egen profilkopi.
- Krever korrekt `userId` ved opprettelse av kommentarer.
- Normaliserer e-post med trim og lowercase før dokument-ID bygges.

### Klient
- `permission-denied` ved allowlist-oppslag behandles som manglende tilgang.
- Klientseeding er feiltolerant når reglene blokkerer en tom allowlist.
- Rollen i `state.profile` overstyres alltid fra allowlisten.
- Rolleendring skriver allowlisten før profilkopien.

### Test og utrulling
- La til Firestore-emulator, automatisert Rules-testsuite og `TESTING.md`.
- La til `@firebase/app` som eksplisitt, låst testavhengighet slik at en ren `npm ci` kan kjøre emulatorpakken.
- Firestore-emulatoren kompilerte primærløsningen med `lower()` og `replace('[.]', ...)`; 19 tester bestod, 0 feilet.
- Produksjonssjekk utført 2026-09-02: Admin og Teamleder har korrekt sanitisert dokument-ID, gyldig rolle med små bokstaver og ingen store bokstaver i ID-ene. `email_verified: true` er bekreftet før klientdeploy.
- Utrullingsrekkefølge: kjør tester, deploy klient `1.4.2`, bekreft Admin-innlogging, publiser regler i Console, og verifiser deretter Admin, Teamleder, Medlem og ikke-allowlistet konto.
- Rollback skal gjøres via Firebase Console sin regelhistorikk eller Git, ikke via en sårbar backupfil i repoet.

## v1.4.1 - 2026-06-20

### Rettet
- Gjorde backdrop-lukking trygg for alle redigeringsmodaler i appen.
- En modal lukkes nå ved backdrop-interaksjon bare når både `pointerdown` og `pointerup` skjer direkte på overlayet.
- Tekstmarkering eller dragging som starter i et inputfelt, select, textarea eller annet modalinnhold kan ikke lenger lukke modalen når pekeren slippes utenfor innholdet.
- X, Avbryt og Escape beholder eksisterende lukkeoppførsel.

### Avgrensning
- Ingen endringer i lagring, beregninger, datamodell, validering, Firestore-regler, backend eller API.
- `firestore.js` er kun oppdatert med klientversjon/build i tråd med prosjektets release-rutine.

### Kontroll
- Oppgave- og ToDo-redigeringsmodalene bruker nå samme backdrop-guard.
- JavaScript-syntaks kontrollert med `node --check` for `app.js`, `firestore.js` og `service-worker.js`.
