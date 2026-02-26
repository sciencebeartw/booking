import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, push } from "firebase/database";
import fs from 'fs';

// Read firebase config
const configContent = fs.readFileSync('firebase-config.js', 'utf8');
const match = configContent.match(/const firebaseConfig = ({[\s\S]*?});/);
if (!match) {
    console.error('Could not parse firebase-config.js');
    process.exit(1);
}
const firebaseConfig = eval('(' + match[1] + ')');

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function inject() {
    const newEventRef = push(ref(db, 'trial_events_config'));
    const eventId = "default_dual_match_2026";
    
    const payload = {
        title: "小六升國一資優科學班試聽與說明會",
        type: "dual_match",
        status: "active",
        countdownSeconds: 90,
        sessions: {
            "math_0501_1300": { subject: "math", name: "5/01 (五) 下午 1:00 - 2:30 數學", capacity: 40 },
            "math_0501_1445": { subject: "math", name: "5/01 (五) 下午 2:45 - 4:15 數學", capacity: 40 },
            "math_0509_1315": { subject: "math", name: "5/09 (六) 下午 1:15 - 2:45 數學", capacity: 40 },
            "math_0509_1500": { subject: "math", name: "5/09 (六) 下午 3:00 - 4:30 數學", capacity: 40 },
            "sci_0501_1300": { subject: "sci", name: "5/01 (五) 下午 1:00 - 2:30 自然", capacity: 40 },
            "sci_0501_1445": { subject: "sci", name: "5/01 (五) 下午 2:45 - 4:15 自然", capacity: 40 },
            "sci_0509_1315": { subject: "sci", name: "5/09 (六) 下午 1:15 - 2:45 自然", capacity: 40 },
            "sci_0509_1500": { subject: "sci", name: "5/09 (六) 下午 3:00 - 4:30 自然", capacity: 40 }
        }
    };

    await set(ref(db, `trial_events_config/${eventId}`), payload);
    console.log(`Successfully injected default event with ID: ${eventId}`);
    process.exit(0);
}

inject();
