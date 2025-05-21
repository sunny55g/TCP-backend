require('dotenv').config();

const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());

// GET /messages
app.get('/messages', async (req, res) => {
    if (!messagesCollection) return res.status(500).send("DB not ready");
    const messages = await messagesCollection.find().sort({ timestamp: 1 }).toArray();
    res.json(messages);
});

// Listen on another port for HTTP
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`REST API running on port ${PORT}`);
});



// Simple WebSocket server for the TCP/IP messaging app
const WebSocket = require('ws');

// Create WebSocket server on port 8080
const wss = new WebSocket.Server({ port: 8080 });

// Store connected clients
const clients = new Map();
let clientIdCounter = 1;

console.log('WebSocket Server started on ws://localhost:8080');

// Handle new connections
wss.on('connection', (ws, req) => {
    const clientId = clientIdCounter++;
    const clientIp = req.socket.remoteAddress;
    
    console.log(`Client #${clientId} connected from ${clientIp}`);
    
    // Add new client to the map
    clients.set(ws, { id: clientId, name: `User ${clientId}`, ip: clientIp });
    
    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            const client = clients.get(ws);
            
            // Handle different message types
            switch (data.type) {
                case 'init':
                    // Update client name when they send initialization
                    clients.set(ws, { ...client, name: data.name });
                    console.log(`Client #${client.id} identified as "${data.name}"`);
                    break;
                    
                case 'message':
                    console.log(`Message from ${client.name}: ${data.content}`);

                    // ✅ Save to MongoDB
                    if (messagesCollection) {
                        messagesCollection.insertOne({
                            sender: client.name,
                            content: data.content,
                         timestamp: new Date()
                                    }).then(() => {
                          console.log('Message saved to MongoDB');
                      }).catch(err => {
                          console.error('Failed to save message to MongoDB:', err);
                      });
                 }

    // ✅ Broadcast to other clients
    broadcastMessage(ws, data);
    break;

                    
                default:
                    console.log('Unknown message type:', data);
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    
    // Handle client disconnection
    ws.on('close', () => {
        const client = clients.get(ws);
        console.log(`Client #${client.id} (${client.name}) disconnected`);
        clients.delete(ws);
    });
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'init',
        name: 'Server',
        isServer: true
    }));
});

// Broadcast message to all clients except sender
function broadcastMessage(sender, message) {
    clients.forEach((client, ws) => {
        if (ws !== sender && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    });
}

// Handle server errors
wss.on('error', (error) => {
    console.error('Server error:', error);
});

//mongodb

const { MongoClient } = require('mongodb');

const mongoClient = new MongoClient(process.env.MONGO_URI);
let messagesCollection;

async function connectToDB() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db("chatDB");
    messagesCollection = db.collection("messages");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}
connectToDB();


// Log server startup
console.log('TCP/IP Messaging WebSocket Server running on port 8080');
console.log('Press Ctrl+C to stop the server');
