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
  // Cloud Storage for photo blobs — only available on the Blaze plan. Leave false
  // on Spark: photos ride as base64 Firestore docs. Flip to true after enabling
  // Blaze + deploying storage.rules; new photos then upload to Storage and old
  // base64 docs stay readable as a fallback (see sync.js uploadPhoto/getPhoto).
  // Guards the firebase-storage SDK import so Spark/local users never download it.
  // NOTE: getPhoto uses getBlob() — set bucket CORS (GET from the app origins) or
  // photo loads fail silently. See PRODUCTION_PLAN 3.2 for the gsutil step.
  useStorage: false,
};
