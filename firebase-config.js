// ============================================================
//  🔥 FIREBASE CONFIGURATION — LendTrack App
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyD6Rp_icIRtTCG7vy6qHAgDDr2BondicJo",
    authDomain: "moneylender-5a3e8.firebaseapp.com",
    projectId: "moneylender-5a3e8",
    storageBucket: "moneylender-5a3e8.firebasestorage.app",
    messagingSenderId: "54908290934",
    appId: "1:54908290934:web:1a9e34516f151db6b81c57",
    measurementId: "G-9ZBKZHNN77"
};

// Initialize Firebase (using compat SDK for GitHub Pages)
firebase.initializeApp(firebaseConfig);

// Make services globally accessible
const db   = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
