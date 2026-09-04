# Development Log

## v1.13.0 - 2026-09-04

### Gjentakende oppgaver
- La til ukentlig og månedlig gjentakelse i oppgavemodalen med intervall, ukedag/dag i måneden, valgfri sluttdato, norsk oppsummering og forklaring av hvordan eksisterende forekomster behandles.
- Gjentakelse krever ferdigdato. Første ferdigdato lagres som et stabilt `anchorDate`; senere endring av malens ferdigdato flytter ikke ankeret eller hele serien.
- Månedlig dag 29–31 bruker månedens siste dag når datoen ikke finnes. Datoberegningen ligger samlet i den rene funksjonen `nextRecurrenceDate()`.
- Maler får et diskret gjentakelsesmerke på oppgavekort. Genererte forekomster vises som ordinære oppgaver uten eget merke.

### Bakgrunnsgenerering og samtidighet
- Genererer manglende forekomster gjennom 90 dager fra i dag etter første oppgavesnapshot og umiddelbart etter lagring. Arbeidet køes med `setTimeout` etter rendering og blokkerer ikke dashboard eller modal.
- Generering kjøres kun for Admin og Teamleder (`canEdit()`), i tråd med eksisterende Firestore-regler. Et Medlem alene utløser derfor ikke nye forekomster.
- Bruker deterministiske dokument-ID-er basert på mal-ID og forekomstdato, kombinert med en Firestore-transaksjon som leser malen og forekomstene før skriving. Samtidige faner kan ikke lage duplikater, og eksisterende forekomster overskrives aldri.
- Transaksjonene behandler maksimalt 100 kandidater per pulje. Det gir høyst 101 dokumentlesinger og 101 dokumentskrivinger i en pulje, godt under grensen på 500. Vanlig 90-dagersgenerering gir maksimalt omtrent 13 ukentlige eller 3 månedlige forekomster.
- Ved endring av mønsteret settes `recurrenceGeneratedUntil` tilbake til ankeret. Gamle forekomster beholdes; fjerning av gjentakelse eller arkivering av malen stopper videre generering.

### Kopiering og datoer
- Forekomster kopierer planleggingsfelter, ansvarlig, deltakere, kategori, avhengigheter og deloppgavenes tittel/ansvar. Status settes til `ikke_startet`, og deloppgaver settes til ikke fullført.
- Startdato og deloppgavefrister beholder sin opprinnelige avstand til ferdigdato. Kommentarer, slettemarkører og kvalitetsunntak kopieres ikke.
- JSON-backupen tar automatisk med de nye råfeltene. CSV-kode, kolonner og filformat er uendret.

### Kontroll
- Isolert datotest består med 22 assertions for månedlig dag 4, annenhver uke, februar ved dag 31 i normalår og skuddår, sluttdato, mønsterendring, puljing og forskyvning av start-/deloppgavefrister.
- Emulatorbasert transaksjonstest består med 12 assertions: to samtidige kjøringer oppretter én forekomst per dato; redigert tittel og fullført deloppgave blir ikke overskrevet ved gjentatt lasting; dag 4 og dag 20 kan eksistere side om side etter mønsterendring; stoppet og arkivert mal genererer ingenting.
- Lokal Chrome-kontroll består på desktop og 390 px mobil for ferdigdatovalidering, betingede felt, månedssluttforklaring, stabilt anker etter endret ferdigdato, kortmerke, Medlem-skrivelås og responsiv bredde uten horisontal overflow. Køtesten bekrefter at genereringen starter etter gjeldende kallstakk for Admin og ikke starter for Medlem.
- Eksisterende Firestore-emulatortester består 24/24. `node --check` består for alle fire JavaScript-filer.
- `classifyDashboardItem()`, `taskSignals()`, `dataQualityIssues()`, dashboardets toppkort/seksjoner, ToDo-modulen, Firestore-reglene og regeltestene er uendret.
- Versjon bumpet til `1.13.0` i alle tre versjonskilder; klientbuild er `11300`.

