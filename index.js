const { askGemini } = require('./gemini');
const { ContextaskGemini } = require('./geminicontext');  
const venom = require('venom-bot');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createPollFromMessage } = require('./helper');
const webSearch = require('./web-search'); // Import the web-search module

const app = express();
const port = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let qrCodeBase64 = '';
let clientInstance = null;
let allowedGroupName = ''; // Group name allowed by user

const groupChatContext = {}; // chatId => [last 30 messages]

const searchCounts = {}; // chatId => number of searches
const MAX_SEARCHES_PER_GROUP = 10;

venom
.create(
    'connection',
    (base64Qr, asciiQR, attempts, urlCode) => {
      console.log(asciiQR);
      qrCodeBase64 = base64Qr;
    },
    undefined,
    {
      headless: false,
      logQR: false,
      browserArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new'],
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    }
  )
  .then((client) => {
    clientInstance = client;
    start(client);
  })
  .catch((err) => console.error('Venom error:', err));

// Serve QR code
app.get('/qr', (req, res) => {
  if (qrCodeBase64.startsWith('data:image')) {
    res.json({ qr: qrCodeBase64 });
  } else {
    res.status(202).json({ message: 'QR not ready yet' });
  }
});

// Set allowed group name from frontend
app.post('/allow-group', (req, res) => {
  const { groupName } = req.body;
  if (groupName && typeof groupName === 'string') {
    allowedGroupName = groupName.trim();
    console.log(`✅ Allowed group set to: "${allowedGroupName}"`);
    res.json({ status: 'ok', allowedGroup: allowedGroupName });
  } else {
    res.status(400).json({ error: 'Invalid group name' });
  }
});

const allowedGroups = new Set();

// GET all allowed groups
app.get('/groups', (req, res) => {
  res.json({ groups: Array.from(allowedGroups) });
});

// ADD group
app.post('/groups', express.json(), (req, res) => {
  const { name } = req.body;
  if (name) {
    allowedGroups.add(name);
    return res.status(201).json({ message: 'Group added', groups: Array.from(allowedGroups) });
  }
  res.status(400).json({ error: 'Group name is required' });
});

// DELETE group
app.delete('/groups/:name', (req, res) => {
  const groupName = req.params.name;
  if (allowedGroups.has(groupName)) {
    allowedGroups.delete(groupName);
    return res.json({ message: 'Group removed', groups: Array.from(allowedGroups) });
  }
  res.status(404).json({ error: 'Group not found' });
});


// Start Express server
app.listen(port, () => {
  console.log(`🌐 Server running on http://localhost:${port}`);
});

/**
 * Perform web search and format results for WhatsApp
 * @param {string} query - Search query
 * @returns {Promise<string>} - Formatted search results
 */
async function performWebSearch(query) {
  try {
    // Use the search function from web-search module
    const searchResults = await webSearch.search(query, {
      maxResults: 3,
      includeContent: true
    });
    
    if (searchResults.status === "error" || searchResults.results.length === 0) {
      return `🔍 No results found for: "${query}"`;
    }
    
    // Format results for WhatsApp message
    let formattedResults = `🔍 *Search Results for "${query}"*\n\n`;
    
    searchResults.results.forEach((result, index) => {
      formattedResults += `*${index + 1}. ${result.title}*\n`;
      formattedResults += `${result.snippet}\n`;
      formattedResults += `🔗 ${result.url}\n\n`;
    });
    
    formattedResults += "───────────────\n";
    formattedResults += "Powered by @vibe search";
    
    return formattedResults;
  } catch (error) {
    console.error('Search error:', error);
    return `❌ Error searching for "${query}": ${error.message}`;
  }
}

