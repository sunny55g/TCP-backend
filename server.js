require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const WebSocket = require('ws');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// MongoDB

const mongoClient = new MongoClient(process.env.MONGO_URI);

let messagesCollection;

async function connectToMongo() {
    try {
        await mongoClient.connect();
        const db = mongoClient.db("chatDB");
        messagesCollection = db.collection("messages");
        console.log("✅ MongoDB connected");
    } catch (err) {
        console.error("❌ MongoDB connection failed:");
        console.error(err.stack); // full error details
        process.exit(1); // Optional: stop server if MongoDB fails
    }
}

connectToMongo();


// REST endpoint (optional)
app.get('/messages', async (req, res) => {
    if (!messagesCollection) return res.status(500).send("MongoDB not ready");
    const messages = await messagesCollection.find().sort({ timestamp: 1 }).toArray();
    res.json(messages);
});


// Create HTTP server
const server = http.createServer(app);

// ✅ Attach WebSocket to the same HTTP server
const wss = new WebSocket.Server({ server });

const clients = new Map();
let clientIdCounter = 1;

wss.on('connection', (ws, req) => {
    const clientId = clientIdCounter++;
    clients.set(ws, { id: clientId, name: `User ${clientId}` });

        ws.on('message', async (message) => {
            
            const data = JSON.parse(message);
        try {
            const data = JSON.parse(message.toString());
            const client = clients.get(ws);
            switch (data.type) {
                case 'init':
                    clients.set(ws, { ...client, name: data.name });
                    console.log(`User ${data.name} joined`);
                    break;

case 'message':
    console.log(`Message from ${client.name}: ${data.content}`);

    // ✅ Store in MongoDB
    if (messagesCollection) {
        try {
            await messagesCollection.insertOne({
                sender: client.name,
                content: data.content,
                timestamp: new Date()
            });
            console.log("✅ Message stored in MongoDB");
        } catch (err) {
            console.error("❌ Failed to store message:", err);
        }
    }

    // ✅ Broadcast to others
    broadcastMessage(ws, data);
    break;


                default:
                    console.log("Unknown message type", data);
            }
        } catch (err) {
            console.error("Error handling message:", err);
        }
    });

    ws.on('close', () => {
        const client = clients.get(ws);
        console.log(`${client.name} disconnected`);
        clients.delete(ws);
    });

    ws.send(JSON.stringify({
        type: 'init',
        name: 'Server',
        isServer: true
    }));
});

function broadcastMessage(sender, message) {
    clients.forEach((_, ws) => {
        if (ws !== sender && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    });
}

// ✅ Start server (both Express and WebSocket)
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