## v1.12.1 - 2026-09-04

### Rettet layout og rulling
- Hindret flexelementene i `Trenger utfylling` fra å krympe inne i listen med maks høyde. Hvert kort følger nå innholdets faktiske høyde, og avviksmerkene blir liggende synlig under kortet.
- Fjernet klippingen fra kortwrapperen og beholdt samlet bakgrunn, skygge og avrunding. Oppgave- og ToDo-titler i seksjonen brytes kontrollert over maksimalt tre linjer.
- Endret vertikal `overscroll-behavior` fra `contain` til `auto`, slik at rulling går videre til siden ved listens topp og bunn. Ingen JavaScript-håndtering av wheel- eller touch-hendelser er lagt til.

### Avgrensning og versjon
- Avviksberegningen, hvilke elementer som rapporteres, modalens «Ikke relevant»-flyt, kollapstilstand, toppkort, øvrige dashboardseksjoner, hasteberegning, Teamoversikt, Firestore-regler og testfiler er uendret.
- Versjon bumpet til `1.12.1` i alle tre versjonskilder; klientbuild er `11201`.

### Kontroll
- Chrome-test med 17 elementer målte 0 overlappende og 0 klippede kort. Alle avviksmerker var synlige, og et langt kort med tre avvik fulgte innholdshøyden og brukte trelinjers tittelklamping.
- Listen hadde 2121 px innhold innenfor 420 px visningshøyde. Wheel-rulling flyttet først den interne listen, fortsatte deretter siden ved bunnen og fortsatte siden oppover ved toppen.
- Med to elementer var innholds- og visningshøyden begge 308 px, uten aktiv intern rulling. Kollaps/utvid ga fortsatt korrekt layout.
- Mobiltesten på 390 px hadde ingen horisontal overflow og lot siden fortsette å rulle ved listens grense.
- Firestore-emulatortestene består 24/24, og `node --check` består for alle fire JavaScript-filer.

## v1.12.0 - 2026-09-04

### Datakvalitet på dashboardet
- Erstattet den nederste `Uten ansvarlig`-listen med den tverrgående seksjonen `Trenger utfylling`, som samler åpne oppgaver med manglende ansvarlig, frist, startdato eller frist på åpne deloppgaver. ToDo-er tas bare med når ansvarlig mangler.
- Samlet avviksberegningen i `dataQualityIssues()`. Dashboardet og modalens unntaksvalg bruker samme resultat, og elementer med flest aktive avvik sorteres først.
- Seksjonen er dempet, kollapset som standard, husker tilstanden i `localStorage` og bruker intern rulling. Den følger Team/Mine, men påvirkes ikke av dashboardets midlertidige toppkortfiltre.
- Beholdt toppkortet `Uten ansvarlig` med uendret telling og filteroppførsel.

### Bevisste unntak
- La til det valgfrie oppgavefeltet `qualityExceptions` med verdiene `startDate`, `dueDate`, `assignee` og `subtaskDueDate`.
- La Admin og Teamleder markere manglende planleggingsinformasjon som ikke relevant fra en samlet, sammenleggbar seksjon nederst i Detaljer-fanen.
- Ved lagring filtreres unntak mot de faktiske manglene, slik at et unntak automatisk fjernes når feltet senere fylles ut.

### Avgrensning og versjon
- `classifyDashboardItem()`, hasteberegning, `taskSignals()`, tidsseksjoner, toppkort, filtre, Oppgaver-fanen, ToDo-fanen, sidepanelet, eksport, Teamoversikt, Firestore-regler og regeltester er funksjonelt uendret.
- Versjon bumpet til `1.12.0` i alle tre versjonskilder; klientbuild er `11200`.