// WhatsApp listener
async function start(client) {
  client.onMessage(async (message) => {
    try {
      const chatId = message.chatId;
      const msgBody = message.body;
  
      if (!message.isGroupMsg || !msgBody) return;
  
      const groupData = await client.getChatById(chatId);
      const groupName = groupData?.name || 'Unknown';
  
      // ✅ Check against the allowedGroups Set
      if (!allowedGroups.has(groupName)) {
        console.log(`❌ Ignored message from unapproved group: ${groupName}`);
        return;
      }

      // ✅ Initialize context if not present
      if (!groupChatContext[chatId]) {
        groupChatContext[chatId] = [];
  
        const earlierMessages = await client.loadEarlierMessages(chatId);
        const pastBodies = Array.isArray(earlierMessages)
          ? earlierMessages.map((msg) => msg.body).filter(Boolean)
          : [];
  
        groupChatContext[chatId].push(...pastBodies.slice(-30));
      }
  
      // ✅ Maintain rolling context of last 30 messages
      groupChatContext[chatId].push(msgBody);
      if (groupChatContext[chatId].length > 30) {
        groupChatContext[chatId].shift();
      }

      // 🎯 Handle poll creation command via Gemini
      if (msgBody.toLowerCase().startsWith('@vibe poll:')) {
        const prompt = `Convert the following group message into a WhatsApp poll in the format: 
        poll:{ 
          name: 'new poll',
          options: [
            {
              name: 'option 1'
            },
            {
              name: 'option 2'
            }
          ],
          selectableOptionsCount: 1
        }
        Only respond with the poll format.\n\nMessage: ${msgBody}`;
        
        const aiPollLine = await askGemini(prompt);
        const generatedPollCommand = aiPollLine?.trim();

        if (generatedPollCommand?.toLowerCase().startsWith('poll:')) {
          // Simulate a message containing Gemini's response
          const generatedMessage = { ...message, body: generatedPollCommand };
          await createPollFromMessage(client, generatedMessage);
        } else {
          await client.sendText(message.chatId, "⚠️ Couldn't generate a valid poll from your message.");
        }
        return;
      }

      // 🎯 Handle web search via new search module
      if (msgBody.toLowerCase().startsWith('@vibe search:')) {
        const chatId = message.chatId;
      
        // Initialize or increment search count
        if (!searchCounts[chatId]) searchCounts[chatId] = 0;
        if (searchCounts[chatId] >= MAX_SEARCHES_PER_GROUP) {
          await client.sendText(chatId, "🚫 Your group has reached the 10 search limit.");
          return;
        }
      
        // Extract query and perform search
        const query = msgBody.replace(/@vibe search:/i, '').trim();
        if (!query) {
          await client.sendText(chatId, "❓ Please provide a search query.");
          return;
        }
        
        // Send typing indicator
        await client.startTyping(chatId);
        
        // First get raw search results
        const searchResults = await performWebSearch(query);
        
        // Then enhance with Gemini if possible
        try {
          const enhanced = await askGemini(
            `This was the user's query: "${query}"\n\n` +
            `These are the search results:\n${searchResults}\n\n` +
            `Based on these search results and consider it carefully, provide a accurate and concise summary that answers the query.` +'Only if it is very important to the asking query Focus on the most relevant information. Include 2-3 key points from the results.' +
            `\n\n` +
            +
            `Format your response nicely for WhatsApp (using *bold* where appropriate). Keep it under 400 words.`
          );
          
          if (enhanced?.trim()) {
            await client.sendText(chatId, enhanced.trim());
          } else {
            await client.sendText(chatId, searchResults);
          }
        } catch (geminiError) {
          // Fallback to raw results if Gemini fails
          console.error('Gemini enhancement error:', geminiError);
          await client.sendText(chatId, searchResults);
        }
        
        // Stop typing indicator
        
        // Increment search count
        searchCounts[chatId] += 1;
        return;
      }
  
      // ✅ Only respond when bot is mentioned
      if (msgBody.includes('@vibe')) {
        const context = groupChatContext[chatId].join('\n');
        const grpContext = `Group context:\n${context}\n`;
        const prompt = `User: ${msgBody}`;
  
        const aiResponse = await ContextaskGemini(grpContext, prompt);
        const response = aiResponse?.trim() || 'Kuch samajh nahi aaya 🤔';
  
        await client.sendText(message.from, response);
      }
    } catch (err) {
      console.error("Error handling message:", err);
      await client.sendText(message.from, "Kuch gadbad ho gayi re 😵");
    }
  });
}