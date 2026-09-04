# Strawberry Planleggingsapp - CLAUDE.md

## Prosjektstatus
Gjeldende appversjon: `v1.13.1`

PWA-basert teamplanleggingsapp for Strawberry. Appen erstatter et tidligere Google Sheets-oppsett, men starter med blanke ark uten datamigrering. Formålet er å gi teamet et operativt bilde av hva som må prioriteres i dag, denne uken og fremover, hvem som har ansvar, hvilke oppgaver/ToDo-er som mangler eier, og hva som er fullført.

Sanntidssynkronisering skjer via Firebase Firestore. UI er norsk, og appen er bygget som en enkel vanilla HTML/CSS/JS single-page app uten bundler.

## Teknologistakk
- Frontend: HTML5, CSS3, JavaScript ES6+
- Hosting: GitHub Pages
- Database: Firebase Firestore
- Autentisering: Firebase Authentication med Google Sign-In
- PWA: `manifest.json` + `service-worker.js`
- Firebase SDK: Firebase 9 compat mode via CDN i `index.html`

## Filstruktur
```text
Planning/
├── index.html          # App-skallet, views og modaler
├── styles.css          # All styling og responsiv layout
├── firebase-config.js  # Firebase config og INITIAL_USERS
├── firestore.js        # Firestore CRUD, subscriptions og write metadata
├── firestore.rules     # Firestore Security Rules - kilde for rules som deployes
├── firebase.json       # Firestore-emulatorkonfigurasjon
├── package.json        # Dev-avhengigheter og testkommando
├── tests/              # Automatiserte Firestore Rules-tester
├── TESTING.md          # Lokal testing og sjekkliste før publisering
├── DEVELOPMENT_LOG.md  # Endrings- og utrullingslogg
├── app.js              # UI-logikk, routing og hendelseshåndtering
├── js/
│   └── todos.js        # ToDo-visning, panel og handlinger
├── manifest.json       # PWA-manifest
├── service-worker.js   # Caching og app-oppdatering
├── .nojekyll           # Hindrer GitHub Pages fra å kjøre Jekyll-prosessering
├── icon-180.png
├── icon-192.png
├── icon-512.png
├── Strawberry_Logotype_Primary_Black_RGB.png
├── Strawberry_Logotype_Primary_White_RGB.png
└── CLAUDE.md
```

## Firebase-oppsett
1. Opprett Firebase-prosjekt.
2. Aktiver Firestore i production mode.
3. Bruk region `europe-west1`.
4. Aktiver Google Sign-In under Authentication.
5. Legg til GitHub Pages-domenet under Authorized domains.
6. Lim inn web app-konfigurasjon i `firebase-config.js`.
7. Seed første Admin manuelt i `allowedUsers` hvis collectionen er tom.
8. Publiser innholdet i `firestore.rules` i Firebase Console.

`firestore.rules` i repoet er kilde til gjeldende rules. Når rules endres, kopier hele innholdet derfra til Firebase Console -> Firestore -> Rules og publiser.

## Rollemodell og regler
Firestore Rules er sikkerhetsgrensen. Klientsjekker styrer bare hva UI-et viser.

- Alle operasjoner krever en innlogget bruker med verifisert e-post og en matchende oppføring i `allowedUsers`.
- Rollen utledes utelukkende fra `allowedUsers`, aldri fra `users/{uid}`.
- `allowedUsers`: alle allowlistede brukere kan lese; kun Admin kan opprette, endre og slette.
- `users`: allowlistede brukere kan lese. Brukeren kan opprette/oppdatere egen profil bare når e-post og rolle matcher allowlisten; Admin kan oppdatere/slette.
- `categories`: Admin og Teamleder kan opprette, endre, skjule og slette.
- `tasks`: Admin og Teamleder kan opprette og oppdatere; direkte delete er blokkert. Oppgaver arkiveres med soft-delete.
- `todos`: Admin og Teamleder kan opprette, oppdatere og arkivere; Medlem kan fullføre/åpne egne tildelte ToDo-er.
- `comments`: alle innloggede kan lese og opprette; direkte delete er blokkert.
- `notifications`: brukeren eier egne varsler.

