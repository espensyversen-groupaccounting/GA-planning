# Strawberry Planleggingsapp - CLAUDE.md

## Prosjektstatus
Gjeldende appversjon: `v1.3.1`

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
├── app.js              # UI-logikk, routing og hendelseshåndtering
├── manifest.json       # PWA-manifest
├── service-worker.js   # Caching og app-oppdatering
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
7. Publiser innholdet i `firestore.rules` i Firebase Console.

`firestore.rules` i repoet er kilde til gjeldende rules. Når rules endres, kopier hele innholdet derfra til Firebase Console -> Firestore -> Rules og publiser.

## Rollemodell og regler
- `allowedUsers`: alle innloggede kan lese; kun Admin kan opprette, endre og slette.
- `users`: alle innloggede kan lese; bruker kan opprette/oppdatere egen profil; Admin kan oppdatere/slette brukere.
- `categories`: Admin og Teamleder kan opprette, endre, skjule og slette.
- `tasks`: Admin og Teamleder kan opprette og oppdatere; direkte delete er blokkert. Oppgaver arkiveres med soft-delete.
- `todos`: Admin og Teamleder kan opprette, oppdatere og arkivere; Medlem kan fullføre/åpne egne tildelte ToDo-er.
- `comments`: alle innloggede kan lese og opprette; direkte delete er blokkert.
- `notifications`: brukeren eier egne varsler.

| Rolle | Opprette oppgaver | Redigere oppgaver | Endre status | Kategorier | Brukere |
|-------|:---:|:---:|:---:|:---:|:---:|
| Admin | Ja | Ja | Ja | Ja | Ja |
| Teamleder | Ja | Ja | Ja | Ja | Nei |
| Medlem | Nei | Nei | Egne tildelte | Nei | Nei |

Admin-panelet er synlig for Admin og Teamleder fordi kategorier administreres der. Brukeradministrasjon vises og fungerer bare for Admin.

## Datamodell

### `allowedUsers/{sanitizedEmail}`
Brukes som allowlist for hvem som slipper inn i appen. Email sanitisert: `.` -> `_dot_`, `@` -> `_at_`.

- `email`: string
- `role`: `admin` | `teamleder` | `medlem`
- `invitedBy`: uid eller `system`
- `invitedAt`: timestamp
- write metadata: `clientAppVersion`, `clientBuild`, `clientWriteId`, `writeSchemaVersion`

### `users/{uid}`
Opprettes eller oppdateres automatisk ved første innlogging etter at brukeren finnes i `allowedUsers`.

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
- `startDate`, `dueDate`: Firestore Timestamp eller null
- `dependencies`
- `subtasks`: array av `{ id, title, completed, dueDate }`, der `dueDate` er `YYYY-MM-DD` eller null
- `deletedAt`, `deletedBy`: soft-delete/arkivering
- `createdBy`, `createdAt`, `updatedAt`
- write metadata

### `todos/{todoId}`
Lettvektsoppgaver for ad hoc-arbeid som ikke trenger full prosjektstruktur.

- `title`
- `priority`: `høy` | `medium` | `lav`
- `status`: `apen` | `fullfort`
- `assignedTo`, `assignedToName`
- `dueDate`: Firestore Timestamp eller null
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
- `Mine`: viser kun oppgaver og ToDo-er tildelt innlogget bruker.

Toppkort:
- `Forsinket`: åpne oppgaver med passert hovedfrist.
- `I dag`: åpne oppgaver eller deloppgaver med frist i dag, inkludert forfalte.
- `Denne uken`: åpne oppgaver, deloppgaver eller ToDo-er med frist innen 7 dager.
- `Uten ansvarlig`: åpne oppgaver eller ToDo-er uten tildelt person.
- `Høy prioritet`: åpne oppgaver eller ToDo-er med høy prioritet.

Dashboardseksjoner:
- `Korte ToDo's`: topp 5 åpne ToDo-er i valgt Team/Mine-visning, sortert etter hastegrad.
- `Prioriter i dag`: forfalte oppgaver og oppgaver/deloppgaver med frist i dag, gruppert etter `Høy`, `Medium`, `Lav`.
- `Planlegg denne uken`: kommende oppgaver/deloppgaver innen 1-7 dager, gruppert etter prioritet.
- `Uten ansvarlig`: åpne oppgaver som må delegeres.
- `Teamoversikt`: viser åpne oppgaver/ToDo-er og risikopunkter per person. I `Mine`-visning skjules denne og brukeren får beskjed om å bytte til Team for teamfordeling.

