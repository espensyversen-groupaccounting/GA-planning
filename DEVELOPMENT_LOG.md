# Development Log

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
