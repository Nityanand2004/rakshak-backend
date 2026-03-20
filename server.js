const express = require('express');
const admin = require('firebase-admin');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Initialize Firebase
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

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
        
        // Push to Dashboard Instantly
        io.emit('live_data', data);

        // Emergency Logic (If Alert Level is 2)
        if (data.alert_level >= 2) {
            io.emit('emergency', { msg: `DANGER: Worker ${data.worker_id}`, data });
        }

        res.status(201).send({ id: docRef.id });
    } catch (e) { res.status(500).send(e.message); }
});

// API 2: History (For Dashboard Logs)
app.get('/api/history', async (req, res) => {
    const snap = await db.collection('sensor_readings').orderBy('timestamp', 'desc').limit(20).get();
    res.send(snap.docs.map(doc => doc.data()));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`RAKSHAK System Live on ${PORT}`));