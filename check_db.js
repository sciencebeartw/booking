import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyBEXgKhWRhUAFvzMad-D3QMtnGaS0Za1fA",
    authDomain: "sciencebear-booking.firebaseapp.com",
    projectId: "sciencebear-booking",
    storageBucket: "sciencebear-booking.firebasestorage.app",
    messagingSenderId: "1066303486185",
    appId: "1:1066303486185:web:d9c600ee1b7843388a9878",
    databaseURL: "https://sciencebear-booking-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function check() {
    const snap = await get(ref(db, 'trial_events_config'));
    const data = snap.val();
    if (data) {
        const keys = Object.keys(data);
        console.log("Found events config:", keys.length);
        if (keys.length > 0) {
            console.log("Sample event config:", JSON.stringify(data[keys[0]], null, 2));
        }
    } else {
        console.log("No config found.");
    }

    const snap2 = await get(ref(db, 'trial_events/registrations'));
    const data2 = snap2.val();
    if (data2) {
        const rkeys = Object.keys(data2);
        console.log("Found events registrations:", rkeys.length);
        if (rkeys.length > 0) {
            const firstEventId = rkeys[0];
            const evtRegs = data2[firstEventId];
            const regKeys = Object.keys(evtRegs);
            console.log("Sample reg info:", JSON.stringify(evtRegs[regKeys[0]], null, 2));
        }
    } else {
        console.log("No reg found.");
    }
    process.exit(0);
}
check();
