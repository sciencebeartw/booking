// 檔案：firebase-config.js
// 版本：V12.0 (啟用 Storage 儲存功能)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, child, update, remove, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
// ★★★ 新增：引入 Storage 相關功能 ★★★
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ★★★ 新增：引入 Authentication 相關功能 ★★★
// ★★★ 新增：引入 Authentication 相關功能 ★★★
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ★★★ 新增：引入 App Check 相關功能 ★★★
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";

const firebaseConfig = {
  apiKey: "AIzaSyBEXgKhWRhUAFvzMad-D3QMtnGaS0Za1fA",
  authDomain: "sciencebear-booking.firebaseapp.com",
  projectId: "sciencebear-booking",
  storageBucket: "sciencebear-booking.firebasestorage.app",
  messagingSenderId: "1066303486185",
  appId: "1:1066303486185:web:d9c600ee1b7843388a9878",
  databaseURL: "https://sciencebear-booking-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app, "https://sciencebear-booking-default-rtdb.asia-southeast1.firebasedatabase.app");
const storage = getStorage(app); // 初始化 Storage
const auth = getAuth(app);       // 初始化 Auth

// ★★★ 初始化 App Check (配置 reCAPTCHA Enterprise) ★★★
// 為了避免本地端開發時 (127.0.0.1 或 localhost) 因為沒加進網域白名單而導致 Google 登入死機
let appCheck = null;
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider('6LdowIIsAAAAAMA97LyQY1KGj7tRDa-Mo0IcydeE'),
    isTokenAutoRefreshEnabled: true // 自動更新 Token
  });
} else {
  console.warn("目前在本地端開發，暫時略過 App Check 初始化以利測試登入。");
}

// 匯出功能
export {
  db, ref, set, get, child, update, remove, push, // Database
  storage, storageRef, uploadBytes, getDownloadURL, // Storage
  auth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, signInAnonymously, // Auth
  appCheck // App Check
};