| Rolle | Opprette oppgaver | Redigere oppgaver | Endre status | Kategorier | Brukere |
|-------|:---:|:---:|:---:|:---:|:---:|
| Admin | Ja | Ja | Ja | Ja | Ja |
| Teamleder | Ja | Ja | Ja | Ja | Nei |
| Medlem | Nei | Nei | Egne tildelte og oppgaver der brukeren er deltaker | Nei | Nei |

Admin-panelet er synlig for Admin og Teamleder fordi kategorier administreres der. Brukeradministrasjon vises og fungerer bare for Admin.

## Datamodell

### `allowedUsers/{sanitizedEmail}`
Brukes som autoritativ allowlist og rollekilde. E-post trimmes og konverteres til lowercase før `.` -> `_dot_` og `@` -> `_at_`.

- `email`: string
- `role`: `admin` | `teamleder` | `medlem`
- `invitedBy`: uid eller `system`
- `invitedAt`: timestamp
- write metadata: `clientAppVersion`, `clientBuild`, `clientWriteId`, `writeSchemaVersion`

### `users/{uid}`
Opprettes eller oppdateres automatisk ved første innlogging etter at brukeren finnes i `allowedUsers`. Dokumentet er en profilkopi og gir aldri rettigheter. Ved egen skriving må `email` og `role` samsvare med auth-tokenet og allowlisten.

- `email`, `displayName`, `photoURL`, `role`
- `createdAt`, `lastLogin`
- write metadata

### `tasks/{taskId}`
- `title`, `description`
- `priority`: `høy` | `medium` | `lav`
- `categoryId`: string eller null
- `categoryName`, `categoryColor`: snapshot-felter for stabil visning
- `status`: `ikke_startet` | `i_gang` | `fullfort`
- `assignedTo`, `assignedToName`
- `collaborators`: valgfritt array av uid-strenger; manglende felt behandles som tomt
- `collaboratorNames`: snapshot-navn i samme rekkefølge som `collaborators`
- `startDate`, `dueDate`: Firestore Timestamp eller null
- `dependencies`
- `subtasks`: array av `{ id, title, completed, dueDate, assignedTo, assignedToName }`, der `dueDate` er `YYYY-MM-DD` eller null og ansvarligfeltene er valgfrie
- `qualityExceptions`: valgfritt array med bevisste unntak for `startDate`, `dueDate`, `assignee` og `subtaskDueDate`; manglende felt behandles som tomt
- `recurrence`: objekt eller null med `frequency` (`weekly`/`monthly`/`yearly`), `interval`, valgfri `weekday`/`dayOfMonth`, stabil `anchorDate` og valgfri `endDate`
- `recurrenceTemplateId`: malens oppgave-ID på genererte forekomster, ellers null
- `recurrenceInstanceDate`: forekomstdato som `YYYY-MM-DD` på genererte forekomster, ellers null
- `recurrenceGeneratedUntil`: datoen malen er ferdig generert gjennom
- `deletedAt`, `deletedBy`: soft-delete/arkivering
- `createdBy`, `createdAt`, `updatedAt`
- write metadata

### `todos/{todoId}`
Lettvektsoppgaver for ad hoc-arbeid som ikke trenger full prosjektstruktur.

- `title`, `description`
- `priority`: `høy` | `medium` | `lav`
- `status`: `apen` | `fullfort`
- `assignedTo`, `assignedToName`
- `dueDate`: Firestore Timestamp eller null
- `sortOrder`: number eller utelatt; felles manuell teamrekkefølge for åpne ToDo-er
- `completedAt`, `completedBy`
- `deletedAt`, `deletedBy`: soft-delete/arkivering
- `createdBy`, `createdAt`, `updatedAt`, `lastEditedBy`
- write metadata

### `categories/{categoryId}`
Konfigureres fra Admin-panelet av Admin eller Teamleder.

- `name`
- `color`: hex string
- `sortOrder`
- `active`: boolean
- `createdBy`, `createdAt`, `updatedAt`

