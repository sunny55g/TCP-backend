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

wss.on('connection', (ws) => {
    const clientId = clientIdCounter++;
    let clientData = { id: clientId, name: `User${clientId}`, target: null };
    clients.set(ws, clientData);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            const client = clients.get(ws);

            switch (data.type) {
                case 'init':
                   // Check for name conflict
                   for (let [clientSocket, clientData] of clients.entries()) {
                       if (clientData.name === data.name) {
                           ws.send(JSON.stringify({
                               type: 'error',
                               message: 'Name already in use. Please choose another.'
                           }));
                          ws.close(); // force disconnect
                           return;
                       }
                   }

                   client.name = data.name;
                   client.target = data.target;
                   console.log(`✅ ${data.name} connected with target ${data.target}`);
                  break;
               

                case 'message':
                    console.log(`💬 ${client.name} → ${client.target}: ${data.content}`);

                    if (messagesCollection) {
                        await messagesCollection.insertOne({
                            sender: client.name,
                            content: data.content,
                            target: client.target,
                            timestamp: new Date()
                        });
                    }

                    // Send to all other clients who share the same target
                    for (let [otherWs, otherClient] of clients.entries()) {
                        if (
                            otherWs !== ws &&
                            otherClient.target === client.target &&
                            otherWs.readyState === WebSocket.OPEN
                        ) {
                            otherWs.send(JSON.stringify({
                                type: 'message',
                                sender: client.name,
                                content: data.content,
                                timestamp: new Date()
                            }));
                        }
                    }

                    break;

                default:
                    console.warn('Unknown message type:', data.type);
            }
        } catch (err) {
            console.error("❌ Error handling message:", err);
        }
    });

    ws.on('close', () => {
        const client = clients.get(ws);
        console.log(`❌ ${client.name} disconnected`);
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