### Kontroll
- Firestore-emulatortestene består uendret: 24 av 24.
- `node --check` består for `app.js`, `js/todos.js`, `firestore.js` og `service-worker.js`.
- Målrettet regresjonstest består med 32 assertions for avvikstyper, ToDo-avgrensning, fullførte/arkiverte elementer, eldre data, unntak, sortering, toppkort, filter, kollaps og versjon.
- Isolert Chrome-test består på desktop og 390 px mobil for Team/Mine, første gangs kollaps, lagret kollapstilstand, tverrgående filteroppførsel, merker, responsiv bredde og automatisk opprydding i faktisk lagringspayload.

## v1.11.1 - 2026-09-04

### Én indikator i deltakerfeltet
- Fjernet den ekstra CSS-genererte pilen fra deltakerkontrollen. Markupens eksisterende SVG er nå eneste indikator og ligger konsekvent i høyre kant.
- SVG-en roteres når `<details>` åpnes. Hele summary-feltet er fortsatt klikkbart og tastaturfokuserbart, og `focus-within` gir samme korallfargede fokusramme som øvrige skjemafelt.
- Lang oppsummeringstekst avkortes med ellipse uten å flytte indikatoren. Flervalg, eierfiltrering, inaktive snapshots og bevaring ved brukeroppdatering er urørt.

### Kontroll
- Lukket og åpen kontroll er visuelt kontrollert på desktop og mobil med én høyrejustert indikator og korrekt rotasjon.
- Valg og fjerning, eierfiltrering, inaktiv deltaker og tastaturåpning er regresjonskontrollert.
- `node --check` består for alle fire JavaScript-filer. Firestore-emulatortestene består 24/24.
- Versjon bumpet til `1.11.1` i alle tre versjonskilder; klientbuild er `11101`.

## v1.11.0 - 2026-09-04

### Samarbeid om oppgaver
- Beholdt `assignedTo` som én hovedansvarlig og la til valgfrie, parallelle snapshotfelter `collaborators` og `collaboratorNames` for flere deltakere.
- Oppgavemodalen har flervalg for deltakere. Hovedansvarlig kan ikke samtidig være deltaker, og valgt innhold bevares når brukerlisten oppdateres.
- Inaktive, allerede lagrede deltakere beholdes med snapshot-navn og merkes som inaktive til de fjernes eksplisitt. Nye valg begrenses til aktive brukere.
- Oppgavekort viser inntil tre deltakeravatarer og `+N` ved flere, uten å redusere hovedansvarliges visuelle rolle.

### Deloppgaveansvar og Mine
- Deloppgaver kan tildeles en aktiv bruker via nedtrekksliste ved siden av fristen. Snapshot-navnet vises kompakt i både Detaljer- og Deloppgaver-fanen, også for en senere inaktiv bruker.
- `taskInvolvement()` returnerer separate flagg for hovedansvarlig, deltaker og ansvarlig for en åpen deloppgave. `Mine`, hurtigfiltrene, teamoversikten og klientens statuskontroller bruker denne felles vurderingen.
- `Mine` inkluderer alle tre involveringsformer og forklarer på kortet hvorfor en oppgave eid av en annen vises. Nye filtre skiller `Jeg er ansvarlig` fra `Jeg deltar` uten overlapp.
- Teamoversikten beholder v1.10.0-tallet for eide åpne oppgaver/ToDo-er og viser i tillegg `M deltar` uten dobbelttelling. Inaktive personer vises ikke i oversikten.

### Rettigheter og begrensning
- Firestore-reglene lar et Medlem endre de samme eksisterende statusfeltene når brukeren er hovedansvarlig eller finnes i `collaborators`. Sikker feltaksess gjør eldre oppgaver uten `collaborators` bakoverkompatible.
- En bruker som kun er deloppgaveansvarlig får ingen hovedstatuskontroll. Deloppgaver ligger fortsatt som embedded array og er derfor kun koordinering for Medlem; avkryssing krever fortsatt Admin eller Teamleder.
- Eksportkoden er uendret. JSON-backupen tar med de nye råfeltene automatisk via eksisterende rekursive normalisering.

