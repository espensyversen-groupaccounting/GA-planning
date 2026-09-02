# Testing av Firestore Security Rules

## Forutsetninger

- Node.js og npm.
- Java installert og tilgjengelig for Firebase Firestore-emulatoren.
- Kjør kommandoene fra prosjektroten.

Installer dev-avhengighetene:

```powershell
npm install
```

Kjør hele testsuiten:

```powershell
npm test
```

Kommandoen starter kun Firestore-emulatoren, kjører `tests/firestore.rules.test.js` og stopper emulatoren igjen. Testene bruker et lokalt `demo-`-prosjekt og skriver aldri til produksjon.

## Hva testsuiten dekker

- Eksakt e-postnøkkel: `espen.syversen@strawberry.no` blir `espen_dot_syversen_at_strawberry_dot_no`.
- Store bokstaver i token-e-post matcher samme lowercase allowlist-dokument.
- Uverifisert og ikke-allowlistet bruker avvises.
- Rolle- og e-postintegritet i `users/{uid}`.
- Innloggingsskriving med `lastLogin` for Admin, Teamleder og Medlem.
- Rolleendring fra Medlem til Teamleder via allowlisten.
- Medlem-, Teamleder- og Admin-rettigheter.
- Feltbegrensning på egne oppgaver.
- Kommentaridentitet, varslingseierskap og forbud mot direkte sletting.
- Tilgang fjernes etter at allowlist-dokumentet slettes.

## Obligatoriske produksjonssjekker før publisering

### 1. Kontroller eksisterende dokument-ID-er

Åpne Firebase Console -> Firestore Database -> `allowedUsers`. Bekreft at ingen dokument-ID-er inneholder store bokstaver. Alle skal være lowercase og bruke `_dot_` og `_at_`.

Eksempel:

```text
espen_dot_syversen_at_strawberry_dot_no
```

Hvis en ID inneholder store bokstaver, må oppføringen opprettes med korrekt lowercase ID og verifiseres før den gamle fjernes. Ikke publiser de nye reglene før dette er avklart.

### 2. Verifiser email_verified på to kontoer

Logg inn med to faktiske produksjonskontoer, åpne nettleserkonsollen og kjør:

```javascript
firebase.auth().currentUser.getIdTokenResult().then(r => console.log(r.claims));
```

Bekreft at begge viser:

```text
email_verified: true
```

Dette må gjøres før reglene publiseres.

Hvis en legitim Google-konto ikke har claim-en, fjernes følgende ene linje fra `isSignedIn()` i `firestore.rules`:

```text
&& request.auth.token.email_verified == true
```

Kjør deretter `npm test` på nytt før publisering. Behold fortsatt kravene om innlogging og token-e-post.

## Sikker utrullingsrekkefølge

1. Gjennomfør de manuelle kontrollene over.
2. Kjør `npm test` og kontroller at alle tester består.
3. Deploy klientversjon `1.4.2`.
4. Bekreft at eksisterende Admin kan logge inn.
5. Publiser innholdet i `firestore.rules` i Firebase Console.
6. Test Admin, Teamleder og Medlem i separate økter.
7. Test at en Google-konto uten allowlist-oppføring får «Du har ikke tilgang til denne appen. Kontakt Admin.»

Rollback gjøres via Firebase Console sin regelhistorikk og Git.
