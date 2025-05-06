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

      if (text.includes('@luffy')) {
        // Skip input checks or cleanup — send entire message as-is to Gemini
        const aiResponse = await askGemini(text);  // full message including @echo
        await client.sendText(message.from, aiResponse);
        console.log(aiResponse);
      }
    
    } catch (err) {
      console.error("Error when sending AI response:", err);
    }
    
  });
  
}
