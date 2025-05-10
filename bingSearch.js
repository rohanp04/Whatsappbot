// const axios = require('axios');
// const cheerio = require('cheerio');

// /**
//  * Enhanced search function that gets real-time information from DuckDuckGo
//  * @param {string} query - The search query from the user
//  * @returns {Promise<string>} - The most relevant and accurate search result
//  */
// async function searchDuckDuckGo(query) {
//   try {
//     console.log(`Starting search for: "${query}"`);
    
//     // Check if this is a time-sensitive query (like "today")
//     const isTimeSensitive = query.toLowerCase().includes('today') || 
//                             query.toLowerCase().includes('happening now') ||
//                             query.toLowerCase().includes('current') ||
//                             query.toLowerCase().match(/what'?s\s+(on|happening)/i);
    
//     // Add specific search terms for time-sensitive queries
//     const today = new Date();
//     const dateString = today.toLocaleDateString('en-US', { 
//       month: 'long', 
//       day: 'numeric',
//       year: 'numeric'
//     });
    
//     // If query contains time indicators, enhance with today's date
//     let enhancedQuery = query;
//     if (isTimeSensitive) {
//       enhancedQuery = query.replace(/today|happening now|current/i, dateString);
//       if (enhancedQuery === query) { // If no replacement was made, add the date
//         enhancedQuery = `${query} on ${dateString}`;
//       }
//       enhancedQuery += ` "${dateString}"`;  // Add exact date as a quoted phrase for better results
//       console.log(`Enhanced time-sensitive query: "${enhancedQuery}"`);
//     }
    
//     const encodedQuery = encodeURIComponent(enhancedQuery);
//     const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
    
//     // Make the request with robust headers
//     const response = await axios.get(searchUrl, {
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
//         'Accept-Language': 'en-US,en;q=0.9',
//         'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
//         'Cache-Control': 'no-cache',
//         'Pragma': 'no-cache'
//       },
//       timeout: 30000 // 30 second timeout
//     });
    
//     // Parse the HTML
//     const $ = cheerio.load(response.data);
    
//     // Extract search results
//     const searchResults = {
//       infoBox: null,
//       featuredSnippet: null,
//       regularResults: [],
//       timeIndicators: [],
//       sources: []
//     };
    
//     // Check for DuckDuckGo infobox
//     const infoBox = $('.result--spotlight, .result--more, .module--about');
//     if (infoBox.length > 0) {
//       searchResults.infoBox = infoBox.text().trim().replace(/\s+/g, ' ');
//     }
    
//     // Extract regular results
//     $('.result').each((i, element) => {
//       const titleElement = $(element).find('.result__title a');
//       const title = titleElement.text().trim();
//       const url = titleElement.attr('href');
//       const snippet = $(element).find('.result__snippet').text().trim();
      
//       if (title && snippet) {
//         const resultObj = {
//           title,
//           snippet,
//           url: url || '#'
//         };
        
//         searchResults.regularResults.push(resultObj);
        
//         // Extract domain if URL exists
//         if (url) {
//           try {
//             let domain;
//             if (url.startsWith('http')) {
//               domain = new URL(url).hostname;
//             } else if (url.startsWith('//')) {
//               domain = new URL(`https:${url}`).hostname;
//             } else {
//               domain = url.split('/')[0];
//             }
//             searchResults.sources.push(domain);
//           } catch (e) {
//             searchResults.sources.push(url);
//           }
//         }
//       }
//     });
    
//     console.log(`Found ${searchResults.regularResults.length} results`);
//     console.log(`InfoBox: ${searchResults.infoBox ? 'Yes' : 'No'}`);
    
//     // Look for time indicators throughout the page
//     const bodyText = $('body').text();
//     const timeRegex = /\b(\d+)\s+(second|minute|hour|day)s?\s+ago\b|\btoday\b|\byesterday\b|\blast\s+updated\b|\bjust\s+now\b|\brecently\b/gi;
//     const dateRegex = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b/gi;
    
