/**
 * web-search.js - Module for searching the web and returning results
 * 
 * This module provides functions to search the web using various sources
 * and return formatted results without Gemini AI processing.
 */

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Search the web using multiple sources
 * @param {string} query - The search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} - Search results object
 */
async function search(query, options = {}) {
  try {
    const maxResults = options.maxResults || 5;
    const includeContent = options.includeContent || false;
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
    
    // If we need to include content, fetch detailed content
    let resultsWithContent = results.slice(0, maxResults);
    
    if (includeContent && resultsWithContent.length > 0) {
      const contentPromises = resultsWithContent.map(async (result) => {
        try {
          const content = await getPageContent(result.url);
          return {
            ...result,
            content
          };
        } catch (error) {
          console.error(`Error fetching content for URL ${result.url}:`, error.message);
          return {
            ...result,
            content: ''
          };
        }
      });
      
      resultsWithContent = await Promise.all(contentPromises);
    }
    
    return {
      status: 'success',
      query,
      results: resultsWithContent
    };
  } catch (error) {
    console.error('Error searching the web:', error.message);
    return {
      status: 'error',
      query,
      results: [],
      error: error.message
    };
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
 * Get detailed information from a specific URL
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
    
    return content.substring(0, 3000); // Limit to 3000 chars
  } catch (error) {
    console.error(`Error fetching content from ${url}:`, error.message);
    return '';
  }
}

/**
 * Format search results as a string
 * @param {Array} results - Search results array
 * @param {Object} options - Formatting options
 * @returns {string} - Formatted results string
 */
function formatResults(results, options = {}) {
  const { maxResults = 10, query = '' } = options;
  
  if (!results || results.length === 0) {
    return `No results found for: "${query}"`;
  }
  
  let output = `🔍 Search Results for "${query}"\n\n`;
  
  results.slice(0, maxResults).forEach((result, index) => {
    output += `${index + 1}. ${result.title}\n`;
    output += `   ${result.snippet}\n`;
    output += `   Source: ${result.url}\n\n`;
  });
  
  return output;
}

// For time-sensitive queries
function getFormattedDate() {
  const today = new Date();
  return {
    short: today.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric' 
    }),
    full: today.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  };
}

module.exports = {
  search,
  formatResults,
  getPageContent,
  getFormattedDate
};