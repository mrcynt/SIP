import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// GANTI BAGIAN INI DENGAN KODE DARI FIREBASE CONSOLE MILIKMU
const firebaseConfig = {
  apiKey: "AIzaSyDmdUr-jIfBi9wnaG1TyAYvab1p61VfGjY",
  authDomain: "hpp-project-1b1fa.firebaseapp.com",
  projectId: "hpp-project-1b1fa",
  storageBucket: "hpp-project-1b1fa.firebasestorage.app",
  messagingSenderId: "926564516533",
  appId: "1:926564516533:web:5e2cd5d09b6278884534fc",
  measurementId: "G-PZ2C5RMGMB"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// Ekspor layanan Auth dan Database (Firestore) agar bisa dipakai di halaman lain
export const auth = getAuth(app);
export const db = getFirestore(app);