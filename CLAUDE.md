# Strawberry Planleggingsapp - CLAUDE.md

## Prosjektoversikt
PWA-basert teamplanleggingsapp for Strawberry. Appen erstatter et tidligere Google Sheets-oppsett, men starter med blanke ark uten datamigrering. Den gir teamet oversikt over oppgaver, prioritet, ansvarlig, frister, deloppgaver, kommentarer, kategorier og varsler.

Sanntidssynkronisering skjer via Firebase Firestore. UI er norsk, og appen er bygget som en enkel vanilla HTML/CSS/JS single-page app uten bundler.

## Teknologistakk
- Frontend: HTML5, CSS3, JavaScript ES6+
- Hosting: GitHub Pages
- Database: Firebase Firestore
- Autentisering: Firebase Authentication med Google Sign-In
- PWA: manifest + service worker

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

### 1. Firebase-prosjekt
1. Opprett prosjekt i Firebase Console.
2. Aktiver Firestore i production mode.
3. Bruk region `europe-west1`.
4. Aktiver Google Sign-In under Authentication.
5. Legg til GitHub Pages-domenet under Authorized domains.
6. Lim inn web app-konfigurasjon i `firebase-config.js`.

### 2. Firestore Security Rules
`firestore.rules` i repoet er kilde til gjeldende rules. Når rules endres, kopier hele innholdet derfra til Firebase Console -> Firestore -> Rules og publiser.

Viktig nåværende rollemodell:
- `allowedUsers`: alle innloggede kan lese; kun Admin kan opprette, endre og slette.
- `users`: alle innloggede kan lese; bruker kan opprette/oppdatere egen profil; Admin kan oppdatere/slette brukere.
- `categories`: Admin og Teamleder kan opprette, endre, skjule og slette.
- `tasks`: Admin og Teamleder kan opprette og oppdatere; direkte delete er blokkert. Oppgaver arkiveres med soft-delete.
- `comments`: alle innloggede kan lese og opprette; direkte delete er blokkert.
- `notifications`: brukeren eier egne varsler.

## Datamodell

### `allowedUsers/{sanitizedEmail}`
Email sanitisert: `.` -> `_dot_`, `@` -> `_at_`.

Brukes som allowlist for hvem som slipper inn i appen.
- `email`: string
- `role`: `admin` | `teamleder` | `medlem`
- `invitedBy`: uid eller `system`
- `invitedAt`: timestamp
- `clientAppVersion`, `clientBuild`, `clientWriteId`, `writeSchemaVersion`

### `users/{uid}`
Opprettes eller oppdateres automatisk ved innlogging etter at brukeren finnes i `allowedUsers`.
- `email`, `displayName`, `photoURL`, `role`
- `createdAt`, `lastLogin`

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
- write metadata: `clientAppVersion`, `clientBuild`, `clientWriteId`, `writeSchemaVersion`

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

## Roller og rettigheter

| Rolle | Opprette oppgaver | Redigere oppgaver | Endre status | Kategorier | Brukere |
|-------|:---:|:---:|:---:|:---:|:---:|
| Admin | Ja | Ja | Ja | Ja | Ja |
| Teamleder | Ja | Ja | Ja | Ja | Nei |
| Medlem | Nei | Nei | Egne tildelte | Nei | Nei |

Admin-panelet er synlig for Admin og Teamleder fordi kategorier administreres der. Brukeradministrasjon vises og fungerer bare for Admin.

## Legge til nye brukere
1. Logg inn som en bruker med rollen `admin`.
2. Gå til Administrasjon.
3. Skriv inn e-postadressen i "Legg til bruker".
4. Velg rolle og trykk "Legg til".
5. Den nye personen logger inn med Google-kontoen sin.

Appen oppretter ikke `users/{uid}` når en bruker inviteres. Den legger bare e-posten i `allowedUsers`. Selve `users/{uid}`-dokumentet opprettes automatisk første gang personen logger inn.

Hvis dette feiler:
- Sjekk at innlogget bruker har `role: "admin"` i `users/{uid}`.
- Sjekk at `firestore.rules` er publisert i Firebase Console.
- Sjekk at e-posten er skrevet likt som Google-kontoen brukeren logger inn med.

## Synksikkerhet
Appen skriver ikke hele datasett tilbake til Firestore. Oppgaver ligger som egne dokumenter og oppdateres feltvis. Direkte sletting av oppgaver er blokkert i rules; sletting i UI er soft-delete med `deletedAt`.

Full redigering av en eksisterende oppgave bruker transaksjon med `updatedAt`-sjekk. Hvis en bruker har hatt en gammel modal åpen og en annen allerede har lagret endringer, stoppes overskrivingen og brukeren må åpne oppgaven på nytt.

Alle skriver legger på `clientAppVersion`, `clientBuild`, `clientWriteId` og `writeSchemaVersion` for sporbarhet. Rules krever ikke app-versjon per nå, fordi for streng versjonsgating tidligere gjorde det lett å blokkere legitime brukere ved utrulling.

## Oppstart og caching
App-skallet vises så snart brukerens tilgang er bekreftet. Realtime subscriptions for oppgaver, brukere, kategorier og varsler startes før bakgrunnssynk av profil fullføres, slik at en profil-write ikke skal stoppe datalasting.

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
5. Åpne appen og bruk "Oppdater app" under Administrasjon for å tvinge ny PWA-versjon på enheten.

## Firebase SDK
Firebase 9 compat mode lastes via CDN i `index.html`.
