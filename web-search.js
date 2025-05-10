// ai-web-search.js - Search the web and use Gemini AI to format accurate answers
const axios = require('axios');
const readline = require('readline');
const cheerio = require('cheerio');

// Set your Google Gemini API Key here
// Get one from: https://aistudio.google.com/app/apikey
const GEMINI_API_KEY = 'AIzaSyA3KHon93R-v9EY9pTjzmhbZDH8ly2bU9E';

// Create readline interface for terminal input/output
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Function to search the web using multiple sources
 * @param {string} query - The search query
 * @returns {Promise<Array>} - Combined search results
 */
async function searchWeb(query) {
  try {
    const results = [];
    
    // Get results from DuckDuckGo
    const duckDuckGoResults = await searchDuckDuckGo(query);
    if (duckDuckGoResults && duckDuckGoResults.length > 0) {
      results.push(...duckDuckGoResults);
    }
    
    // Optionally add more search sources here
    // const bingResults = await searchBing(query);
    // if (bingResults && bingResults.length > 0) {
    //   results.push(...bingResults);
    // }
    
    return results;
  } catch (error) {
    console.error('Error searching the web:', error.message);
    return [];
  }
}

/** 
 * Search DuckDuckGo
 * @param {string} query - The search query
 * @returns {Promise<Array>} - Search results
 */
async function searchDuckDuckGo(query) {
  try {
    // Add specific search terms for time-sensitive queries
    const today = new Date();
    const dateString = today.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
    
    // If query contains "today", make sure we're emphasizing the date
    let enhancedQuery = query;
    if (query.toLowerCase().includes('today')) {
      enhancedQuery = query.replace(/today/i, dateString);
      enhancedQuery += ` "${dateString}"`;  // Add exact date as a quoted phrase for better results
    }
    
    const encodedQuery = encodeURIComponent(enhancedQuery);
    const response = await axios.get(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    const results = [];
    
    $('.result').each((i, element) => {
      const titleElement = $(element).find('.result__title a');
      const title = titleElement.text().trim();
      const url = titleElement.attr('href');
      const snippet = $(element).find('.result__snippet').text().trim();
      
      if (title && url && snippet) {
        results.push({
          title,
          url,
          snippet,
          source: 'DuckDuckGo'
        });
      }
    });
    
    return results;
  } catch (error) {
    console.error('Error searching DuckDuckGo:', error.message);
    return [];
  }
}

/**
 * Function to get more detailed information from a specific URL
 * @param {string} url - The URL to scrape
 * @returns {Promise<string>} - The extracted content
 */
async function getPageContent(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000 // 10 second timeout
    });
    
    const $ = cheerio.load(response.data);
    
    // Remove script tags, style tags, and other non-content elements
    $('script, style, nav, header, footer, iframe, [class*="ad"], [id*="ad"], .header, .footer, .menu, .nav, .sidebar').remove();
    
    // Look for the main content
    let content = '';
    
    // Try to find the most likely content container
    const contentSelectors = [
      'main', 'article', '.content', '#content', '.post', '.article', '.post-content',
      '[role="main"]', '.main-content', '#main-content', '.entry-content', '.page-content'
    ];
    
    for (const selector of contentSelectors) {
      const el = $(selector).first();
      if (el.length > 0) {
        content = el.text().trim();
        if (content.length > 100) {
          break;
        }
      }
    }
    
    // If we couldn't find a good content container, try the body
    if (!content || content.length < 100) {
      content = $('body').text().trim();
    }
    
    // Clean up the text
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
    
    return content.substring(0, 3000); // Limit to 3000 chars to avoid overloading Gemini
  } catch (error) {
    console.error(`Error fetching content from ${url}:`, error.message);
    return '';
  }
}

/**
 * Get content from top search results
 * @param {Array} searchResults - Search results
 * @param {Number} maxResults - Max number of results to process
 * @returns {Promise<Array>} - Array of result contents
 */
async function getTopResultsContent(searchResults, maxResults =10) {
  const topResults = searchResults.slice(0, maxResults);
  const contentPromises = topResults.map(async (result) => {
    const content = await getPageContent(result.url);
    return {
      title: result.title,
      url: result.url,
      content: content
    };
  });
  
  return Promise.all(contentPromises);

}

/**
 * Use Gemini API to generate an accurate answer
 * @param {string} query - The original query
 * @param {Array} resultContents - Content from top search results
 * @returns {Promise<string>} - The AI-generated answer
 */