//     const timeMatches = bodyText.match(timeRegex) || [];
//     const dateMatches = bodyText.match(dateRegex) || [];
    
//     searchResults.timeIndicators.push(...timeMatches, ...dateMatches);
    
//     // Check if results are empty or insufficient
//     if (searchResults.regularResults.length === 0 && !searchResults.infoBox) {
//       // Try again with slightly modified query
//       console.log("No good results, trying with modified query");
      
//       // Add "about" or remove quotes to improve results
//       let modifiedQuery = enhancedQuery;
//       if (query.includes('"')) {
//         modifiedQuery = enhancedQuery.replace(/"/g, '');
//       } else {
//         modifiedQuery = "about " + enhancedQuery;
//       }
      
//       const modifiedEncodedQuery = encodeURIComponent(modifiedQuery);
//       const modifiedSearchUrl = `https://html.duckduckgo.com/html/?q=${modifiedEncodedQuery}`;
      
//       // Make another request
//       const modifiedResponse = await axios.get(modifiedSearchUrl, {
//         headers: {
//           'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
//           'Accept-Language': 'en-US,en;q=0.9',
//           'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
//           'Cache-Control': 'no-cache',
//           'Pragma': 'no-cache'
//         },
//         timeout: 30000
//       });
      
//       // Parse the modified results
//       const $modified = cheerio.load(modifiedResponse.data);
      
//       // Check for infobox in modified results
//       const modifiedInfoBox = $modified('.result--spotlight, .result--more, .module--about');
//       if (modifiedInfoBox.length > 0 && !searchResults.infoBox) {
//         searchResults.infoBox = modifiedInfoBox.text().trim().replace(/\s+/g, ' ');
//       }
      
//       // Extract regular results from modified search
//       $modified('.result').each((i, element) => {
//         const titleElement = $modified(element).find('.result__title a');
//         const title = titleElement.text().trim();
//         const url = titleElement.attr('href');
//         const snippet = $modified(element).find('.result__snippet').text().trim();
        
//         if (title && snippet) {
//           const resultObj = {
//             title,
//             snippet,
//             url: url || '#'
//           };
          
//           searchResults.regularResults.push(resultObj);
          
//           // Extract domain if URL exists
//           if (url) {
//             try {
//               let domain;
//               if (url.startsWith('http')) {
//                 domain = new URL(url).hostname;
//               } else if (url.startsWith('//')) {
//                 domain = new URL(`https:${url}`).hostname;
//               } else {
//                 domain = url.split('/')[0];
//               }
//               searchResults.sources.push(domain);
//             } catch (e) {
//               searchResults.sources.push(url);
//             }
//           }
//         }
//       });
      
//       // Look for additional time indicators
//       const modifiedBodyText = $modified('body').text();
//       const modifiedTimeMatches = modifiedBodyText.match(timeRegex) || [];
//       const modifiedDateMatches = modifiedBodyText.match(dateRegex) || [];
      
//       searchResults.timeIndicators.push(...modifiedTimeMatches, ...modifiedDateMatches);
//     }
    
//     // For top results, fetch more detailed content
//     if (searchResults.regularResults.length > 0) {
//       // Try to fetch more content from the top result for better context
//       try {
//         const topResult = searchResults.regularResults[0];
//         if (topResult.url && topResult.url !== '#') {
//           const pageContent = await getPageContent(topResult.url);
//           if (pageContent && pageContent.length > topResult.snippet.length) {
//             // Update the snippet with richer content (but keep it reasonably sized)
//             const enhancedSnippet = pageContent.substring(0, 500) + '...';
//             searchResults.regularResults[0].snippet = enhancedSnippet;
//           }
//         }
//       } catch (fetchError) {
//         console.error('Error fetching additional content:', fetchError.message);
//         // Continue with existing snippet if fetch fails
//       }
//     }
    
//     // Process the results to create the best possible answer
//     return constructAnswer(query, searchResults);
    
//   } catch (error) {
//     console.error('🔍 Search operation failed:', error);
//     return `I encountered an error while searching: ${error.message}. Please try again or rephrase your query.`;
//   }
// }