Kategorier kan skjules eller slettes. Oppgaver lagrer også kategoriens navn/farge som snapshot, slik at gamle oppgaver fortsatt har lesbar kontekst hvis en kategori fjernes.

### `comments/{commentId}`
- `taskId`, `userId`, `userDisplayName`, `userPhotoURL`
- `text`, `createdAt`

### `users/{userId}/notifications/{notifId}`
- `type`: `task_assigned` | `comment_added` | `status_changed`
- `taskId`, `taskTitle`, `message`
- `read`, `createdAt`

## Dashboard og prioritering
Dashboardet er en operativ ledervisning, ikke bare en statusrapport.

Dashboardet har en segmentert kontroll:
- `Team`: viser teamets samlede oppgaver, ToDo-er, risiko og fordeling.
- `Mine`: viser ToDo-er tildelt innlogget bruker og oppgaver der brukeren er hovedansvarlig, deltaker eller ansvarlig for minst én åpen deloppgave.

Toppkort:
- `Forfalt og i dag`: samme unike elementer som tidsseksjonen med samme navn, med eget undertall for elementer der hovedfrist eller minst én åpen deloppgave er forfalt.
- `Neste 7 dager`: samme unike elementer som tidsseksjonen med samme navn.
- `I gang`: samme unike elementer som tidsseksjonen med samme navn.
- `Uten ansvarlig`: åpne oppgaver eller ToDo-er uten tildelt person.
- `Høy prioritet`: åpne oppgaver eller ToDo-er med høy prioritet.

Kortene er midlertidige dashboardfiltre og navigerer ikke til Oppgaver-fanen. De tre første viser kun sin tidsseksjon. De to siste filtrerer på tvers av tidsseksjonene; treff utenfor tidsklassifiseringen vises da i den midlertidige seksjonen `Andre treff`. Aktivt filter kombineres med `Team`/`Mine`, nullstilles ved nytt klikk eller Escape og lagres ikke i `localStorage`. De nederste seksjonene `Trenger utfylling` og `Teamoversikt` påvirkes ikke av filteret.

Dashboardseksjoner:
- `Forfalt og i dag`: åpne oppgaver, deloppgaver og ToDo-er med passert frist eller frist i dag.
- `Neste 7 dager`: åpne oppgaver, deloppgaver og ToDo-er med frist fra i morgen til og med syv dager frem.
- `I gang`: påbegynte oppgaver som ikke allerede er fanget av de to første tidsvinduene. Seksjonen er åpen som standard og kan kollapses.
- `Kommer senere`: oppgaver og deloppgaver med frist 8–30 dager frem som ikke allerede ligger i en tidligere seksjon. ToDo-er tas ikke med. Seksjonen er åpen som standard for brukere uten lagret preferanse.
- `Trenger utfylling`: åpne oppgaver med manglende ansvarlig, frist, startdato eller frist på en åpen deloppgave, samt ToDo-er uten ansvarlig. Bevisste unntak på oppgaver skjuler det aktuelle avviket. Listen er kollapset som standard, sorterer flest avvik først og ruller internt når den blir høy. Kortene krymper ikke i rulleflaten, og rulling fortsetter på siden når listen når topp eller bunn.
- `Teamoversikt`: viser åpne oppgaver/ToDo-er som personen eier og, når tallet er større enn null, hvor mange åpne oppgaver personen bidrar til som deltaker eller deloppgaveansvarlig. Bidrag telles ikke dobbelt med eide oppgaver, og risiko beregnes fortsatt bare fra eide oppgaver. Kun aktive personer i `state.users` vises. I `Mine`-visning skjules oversikten og brukeren får beskjed om å bytte til Team for teamfordeling.

Dashboardets tidsvinduer klassifiseres ett sted i `classifyDashboardItem()`. Et element eies av den første seksjonen det kvalifiserer til, slik at det ikke dupliseres mellom hovedseksjonene. `Trenger utfylling` og `Teamoversikt` er tverrgående seksjoner. Når en deloppgave utløser plasseringen, vises relevante deloppgaver med tittel, absolutt dato og relativ etikett under hovedkortet. I `I gang` vises utfylt `dependencies` som en escapet blokkertmelding.

