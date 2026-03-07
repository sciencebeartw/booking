import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, set } from "firebase/database";
import fs from "fs";
const firebaseConfigStr = fs.readFileSync('firebase-config.js', 'utf8').match(/const firebaseConfig = ({[\s\S]*?});/)[1];
const firebaseConfig = eval('(' + firebaseConfigStr + ')');
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function addTestWarnings() {
  await set(push(ref(db, 'bot-warnings/booking_enter')), {
    email: 'testparent@gmail.com', uid: 'testuid', timestamp: Date.now(), penaltySeconds: 5, targetId: '-O0u22bZ4-test-course-id'
  });
  await set(push(ref(db, 'bot-warnings/trial_enter')), {
    email: 'testparent2@gmail.com', uid: 'testuid2', timestamp: Date.now(), penaltySeconds: 5, targetId: 'test-event-id', studentName: '王小明'
  });
  console.log('done adding test bot warnings');
  process.exit(0);
}
addTestWarnings();
