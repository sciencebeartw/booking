// 檔案：firebase-config.js
// 版本：V12.0 (啟用 Storage 儲存功能)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, child, update, remove, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
// ★★★ 新增：引入 Storage 相關功能 ★★★
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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

// 匯出功能
export { 
    db, ref, set, get, child, update, remove, push, // Database
    storage, storageRef, uploadBytes, getDownloadURL // Storage
};