### Kontroll
- Firestore-emulatortestene består: 24/24, inkludert fem nye tester for deltakerstatus, sperrede innholdsfelt, utenforstående, eldre dokument uten deltakerfelt og deloppgaveansvarlig.
- Lokal Chrome-test består med 31 kontroller på både desktop 1440 x 900 og mobil 390 x 844. Den dekker valg og bevaring, inaktive snapshots, Mine/filtre, faktisk statusendring fra kort og modal, teamtelling, datosortering og JSON-felter.
- Team-toppkortenes fem tall er identiske med og uten de nye involveringsfeltene for samme Team-datasett. `classifyDashboardItem()`, tellelogikken, hasteberegningen og `taskSignals()` er uendret.
- Mobil- og desktopvisning er kontrollert uten horisontal side-scroll. ToDo-modulen og konverteringsflyten er uendret.
- `node --check` består for `app.js`, `js/todos.js`, `firestore.js` og `service-worker.js`.
- Versjon bumpet til `1.11.0` i alle tre versjonskilder; klientbuild er `11100`.

## v1.10.0 - 2026-09-04

### Toppkort som dashboardfiltre
- Erstattet de gamle navigerende toppkortene med `Forfalt og i dag`, `Neste 7 dager`, `I gang`, `Uten ansvarlig` og `Høy prioritet`.
- De tre tidskortene leser antall direkte fra de samme klassifiserte seksjonsarrayene som rendrer innholdet. Første kort viser i tillegg antall unike elementer med forfalt hovedfrist eller minst én åpen, forfalt deloppgave.
- Kortene filtrerer dashboardet etter at `classifyDashboardItem()` har klassifisert elementene. Aktivt filter kan slås av med nytt klikk, `Nullstill filter` eller Escape, lagres ikke lokalt og kombineres med `Team`/`Mine`.
- `Uten ansvarlig` og `Høy prioritet` inkluderer også åpne elementer uten tidsseksjon. Disse vises uten duplikater i den midlertidige, forklarte seksjonen `Andre treff`.
- Nederste `Uten ansvarlig` og `Teamoversikt` påvirkes ikke av toppkortfiltrene.

### Kompakt presentasjon
- Typeindikatoren er flyttet fra en egen rad til to visuelt ulike, tilgjengelig navngitte ikoner direkte i korttittelen. Eksisterende `taskCardHtml()` og `todoCardHtml()` er urørt.
- `Kommer senere` er åpen som standard når ingen preferanse finnes. Eksisterende lagrede åpne og lukkede tilstander beholdes.
- Aktivt toppkort, tastaturfokus, filterstatus, nulltreff og mobilvisning har egne responsive stiler.

### Kontroll
- Lokal Chrome-test består: de tre tidskortene matcher seksjonstellingen, de to tverrgående kortene inkluderer alle åpne treff, og synlige tidsseksjoner pluss `Andre treff` summerer til aktivt kort.
- En høyprioritert oppgave med frist om 60 dager og en utildelt oppgave uten frist vises korrekt i `Andre treff`. Seksjonen er skjult uten aktivt tverrgående filter og når den er tom.
- En oppgave med to forfalte deloppgaver telles én gang. En oppgave med både forfalt hovedfrist og forfalte deloppgaver telles også én gang.
- Klikk, nytt klikk, nullstilling, Space-tast, Escape, Team/Mine, reload uten filterpersistens, nulltreff og modal-forrang er kontrollert. Oppgavemodalen lukkes før et aktivt dashboardfilter.
- Ny profil får åpen `Kommer senere`; lagret kollapstilstand beholdes. Desktop ved 1440 × 900 px og mobil ved 390 × 844 px er visuelt kontrollert uten horisontal side-scroll.
- Direkte kildekodesammenligning mot v1.9.0 bekrefter at `classifyDashboardItem()`, hasteberegningen, `taskSignals()`, `taskCardHtml()`, `todoCardHtml()` og hele `js/todos.js` er uendret.
- `node --check` består for `app.js`, `js/todos.js`, `firestore.js` og `service-worker.js`.
- Firestore-emulatortestene består: 19/19.
- Versjon bumpet til `1.10.0` i alle tre versjonskilder; klientbuild er `11000`.