På mobil er dashboardet komprimert: toppkortene vises som horisontale chips, ToDo-skjemaet åpnes først når brukeren trykker `+ ToDo`, og kort/spacing er strammet inn slik at prioriterte oppgaver kommer tidligere på skjermen. Desktop-layouten er beholdt bred og mer informasjonsrik.

Hasteberegningen i `app.js` tar hensyn til frist, om fristen er passert, prioritet, om oppgaven mangler ansvarlig, status og deloppgavefrister.

## Oppgaver-fanen
Oppgaver-fanen har ordinære filtre og hurtigfiltre.

Hurtigfiltre:
- `Alle`
- `Prosjekter`
- `ToDo`
- `Må følges opp`
- `Uten ansvarlig`
- `Denne uken`: frist i dag eller innen 7 dager, inkludert deloppgaver.
- `Neste 14 dager`: bredere planleggingsvindu for kommende leveranser.
- `Mine`
- `Høy prioritet`

Standard sortering er etter hastegrad, ikke bare prioritet. Oppgavekort og ToDo-kort viser signaler som `Forfalt`, `Frist i dag`, `Denne uken`, `Neste 14 d`, `Ikke tildelt` og `Deloppgavefrist`.

## Korte ToDo-er
ToDo-er er ment for korte ad hoc-oppgaver som må følges opp, men som ikke trenger full prosjektstruktur med deloppgaver og kommentarer.

ToDo legges inn direkte fra dashboardet med:
- tittel
- ansvarlig
- frist
- prioritet: `Haster`, `Normal`, `Lav`

ToDo-er vises:
- som egen `Korte ToDo's`-seksjon på dashboardet
- i toppkortene på dashboardet der de påvirker `I dag`, `Denne uken`, `Uten ansvarlig` og `Høy prioritet`
- i Oppgaver-fanen under `Alle` og hurtigfilteret `ToDo`
- i Team/Mine-visningen på dashboardet

Admin og Teamleder kan opprette og slette ToDo-er. Tildelt Medlem kan markere egne ToDo-er som fullført eller åpne dem igjen.

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
- Sjekk at innlogget admin faktisk har `role: "admin"` i `users/{uid}`.
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

## Synksikkerhet
Appen skriver ikke hele datasett tilbake til Firestore. Oppgaver ligger som egne dokumenter og oppdateres feltvis. Direkte sletting av oppgaver er blokkert i rules; sletting i UI er soft-delete med `deletedAt`.

Full redigering av en eksisterende oppgave bruker transaksjon med `updatedAt`-sjekk. Hvis en bruker har hatt en gammel modal åpen og en annen allerede har lagret endringer, stoppes overskrivingen og brukeren må åpne oppgaven på nytt.

Alle skriver legger på `clientAppVersion`, `clientBuild`, `clientWriteId` og `writeSchemaVersion` for sporbarhet. Rules krever ikke app-versjon per nå, fordi for streng versjonsgating tidligere gjorde det lett å blokkere legitime brukere ved utrulling.

## Oppstart og caching
App-skallet vises så snart brukerens tilgang er bekreftet. Realtime subscriptions for oppgaver, ToDo-er, brukere, inviterte brukere, kategorier og varsler startes før bakgrunnssynk av profil fullføres, slik at en profil-write ikke skal stoppe datalasting.

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
Hardkodet i `firebase-config.js` under `INITIAL_USERS`. Disse seedes til `allowedUsers` første gang appen kjører hvis allowlisten er tom.

| E-post | Rolle |
|--------|-------|
| espen.syversen@strawberry.no | Admin |
| christine.bjornstadjordet@strawberry.no | Teamleder |

## Deployment til GitHub Pages
1. Push alle filer til GitHub.
2. Settings -> Pages -> Source: `main` branch, `/ (root)`.
3. Legg til GitHub Pages-domenet i Firebase Authentication -> Authorized domains.
4. Publiser `firestore.rules` i Firebase Console.
5. Åpne appen og bruk `Oppdater app` under Administrasjon for å tvinge ny PWA-versjon på enheten.