async function generateAnswer(query, resultContents) {
  // Check if this is a time-sensitive query (like "today")
  const isTimeSensitive = query.toLowerCase().includes('today') || 
                          query.toLowerCase().includes('happening now') ||
                          query.toLowerCase().includes('current') ||
                          query.toLowerCase().match(/what'?s\s+(on|happening)/i);
  
  const today = new Date();
  const formatDate = today.toLocaleDateString('en-US', { 
    weekday: 'long',
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }); // e.g., "Saturday, May 10, 2025"
  try {
    // Build prompt for Gemini
    let prompt = `Question: ${query}\n\n`;
    
    if (isTimeSensitive) {
      prompt += `Note: This is a time-sensitive query about today (${formatDate}). Ensure the information is specific to this date.\n\n`;
    }
    
    prompt += "I've gathered information from multiple web sources. Please provide a comprehensive, accurate answer based on the following information:\n\n";
    
    resultContents.forEach((result, index) => {
      prompt += `Source ${index + 1}: ${result.title}\nURL: ${result.url}\n\n`;
      prompt += `${result.content.substring(0, 1000)}...\n\n`;
    });
    
    prompt += "Please synthesize this information to provide a clear, accurate, and well-structured answer to the question. Include relevant facts and details. Format the answer nicely with proper headings, lists, and paragraphs where appropriate. Cite sources when possible.";
    
    if (isTimeSensitive) {
      prompt += "\n\nVery important: If the information seems outdated or doesn't specifically mention today's date, please note this in your answer. Start your response with 'As of today, " + formatDate + "' and then provide the most current information available from the sources."
    }
    
    // Call Gemini API
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      }
    );
    
    // Extract and return the generated answer
    if (response.data && 
        response.data.candidates && 
        response.data.candidates[0] && 
        response.data.candidates[0].content && 
        response.data.candidates[0].content.parts && 
        response.data.candidates[0].content.parts[0]) {
      return response.data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("Unexpected API response structure");
    }
  } catch (error) {
    console.error('Error generating answer with Gemini:', error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
    return "I couldn't generate an AI answer due to an error. Here's the information I found:\n\n" + 
           resultContents.map(r => `${r.title}\n${r.url}\n${r.content.substring(0, 200)}...\n`).join('\n');
  }
}

/**
 * Format search results for display
 * @param {Array} results - The search results
 * @returns {string} - Formatted results string
 */
function formatSearchResults(results) {
  if (!results || results.length === 0) {
    return "No results found.";
  }
  
  let output = "Top search results:\n\n";
  
  results.slice(0, 5).forEach((result, index) => {
    output += `${index + 1}. ${result.title}\n`;
    output += `   ${result.snippet}\n`;
    output += `   Source: ${result.url}\n\n`;
  });
  
  return output;
}

/**
 * Main function to run the search tool
 */
async function main() {
  console.log("🔍 AI-Enhanced Web Search Terminal");
  console.log("==================================");
  console.log("Type your question or 'exit' to quit");
  console.log("TIP: For time-sensitive queries, I'll automatically add today's date (May 10, 2025)");
  
  let lastResults = null;
  
  const askQuestion = async () => {
    rl.question('\n❓ What would you like to know? ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('👋 Goodbye!');
        rl.close();
        return;
      }
      
      // Check if the query is about something happening "today"
      let searchQuery = input;
      if (input.toLowerCase().includes('today') || 
          input.toLowerCase().includes('happening now') ||
          input.toLowerCase().includes('current') ||
          input.toLowerCase().match(/what'?s\s+(on|happening)/i)) {
        
        // Get today's date in different formats
        const today = new Date();
        const dateString = today.toDateString(); // e.g., "Sat May 10 2025"
        const formatDate = today.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }); // e.g., "May 10, 2025"
        
        // Add the date to the query
        searchQuery = input.replace(/today|happening now|current/i, formatDate);
        if (searchQuery === input) { // If no replacement was made, add the date
          searchQuery = `${input} on ${formatDate}`;
        }
        
        console.log(`\n🕒 I'll search for information about "${input}" for today (${formatDate})`);
      }
      
      console.log(`\n🔎 Searching for: "${searchQuery}"`);
      console.log('🕒 Please wait...');
      
      // 1. Search the web
      const searchResults = await searchWeb(searchQuery);
      lastResults = searchResults;
      
      if (!searchResults || searchResults.length === 0) {
        console.log("❌ No search results found.");
        askQuestion();
        return;
      }
      
      // 2. Fetch detailed content from top results
      console.log('📄 Gathering detailed information...');
      const topResultsContent = await getTopResultsContent(searchResults, 3);
      
      // 3. Generate answer with Gemini
      console.log('🧠 Analyzing content and generating answer...');
      const aiAnswer = await generateAnswer(input, topResultsContent);
      
      // 4. Display the answer
      console.log('\n=========== AI-ENHANCED ANSWER ===========');
      console.log(aiAnswer);
      console.log('==========================================');
      
      // 5. Also show the original search results
      console.log('\n');
      console.log(formatSearchResults(searchResults));
      
      askQuestion(); // Ask another question
    });
  };
  
  await askQuestion();
}

// Create package.json
console.log("Creating package.json...");
const fs = require('fs');
const packageJson = {
  "name": "ai-web-search",
  "version": "1.0.0",
  "description": "AI-enhanced web search tool using Gemini AI",
  "main": "ai-web-search.js",
  "dependencies": {
    "axios": "^1.6.2",
    "cheerio": "^1.0.0-rc.12"
  },
  "scripts": {
    "start": "node ai-web-search.js"
  }
};

fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
console.log("package.json created successfully.");

// Start the application
console.log("Starting application...");
main().catch(error => {
  console.error('An error occurred:', error);
  rl.close();
});