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
        serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
        console.log("Firebase Key loaded from Environment Variable.");
    } else {
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

// Root Route
app.get('/', (req, res) => res.send("RAKSHAK Backend is Live and Ready!"));

// --- MODULE 1: WEARABLE UNIT (Personal Health) ---

app.post('/api/ingest', async (req, res) => {
    try {
        const { worker_id, bpm, h2s, o2 } = req.body;

        // ALERT LOGIC: Trigger if vitals are outside safe ranges
        // BPM > 120 or < 50 | O2 < 19.5% | H2S > 10ppm
        const isAlert = (bpm > 120 || bpm < 50 || (o2 && o2 < 19.5) || (h2s && h2s > 10));

        const data = {
            ...req.body,
            alert: isAlert, // Auto-generated alert status
            timestamp: new Date().toISOString() 
        };
        
        const docRef = await db.collection('sensor_readings').add(data);
        io.emit('live_data', data);

        if (isAlert) {
            io.emit('emergency', { msg: `🚨 DANGER: Worker ${worker_id || 'Unknown'}`, data });
        }

        res.status(201).send({ id: docRef.id, alert: isAlert });
    } catch (e) { 
        console.error("Ingest Error:", e.message);
        res.status(500).send(e.message); 
    }
});

app.get('/api/history', async (req, res) => {
    try {
        const snap = await db.collection('sensor_readings').orderBy('timestamp', 'desc').limit(20).get();
        if (snap.empty) return res.status(200).json([]);
        const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(logs);
    } catch (e) { 
        res.status(500).send(e.message); 
    }
});


// --- MODULE 2: PORTABLE ENVIRONMENTAL UNIT (Hazardous Gases) ---

app.post('/api/environmental/ingest', async (req, res) => {
    try {
        const { device_id, ch4, h2s, co } = req.body;

        // ALERT LOGIC: Based on Industrial Safety Thresholds
        // CH4 > 1.5% | H2S > 10ppm | CO > 35ppm
        const isAlert = (ch4 > 1.5 || h2s > 10 || co > 35);

        const envReading = {
            device_id: device_id || "PORTABLE_UNIT",
            ch4: ch4 || 0,
            h2s: h2s || 0,
            co: co || 0,
            alert: isAlert, // Auto-generated alert status
            timestamp: new Date().toISOString()
        };

        const docRef = await db.collection('env_readings').add(envReading);
        io.emit('env_live_data', envReading);

        if (isAlert) {
            io.emit('emergency', { msg: `🚨 GAS LEAK: ${device_id || 'Portable Unit'}`, data: envReading });
        }

        res.status(201).json({ success: true, id: docRef.id, alert: isAlert });
    } catch (e) {
        console.error("Env Ingest Error:", e.message);
        res.status(500).send(e.message);
    }
});

app.get('/api/environmental/history', async (req, res) => {
    try {
        const snap = await db.collection('env_readings').orderBy('timestamp', 'desc').limit(10).get();
        if (snap.empty) return res.status(200).json([]);
        const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(logs);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`RAKSHAK System Live on ${PORT}`));