## v1.9.0 - 2026-09-03

### Tidsstyrt dashboard
- Erstattet `Fokus nå` og `Planlegg denne uken` med `Forfalt og i dag`, `Neste 7 dager`, `I gang` og `Kommer senere` i bindende prioriteringsrekkefølge.
- `classifyDashboardItem()` klassifiserer hvert åpent element ett sted og returnerer nøyaktig én hovedseksjon. Dette hindrer duplikater uten å endre eksisterende hasteberegning.
- ToDo-er deltar i de to nærmeste tidsvinduene, men ikke i `Kommer senere`.
- `I gang` er åpen som standard. `Kommer senere` er lukket som standard. Begge kollapstilstander lagres i `localStorage`.

### Handlingsinformasjon på kortene
- Oppgaver som løftes av deloppgavefrister viser de utløsende deloppgavene med tittel, dato og relativ etikett under hovedkortet.
- Påbegynte oppgaver med innhold i `dependencies` viser en tydelig, HTML-escapet blokkertmelding.
- Oppgave og ToDo skilles med både typeikon og tekst, slik at skillet fungerer uten farge.
- Alle seksjonsoverskrifter viser antall unike kort. `Uten ansvarlig` og `Teamoversikt` beholder eksisterende innhold og layout.

### Avgrensning og versjon
- Toppkortenes markup og tellelogikk, `taskUrgencyScore()`, `compareTasksByUrgency()`, `taskSignals()`, oppgavekort, Oppgaver-fanen, ToDo-fanen, ToDo-panelet, oppgavemodalen, eksport og Firestore-regler er uendret.
- Versjon bumpet til `1.9.0` i alle tre versjonskilder; klientbuild er `1900`.

### Kontroll
- Lokal Chrome-test består: 22/22 klassifiserings- og desktopkontroller, 3/3 reload-/persistenskontroller og 5/5 mobilkontroller.
- Testdata dekker oppgave, deloppgave og ToDo i alle fire tidsvinduer, påbegynt arbeid, blokkerttekst, Team/Mine, tomtilstander, fullførte elementer og frister utenfor 30 dager.
- De kritiske testene består: oppgave uten hovedfrist løftes av deloppgave i dag med synlig deloppgavelinje; ToDo om 20 dager utelates; ingen element-ID forekommer i mer enn én hovedseksjon; toppkorttallene er identiske med eksisterende beregning.
- Kollapstilstand er kontrollert etter full sidelasting. Mobil ved 390 × 844 px har ingen horisontal side-scroll, og alle seksjoner og kontrollknapper holder seg innenfor viewporten.
- Visuell kontroll er utført med representative skjermbilder på 1440 × 900 px og 390 × 844 px.
- Direkte sammenligning mot v1.8.2 bekrefter uendret kildekode for toppkortmarkup/-telling, `taskSignals()`, `taskUrgencyScore()`, `compareTasksByUrgency()`, oppgavekort, Oppgaver-fanen, oppgavemodalen, eksporten og hele `js/todos.js`.
- `node --check` bestått for `app.js`, `js/todos.js`, `firestore.js` og `service-worker.js`.
- Firestore-emulatortestene består: 19/19.
- `git diff --check` bestått (kun forventede advarsler om linjeskift på Windows).

## v1.8.2 - 2026-09-03

