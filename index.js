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

// Enable debugging
const DEBUG = true;

// Debug function
function debug(message, data = null) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG ${timestamp}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let qrCodeBase64 = '';
let clientInstance = null;
let botPhoneNumber = "919511972070"; // Will store the bot's own number
let botFullId = "919511972070@c.us"; // Will store the bot's full ID

const allowedGroups = new Set();
const groupChatContext = {}; // chatId => [last 30 messages]
const searchCounts = {}; // chatId => number of searches
const MAX_SEARCHES_PER_GROUP = 10;

// Commands that the bot can process when sent by itself
const SELF_COMMANDS = {
  // Format: 'command': handlerFunction
  '/status': handleStatusCommand,
  '/reset': handleResetCommand,
  '/help': handleHelpCommand
};

venom
.create(
    'connection',
    (base64Qr, asciiQR, attempts, urlCode) => {
      console.log(asciiQR);
      qrCodeBase64 = base64Qr;
      debug('QR Code generated', { attempts });
    },
    (statusSession) => {
      debug('Session status change', { status: statusSession });
    },
    {
      headless: false,
      logQR: false,
      browserArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new'],
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      debug: DEBUG
    }
  )
  .then(async (client) => {
    clientInstance = client;
    debug('Client instance created successfully');
    
    // Get bot's own number when connected - FIXED VERSION
    try {
      // Get information about the connected account
      const me = await client.getMe();
      debug('Bot information retrieved', { me });
      
      // Extract phone number from the me object
      if (me && me.wid) {
        // Format: "1234567890@c.us"
        botPhoneNumber = me.wid.replace('@c.us', '');
        botFullId = `${botPhoneNumber}@c.us`;
        
        debug('Bot initialized with phone number', { 
          botPhoneNumber, 
          botFullId,
          wid: me.wid
        });
      } else if (client.wid) {
        // Alternative method if me doesn't work
        botPhoneNumber = client.wid.replace('@c.us', '');
        botFullId = `${botPhoneNumber}@c.us`;
        
        debug('Bot initialized using client.wid', { 
          botPhoneNumber, 
          botFullId
        });
      } else {
        console.warn('Could not determine bot phone number. Some functionality may be limited.');
        debug('Failed to determine bot phone number', { client: !!client });
        
        // Set default values to avoid errors
        botPhoneNumber = 'unknown';
        botFullId = 'unknown@c.us';
      }
      
      // Log connection state for debugging
      const connectionInfo = await client.getConnectionState();
      debug('Connection state', { connectionInfo });
      
      // Verify the bot initialization after a short delay
      setTimeout(() => verifyBotInitialization(client), 3000);
      
    } catch (err) {
      console.error('Failed to get bot information:', err);
      debug('Bot information error', { error: err.message });
      
      // Set default values to avoid errors
      botPhoneNumber = 'unknown';
      botFullId = 'unknown@c.us';
    }
    
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

// GET all allowed groups
app.get('/groups', (req, res) => {
  debug('GET /groups endpoint called');
  res.json({ groups: Array.from(allowedGroups) });
});

// ADD group
app.post('/groups', express.json(), (req, res) => {
  const { name } = req.body;
  debug('POST /groups endpoint called', { groupName: name });
  
  if (name) {
    allowedGroups.add(name);
    return res.status(201).json({ message: 'Group added', groups: Array.from(allowedGroups) });
  }
  res.status(400).json({ error: 'Group name is required' });
});

// DELETE group
app.delete('/groups/:name', (req, res) => {
  const groupName = req.params.name;
  debug('DELETE /groups endpoint called', { groupName });
  
  if (allowedGroups.has(groupName)) {
    allowedGroups.delete(groupName);
    return res.json({ message: 'Group removed', groups: Array.from(allowedGroups) });
  }
  res.status(404).json({ error: 'Group not found' });
});

// Status endpoints to check bot health
app.get('/status', (req, res) => {
  debug('GET /status endpoint called');
  
  if (clientInstance) {
    res.json({
      status: 'connected',
      botNumber: botPhoneNumber,
      allowedGroups: Array.from(allowedGroups),
      searchCounters: searchCounts
    });
  } else {
    res.status(503).json({ status: 'disconnected' });
  }
});

// Start Express server
app.listen(port, () => {
  console.log(`🌐 Server running on http://localhost:${port}`);
  debug('Express server started', { port });
});

/**
 * Verify bot initialization 
 * @param {Object} client - Venom client
 * @returns {Promise<boolean>} Success status
 */
async function verifyBotInitialization(client) {
  try {
    debug('Verifying bot initialization');
    
    // Get the bot's information through available methods
    let updatedInfo = null;
    
    try {
      // Try to get info using getMe
      const me = await client.getMe();
      if (me && me.wid) {
        updatedInfo = {
          source: 'getMe',
          wid: me.wid,
          name: me.pushname || me.name
        };
      }
    } catch (meError) {
      debug('getMe failed', { error: meError.message });
    }
    
    // Use client.wid as fallback
    if (!updatedInfo && client.wid) {
      updatedInfo = {
        source: 'client.wid',
        wid: client.wid,
        name: 'Unknown'
      };
    }
    
    debug('Bot verification information', {
      updatedInfo,
      currentBotPhone: botPhoneNumber,
      currentBotFullId: botFullId
    });
    
    // Update bot identifiers if new information found
    if (updatedInfo && updatedInfo.wid) {
      const newPhoneNumber = updatedInfo.wid.replace('@c.us', '');
      
      if (newPhoneNumber !== botPhoneNumber && newPhoneNumber !== 'unknown') {
        botPhoneNumber = newPhoneNumber;
        botFullId = `${botPhoneNumber}@c.us`;
        debug('Updated bot identifiers', { botPhoneNumber, botFullId });
      }
    }
    
    return true;
  } catch (error) {
    console.error('Bot verification error:', error);
    debug('Failed to verify bot initialization', { error: error.message });
    return false;
  }
}

/**
 * Test function to verify the bot can identify its own messages
 * @param {Object} client - Venom client
 */
async function testSelfMessageIdentification(client) {
  try {
    debug('Running self-message identification test');
    
    // Get all chats
    const chats = await client.getAllChats();
    debug('Retrieved chats for testing', { count: chats.length });
    
    // Find a suitable chat for testing (preferably self-chat)
    let testChatId = null;
    
    // First try to find self chat
    const selfChat = chats.find(chat => {
      if (!chat || !chat.id) return false;
      
      // Try several matching methods
      const chatId = typeof chat.id === 'string' ? chat.id : chat.id.user;
      const normalizedChatId = chatId?.replace('@c.us', '');
      const normalizedBot = botPhoneNumber?.replace('@c.us', '');
      
      return normalizedChatId === normalizedBot;
    });
    
    if (selfChat && selfChat.id) {
      testChatId = typeof selfChat.id === 'string' ? selfChat.id : `${selfChat.id.user}@c.us`;
      debug('Found self chat for testing', { 
        testChatId,
        chatName: selfChat.name || 'Unknown'
      });
    } else {
      // If no self chat, use the first valid chat
      const firstChat = chats.find(chat => chat && chat.id);
      if (firstChat) {
        testChatId = typeof firstChat.id === 'string' ? firstChat.id : `${firstChat.id.user}@c.us`;
        debug('Using first available chat for testing', { 
          testChatId,
          chatName: firstChat.name || 'Unknown' 
        });
      }
    }
    
    if (!testChatId) {
      debug('No suitable chat found for testing');
      return;
    }
    
    // Log important identifiers
    debug('Bot identifiers for test', {
      botPhoneNumber,
      botFullId,
      testChatId
    });
    
    // Send a test message
    const testMessage = '🤖 Self-identification test: ' + new Date().toISOString();
    await client.sendText(testChatId, testMessage);
    debug('Sent test message to test chat');
    
  } catch (error) {
    console.error('Error in self-message test:', error);
    debug('Self-message test failed', { error: error.message });
  }
}

/**
 * Enhanced debug function for message identification
 * @param {Object} message - Message object from venom
 */
function debugMessageIdentification(message) {
  if (!DEBUG) return;
  
  const normalizedSender = (message.author || message.from || '').replace('@c.us', '');
  const normalizedBot = botPhoneNumber ? botPhoneNumber.replace('@c.us', '') : 'unknown';
  
  const identificationData = {
    messageId: message.id,
    from: message.from,
    author: message.author,
    chatId: message.chatId,
    
    // Compare different formats
    senderNoSuffix: normalizedSender,
    botNoSuffix: normalizedBot,
    senderEqualsBotFull: message.from === botFullId,
    senderEqualsBotPhone: normalizedSender === normalizedBot,
    
    // Bot identifiers for reference
    botPhoneNumber,
    botFullId,
    
    // WhatsApp platform identifiers
    isFromMe: message.fromMe, // Some venom versions provide this
    quotedMsgObj: message.quotedMsgObj ? {
      sender: message.quotedMsgObj.author || message.quotedMsgObj.from
    } : null
  };
  
  debug('MESSAGE IDENTIFICATION DETAILS', identificationData);
}

/**
 * Perform web search and format results for WhatsApp
 * @param {string} query - Search query
 * @returns {Promise<string>} - Formatted search results
 */
async function performWebSearch(query) {
  try {
    debug('Performing web search', { query });
    
    // Use the search function from web-search module
    const searchResults = await webSearch.search(query, {
      maxResults: 3,
      includeContent: true
    });
    
    debug('Search results received', { 
      status: searchResults.status, 
      resultCount: searchResults.results.length 
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
    debug('Search error occurred', { error: error.message });
    return `❌ Error searching for "${query}": ${error.message}`;
  }
}

/**
 * Check if a message is from the bot itself - IMPROVED
 * @param {Object} message - Message object from venom
 * @returns {Boolean} - True if the message is from the bot
 */
function isMessageFromSelf(message) {
  // No message or bot not properly initialized
  if (!message || !botPhoneNumber || botPhoneNumber === 'unknown') return false;
  
  const sender = message.author || message.from;
  if (!sender) return false;
  
  // Strip the suffix for reliable comparison
  const normalizedSender = sender.replace('@c.us', '');
  const normalizedBotId = botPhoneNumber.replace('@c.us', '');
  
  // Try multiple checks
  return (
    (sender === botFullId) || 
    (normalizedSender === normalizedBotId) ||
    (message.fromMe === true) // Some venom versions provide this
  );
}

/**
 * Handle status command from self
 * @param {Object} client - Venom client
 * @param {Object} message - Message object
 */
async function handleStatusCommand(client, message) {
  try {
    const status = {
      botNumber: botPhoneNumber,
      time: new Date().toISOString(),
      allowedGroups: Array.from(allowedGroups),
      activeSearches: Object.keys(searchCounts).length,
      memoryUsage: process.memoryUsage()
    };
    
    const statusText = `*Bot Status Report*\n\n` +
      `📱 Bot Number: ${status.botNumber}\n` +
      `⏰ Current Time: ${status.time}\n` +
      `👥 Allowed Groups: ${status.allowedGroups.length}\n` +
      `🔍 Active Search Sessions: ${status.activeSearches}\n` +
      `💾 Memory Usage: ${Math.round(status.memoryUsage.heapUsed / 1024 / 1024)} MB`;
    
    await client.reply(message.from, statusText, message.id);
    debug('Sent status report', status);
  } catch (error) {
    console.error('Error in status command:', error);
    await client.reply(message.from, "❌ Error generating status report", message.id);
  }
}

/**
 * Handle reset command from self
 * @param {Object} client - Venom client
 * @param {Object} message - Message object
 */
async function handleResetCommand(client, message) {
  try {
    // Reset search counts
    const oldCounts = { ...searchCounts };
    Object.keys(searchCounts).forEach(key => {
      searchCounts[key] = 0;
    });
    
    await client.reply(message.from, "🔄 Search counters reset successfully", message.id);
    debug('Reset search counters', { before: oldCounts, after: searchCounts });
  } catch (error) {
    console.error('Error in reset command:', error);
    await client.reply(message.from, "❌ Error resetting counters", message.id);
  }
}

/**
 * Handle help command from self
 * @param {Object} client - Venom client
 * @param {Object} message - Message object
 */
async function handleHelpCommand(client, message) {
  try {
    const helpText = `*Self Commands*\n\n` +
      `/status - Show bot status report\n` +
      `/reset - Reset search counters\n` +
      `/help - Show this help message\n\n` +
      
      `*User Commands*\n\n` +
      `@vibe - Chat with the bot\n` +
      `@vibe search: [query] - Search the web\n` +
      `@vibe poll: [question] - Create a poll`;
    
    await client.reply(message.from, helpText, message.id);
    debug('Sent help information');
  } catch (error) {
    console.error('Error in help command:', error);
    await client.reply(message.from, "❌ Error displaying help", message.id);
  }
}

/**
 * Process commands from the bot itself
 * @param {Object} client - Venom client
 * @param {Object} message - Message object 
 * @returns {Boolean} - True if a command was processed
 */
async function processSelfCommand(client, message) {
  const msgBody = message.body.trim();
  
  // Check if the message matches any self command
  for (const [command, handler] of Object.entries(SELF_COMMANDS)) {
    if (msgBody.startsWith(command)) {
      debug('Processing self command', { command, messageId: message.id });
      await handler(client, message);
      return true;
    }
  }
  
  return false;
}

/**
 * Send a message from the bot to a group
 * @param {Object} client - Venom client
 * @param {string} chatId - Chat ID to send to
 * @param {string} message - Message to send
 * @returns {Promise<Object>} - Send result
 */
async function sendBotMessage(client, chatId, message) {
  try {
    debug('Sending message to group', { chatId, messagePreview: message.substring(0, 20) });
    const result = await client.sendText(chatId, message);
    debug('Message sent successfully', { messageId: result?.id });
    return result;
  } catch (error) {
    console.error('Error sending message:', error);
    debug('Failed to send message', { error: error.message });
    throw error;
  }
}

// WhatsApp listener with improved self-message handling
async function start(client) {
  debug('Starting WhatsApp listener');
  
  client.onMessage(async (message) => {
    try {
      const chatId = message.chatId;
      const msgBody = message.body;
      
      if (!msgBody || !chatId) return;
      
      // Enhanced debugging for message identification
      if (DEBUG) {
        debugMessageIdentification(message);
        
        debug('Received message', { 
          chatId,
          isGroup: message.isGroupMsg,
          from: message.from,
          author: message.author,
          msgLength: msgBody.length,
          msgStart: msgBody.substring(0, 20)
        });
      }
      
      // Improved check for self message
      const isSelfMessage = isMessageFromSelf(message);
      
      if (isSelfMessage) {
        debug('Message is from self (bot)', { messageId: message.id });
        // Process self commands if present
        const commandProcessed = await processSelfCommand(client, message);
        if (commandProcessed) {
          debug('Self command processed successfully');
          return;
        }
        
        // If no command but still self-message, we may want to skip further processing
        debug('Non-command self message received, skipping normal processing');
        return; // Skip further processing for bot's own messages
      }
      
      // Non-group messages are ignored
      if (!message.isGroupMsg) {
        debug('Ignoring non-group message');
        return;
      }
  
      const groupData = await client.getChatById(chatId);
      const groupName = groupData?.name || 'Unknown';
      debug('Group information', { groupName, groupId: chatId });
  
      // Check against the allowedGroups Set
      if (!allowedGroups.has(groupName)) {
        debug('Ignored message from unapproved group', { groupName });
        return;
      }

      // Initialize context if not present
      if (!groupChatContext[chatId]) {
        debug('Initializing group chat context', { groupId: chatId });
        groupChatContext[chatId] = [];
  
        try {
          const earlierMessages = await client.loadEarlierMessages(chatId);
          debug('Loaded earlier messages', { count: earlierMessages?.length || 0 });
          
          const pastBodies = Array.isArray(earlierMessages)
            ? earlierMessages.map((msg) => msg.body).filter(Boolean)
            : [];
    
          groupChatContext[chatId].push(...pastBodies.slice(-30));
        } catch (contextErr) {
          console.error('Error loading earlier messages:', contextErr);
          debug('Failed to load earlier messages', { error: contextErr.message });
        }
      }
  
      // Maintain rolling context of last 30 messages
      groupChatContext[chatId].push(msgBody);
      if (groupChatContext[chatId].length > 30) {
        groupChatContext[chatId].shift();
      }

      // Handle poll creation command via Gemini
      if (msgBody.toLowerCase().startsWith('@vibe poll:')) {
        debug('Processing poll command');
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
        debug('Generated poll command', { generatedPollCommand });

        if (generatedPollCommand?.toLowerCase().startsWith('poll:')) {
          // Simulate a message containing Gemini's response
          const generatedMessage = { ...message, body: generatedPollCommand };
          await createPollFromMessage(client, generatedMessage);
          debug('Poll created successfully');
        } else {
          await client.sendText(message.chatId, "⚠️ Couldn't generate a valid poll from your message.");
          debug("Failed to generate valid poll format");
        }
        return;
      }

      // Handle web search via new search module
      if (msgBody.toLowerCase().startsWith('@vibe search:')) {
        const chatId = message.chatId;
        debug('Processing search command', { chatId });
      
        // Initialize or increment search count
        if (!searchCounts[chatId]) searchCounts[chatId] = 0;
        if (searchCounts[chatId] >= MAX_SEARCHES_PER_GROUP) {
          await client.sendText(chatId, "🚫 Your group has reached the 10 search limit.");
          debug('Search limit reached for group', { 
            chatId, 
            groupName, 
            currentCount: searchCounts[chatId]
          });
          return;
        }
      
        // Extract query and perform search
        const query = msgBody.replace(/@vibe search:/i, '').trim();
        if (!query) {
          await client.sendText(chatId, "❓ Please provide a search query.");
          debug('Empty search query received');
          return;
        }
        
        // Send typing indicator
        await client.startTyping(chatId);
        debug('Search query processing', { query });
        
        // First get raw search results
        const searchResults = await performWebSearch(query);
        debug('Raw search results obtained', { resultLength: searchResults.length });
        
        // Then enhance with Gemini if possible
        try {
          debug('Enhancing search results with Gemini');
          const enhanced = await askGemini(
            `This was the user's query: "${query}"\n\n` +
            `These are the search results:\n${searchResults}\n\n` +
            `Based on these search results and consider it carefully, provide a accurate and concise summary that answers the query.` +'Only if it is very important to the asking query Focus on the most relevant information. Include 2-3 key points from the results.' +
            `\n\n` +
            `Format your response nicely for WhatsApp (using *bold* where appropriate). Keep it under 400 words.`
          );
          
          if (enhanced?.trim()) {
            await client.sendText(chatId, enhanced.trim());
            debug('Sent enhanced search results');
          } else {
            await client.sendText(chatId, searchResults);
            debug('Sent raw search results (Gemini returned empty response)');
          }
        } catch (geminiError) {
          // Fallback to raw results if Gemini fails
          console.error('Gemini enhancement error:', geminiError);
          debug('Gemini enhancement failed', { error: geminiError.message });
          await client.sendText(chatId, searchResults);
        }
        
        // Try to stop typing indicator (not all clients support this)
        try {
          await client.stopTyping(chatId);
        } catch (typingErr) {
          debug('Error stopping typing indicator', { error: typingErr.message });
        }
        
        // Increment search count
        searchCounts[chatId] += 1;
        debug('Search count incremented', { 
          chatId, 
          newCount: searchCounts[chatId] 
        });
        return;
      }
  
      // Only respond when bot is mentioned
      if (msgBody.includes('@vibe')) {
        debug('Bot mention detected', { messageId: message.id });
        const context = groupChatContext[chatId].join('\n');
        const grpContext = `Group context:\n${context}\n`;
        const prompt = `User: ${msgBody}`;
  
        debug('Sending message to Gemini with context');
        const aiResponse = await ContextaskGemini(grpContext, prompt);
        const response = aiResponse?.trim() || 'Kuch samajh nahi aaya 🤔';
        debug('Received response from Gemini', { responseLength: response.length });
  
        await client.sendText(message.from, response);
        debug('Sent response to group');
      }
    } catch (err) {
      console.error("Error handling message:", err);
      debug('Error in message handler', { error: err.message, stack: err.stack });
      
      try {
        await client.sendText(message.from, "Kuch gadbad ho gayi re 😵");
      } catch (sendErr) {
        console.error("Error sending error message:", sendErr);
      }
    }
  });
  
  // Additional error handlers
  client.onIncomingCall(async (call) => {
    debug('Incoming call detected', { call });
    // You might want to send a message to the caller
  });
  
  // Handle disconnection
  client.onStateChange((state) => {
    debug('Connection state changed', { state });
    if (state === 'CONFLICT' || state === 'DISCONNECTED') {
      debug('Client disconnected or conflict detected');
    }
  });
  
  debug('WhatsApp listener setup complete');
  
  // Call testSelfMessageIdentification after a delay to ensure connection is stable
  setTimeout(() => testSelfMessageIdentification(client), 10000);
}