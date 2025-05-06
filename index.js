const venom = require('venom-bot');
const path = require('path');
const { askGemini } = require('./gemini');

venom
  .create({
    session: 'connect',
    headless: false,
    browserArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new'],
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // adjust if needed
  })
  .then((client) => start(client))
  .catch((erro) => {
    console.error('Error starting Venom:', erro);
  });

async function start(client) {
  client.onMessage(async (message) => {
    try {
      const text = message.body;

      if (message.isGroupMsg && message.body && message.body.includes('@vibe')) {
        try {
          const aiResponse = await askGemini(text);
          if (typeof aiResponse === 'string' && aiResponse.trim() !== '') {
            await client.sendText(message.from, aiResponse);
          } else {
            await client.sendText(message.from, "Kuch samajh nahi aaya 🤔");
          }
        } catch (err) {
          console.error("Failed to handle group @vibe:", err);
          await client.sendText(message.from, "Kuch gadbad ho gayi re 😵");
        }
      }
      
    
    } catch (err) {
      console.error("Error when sending AI response:", err);
    }
    
  });
  
}