### Deloppgaver i fristrekkefølge
- Begge fanene i oppgavemodalen sorterer deloppgaver stigende etter `dueDate`, med udaterte deloppgaver sist og stabil intern rekkefølge ved lik eller manglende dato.
- Sorteringen skjer kun på en visningskopi som bærer med seg opprinnelig arrayindeks. Alle endringshandlinger fortsetter derfor å operere på Firestore-arrayets lagrede rekkefølge.

### Entydig datovisning
- Begge fanene viser alltid absolutt frist sammen med relativ etikett når relevant: `Forfalt`, `I dag`, `I morgen` eller `Om N d`.
- Relativ skala er samlet i `relativeDueDateLabel()`. Oppgave- og ToDo-kort beholder dagens detaljerte tekst for passert frist, mens deloppgaver bruker den kompakte etiketten `Forfalt`.
- Fullførte deloppgaver viser fortsatt `Fullført`, og deloppgaver uten frist viser `Ingen frist`.

### Avgrensning og versjon
- Datamodell, lagret deloppgaverekkefølge, Firestore-transaksjoner, eksport, dashboard, oppgavekort, ToDo-modul, regler og regeltester er uendret.
- Versjon bumpet til `1.8.2` i alle tre versjonskilder; klientbuild er `1802`.

### Kontroll
- Lokal Chrome-test består: 19/19 kontroller som dekker begge modal-faner, alle relative etiketter, datorekkefølge, stabile udaterte elementer og bevarte fargeklasser.
- Avkryssing, tillegg, fristendring og sletting er testet fra den sorterte visningen. Riktig lagret element oppdateres, og arrayet omorganiseres ikke.
- JSON-normalisering beholder deloppgave-arrayets lagrede rekkefølge.
- Direkte sammenligning mot v1.8.1 bekrefter at dashboard-rendering, oppgavekort, eksport, `updateSubtasksSafely()` og hele `js/todos.js` er uendret.
- `node --check` bestått for `app.js`, `js/todos.js`, `firestore.js` og `service-worker.js`.
- Firestore-emulatortestene består: 19/19.
- `git diff --check` bestått (kun forventede advarsler om linjeskift på Windows).

## v1.8.1 - 2026-09-02

### Tydelig sletting og umiddelbar angre
- La til en rød `Slett ToDo`-knapp i redigeringsmodalen for Admin og Teamleder, med eksisterende bekreftelsesdialog og soft-delete.
- Byttet kortenes X-symbol til samme søppelbøtteikon som øvrige slettehandlinger. `title` er fortsatt `Slett ToDo`.
- Utvidet `showToast()` bakoverkompatibelt med valgfri handlingsknapp. Eksisterende kallsteder bruker fortsatt samme signatur og oppførsel.
- Hver slettetoast lukker over sitt eget `todoId` og har egen timeout. Flere raske slettinger kan derfor angres uavhengig og gjenoppretter riktig dokument.
- `restoreTodo()` fjerner `deletedAt` og `deletedBy`, oppdaterer skrivemetadata og lar `sortOrder` stå urørt.

### Konsistent dashboard
- `Uten ansvarlig` viser nå både åpne oppgaver og åpne ToDo-er uten ansvarlig, samlet sortert etter eksisterende hastegrad. Grensen på seks elementer er fjernet, så antallet synlige kort samsvarer med toppkortet.
- Listen har `overflow-y: auto` og en maksimumshøyde tilsvarende omtrent seks til syv kort. Ved få elementer aktiveres ingen intern rulling; på mobil begrenses høyden også relativt til viewporten.
- `todoCardHtml()` har fått `sortable: true` som standard. Dashboardet bruker `{ sortable: false }`, mens sidepanelet og ToDo-fanen beholder eksisterende kall og fungerende drahåndtak.

### Avgrensning og versjon
- Toppkortenes tellelogikk, konvertering, eksport, Firestore-regler, regeltester og manuell ToDo-rekkefølge er uendret.
- Versjon bumpet til `1.8.1` i alle tre versjonskilder; klientbuild er `1801`.