Datakvalitetsavvik beregnes samlet i `dataQualityIssues()`, som brukes av både dashboardet og oppgavemodalens valg for «ikke relevant». Valgene ligger samlet i en diskret, sammenleggbar seksjon nederst i Detaljer-fanen. Ved lagring beholdes bare unntak for felt som fortsatt mangler; utfylte felt rydder dermed bort foreldede unntak automatisk. ToDo-er har ikke slike unntak og rapporteres bare når ansvarlig mangler.

Oppgaver og ToDo-er i de blandede tidsseksjonene har to visuelt ulike typeikoner direkte ved tittelen, med tilgjengelig navn for skjermlesere. Skillet er derfor ikke avhengig av farge. Alle tidsseksjoner er gruppert etter prioritet og sortert med den eksisterende hasteberegningen. Kollapstilstanden for `I gang` og `Kommer senere` lagres lokalt i nettleseren.

På mobil er dashboardet komprimert: toppkortene vises som horisontale chips og kort/spacing er strammet inn slik at prioriterte oppgaver kommer tidligere på skjermen. Desktop-layouten er beholdt bred og mer informasjonsrik.

Hasteberegningen i `app.js` tar hensyn til frist, om fristen er passert, prioritet, om oppgaven mangler ansvarlig, status og deloppgavefrister.

## Oppgaver-fanen
Oppgaver-fanen har ordinære filtre og hurtigfiltre.

Hurtigfiltre:
- `Alle`
- `Må følges opp`
- `Uten ansvarlig`
- `Denne uken`: frist i dag eller innen 7 dager, inkludert deloppgaver.
- `Neste 14 dager`: bredere planleggingsvindu for kommende leveranser.
- `Mine`
- `Jeg er ansvarlig`: åpne oppgaver der innlogget bruker er hovedansvarlig.
- `Jeg deltar`: åpne oppgaver der brukeren er deltaker eller ansvarlig for en åpen deloppgave, men ikke hovedansvarlig.
- `Høy prioritet`

Oppgaver-fanen viser bare dokumenter fra `tasks`; ToDo-er håndteres i sidepanelet og ToDo-fanen. Standard sortering er etter hastegrad, ikke bare prioritet. Oppgavekort viser signaler som `Forfalt`, `Frist i dag`, `Denne uken`, `Neste 14 d`, `Ikke tildelt` og `Deloppgavefrist`.

## Korte ToDo-er
ToDo-er er ment for korte ad hoc-oppgaver som må følges opp, men som ikke trenger full prosjektstruktur med deloppgaver og kommentarer.

Admin og Teamleder kan legge inn ToDo direkte fra sidepanelet på Dashboard og Oppgaver med:
- tittel
- ansvarlig
- frist
- prioritet: `Haster`, `Normal`, `Lav`

Ansvarlig er alltid synlig som en kompakt valgbrikke under tittelfeltet. I `Mine` på Dashboard er innlogget bruker standard; i `Team` og Oppgaver er standarden `Ikke tildelt`. Et manuelt valg beholdes ved bytte mellom `Team` og `Mine` for den pågående registreringen, og tilbakestilles til gjeldende standard etter opprettelse.

ToDo-er vises:
- i et høyre sidepanel på brede skjermer, eller i et bunnark på smalere skjermer
- i toppkortene på dashboardet der de påvirker `Forfalt og i dag`, `Neste 7 dager`, `Uten ansvarlig` og `Høy prioritet`
- i Team/Mine-visningen på dashboardet
- i ToDo-fanen med åpne/fullførte filtre og manuell rangering

Admin og Teamleder kan opprette og slette ToDo-er. Sletting er tilgjengelig med søppelbøtte både på kort og i redigeringsmodalen. Hver sletting får en egen kortvarig `Angre`-handling som gjenoppretter akkurat den aktuelle ToDo-en uten å endre `sortOrder`. Tildelt Medlem kan markere egne ToDo-er som fullført eller åpne dem igjen.

