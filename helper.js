const { askGemini } = require('./gemini'); 
const venom = require('venom-bot');
const express = require('express');
const cors = require('cors');
const path = require('path');

// pollHelper.js
async function createPollFromMessage(client, message) {
    const chatId = message.chatId;
    const msgBody = message.body;
  
    // Expecting message to be like: poll: { name: '...', options: [...], ... }
    const pollJsonMatch = msgBody.match(/^poll\s*:\s*(\{[\s\S]*\})$/i);
    if (!pollJsonMatch) {
      await client.sendText(chatId, "❌ Invalid poll format received from AI.");
      return;
    }
  
    try {
      // Convert single quotes to double quotes to parse as JSON
      const rawPollText = pollJsonMatch[1]
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // keys
        .replace(/'/g, '"'); // string values
  
      const poll = JSON.parse(rawPollText);
  
      // Basic validation
      if (!poll.name || !Array.isArray(poll.options) || poll.options.length < 2) {
        await client.sendText(chatId, "⚠️ Poll must have a question and at least 2 options.");
        return;
      }
  
      const result = await client.sendPollCreation(chatId, poll);
      // console.log("📊 Poll created:", result);
    } catch (err) {
      console.error("❌ Failed to parse/send poll:", err);
      await client.sendText(chatId, "❌ Failed to create poll due to format error.");
    }
  }
  
  module.exports = { createPollFromMessage };
  
  