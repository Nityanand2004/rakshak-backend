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
        // Option A: Use Environment Variable (Best for Render Cloud)
        serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
        console.log("Firebase Key loaded from Environment Variable.");
    } else {
        // Option B: Use Local File (Fallback for Localhost)
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

// --- MODULE 1: WEARABLE UNIT (Personal Health) ---

// API 1: Data Ingest
app.post('/api/ingest', async (req, res) => {
    try {
        const data = {
            ...req.body,
            timestamp: new Date().toISOString() 
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

// API 2: History (OPTIMIZED)
app.get('/api/history', async (req, res) => {
    try {
        const snap = await db.collection('sensor_readings')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

        if (snap.empty) return res.status(200).json([]);

        const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(logs);

    } catch (e) { 
        console.error("History Error:", e.message);
        if (e.message.includes('8 RESOURCE_EXHAUSTED')) {
            return res.status(429).json({ error: "QUOTA_EXCEEDED", message: "Firebase limit reached." });
        }
        res.status(500).send(e.message); 
    }
});


// --- MODULE 2: PORTABLE ENVIRONMENTAL UNIT (Hazardous Gases) ---

// API 3: Environmental Data Ingest (NEW)
app.post('/api/environmental/ingest', async (req, res) => {
    try {
        const { device_id, ch4, h2s, co } = req.body;

        const envReading = {
            device_id: device_id || "PORTABLE_UNIT",
            ch4: ch4 || 0,
            h2s: h2s || 0,
            co: co || 0,
            timestamp: new Date().toISOString()
        };

        const docRef = await db.collection('env_readings').add(envReading);
        
        // Emit via Socket so Anmol can see it live on the dashboard
        io.emit('env_live_data', envReading);

        res.status(201).json({ success: true, id: docRef.id });
    } catch (e) {
        console.error("Env Ingest Error:", e.message);
        res.status(500).send(e.message);
    }
});

// API 4: Environmental History (NEW)
app.get('/api/environmental/history', async (req, res) => {
    try {
        const snap = await db.collection('env_readings')
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();

        if (snap.empty) return res.status(200).json([]);

        const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(logs);

    } catch (e) {
        console.error("Env History Error:", e.message);
        res.status(500).send(e.message);
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`RAKSHAK System Live on ${PORT}`));