Panelet bruker samme `Team`/`Mine`-avgrensning som dashboardet og husker kollapstilstanden i `localStorage`. Åpne ToDo-er i panelet og ToDo-fanen følger én felles, manuell teamrekkefølge via `sortOrder`; hastegradsmerker vises fortsatt, men påvirker ikke denne rekkefølgen. Admin og Teamleder kan flytte åpne kort med et eget drahåndtak ved hjelp av mus, berøring eller tastatur. Filtrerte visninger endrer samme globale rekkefølge, og fullførte ToDo-er kan ikke flyttes.

Ved første flytting normaliseres alle åpne ToDo-er i én batch dersom noen mangler `sortOrder`. Senere flyttinger skriver bare det flyttede dokumentet, med mindre tallavstanden mellom naboene er blitt for liten og en ny normalisering kreves. Pågående flytting skjermer listen mot sanntids-rerender; lagringsfeil gjenoppretter forrige rekkefølge.

Når desktop-panelet kollapses, utvides hovedinnholdet jevnt inn i den frigjorte plassen mens panelstripen blir liggende ved høyre skjermkant. På skjermbredder opptil 1280 px erstattes sidekolonnen av en flytende ToDo-knapp. På mobil åpnes panelet nedenfra og stopper over bunnnavigasjonen. Hele ToDo-kortet kan åpnes med mus, Enter eller mellomrom; avkryssing, drahåndtak og sletting åpner ikke redigeringsmodalen.

Beskrivelse er valgfri. Eksisterende ToDo-er uten feltet behandles som tom tekst og trenger ingen migrering.

Kort uten ansvarlig viser ett `Ikke tildelt`-signal fra den felles signalberegningen. Ansvarlig-brikken rendres bare når en faktisk bruker er tildelt.

ToDo-titler brytes over opptil tre linjer på alle flater. Lengre titler klampes med ellipse, og lange ord eller URL-er brytes slik at de ikke utvider kortet. Hele tittelen er fortsatt tilgjengelig når kortet åpnes.

Admin og Teamleder kan konvertere en åpen ToDo til en full oppgave fra redigeringsmodalen. Konverteringen bruker modalens nåværende verdier, også ulagrede endringer, for tittel, beskrivelse, ansvarlig, frist og prioritet. Firestore oppretter oppgaven og soft-sletter ToDo-en i én transaksjon. Dermed gjennomføres begge skrivningene eller ingen, og en ToDo som allerede er fullført, slettet eller konvertert kan ikke gi en duplikatoppgave. Den nye oppgaven åpnes direkte for videre utfylling av kategori, startdato, deloppgaver og avhengigheter.

Dashboardrendering av ToDo-kort bruker en ikke-sorterbar variant uten drahåndtak. Sidepanelet og ToDo-fanen bruker fortsatt standardvarianten med uendret manuell rangering.

## Legge til nye brukere
1. Logg inn som en bruker med rollen `admin`.
2. Gå til Administrasjon.
3. Skriv inn e-postadressen i "Legg til bruker".
4. Velg rolle og trykk "Legg til".
5. Kopier app-lenken fra "Link til appen" og send til brukeren.
6. Den nye personen logger inn med Google-kontoen sin.

Når en bruker inviteres, skrives personen til `allowedUsers`. Det betyr at brukeren har tilgang selv om personen ikke har logget inn ennå.

`Teammedlemmer` viser både:
- aktive brukere fra `users`
- inviterte brukere fra `allowedUsers`

Inviterte brukere vises med status `Invitert`. Når personen logger inn første gang, opprettes `users/{uid}` automatisk og brukeren vises som aktiv teambruker med navn og bilde fra Google.

Hvis innlogging feiler:
- Sjekk at e-posten i `allowedUsers` matcher Google-kontoen brukeren logger inn med.
- Sjekk at dokument-ID-en i `allowedUsers` er lowercase og bruker `_dot_`/`_at_`.
- Sjekk at innlogget admin har `role: "admin"` i sin `allowedUsers`-oppføring.
- Sjekk at `firestore.rules` er publisert.
- Sjekk at GitHub Pages-domenet ligger i Firebase Authentication -> Authorized domains.

