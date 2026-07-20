// Firebase project config for "us-date-tracker" (project us-date-tracker-c988b).
// These values are public by design — access is controlled by Firestore/Storage
// security rules (firestore.rules / storage.rules), not by hiding this config.
// Sync stays off unless apiKey is set; local-only mode never loads Firebase.
export const firebaseConfig = {
  apiKey: "AIzaSyAnQraHxkiAsvuWNnIydIiE-JLhno13ac0",
  authDomain: "us-date-tracker-c988b.firebaseapp.com",
  projectId: "us-date-tracker-c988b",
  storageBucket: "us-date-tracker-c988b.firebasestorage.app",
  messagingSenderId: "769027499995",
  appId: "1:769027499995:web:9f8fbadca109e56a1629fe",
  // Cloud Storage for photo blobs (Blaze). Enabled 2026-07-20: Blaze live, bucket
  // created, storage.rules deployed (+ cross-service Firestore IAM grant), and
  // bucket CORS set (GET/HEAD from tzoororg.github.io + localhost:8000 — required
  // because getPhoto uses getBlob()). New photos upload to Storage; old base64
  // Firestore docs stay readable via the fallback (see sync.js uploadPhoto/getPhoto).
  // Guards the firebase-storage SDK import so Spark/local users never download it.
  useStorage: true,
};