// /**
//  * Function to get more detailed information from a specific URL
//  * @param {string} url - The URL to scrape
//  * @returns {Promise<string>} - The extracted content
//  */
// async function getPageContent(url) {
//   try {
//     const response = await axios.get(url, {
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
//       },
//       timeout: 10000 // 10 second timeout
//     });
    
//     const $ = cheerio.load(response.data);
    
//     // Remove script tags, style tags, and other non-content elements
//     $('script, style, nav, header, footer, iframe, [class*="ad"], [id*="ad"], .header, .footer, .menu, .nav, .sidebar').remove();
    
//     // Look for the main content
//     let content = '';
    
//     // Try to find the most likely content container
//     const contentSelectors = [
//       'main', 'article', '.content', '#content', '.post', '.article', '.post-content',
//       '[role="main"]', '.main-content', '#main-content', '.entry-content', '.page-content'
//     ];
    
//     for (const selector of contentSelectors) {
//       const el = $(selector).first();
//       if (el.length > 0) {
//         content = el.text().trim();
//         if (content.length > 100) {
//           break;
//         }
//       }
//     }
    
//     // If we couldn't find a good content container, try the body
//     if (!content || content.length < 100) {
//       content = $('body').text().trim();
//     }
    
//     // Clean up the text
//     content = content
//       .replace(/\s+/g, ' ')
//       .replace(/\n+/g, '\n')
//       .trim();
    
//     return content.substring(0, 3000); // Limit to 3000 chars
//   } catch (error) {
//     console.error(`Error fetching content from ${url}:`, error.message);
//     return '';
//   }
// }

// /**
//  * Constructs the best possible answer from search results
//  * @param {string} query - Original search query
//  * @param {Object} results - Search results object
//  * @returns {string} - Formatted answer
//  */
// function constructAnswer(query, results) {
//   // Check if we have any results at all
//   if (!results.infoBox && 
//       results.regularResults.length === 0) {
//     return "I couldn't find any relevant information for your query. Please try rephrasing or ask something else.";
//   }
  
//   const queryLower = query.toLowerCase();
//   let answer = '';
  
//   // Determine if query is about current events or time-sensitive information
//   const timeRelatedTerms = ['current', 'latest', 'today', 'now', 'recent', 'update', 
//                           'live', 'happening', 'news', 'when', 'schedule'];
//   const isTimeRelatedQuery = timeRelatedTerms.some(term => queryLower.includes(term));
  
//   // Analyze time indicators to determine how fresh the information is
//   const hasRecentTimeIndicators = results.timeIndicators.some(indicator => {
//     const indicatorLower = indicator.toLowerCase();
//     return indicatorLower.includes('minute ago') || 
//            indicatorLower.includes('hour ago') ||
//            indicatorLower.includes('today') ||
//            indicatorLower.includes('just now') ||
//            indicatorLower.includes('recently');
//   });
  
//   // Answer construction priority:
//   // 1. Info box for factual queries
//   // 2. Top regular results for most queries
  
//   if (results.infoBox) {
//     // DuckDuckGo info boxes are usually high quality
//     answer = results.infoBox;
//   } else if (results.regularResults.length > 0) {
//     // Begin with the most relevant result
//     const bestResult = results.regularResults[0];
    
//     // Format a good answer from the best result
//     answer = bestResult.title ? `${bestResult.title}\n\n` : '';
//     answer += bestResult.snippet || '';
    
//     // If time-sensitive, add info from additional results
//     if (isTimeRelatedQuery && results.regularResults.length > 1) {
//       // Find results with time indicators
//       const recentResults = results.regularResults.filter((result, index) => {
//         if (index === 0) return false; // Skip the first one as we already used it
//         const resultText = `${result.title} ${result.snippet}`.toLowerCase();
//         return timeRelatedTerms.some(term => resultText.includes(term));
//       });
      
//       if (recentResults.length > 0) {
//         answer += '\n\nAdditional information:';
//         recentResults.slice(0, 2).forEach(result => {
//           answer += `\n• ${result.title || result.snippet}`;
//         });
//       }
//     }
    
