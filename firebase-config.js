// ============================================================
// FIREBASE KONFIGURASJON
// ============================================================
// STEG 1: Gå til https://console.firebase.google.com
// STEG 2: Prosjektinnstillinger → Your apps → Web app (</>)
// STEG 3: Kopier firebaseConfig-objektet og lim inn nedenfor

const firebaseConfig = {
  apiKey:            "AIzaSyAcXX4bZWjTzYcFS1xvi35WmrJoVbea1tg",
  authDomain:        "groupaccounting-planning.firebaseapp.com",
  projectId:         "groupaccounting-planning",
  storageBucket:     "groupaccounting-planning.firebasestorage.app",
  messagingSenderId: "474779784146",
  appId:             "1:474779784146:web:9dec67f915cf07e5b4ee0b"
};

// ============================================================
// INITIELLE BRUKERE
// Seedes automatisk til Firestore ved første kjøring
// ============================================================
const INITIAL_USERS = [
  { email: 'espen.syversen@strawberry.no',              role: 'admin'      },
  { email: 'christine.bjornstadjordet@strawberry.no',   role: 'teamleder'  }
];

// ============================================================
// FIREBASE INITIALISERING (ikke endre)
// ============================================================
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

// Persistens: behold innlogging selv etter lukking av nettleser
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
