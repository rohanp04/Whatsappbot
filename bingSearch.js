const puppeteer = require('puppeteer');

/**
 * Performs a Bing search using Puppeteer and extracts the top answer or summary.
 * @param {string} query - The search query from the user.
 * @returns {Promise<string>} - A relevant result or a fallback message.
 */
async function searchBing(query) {
  const browser = await puppeteer.launch({
    headless: 'true',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Set user agent to reduce bot detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    );

    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

    const answer = await page.evaluate(() => {
      const selectors = [
        'div.b_focusTextLarge',
        'div.b_focusLabel',
        'div.b_lBottom.b_ans',
        'div.b_focusTextMedium',
        'div.b_xlText',
        'li.b_algo p',
        'li.b_algo h2 a',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.innerText.trim()) {
          return el.innerText.trim();
        }
      }

      return null;
    });

    return answer || 'Sorry, I couldn’t find a relevant answer.';
  } catch (error) {
    console.error('🔍 Bing search failed:', error);
    return 'Something went wrong while performing the search.';
  } finally {
    await browser.close();
  }
}

module.exports = { searchBing };