## Kategorier
Kategorier administreres i Administrasjon under knappen `Kategorier`.

Admin og Teamleder kan:
- opprette kategori
- endre navn og farge
- skjule/aktivere kategori
- slette kategori med bekreftelsesdialog

Skjulte kategorier kan fortsatt vises på gamle oppgaver, men kan ikke velges som aktiv kategori på nye oppgaver.

## Deloppgaver og frister
Deloppgaver kan ha egne deadlines. Disse brukes i dashboardets hasteberegning og i oppgavekortene. Deloppgaver med frist i dag eller denne uken kan løfte hovedoppgaven opp i dashboardet selv om hovedoppgavens egen frist er senere.

I oppgavemodalen vises deloppgaver stigende etter frist, med deloppgaver uten frist sist. Sorteringen skjer bare på en visningskopi som beholder indeks til det lagrede arrayet; avkryssing, ansvarsendring, fristendring og sletting oppdaterer derfor riktig element uten å endre rekkefølgen i Firestore. Begge modal-fanene viser ansvarlig og alltid absolutt dato sammen med den relative etiketten `Forfalt`, `I dag`, `I morgen` eller `Om N d` når den er relevant. Fullførte deloppgaver viser `Fullført`, og udaterte viser `Ingen frist`.

Oppgaver har fortsatt nøyaktig én hovedansvarlig i `assignedTo`, men kan i tillegg ha flere deltakere. Hovedansvarlig filtreres bort fra deltakerlisten ved lagring. Kort viser deltakerne kompakt, mens `taskInvolvement()` er felles kilde for `Mine`, hurtigfiltrene, teamoversikten og klientens statuskontroller. Hovedansvarlig og deltaker kan endre hovedstatus; en bruker som kun er deloppgaveansvarlig kan ikke endre hovedstatus.

Deltakerfeltet bruker én eksplisitt SVG-indikator i høyre kant. Indikatoren roteres når feltet åpnes; nettleserens innebygde `summary`-markør er skjult.

Lagrede deltakere og deloppgaveansvarlige som ikke lenger finnes i `state.users`, beholdes med snapshot-navnet og merkes som inaktive til de fjernes eksplisitt. Bare aktive brukere kan velges på nytt, og inaktive personer telles ikke i teamoversikten.

Deloppgaver er fortsatt et array inne i oppgavedokumentet. Firestore-reglene kan derfor ikke gi et Medlem skrivetilgang bare til sitt eget arrayelement. Deloppgaveansvar i v1.11.0 er et koordineringsverktøy: personen ser oppgaven i `Mine`, men kan ikke krysse av eller redigere deloppgaven. Det krever egne deloppgavedokumenter i en senere arkitektur.

## Gjentakende oppgaver
Admin og Teamleder kan gjøre en oppgave ukentlig, månedlig eller årlig gjentakende fra Detaljer-fanen. Gjentakelse krever ferdigdato. Når serien opprettes, lagres ferdigdatoen som `recurrence.anchorDate`; malen er den første forekomsten, og genererte forekomster kommer etter denne datoen. Endres malens ferdigdato senere, beholdes ankeret slik at hele serien ikke forskyves utilsiktet.

Klienten genererer forekomster gjennom 90 dager fra dagens dato. Ved månedlig dag 29, 30 eller 31 brukes månedens siste dag når den valgte datoen ikke finnes. Årlig gjentakelse bruker måned og dag fra ankerdatoen; 29. februar blir 28. februar i år som ikke er skuddår. Startdato og deloppgavefrister forskyves med samme avstand til ferdigdatoen som på malen. Nye forekomster starter som `ikke_startet`, og deloppgaver starter som ikke fullført.

Genereringen starter i bakgrunnen etter at oppgavene er lastet og umiddelbart etter lagring av en gjentakende oppgave. Den blokkerer ikke første rendering eller lukking av modalen. Dagens Firestore-regler tillater bare Admin og Teamleder å opprette oppgaver, så genereringen kjøres bare når `canEdit()` er sann. En ny forekomst opprettes derfor først når en Admin eller Teamleder åpner appen; innlogging fra kun et Medlem utløser ikke generering.

