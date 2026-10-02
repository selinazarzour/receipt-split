"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, type Auth } from "firebase/auth";

type FirebaseConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };

export function receiptAuth(config: FirebaseConfig): Auth {
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

export function signInWithGoogle(auth: Auth) {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export { signOut };
