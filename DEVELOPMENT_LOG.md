# Development Log

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
