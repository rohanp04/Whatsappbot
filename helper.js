const { createPollWithGemini } = require('./gemini');
const { Poll } = require('whatsapp-web.js'); // ✅ Import Poll class

// pollHelper.js for whatsapp-web.js - Creates actual WhatsApp poll
async function createPollFromMessage(client, message) {
    const chatId = message.from;
    const msgBody = message.body;

    try {
        console.log("📝 Creating poll from message:", msgBody);

        // Get poll response from Gemini
        const pollResponse = await createPollWithGemini(msgBody);
        console.log("🤖 Gemini response:", pollResponse);

        // Extract name
        const nameMatch = pollResponse.match(/name:\s*["']([^"']+)["']/);
        if (!nameMatch) {
            console.log("❌ Poll name not found in response");
            await client.sendMessage(chatId, "❌ Sorry bhai, poll question nahi mil raha");
            return;
        }
        const pollName = nameMatch[1];

        // Extract options array
        const optionsMatch = pollResponse.match(/options:\s*\[([^\]]+)\]/);
        if (!optionsMatch) {
            console.log("❌ Poll options not found in response");
            await client.sendMessage(chatId, "❌ Poll options nahi mil rahe bhai");
            return;
        }

        const optionsStr = optionsMatch[1];
        const pollOptions = optionsStr
            .split(/",\s*"/)
            .map(opt => opt.replace(/^["']|["']$/g, '').trim())
            .filter(opt => opt.length > 0);

        // Validate
        if (pollOptions.length < 2) {
            console.log("❌ Not enough poll options");
            await client.sendMessage(chatId, "⚠️ Poll me kam se kam 2 options chahiye bhai");
            return;
        }

        // Ensure maximum 12 options (WhatsApp limit)
        if (pollOptions.length > 12) {
            pollOptions.length = 12;
        }

        console.log("📊 Final poll data:", { name: pollName, options: pollOptions });

        // ✅ Create a real WhatsApp poll
        const poll = new Poll(pollName, pollOptions);

        const sentMsg = await client.sendMessage(chatId, poll);
        console.log("✅ Real WhatsApp poll sent:", sentMsg.id._serialized);

    } catch (err) {
        console.error("❌ Complete poll creation failure:", err);
        await client.sendMessage(chatId, "❌ Poll create karne me problem hai bhai, please try again! 😅");
    }
}

module.exports = {
    createPollFromMessage
};