### Kontroll
- `node --check` bestått for `app.js`, `js/todos.js`, `firestore.js` og `service-worker.js`.
- Firestore-emulatortestene består: 19/19.
- Isolert test av `restoreTodo()` består: 11/11 kontroller, inkludert `FieldValue.delete()`, skrivemetadata, uendret `sortOrder` og feilhåndtering.
- Lokal Chrome-test består: 27/27 desktopkontroller og 6/6 mobilkontroller for modal-/kortsletting, angre, parallelle toast-er, tilgangsstyring, dashboardkonsistens og intern rulling.
- Direkte sammenligning mot v1.8.0 bekrefter at toppkortenes tellekode, CSV-eksport, konverteringsflyt, ToDo-fanens renderer, sidepanelrenderer og dra-og-slipp-kode er uendret.
- `git diff --check` bestått (kun forventede advarsler om linjeskift på Windows).

## v1.8.0 - 2026-09-02

### Tydelig arbeidsdeling
- Oppgaver-fanen viser nå kun ordinære oppgaver fra `tasks`; ToDo-er forblir tilgjengelige i sidepanelet, ToDo-fanen og dashboardets eksisterende tellinger og prioriteringer.
- Fjernet hurtigfiltrene `Prosjekter` og `ToDo`. De syv gjenværende filtrene beholder rekkefølge og virkemåte.
- Eldre filterverdier `projects`, `todos` og den defensive varianten `todo` faller tilbake til `Alle`, slik at ingen blir stående i en tom visning uten aktiv filterknapp.

### Atomisk konvertering
- La til `Konverter til oppgave` i ToDo-redigeringsmodalen for Admin og Teamleder. Fullførte ToDo-er kan ikke konverteres.
- Modalens nåværende feltverdier er autoritative, slik at ulagrede endringer i tittel, beskrivelse, ansvarlig, frist og prioritet tas med.
- `convertTodoToTask()` leser ToDo-en, oppretter oppgaven og soft-sletter ToDo-en i én Firestore-transaksjon. Enten gjennomføres begge skrivningene, eller ingen.
- Transaksjonen avviser en ToDo som allerede er fullført, slettet eller konvertert. Knappen deaktiveres samtidig i klienten som tydelig signal og ekstra vern mot dobbelttrykk.
- Den nye oppgaven åpnes automatisk i den eksisterende redigeringsmodalen etter vellykket commit.

### Dialog, avgrensning og versjon
- Utvidet `showConfirm()` med valgfri bekreftelsestekst og primærstil. Standard er fortsatt rød `Slett`, og eksisterende kall er uendret. Escape bruker fortsatt samme `cleanup()`-vei og løser promise-en med `false`.
- Ingen endringer i Firestore-regler, regeltester, eksport, dashboardberegninger eller ToDo-rangering.
- Versjon bumpet til `1.8.0` i alle tre versjonskilder; klientbuild er `1800`.

### Kontroll
- `node --check` består for `app.js`, `js/todos.js`, `firestore.js` og `service-worker.js`.
- Firestore-emulatortestene består uendret: 19 av 19.
- Isolert transaksjonstest består med 14 av 14 assertions for feltmapping fra modalverdier, atomisk rollback, manglende/slettet ToDo, fullført ToDo og nytt konverteringsforsøk etter commit.
- Headless Chrome-kontroll består med 46 assertions for tasks-only-visning, syv hurtigfiltre, filterfallback, knappesynlighet, dialogstil og Escape-opprydding, avbrutt konvertering, dobbeltklikkvern, eksplisitt `getTask()`-henting, tom frist/ansvarlig, foreldet ToDo, åpne/fullførte ToDo-visninger og responsiv modalbredde.
- Kildesammenligning mot v1.7.1 bekrefter at dashboardberegningene, eksportfunksjonen og dra-og-slipp-implementasjonen er uendret.

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
