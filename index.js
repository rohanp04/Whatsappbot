const venom = require('venom-bot');
const path = require('path');
const { askGemini } = require('./gemini');

venom
  .create({
    session: 'luffy-bot',
    headless: true,
    browserArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new'],
    executablePath: 'C://Program Files//Google//Chrome//Application//chrome.exe',
  })
  .then((client) => start(client))
  .catch((error) => {
    console.error('Error starting Venom:', error);
  });

async function start(client) {
  console.log('Bot successfully started!');
  
  client.onMessage(async (message) => {
    try {
      // Check if message and message.body exist
      if (!message || !message.body) {
        console.log('Received message with no body');
        return;
      }

      const fullText = message.body;

      // Check if message includes @luffy (case insensitive)
      if (fullText.toLowerCase().includes('@luffy')) {
        console.log(`Received message with tag: ${fullText}`);
        
        // Extract only the query part after "@luffy"
        // This regex looks for "@luffy" (case insensitive) and captures everything after it
        const match = fullText.match(/@luffy\s*(.*)/i);
        
        // If we have a match and there's content after "@luffy"
        if (match && match[1]) {
          const queryText = match[1].trim();
          console.log(`Extracted query: "${queryText}"`);
          
          // Skip if there's nothing after the tag
          if (!queryText) {
            console.log('Empty query after tag, skipping');
            return;
          }
          
          try {
            // Get AI response using only the extracted query
            const aiResponse = await askGemini(queryText);
            
            // Check if we have a valid response
            if (aiResponse) {
              // Send the response back to WhatsApp
              await client.sendText(message.from, aiResponse);
              console.log(`Response sent: ${aiResponse}`);
            } else {
              console.error("No response received from Gemini");
              await client.sendText(message.from, "Sorry, I couldn't think of a response!");
            }
          } catch (aiError) {
            console.error("Error when getting AI response:", aiError);
            await client.sendText(message.from, "Oops! My brain froze. Try again later?");
          }
        } else {
          console.log('Tag found but no query text after it');
          await client.sendText(message.from, "Haan bolo, kya chahiye?");
        }
      }
    } catch (err) {
      console.error("Error processing message:", err);
    }
  });
  
  // Handle reconnection if disconnected
  client.onStateChange((state) => {
    console.log(`Bot state: ${state}`);
    if (state === 'CONFLICT' || state === 'DISCONNECTED') {
      console.log('Attempting to reconnect...');
      client.useHere();
    }
  });
}