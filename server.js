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

// API 1: Data Ingest
app.post('/api/ingest', async (req, res) => {
    try {
        const data = {
            ...req.body,
            // Optimization: Use a string timestamp so the frontend doesn't crash
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
        // QUOTA SAVER: Limit to 20 documents only
        const snap = await db.collection('sensor_readings')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

        if (snap.empty) {
            return res.status(200).json([]);
        }

        const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(logs);

    } catch (e) { 
        console.error("History Error:", e.message);
        
        // Catch Quota Error gracefully
        if (e.message.includes('8 RESOURCE_EXHAUSTED')) {
            return res.status(429).json({ error: "QUOTA_EXCEEDED", message: "Firebase limit reached." });
        }
        res.status(500).send(e.message); 
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`RAKSHAK System Live on ${PORT}`));
