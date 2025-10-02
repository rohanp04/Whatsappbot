const puppeteer = require("puppeteer");

/**
 * Sleep helper (works everywhere)
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bing Search with Puppeteer
 * @param {string} query - Search query
 * @returns {Promise<string>} - Best available search result
 */
async function searchBing(query) {
  let browser;

  try {
    console.log(`🔎 Searching Bing for: "${query}"`);

    browser = await puppeteer.launch({
      headless: true, // use true if "new" not supported
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      timeout: 20000,
    });

    const page = await browser.newPage();

    // Random realistic user agent
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
      "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/120.0",
    ];
    await page.setUserAgent(
      userAgents[Math.floor(Math.random() * userAgents.length)]
    );

    await page.setViewport({ width: 1366, height: 768 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(
      query
    )}`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // use universal sleep
    await sleep(2000 + Math.floor(Math.random() * 1000));

    const result = await page.evaluate(() => {
      const selectors = [
        "li.b_algo .b_caption p", // snippet
        "li.b_algo h2 a", // title
        ".b_focusTextMedium", // instant answers
        ".b_focusLabel", // fact boxes
      ];

      let results = [];

      for (const selector of selectors) {
        const els = document.querySelectorAll(selector);
        for (const el of els) {
          let text = el.innerText?.trim();
          if (!text) continue;

          text = text.replace(/\s+/g, " ");
          if (text.length < 15 || text.length > 800) continue;

          results.push({
            text,
            priority: selectors.indexOf(selector),
          });
        }
      }

      if (results.length > 0) {
        results.sort((a, b) => a.priority - b.priority);
        return results[0].text;
      }

      return null;
    });

    if (result && result.length > 20) {
      console.log(`✅ Bing result: ${result.substring(0, 100)}...`);
      return result;
    }

    console.log("⚠️ Bing returned no quality results");
    return `Bing search completed but no clear result found for "${query}".`;
  } catch (error) {
    console.error("❌ Bing search failed:", error.message);
    return `Bing search failed for "${query}". Please try again later.`;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        console.error("⚠️ Error closing browser:", err);
      }
    }
  }
}

module.exports = { searchBing };
