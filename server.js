const express = require('express');
const admin = require('firebase-admin');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// --- SMART FIREBASE INITIALIZATION ---
let serviceAccount;

try {
    if (process.env.FIREBASE_KEY) {
        // Option A: Use Environment Variable (Best for Cloud)
        serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
        console.log("Firebase Key loaded from Environment Variable.");
    } else {
        // Option B: Use Local File (Fallback)
        const serviceAccountPath = path.resolve(__dirname, 'serviceAccountKey.json');
        serviceAccount = require(serviceAccountPath);
        console.log("Firebase Key loaded from local file:", serviceAccountPath);
    }

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin SDK initialized successfully.");
    }
} catch (error) {
    console.error("CRITICAL: Firebase initialization failed!", error.message);
}

const db = admin.firestore();
// --- END INITIALIZATION ---

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// Root Route (To check if server is awake)
app.get('/', (req, res) => res.send("RAKSHAK Backend is Live and Ready!"));

// API 1: Data Ingest
app.post('/api/ingest', async (req, res) => {
    try {
        const data = {
            ...req.body,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await db.collection('sensor_readings').add(data);
        
        io.emit('live_data', data);

        if (data.alert_level >= 2) {
            io.emit('emergency', { msg: `DANGER: Worker ${data.worker_id}`, data });
        }

        res.status(201).send({ id: docRef.id });
    } catch (e) { 
        console.error("Ingest Error:", e.message);
        res.status(500).send(e.message); 
    }
});

// API 2: History
app.get('/api/history', async (req, res) => {
    try {
        const snap = await db.collection('sensor_readings').orderBy('timestamp', 'desc').limit(20).get();
        res.send(snap.docs.map(doc => doc.data()));
    } catch (e) { res.status(500).send(e.message); }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`RAKSHAK System Live on ${PORT}`));
