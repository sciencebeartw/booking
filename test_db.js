import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";
import fs from 'fs';

const configContent = fs.readFileSync('firebase-config.js', 'utf8');
const match = configContent.match(/const firebaseConfig = ({[\s\S]*?});/);
const firebaseConfig = eval('(' + match[1] + ')');
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function check() {
    const snap = await get(ref(db, 'trial_events_config'));
    console.log("EVENTS CONFIG:", JSON.stringify(snap.val(), null, 2));
    process.exit(0);
}
check();
