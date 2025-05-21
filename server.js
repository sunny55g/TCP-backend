require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

// HTTP server (for REST API)
app.use(cors());

let messagesCollection;

async function connectToMongo() {
    try {
        const client = new MongoClient(process.env.MONGO_URI);
        await client.connect();
        const db = client.db("chatDB");
        messagesCollection = db.collection("messages");
        console.log("✅ Connected to MongoDB");
    } catch (err) {
        console.error("❌ MongoDB Error:", err);
    }
}
connectToMongo();

// REST endpoint to fetch messages (optional)
app.get('/messages', async (req, res) => {
    if (!messagesCollection) return res.status(500).send("DB not ready");
    const messages = await messagesCollection.find().sort({ timestamp: 1 }).toArray();
    res.json(messages);
});

// Start HTTP server
app.listen(PORT, () => {
    console.log(`🌐 REST API running on http://localhost:${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Map();
let clientIdCounter = 1;

console.log(`📡 WebSocket Server running at ws://localhost:${WS_PORT}`);

wss.on('connection', (ws, req) => {
    const clientId = clientIdCounter++;
    const clientIp = req.socket.remoteAddress;
    clients.set(ws, { id: clientId, name: `User ${clientId}`, ip: clientIp });

    console.log(`Client #${clientId} connected from ${clientIp}`);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            const client = clients.get(ws);

            switch (data.type) {
                case 'init':
                    clients.set(ws, { ...client, name: data.name });
                    console.log(`Client #${client.id} identified as "${data.name}"`);
                    break;

                case 'message':
                    console.log(`Message from ${client.name}: ${data.content}`);

                    // Save to MongoDB
                    if (messagesCollection) {
                        await messagesCollection.insertOne({
                            sender: client.name,
                            content: data.content,
                            timestamp: new Date()
                        });
                    }

                    // Broadcast
                    broadcastMessage(ws, data);
                    break;

                default:
                    console.log('Unknown message type:', data);
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        const client = clients.get(ws);
        console.log(`Client #${client.id} (${client.name}) disconnected`);
        clients.delete(ws);
    });

    ws.send(JSON.stringify({
        type: 'init',
        name: 'Server',
        isServer: true
    }));
});

function broadcastMessage(sender, message) {
    clients.forEach((client, ws) => {
        if (ws !== sender && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    });
}
