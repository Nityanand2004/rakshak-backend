const express = require('express');
const admin = require('firebase-admin');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path'); // Added this

// --- NEW FIREBASE INITIALIZATION START ---
const serviceAccountPath = path.resolve(__dirname, 'serviceAccountKey.json');
console.log("Attempting to load Firebase Key from:", serviceAccountPath);

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath)
    });
    console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
    console.error("Firebase initialization failed:", error.message);
}

const db = admin.firestore();
// --- NEW FIREBASE INITIALIZATION END ---

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// API 1: Data Ingest (For ESP32 / Raspberry Pi)
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

// API 2: History (For Dashboard Logs)
app.get('/api/history', async (req, res) => {
    try {
        const snap = await db.collection('sensor_readings').orderBy('timestamp', 'desc').limit(20).get();
        res.send(snap.docs.map(doc => doc.data()));
    } catch (e) { res.status(500).send(e.message); }
});

const PORT = process.env.PORT || 10000; // Render uses 10000 by default
server.listen(PORT, () => console.log(`RAKSHAK System Live on ${PORT}`));
