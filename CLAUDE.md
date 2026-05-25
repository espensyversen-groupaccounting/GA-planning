# Strawberry Planleggingsapp – CLAUDE.md

## Prosjektoversikt
PWA-basert teamplanleggingsapp for Strawberry. Erstatter Google Sheets-regnearket "Plan 2026&2027".
Sanntidssynkronisering via Firebase Firestore. Norsk UI. Ingen datamigrering nødvendig.

## Teknologistakk
- **Frontend**: HTML5, CSS3, JavaScript ES6+ (ingen bundler/framework)
- **Hosting**: GitHub Pages
- **Database**: Firebase Firestore (sanntidssynkronisering)
- **Autentisering**: Firebase Authentication med Google Sign-In

## Filstruktur
```
Planleggingsapp/
├── index.html          # App-skallet (single-page app, alle views)
├── styles.css          # All CSS med Strawberry-merkevarefarger
├── firebase-config.js  # Firebase-konfigurasjon (fyll inn credentials)
├── firestore.js        # Alle Firestore CRUD-operasjoner
├── app.js              # All UI-logikk, routing, hendelseshåndtering
├── manifest.json       # PWA-manifest (installasjon på hjemskjerm)
├── service-worker.js   # Caching og offline-støtte
├── Strawberry_Logotype_Primary_Black_RGB.png
├── Strawberry_Logotype_Primary_White_RGB.png
└── CLAUDE.md
```

## Oppsett – Firebase (MÅ GJØRES FØR FØRSTE KJØRING)

### 1. Opprett Firebase-prosjekt
1. Gå til https://console.firebase.google.com
2. Klikk "Add project" → gi navn (f.eks. "strawberry-planlegging")
3. Deaktiver Google Analytics om ønskelig → klikk "Create project"

### 2. Aktiver Firestore
1. Build → Firestore Database → "Create database"
2. Velg "Start in production mode"
3. Velg region: `europe-west1`

### 3. Aktiver Authentication
1. Build → Authentication → Get started
2. Under "Sign-in method": Aktiver "Google"
3. Legg til ditt domene i "Authorized domains" (inkl. GitHub Pages URL når klar)

### 4. Hent Firebase-konfigurasjon
1. Prosjektinnstillinger (tannhjulet) → "Your apps" → Klikk </> (Web app)
2. Registrer appen, kopier `firebaseConfig`-objektet
3. Lim inn verdiene i `firebase-config.js`

