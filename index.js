const venom = require('venom-bot');
const path = require('path');
const { askGemini } = require('./gemini');

venom
  .create({
    session: 'connection',
    headless: false,
    browserArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new'],
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // adjust if needed
  })
  .then((client) => start(client))
  .catch((erro) => {
    console.error('Error starting Venom:', erro);
  });

  const groupChatContext = {}; // key: chatId, value: array of last 30 messages

  async function start(client) {
    client.onMessage(async (message) => {
      try {
        const chatId = message.chatId;
        const msgBody = message.body;
  
        // Skip if message is empty or not from a group
        if (!message.isGroupMsg || !msgBody) return;
  
        // Initialize context array for this group if not already
        if (!groupChatContext[chatId]) {
          groupChatContext[chatId] = [];
  
          // Load earlier messages to prefill context
          const earlierMessages = await client.loadEarlierMessages(chatId);
          const pastBodies = Array.isArray(earlierMessages)
            ? earlierMessages.map(msg => msg.body).filter(Boolean)
            : []; // fallback if it's not an array
          // filter out empty ones
  
          groupChatContext[chatId].push(...pastBodies.slice(-30));
        }
  
        // Append current message
        groupChatContext[chatId].push(msgBody);
  
        // Maintain only last 30 messages
        if (groupChatContext[chatId].length > 30) {
          groupChatContext[chatId].shift();
        }
        console.log(groupChatContext[chatId]);
  
        // Handle @vibe trigger
        if (msgBody.includes('@vibe')) {
          const context = groupChatContext[chatId].join('\n');
          const prompt = `Group context:\n${context}\n\nUser: ${msgBody}\nBot:`;
  
          const aiResponse = await askGemini(prompt);
          const response = aiResponse?.trim() || "Kuch samajh nahi aaya 🤔";
  
          await client.sendText(message.from, response);
        }
  
      } catch (err) {
        console.error("Error handling message:", err);
        await client.sendText(message.from, "Kuch gadbad ho gayi re 😵");
      }
    });
  }
  
  