Forekomst-ID-en utledes deterministisk av mal-ID og dato. Generering skjer i transaksjonelle puljer på maksimalt 100 kandidater: transaksjonen leser den autoritative malen og alle aktuelle forekomster, oppretter bare dokumenter som ikke finnes, og oppdaterer `recurrenceGeneratedUntil` atomisk. Samtidige faner kan derfor ikke lage duplikater, og en eksisterende forekomst overskrives aldri. Ved mønsterendring settes markøren tilbake til ankeret; tidligere forekomster beholdes urørt. Fjerning av gjentakelse eller soft-delete av malen stopper videre generering.

## Eksport og sikkerhetskopi
Admin har et eget kort under Administrasjon for å laste ned en manuell øyeblikkskopi. Eksporten henter ett rått snapshot fra hver av samlingene `tasks`, `todos`, `categories`, `users`, `allowedUsers` og `comments`. Soft-slettede oppgaver og ToDo-er er med; varsler utelates fordi de er avledede og forgjengelige.

Ett knappetrykk klargjør tre filer:
- `strawberry-plan-backup-YYYY-MM-DD.json`: autoritativ kopi for manuell gjenoppretting, med dokument-ID-er, metadata, tellinger og rekursivt ISO-konverterte Firestore-timestamps.
- `strawberry-plan-oppgaver-YYYY-MM-DD.csv`: lesbart oppgaveuttrekk med norske kolonner.
- `strawberry-plan-todos-YYYY-MM-DD.csv`: lesbart ToDo-uttrekk med norske kolonner.

CSV-filene begynner med UTF-8 BOM, deretter Excels `sep=;`-direktiv på egen linje, og bruker standard CSV-sitering. Dette gir norske tegn og riktige kolonner ved dobbeltklikk i Excel, uavhengig av Windows-brukerens regionale listeskilletegn. Ansvarlige vises med navn når brukerprofilen finnes, og arkiverte rader merkes eksplisitt.

Eksportkortet og handleren er avgrenset til Admin i klienten. Dagens Firestore-regler gir imidlertid alle allowlistede roller lesetilgang til de eksporterte samlingene, så Admin-avgrensningen er ikke en separat serverside-sikkerhetsgrense. En håndhevet Admin-only eksport krever senere endring av regler eller backendarkitektur.

## Synksikkerhet
Appen skriver ikke hele datasett tilbake til Firestore. Oppgaver ligger som egne dokumenter og oppdateres feltvis. Direkte sletting av oppgaver er blokkert i rules; sletting i UI er soft-delete med `deletedAt`.

Valgt ansvarlig i åpne oppgave- og ToDo-skjemaer, samt ansvarligfilteret, bevares når `users`-collectionen oppdateres i sanntid. Dette hindrer at en annen brukers innlogging nullstiller en pågående tildeling eller et aktivt filter.

Bekreftelsesdialoger har én aktiv instans og én felles oppryddingsvei for OK, Avbryt og Escape. Escape lukker bare den øverste dialogen, slik at en underliggende oppgave- eller ToDo-modal ikke lukkes samtidig.

Deloppgaveendringer har felles feiltilbakemelding og laster oppgaven på nytt ved feil. Brukere uten redigeringsrett får ikke aktive deloppgavekontroller.

Full redigering av en eksisterende oppgave bruker transaksjon med `updatedAt`-sjekk. Hvis en bruker har hatt en gammel modal åpen og en annen allerede har lagret endringer, stoppes overskrivingen og brukeren må åpne oppgaven på nytt.

Alle skriver legger på `clientAppVersion`, `clientBuild`, `clientWriteId` og `writeSchemaVersion` for sporbarhet. Rules krever ikke app-versjon per nå, fordi for streng versjonsgating tidligere gjorde det lett å blokkere legitime brukere ved utrulling.