//     // Source citation
//     if (bestResult.url && bestResult.url !== '#') {
//       try {
//         let domain = bestResult.url;
//         if (bestResult.url.startsWith('http')) {
//           domain = new URL(bestResult.url).hostname;
//         }
//         answer += `\n\nSource: ${domain}`;
//       } catch {
//         answer += `\n\nSource: ${bestResult.url}`;
//       }
//     }
    
//     // If we have more than one result and they contain potentially contradictory information
//     if (results.regularResults.length > 1) {
//       const contradictions = checkContradictions(
//         results.regularResults.map(r => r.snippet).filter(Boolean)
//       );
      
//       if (contradictions) {
//         answer += "\n\nNote: I found some inconsistent information in the search results. Consider verifying from an official source.";
//       }
//     }
//   }
  
//   // Format the final answer
//   if (answer) {
//     // Add freshness disclaimer for time-sensitive queries with no recent indicators
//     if (isTimeRelatedQuery && !hasRecentTimeIndicators) {
//       answer += "\n\nPlease note that I couldn't find very recent information on this topic.";
//     }
    
//     // Add today's date for time-sensitive queries
//     if (isTimeRelatedQuery) {
//       const today = new Date();
//       const formatDate = today.toLocaleDateString('en-US', { 
//         weekday: 'long',
//         year: 'numeric', 
//         month: 'long', 
//         day: 'numeric' 
//       });
      
//       answer = `As of today, ${formatDate}:\n\n${answer}`;
//     }
    
//     return answer;
//   } else {
//     return "I found some information but couldn't construct a clear answer. Please try rephrasing your question.";
//   }
// }

// /**
//  * Check for contradictory information between snippets
//  * @param {string[]} snippets - Array of text snippets to check
//  * @returns {boolean} - True if contradictions found
//  */
// function checkContradictions(snippets) {
//   // Common contradictory term pairs
//   const contradictoryPairs = [
//     ['yes', 'no'],
//     ['confirmed', 'canceled'],
//     ['cancelled', 'scheduled'],
//     ['postponed', 'ongoing'],
//     ['delayed', 'on time'],
//     ['true', 'false'],
//     ['available', 'unavailable'],
//     ['open', 'closed'],
//     ['active', 'inactive'],
//     ['alive', 'dead'],
//     ['win', 'lose'],
//     ['started', 'ended']
//   ];
  
//   for (const [term1, term2] of contradictoryPairs) {
//     let hasTerm1 = false;
//     let hasTerm2 = false;
    
//     for (const snippet of snippets) {
//       if (!snippet) continue;
      
//       const snippetLower = snippet.toLowerCase();
      
//       if (snippetLower.includes(term1)) {
//         hasTerm1 = true;
//       }
      
//       if (snippetLower.includes(term2)) {
//         hasTerm2 = true;
//       }
      
//       // If both contradictory terms found, return true
//       if (hasTerm1 && hasTerm2) {
//         console.log(`Contradiction found: "${term1}" and "${term2}"`);
//         return true;
//       }
//     }
//   }
  
//   return false;
// }

// /**
//  * Simple test function to demonstrate the search functionality
//  */
// async function testSearch() {
//   const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout
//   });

//   const askQuestion = () => {
//     rl.question('\nEnter your search query (or "exit" to quit): ', async (query) => {
//       if (query.toLowerCase() === 'exit') {
//         console.log('Goodbye!');
//         rl.close();
//         return;
//       }
      
//       console.log('Searching...');
//       const result = await searchDuckDuckGo(query);
//       console.log('\n=========== SEARCH RESULTS ===========');
//       console.log(result);
//       console.log('======================================');
      
//       askQuestion();
//     });
//   };

//   console.log('DuckDuckGo Search Module Test');
//   console.log('Type a query to test the search functionality');
//   askQuestion();
// }

// // Export the search function for use in other modules
// module.exports = { searchDuckDuckGo };

// // Uncomment the next line to test the search functionality directly
// // testSearch();