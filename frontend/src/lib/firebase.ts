import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBp96CTvdPksUDtgbZQbdVHt40gC40W0uM",
  authDomain: "voxsense-94c4f.firebaseapp.com",
  projectId: "voxsense-94c4f",
  storageBucket: "voxsense-94c4f.firebasestorage.app",
  messagingSenderId: "387283850044",
  appId: "1:387283850044:web:7eccbf65866962197d0439",
  measurementId: "G-1PK5ZBTLPX",
};

// Prevent re-initializing Firebase on hot reload (Next.js dev mode)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db   = getFirestore(app);
export const storage = getStorage(app);
export default app;