## Oppstart og caching
App-skallet vises så snart brukerens tilgang er bekreftet. Realtime subscriptions for oppgaver, ToDo-er, brukere, inviterte brukere, kategorier og varsler startes før bakgrunnssynk av profil fullføres, slik at en profil-write ikke skal stoppe datalasting.

`checkAllowedUser()` behandler `permission-denied` som manglende tilgang. Rollen i `state.profile` overstyres alltid med rollen fra allowlisten. En tom allowlist kan ikke lenger seedes av klienten etter at de herdede reglene er publisert; første Admin må opprettes manuelt i Firebase Console.

Service worker cacher appfiler. Ved ny release må `APP_VERSION` i `app.js` og `service-worker.js`, samt `CLIENT_APP_VERSION`/`CLIENT_BUILD` i `firestore.js`, holdes i sync.

## Merkevarefarger
| Navn | Hex |
|------|-----|
| Signature Coral | `#FF5A5F` |
| Strawberry Red | `#FF0036` |
| Black | `#000000` |
| White | `#FFFFFF` |
| Grey bakgrunn | `#f7f5f3` |
| Light Pink | `#ffd7d7` |

## Første brukere
Hardkodet i `firebase-config.js` under `INITIAL_USERS`. Klientseeding beholdes av hensyn til eldre oppsett, men vil være en feiltolerant no-op med de herdede reglene dersom allowlisten er tom. Første Admin må da seedes manuelt i Firebase Console.

| E-post | Rolle |
|--------|-------|
| espen.syversen@strawberry.no | Admin |
| christine.bjornstadjordet@strawberry.no | Teamleder |

## Deployment til GitHub Pages

### Førstegangsoppsett
1. Push alle filer til GitHub, inkludert `.nojekyll`.
2. Settings -> Pages -> Source: `main` branch, `/ (root)`.
3. Legg til GitHub Pages-domenet i Firebase Authentication -> Authorized domains.
4. Publiser `firestore.rules` i Firebase Console.

### Ved hver ny versjon
1. Bump versjonsnummer i alle tre filer samtidig:
   - `APP_VERSION` i `app.js`
   - `APP_VERSION` i `service-worker.js`
   - `CLIENT_APP_VERSION` og `CLIENT_BUILD` i `firestore.js`
2. Last opp alle endrede filer til GitHub (inkl. `.nojekyll` hvis den mangler).
3. Sjekk at deployment får grønn hake under **Deployments** i repoet (tar 1–3 min). Rødt kryss betyr at Jekyll-prosessering har feilet — dobbeltsjekk at `.nojekyll` ligger i repoet.
4. Åpne appen og trykk **Administrasjon → Oppdater app** for å tvinge ny PWA-versjon på enheten.

### Sikker utrulling av v1.4.2-reglene
1. Kontroller manuelt i Firebase Console at ingen dokument-ID-er i `allowedUsers` inneholder store bokstaver.
2. Kjør emulator-testene som beskrevet i `TESTING.md`.
3. Verifiser `email_verified` på to faktiske produksjonskontoer.
4. Deploy klientversjon `1.4.2` og bekreft at eksisterende Admin kan logge inn.
5. Publiser først deretter `firestore.rules` i Firebase Console.
6. Verifiser Admin, Teamleder, Medlem og en konto uten allowlist-tilgang i separate økter.

Rollback skjer via Firebase Console sin regelhistorikk og Git. Det skal ikke lagres en deployklar kopi av de gamle, sårbare reglene i repoet.

### Feilsøking ved deployment-problemer
- **Rødt kryss på commit**: `.nojekyll` mangler trolig i repoet. Legg den til (tom fil) og commit på nytt.
- **Appen viser gammel versjon etter oppdatering**: Åpne appen i inkognito-vindu for å bekrefte at nye filer er live. Bruk deretter `Oppdater app` i Administrasjon, eller slett nettstedsdata for domenet i nettleserinnstillingene.
- **GitHub Pages deployment er «2 hours ago» eller eldre**: Gjør en triviell commit (f.eks. legg til blank linje i CLAUDE.md) for å tvinge en ny deployment.
