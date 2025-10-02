const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const { ContextaskGemini } = require('./geminicontext');
const { askGemini } = require('./gemini');
const { searchBing } = require('./bingSearch');
const express = require('express');
const cors = require('cors');
const path = require('path');
const qrcode = require('qrcode');
const { createPollFromMessage } = require('./helper');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let qrCodeBase64 = '';
let clientInstance = null;
let isReady = false;

const groupChatContext = {}; // chatId => [last 30 messages]
const searchCounts = {}; // chatId => number of searches
const MAX_SEARCHES_PER_GROUP = 10;
const allowedGroups = new Set();

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "whatsapp-bot"
    }),
    puppeteer: {
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// QR Code generation
client.on('qr', async (qr) => {
    console.log('🔗 QR Code received, generating image...');
    try {
        qrCodeBase64 = await qrcode.toDataURL(qr);
        console.log('✅ QR Code image generated successfully');
    } catch (err) {
        console.error('❌ Error generating QR code:', err);
    }
});

// Client ready
client.on('ready', () => {
    console.log('✅ WhatsApp bot is ready!');
    isReady = true;
    clientInstance = client;
});

// Authentication success
client.on('authenticated', () => {
    console.log('✅ Authentication successful!');
});

// Authentication failure
client.on('auth_failure', msg => {
    console.error('❌ Authentication failed:', msg);
});

// Client disconnected
client.on('disconnected', (reason) => {
    console.log('❌ Client disconnected:', reason);
    isReady = false;
});

// Helper function to maintain group context
async function updateGroupContext(chatId, messageBody) {
    if (!groupChatContext[chatId]) {
        groupChatContext[chatId] = [];
    }

    groupChatContext[chatId].push(messageBody);
    if (groupChatContext[chatId].length > 30) {
        groupChatContext[chatId].shift();
    }
}

// Helper function to create poll


// Message handler
client.on('message', async (message) => {
    try {
        if (!message.body || !message.from.includes('@g.us')) return; // Only group messages

        const chat = await message.getChat();
        const groupName = chat.name;
        const chatId = message.from;
        const msgBody = message.body;

        // Check if group is allowed
        if (!allowedGroups.has(groupName)) {
            console.log(`❌ Ignored message from unapproved group: ${groupName}`);
            return;
        }

        // Update context
        await updateGroupContext(chatId, msgBody);

        // Handle poll creation
        if (msgBody.toLowerCase().startsWith('@vibe poll:')) {
          console.log("📊 Poll request detected:", msgBody);
          await createPollFromMessage(client, message);
          return;
        }

        // Handle web search
        if (msgBody.toLowerCase().startsWith('@vibe search:')) {
          if (!searchCounts[chatId]) searchCounts[chatId] = 0;
          if (searchCounts[chatId] >= MAX_SEARCHES_PER_GROUP) {
              await message.reply("🚫 Your group has reached the 10 search limit.");
              return;
          }

          const query = msgBody.replace(/@vibe search:/i, '').trim();
          if (!query) {
              await message.reply("❓ Please provide a search query.");
              return;
          }

          await message.reply("🔍 Searching... Please wait...");

          // ✅ Use smartSearch instead of direct DuckDuckGo
          const rawResult = await searchBing(query);

          const enhanced = await askGemini(
              `This was the user's query: ${query}\n\nWeb search result: "${rawResult}"\n\nEnhance this response in your style as Vibe. never tag the user back just give a better response `
          );

          await message.reply(enhanced?.trim() || rawResult);
          searchCounts[chatId] += 1;
          return;
        }


        // Handle normal chat with context
        if (msgBody.includes('@vibe')) {
            const context = groupChatContext[chatId] ? groupChatContext[chatId].join('\n') : '';
            const grpContext = `Group context:\n${context}\n`;
            const prompt = `User: ${msgBody}`;

            const aiResponse = await ContextaskGemini(grpContext, prompt);
            const response = aiResponse?.trim() || 'Kuch samajh nahi aaya 🤔';

            await message.reply(response);
        }

    } catch (error) {
        console.error("❌ Error handling message:", error);
        await message.reply("Kuch gadbad ho gayi re 😵");
    }
});

// Express routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve QR code
app.get('/qr', (req, res) => {
    if (qrCodeBase64) {
        res.json({ qr: qrCodeBase64, ready: isReady });
    } else {
        res.status(202).json({ message: 'QR not ready yet', ready: isReady });
    }
});

// Get bot status
app.get('/status', (req, res) => {
    res.json({ 
        ready: isReady,
        hasQr: !!qrCodeBase64,
        allowedGroups: Array.from(allowedGroups)
    });
});

// GET all allowed groups
app.get('/groups', (req, res) => {
    res.json({ groups: Array.from(allowedGroups) });
});

// ADD group
app.post('/groups', (req, res) => {
    const { name } = req.body;
    if (name) {
        allowedGroups.add(name);
        console.log(`✅ Added group: ${name}`);
        return res.status(201).json({ 
            message: 'Group added', 
            groups: Array.from(allowedGroups) 
        });
    }
    res.status(400).json({ error: 'Group name is required' });
});

// DELETE group
app.delete('/groups/:name', (req, res) => {
    const groupName = decodeURIComponent(req.params.name);
    if (allowedGroups.has(groupName)) {
        allowedGroups.delete(groupName);
        console.log(`✅ Removed group: ${groupName}`);
        return res.json({ 
            message: 'Group removed', 
            groups: Array.from(allowedGroups) 
        });
    }
    res.status(404).json({ error: 'Group not found' });
});

// Get group chats
app.get('/chats', async (req, res) => {
    if (!isReady || !clientInstance) {
        return res.status(503).json({ error: 'Bot not ready' });
    }

    try {
        const chats = await clientInstance.getChats();
        const groupChats = chats
            .filter(chat => chat.isGroup)
            .map(chat => ({
                id: chat.id._serialized,
                name: chat.name,
                participantCount: chat.participants.length
            }));
        
        res.json({ chats: groupChats });
    } catch (error) {
        console.error('❌ Error fetching chats:', error);
        res.status(500).json({ error: 'Failed to fetch chats' });
    }
});

// Start Express server
app.listen(port, () => {
    console.log(`🌐 Server running on http://localhost:${port}`);
});

// Initialize WhatsApp client
client.initialize();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🔄 Shutting down gracefully...');
    if (clientInstance) {
        await clientInstance.destroy();
    }
    process.exit(0);
});