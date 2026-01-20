import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBe4qKoMbia4kR8nEk2qxITvpKZz1XMO9c",
  authDomain: "roomio-admin.firebaseapp.com",
  projectId: "roomio-admin",
  storageBucket: "roomio-admin.firebasestorage.app",
  messagingSenderId: "607134762324",
  appId: "1:607134762324:web:37cf93ccb9461a9a7374c1",
  measurementId: "G-YPCXV4MQ58"
};

const app = initializeApp(firebaseConfig);

// ✅ Auth works on mobile
export const auth = getAuth(app);