### 5. Sett Firestore Security Rules
Gå til Firestore → Rules og lim inn:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuth() { return request.auth != null; }
    function getRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }
    function isAdmin() { return getRole() == 'admin'; }
    function isAdminOrTeamleder() { return getRole() in ['admin', 'teamleder']; }

    match /allowedUsers/{doc} {
      allow read: if isAuth();
      allow write: if isAuth() && isAdmin();
    }
    match /users/{userId} {
      allow read: if isAuth();
      allow create: if isAuth() && request.auth.uid == userId;
      allow update: if isAuth() && (request.auth.uid == userId || isAdmin());
      allow delete: if isAuth() && isAdmin();
    }
    match /tasks/{taskId} {
      allow read: if isAuth();
      allow create, delete: if isAuth() && isAdminOrTeamleder();
      allow update: if isAuth() && (isAdminOrTeamleder() ||
        (getRole() == 'medlem' && request.resource.data.diff(resource.data)
          .affectedKeys().hasOnly(['status', 'updatedAt'])));
    }
    match /comments/{commentId} {
      allow read: if isAuth();
      allow create: if isAuth();
      allow update, delete: if isAuth() &&
        (resource.data.userId == request.auth.uid || isAdmin());
    }
    match /users/{userId}/notifications/{notifId} {
      allow read, update, delete: if isAuth() && request.auth.uid == userId;
      allow create: if isAuth();
    }
  }
}
```

## Datamodell (Firestore)

### `allowedUsers/{sanitizedEmail}`
Email sanitisert: `.` → `_dot_`, `@` → `_at_` (f.eks. `espen_dot_syversen_at_strawberry_dot_no`)
- `email`: string — `role`: 'admin' | 'teamleder' | 'medlem'
- `invitedBy`: string (uid eller 'system') — `invitedAt`: timestamp

### `users/{uid}`
Opprettes automatisk ved første innlogging.
- `email`, `displayName`, `photoURL`, `role`, `createdAt`, `lastLogin`

### `tasks/{taskId}`
- `title`, `description`: string
- `priority`: 'høy' | 'medium' | 'lav'
- `categoryId`: string | null — `categoryName`, `categoryColor`: snapshot-felter for visning
- `status`: 'ikke_startet' | 'i_gang' | 'fullfort'
- `assignedTo`: uid — `assignedToName`: string
- `startDate`, `dueDate`: Firestore Timestamp (nullable)
- `dependencies`: string
- `subtasks`: array av `{id, title, completed, dueDate}` der `dueDate` er `YYYY-MM-DD` eller `null`
- `createdBy`: uid — `createdAt`, `updatedAt`: timestamp

### `comments/{commentId}`
- `taskId`, `userId`, `userDisplayName`, `userPhotoURL`, `text`, `createdAt`

### `categories/{categoryId}`
Konfigureres fra Admin-panelet av Admin eller Teamleder.
- `name`: string — `color`: hex string — `icon`: string
- `sortOrder`: number — `active`: boolean
- `createdBy`: uid — `createdAt`, `updatedAt`: timestamp

### `users/{userId}/notifications/{notifId}`
- `type`: 'task_assigned' | 'comment_added' | 'status_changed'
- `taskId`, `taskTitle`, `message`: string
- `read`: boolean — `createdAt`: timestamp

## Merkevarefarger
| Navn | Hex |
|------|-----|
| Signature Coral (primær) | #FF5A5F |
| Strawberry Red | #FF0036 |
| Black | #000000 |
| White | #FFFFFF |
| Grey (bakgrunn) | #f7f5f3 |
| Light Pink | #ffd7d7 |

## Brukere ved oppstart
Hardkodet i `firebase-config.js` under `INITIAL_USERS`.
Seedes automatisk til `allowedUsers` ved første kjøring hvis samlingen er tom.

| E-post | Rolle |
|--------|-------|
| espen.syversen@strawberry.no | Admin |
| christine.bjornstadjordet@strawberry.no | Teamleder |

Admin kan legge til flere brukere via Admin-panelet i appen.

## Roller og rettigheter
| Rolle | Opprette | Redigere | Slette | Oppdatere status | Adminpanel |
|-------|:---:|:---:|:---:|:---:|:---:|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| Teamleder | ✓ | ✓ | ✓ | ✓ | ✗ |
| Medlem | ✗ | ✗ | ✗ | Egne oppg. | ✗ |

## Deployment til GitHub Pages
1. Opprett repository på GitHub
2. Last opp alle filer (eller push via git)
3. Settings → Pages → Source: `main` branch, `/ (root)`
4. Legg til `<brukernavn>.github.io` i Firebase Authentication → Authorized domains

## Varsler
Fase 1: Internt varslingssenter (bjelle-ikon) med sanntidsoppdateringer via Firestore.
Fase 2 (fremtidig): Ekte Web Push (VAPID + Firebase Cloud Functions, krever Blaze-abonnement).

## Synksikkerhet
Appen skriver ikke hele datasett tilbake til Firestore. Oppgaver opprettes som egne dokumenter, oppdateres feltvis, og sletting av oppgaver er soft-delete (`deletedAt`) slik at gamle klienter ikke kan fjerne oppgavedokumenter permanent.

Alle skriver legger på `clientAppVersion`, `clientBuild`, `clientWriteId` og `writeSchemaVersion`. Deploy `firestore.rules` sammen med appen for å avvise gamle klienter som ikke sender dette metadata-stempelet. Full redigering av en eksisterende oppgave bruker transaksjon med `updatedAt`-sjekk, slik at en bruker som har hatt en gammel modal åpen ikke overskriver endringer andre har gjort i mellomtiden.

## Firebase SDK-versjon
Firebase 9 (compat mode) via CDN. Alle scripts lastes i `index.html`.
