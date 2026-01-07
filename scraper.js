// Milwaukee Custard Tracker - PRODUCTION RAILWAY DEPLOYMENT
// Optimized for Railway.app with proper error handling and resilience

const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const cron = require("node-cron");
const express = require("express");
const fs = require("fs").promises;
const cors = require("cors");
const path = require("path");

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  PORT: process.env.PORT || 4000,
  NODE_ENV: process.env.NODE_ENV || "production",
  SCRAPE_TIMEOUT: 30000,
  BROWSER_ARGS: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--no-zygote",
    "--disable-gpu",
  ],
  DATA_DIR: process.env.DATA_DIR || "./data",
  SCRAPE_SCHEDULE: "0 6 * * *", // 6 AM daily
  TIMEZONE: "America/Chicago",
};

// ============================================
// LOGGING UTILITY
// ============================================

const logger = {
  info: (msg, ...args) =>
    console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) =>
    console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) =>
    console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => {
    if (CONFIG.NODE_ENV === "development") {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args);
    }
  },
};

// ============================================
// BROWSER INSTANCE MANAGEMENT
// ============================================

let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  try {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: CONFIG.BROWSER_ARGS,
    });
    logger.info("Browser instance created successfully");
    return browserInstance;
  } catch (error) {
    logger.error("Failed to launch browser:", error.message);
    throw error;
  }
}

async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
      browserInstance = null;
      logger.info("Browser instance closed");
    } catch (error) {
      logger.error("Error closing browser:", error.message);
    }
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getStandardDate(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split("T")[0];
}

async function safePageNavigation(page, url, options = {}) {
  const maxRetries = 3;
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: CONFIG.SCRAPE_TIMEOUT,
        ...options,
      });
      return true;
    } catch (error) {
      lastError = error;
      logger.warn(
        `Navigation attempt ${i + 1} failed for ${url}:`,
        error.message
      );
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
  }

  throw lastError;
}

// ============================================
// 1. KOPP'S FROZEN CUSTARD SCRAPER
// ============================================

async function scrapeKopps() {
  let browser, page;

  try {
    browser = await getBrowser();
    page = await browser.newPage();

    await safePageNavigation(page, "https://kopps.com/flavor-preview");

    const html = await page.content();
    const $ = cheerio.load(html);

    const flavors = [];
    const today = new Date();

    $("h2").each((i, el) => {
      const headerText = $(el).text().trim();
      let date = null;
      let dayLabel = "";

      if (headerText.includes("Today")) {
        date = getStandardDate(0);
        dayLabel = "today";
      } else if (headerText.includes("Tomorrow")) {
        date = getStandardDate(1);
        dayLabel = "tomorrow";
      } else {
        const dateMatch = headerText.match(/([A-Za-z]+)\s+(\d+)\/(\d+)/);
        if (dateMatch) {
          const month = parseInt(dateMatch[2]);
          const day = parseInt(dateMatch[3]);
          const year = today.getFullYear();
          date = new Date(year, month - 1, day).toISOString().split("T")[0];
          dayLabel = dateMatch[1].toLowerCase();
        }
      }

      if (date) {
        let currentEl = $(el).next();
        const dayFlavors = [];

        while (currentEl.length && currentEl[0].tagName !== "H2") {
          if (currentEl[0].tagName === "H3") {
            const name = currentEl.text().trim();
            const description = currentEl.next("p").text().trim();

            if (name) {
              dayFlavors.push({
                name: name,
                description: description || "No description available",
              });
            }
          }
          currentEl = currentEl.next();
        }

        flavors.push({
          date: date,
          dayLabel: dayLabel,
          flavors: dayFlavors,
        });
      }
    });

    await page.close();

    logger.info(`Kopp's scraped successfully - ${flavors.length} days found`);

    return [
      {
        id: "kopps-greenfield",
        name: "Kopp's Frozen Custard",
        location: "Greenfield",
        address: "7631 W Layton Ave, Greenfield, WI",
        phone: "414-282-4312",
        status: "open",
        hours: "10:30am - 10:30pm",
        website: "https://kopps.com",
        flavors: flavors,
      },
      {
        id: "kopps-brookfield",
        name: "Kopp's Frozen Custard",
        location: "Brookfield",
        address: "18880 W Bluemound Rd, Brookfield, WI",
        phone: "262-789-9490",
        status: "open",
        hours: "10:30am - 10:30pm",
        website: "https://kopps.com",
        flavors: flavors,
      },
      {
        id: "kopps-glendale",
        name: "Kopp's Frozen Custard",
        location: "Glendale",
        address: "5373 N Port Washington Rd, Glendale, WI",
        phone: "414-961-3288",
        status: "open",
        hours: "10:30am - 10:30pm",
        website: "https://kopps.com",
        flavors: flavors,
      },
    ];
  } catch (error) {
    logger.error("Error scraping Kopps:", error.message);
    if (page) await page.close();
    return [];
  }
}

// ============================================
// 2. MURF'S FROZEN CUSTARD SCRAPER
// ============================================

async function scrapeMurfs() {
  let browser, page;

  try {
    browser = await getBrowser();
    page = await browser.newPage();

    await safePageNavigation(
      page,
      "https://www.murfsfrozencustard.com/flavorForecast"
    );
    await page.waitForTimeout(2000);

    const flavorData = await page.evaluate(() => {
      const flavors = [];
      const headings = document.querySelectorAll("h1, h2, h3, h4");

      headings.forEach((heading) => {
        const text = heading.textContent.trim();

        if (
          text.includes("Today") ||
          text.includes("Mon") ||
          text.includes("Tue") ||
          text.includes("Wed") ||
          text.includes("Thu") ||
          text.includes("Fri") ||
          text.includes("Sat") ||
          text.includes("Sun")
        ) {
          let parent = heading.parentElement;
          while (parent && !parent.querySelector("img")) {
            parent = parent.parentElement;
          }

          if (parent) {
            const flavorName = parent.textContent.match(
              /([A-Z][A-Za-z\s&']+)(?=\n|Vanilla|Chocolate|Cool mint|Caramel)/
            );
            const description = parent.textContent
              .split("\n")
              .filter(
                (line) =>
                  line.includes("frozen custard") || line.includes("custard,")
              )[0];

            if (flavorName) {
              flavors.push({
                date: text,
                name: flavorName[0].trim(),
                description: description ? description.trim() : "",
              });
            }
          }
        }
      });

      return flavors;
    });

    await page.close();

    logger.info(`Murf's scraped - ${flavorData.length} flavors found`);

    return [
      {
        id: "murfs-brookfield",
        name: "Murf's Frozen Custard",
        location: "Brookfield",
        address: "12505 W Burleigh Rd, Brookfield, WI",
        phone: "262-814-6873",
        status: "open",
        hours: "10:30am - 9:00pm (Closed Mondays)",
        website: "https://www.murfsfrozencustard.com",
        flavors:
          flavorData.length > 0
            ? flavorData
            : [
                {
                  date: getStandardDate(0),
                  dayLabel: "today",
                  flavors: [
                    {
                      name: "Check website",
                      description:
                        "Visit murfsfrozencustard.com for today's flavor",
                    },
                  ],
                },
              ],
      },
    ];
  } catch (error) {
    logger.error("Error scraping Murfs:", error.message);
    if (page) await page.close();
    return [
      {
        id: "murfs-brookfield",
        name: "Murf's Frozen Custard",
        location: "Brookfield",
        address: "12505 W Burleigh Rd, Brookfield, WI",
        phone: "262-814-6873",
        status: "open",
        hours: "10:30am - 9:00pm (Closed Mondays)",
        website: "https://www.murfsfrozencustard.com",
        flavors: [
          {
            date: getStandardDate(0),
            dayLabel: "today",
            flavors: [
              {
                name: "Check website",
                description: "Visit website for today's flavor",
              },
            ],
          },
        ],
      },
    ];
  }
}

// ============================================
// 3. CULVER'S LOCATIONS SCRAPER
// ============================================

const CULVERS_LOCATIONS = [
  {
    slug: "west-milwaukee",
    name: "Culver's",
    location: "West Milwaukee - Miller Park Way",
    address: "1641 Miller Parkway, West Milwaukee, WI",
    phone: "414-645-1011",
  },
  {
    slug: "milwaukee-good-hope",
    name: "Culver's",
    location: "Milwaukee - Good Hope Rd",
    address: "7515 W Good Hope Rd, Milwaukee, WI",
    phone: "414-760-0500",
  },
  {
    slug: "milwaukee-fond-du-lac",
    name: "Culver's",
    location: "Milwaukee - Fond du Lac Ave",
    address: "W Fond du Lac Ave, Milwaukee, WI",
    phone: "414-444-1300",
  },
  {
    slug: "milwaukee-capitol",
    name: "Culver's",
    location: "Milwaukee - Capitol Drive",
    address: "1325 E Capitol Dr, Milwaukee, WI",
    phone: "414-962-0900",
  },
  {
    slug: "west-allis",
    name: "Culver's",
    location: "West Allis - Layton Ave",
    address: "575 W Layton Ave, Milwaukee, WI",
    phone: "414-321-8400",
  },
];

async function scrapeCulvers(locationData) {
  let browser, page;

  try {
    browser = await getBrowser();
    page = await browser.newPage();

    const url = `https://www.culvers.com/restaurants/${locationData.slug}`;
    await safePageNavigation(page, url);
    await page.waitForTimeout(2000);

    const flavorData = await page.evaluate(() => {
      const results = [];
      const dayHeaders = document.querySelectorAll("h3");

      dayHeaders.forEach((header) => {
        const headerText = header.textContent.trim();

        if (
          headerText.includes("Today") ||
          headerText.includes("Tomorrow") ||
          headerText.includes("Monday") ||
          headerText.includes("Tuesday") ||
          headerText.includes("Wednesday") ||
          headerText.includes("Thursday") ||
          headerText.includes("Friday") ||
          headerText.includes("Saturday") ||
          headerText.includes("Sunday")
        ) {
          const parent = header.parentElement;
          const flavorLink = parent.querySelector(
            'a[href*="flavor-of-the-day"]'
          );

          if (flavorLink) {
            const flavorName = flavorLink.textContent.trim();
            const dayLabel = headerText.toLowerCase().includes("today")
              ? "today"
              : headerText.toLowerCase().includes("tomorrow")
              ? "tomorrow"
              : "";

            results.push({
              dayLabel: dayLabel,
              date: headerText,
              name: flavorName,
            });
          }
        }
      });

      return results;
    });

    await page.close();

    logger.info(
      `Culver's ${locationData.location} scraped - ${flavorData.length} flavors`
    );

    return {
      ...locationData,
      id: `culvers-${locationData.slug}`,
      status: "open",
      hours: "10:00am - 11:00pm",
      website: url,
      flavors:
        flavorData.length > 0
          ? flavorData
          : [
              {
                date: getStandardDate(0),
                dayLabel: "today",
                flavors: [
                  {
                    name: "Check location",
                    description: "Visit Culver's website for today's flavor",
                  },
                ],
              },
            ],
    };
  } catch (error) {
    logger.error(`Error scraping Culvers ${locationData.slug}:`, error.message);
    if (page) await page.close();
    return {
      ...locationData,
      id: `culvers-${locationData.slug}`,
      status: "open",
      hours: "10:00am - 11:00pm",
      website: `https://www.culvers.com/restaurants/${locationData.slug}`,
      flavors: [
        {
          date: getStandardDate(0),
          dayLabel: "today",
          flavors: [
            {
              name: "Check location",
              description: "Visit location for today's flavor",
            },
          ],
        },
      ],
    };
  }
}

async function scrapeAllCulvers() {
  const results = [];

  for (const location of CULVERS_LOCATIONS) {
    const data = await scrapeCulvers(location);
    results.push(data);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return results;
}

// ============================================
// 4. LEON'S FROZEN CUSTARD (STATIC)
// ============================================

function scrapeLeonsStatic() {
  return [
    {
      id: "leons-milwaukee",
      name: "Leon's Frozen Custard",
      location: "Milwaukee",
      address: "3131 S 27th St, Milwaukee, WI",
      phone: "414-383-1784",
      status: "open",
      hours: "11:00am - 11:00pm",
      website: "https://leonsfrozencustardmke.com",
      flavors: [
        {
          date: getStandardDate(0),
          dayLabel: "always",
          flavors: [
            {
              name: "Vanilla",
              description: "Classic vanilla custard (always available)",
            },
            {
              name: "Chocolate",
              description: "Rich chocolate custard (always available)",
            },
            {
              name: "Butter Pecan",
              description: "Butter pecan custard (always available)",
            },
            {
              name: "Weekend Special",
              description: "Check in-store or Facebook for weekend specials",
            },
          ],
        },
      ],
    },
  ];
}

// ============================================
// 5. GILLES FROZEN CUSTARD
// ============================================

async function scrapeGilles() {
  let browser, page;

  try {
    browser = await getBrowser();
    page = await browser.newPage();

    await safePageNavigation(page, "https://gillesfrozencustard.com");

    const html = await page.content();
    const $ = cheerio.load(html);

    const bodyText = $("body").text().toLowerCase();

    if (bodyText.includes("closed") && bodyText.includes("winter")) {
      await page.close();
      logger.info("Gilles is closed for winter");
      return [
        {
          id: "gilles-milwaukee",
          name: "Gilles Frozen Custard",
          location: "Milwaukee",
          address: "7515 W Bluemound Rd, Milwaukee, WI",
          phone: "414-453-4875",
          status: "closed",
          hours: "Reopens January 8th, 2026",
          website: "https://gillesfrozencustard.com",
          flavors: [
            {
              date: getStandardDate(0),
              dayLabel: "closed",
              flavors: [
                {
                  name: "Closed for Winter",
                  description: "Returning January 8, 2026",
                },
              ],
            },
          ],
        },
      ];
    }

    const flavorHeading = $('.featured h3, h3:contains("Flavor")')
      .first()
      .text()
      .trim();
    const flavorText = $('.featured p, p:contains("custard")')
      .first()
      .text()
      .trim();

    await page.close();

    logger.info("Gilles scraped successfully");

    return [
      {
        id: "gilles-milwaukee",
        name: "Gilles Frozen Custard",
        location: "Milwaukee",
        address: "7515 W Bluemound Rd, Milwaukee, WI",
        phone: "414-453-4875",
        status: "open",
        hours: "11:00am - 9:00pm",
        website: "https://gillesfrozencustard.com",
        flavors: [
          {
            date: getStandardDate(0),
            dayLabel: "today",
            flavors: [
              {
                name: flavorHeading || "Check in-store",
                description:
                  flavorText || "Visit Gilles for today's special flavor",
              },
            ],
          },
        ],
      },
    ];
  } catch (error) {
    logger.error("Error scraping Gilles:", error.message);
    if (page) await page.close();
    return [
      {
        id: "gilles-milwaukee",
        name: "Gilles Frozen Custard",
        location: "Milwaukee",
        address: "7515 W Bluemound Rd, Milwaukee, WI",
        phone: "414-453-4875",
        status: "unknown",
        hours: "Check website",
        website: "https://gillesfrozencustard.com",
        flavors: [
          {
            date: getStandardDate(0),
            dayLabel: "today",
            flavors: [
              {
                name: "Check website",
                description: "Visit website for current status",
              },
            ],
          },
        ],
      },
    ];
  }
}

// ============================================
// 6. MASTER SCRAPER WITH ERROR RESILIENCE
// ============================================

async function scrapeAllStands() {
  logger.info("Starting Milwaukee Custard Tracker scrape");

  const results = {
    timestamp: new Date().toISOString(),
    lastUpdated: new Date().toLocaleString("en-US", {
      timeZone: CONFIG.TIMEZONE,
    }),
    totalLocations: 0,
    stands: [],
    errors: [],
  };

  const scrapers = [
    { name: "Kopp's", fn: scrapeKopps },
    { name: "Murf's", fn: scrapeMurfs },
    { name: "Culver's", fn: scrapeAllCulvers },
    { name: "Leon's", fn: scrapeLeonsStatic },
    { name: "Gilles", fn: scrapeGilles },
  ];

  for (const scraper of scrapers) {
    try {
      logger.info(`Scraping ${scraper.name}...`);
      const data = await scraper.fn();
      results.stands.push(...data);
    } catch (error) {
      logger.error(`Failed to scrape ${scraper.name}:`, error.message);
      results.errors.push({
        scraper: scraper.name,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  results.totalLocations = results.stands.length;

  logger.info(
    `Scraping complete - ${results.totalLocations} locations, ${results.errors.length} errors`
  );

  return results;
}

// ============================================
// 7. FILE SYSTEM OPERATIONS
// ============================================

async function ensureDataDirectory() {
  try {
    await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
    logger.info(`Data directory ensured: ${CONFIG.DATA_DIR}`);
  } catch (error) {
    logger.error("Failed to create data directory:", error.message);
    throw error;
  }
}

async function saveFlavorData(data) {
  try {
    await ensureDataDirectory();
    const filePath = path.join(CONFIG.DATA_DIR, "flavors.json");
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    logger.info(`Flavor data saved to ${filePath}`);
    return true;
  } catch (error) {
    logger.error("Failed to save flavor data:", error.message);
    throw error;
  }
}

async function loadFlavorData() {
  try {
    const filePath = path.join(CONFIG.DATA_DIR, "flavors.json");
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.warn("Flavor data file not found, returning empty dataset");
      return {
        timestamp: new Date().toISOString(),
        lastUpdated: "No data available",
        totalLocations: 0,
        stands: [],
        errors: [],
      };
    }
    throw error;
  }
}

// ============================================
// 8. CRON SCHEDULER
// ============================================

function initCronScheduler() {
  cron.schedule(
    CONFIG.SCRAPE_SCHEDULE,
    async () => {
      logger.info("Running scheduled flavor scrape");

      try {
        const data = await scrapeAllStands();
        await saveFlavorData(data);
        logger.info("Scheduled scrape completed successfully");
      } catch (error) {
        logger.error("Scheduled scrape failed:", error.message);
      }
    },
    {
      timezone: CONFIG.TIMEZONE,
    }
  );

  logger.info(
    `Cron scheduler initialized: ${CONFIG.SCRAPE_SCHEDULE} ${CONFIG.TIMEZONE}`
  );
}

// ============================================
// 9. EXPRESS API SERVER
// ============================================

const app = express();

// Middleware
app.use(express.json());
app.use(cors({ origin: "*" }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Root route
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    service: "Milwaukee Custard Tracker API",
    version: "1.0.0",
    environment: CONFIG.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "GET /api/health",
      allFlavors: "GET /api/flavors",
      locationFlavors: "GET /api/flavors/:locationId",
      triggerScrape: "POST /api/scrape",
    },
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
  });
});

// Get all flavors
app.get("/api/flavors", async (req, res) => {
  try {
    const data = await loadFlavorData();
    res.json(data);
  } catch (error) {
    logger.error("Error loading flavors:", error.message);
    res.status(500).json({
      error: "Failed to load flavor data",
      message: error.message,
    });
  }
});

// Get specific location
app.get("/api/flavors/:locationId", async (req, res) => {
  try {
    const data = await loadFlavorData();
    const location = data.stands.find((s) => s.id === req.params.locationId);

    if (location) {
      res.json(location);
    } else {
      res.status(404).json({
        error: "Location not found",
        locationId: req.params.locationId,
      });
    }
  } catch (error) {
    logger.error("Error loading location:", error.message);
    res.status(500).json({
      error: "Failed to load location data",
      message: error.message,
    });
  }
});

// Manual scrape trigger
app.post("/api/scrape", async (req, res) => {
  try {
    logger.info("Manual scrape triggered via API");
    const data = await scrapeAllStands();
    await saveFlavorData(data);

    res.json({
      success: true,
      message: "Scrape completed successfully",
      timestamp: new Date().toISOString(),
      totalLocations: data.totalLocations,
      errors: data.errors,
    });
  } catch (error) {
    logger.error("Manual scrape failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.path,
    method: req.method,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err.message);
  res.status(500).json({
    error: "Internal server error",
    message:
      CONFIG.NODE_ENV === "development" ? err.message : "An error occurred",
  });
});

// ============================================
// 10. GRACEFUL SHUTDOWN
// ============================================

async function gracefulShutdown(signal) {
  logger.info(`${signal} received, starting graceful shutdown`);

  try {
    await closeBrowser();
    logger.info("Browser closed successfully");
  } catch (error) {
    logger.error("Error during shutdown:", error.message);
  }

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error.message);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection:", reason);
});

// ============================================
// 11. STARTUP SEQUENCE
// ============================================

async function startServer() {
  try {
    logger.info("Starting Milwaukee Custard Tracker API");
    logger.info(`Environment: ${CONFIG.NODE_ENV}`);
    logger.info(`Port: ${CONFIG.PORT}`);

    // Ensure data directory exists
    await ensureDataDirectory();

    // Run initial scrape
    logger.info("Running initial scrape...");
    try {
      const data = await scrapeAllStands();
      await saveFlavorData(data);
      logger.info("Initial scrape completed successfully");
    } catch (error) {
      logger.error("Initial scrape failed:", error.message);
      logger.warn("Server will start with empty/cached data");
    }

    // Initialize cron scheduler
    initCronScheduler();

    // Start Express server
    app.listen(CONFIG.PORT, "0.0.0.0", () => {
      logger.info(`Server running on port ${CONFIG.PORT}`);
      logger.info(`Health check: http://localhost:${CONFIG.PORT}/api/health`);
      logger.info(`API ready: http://localhost:${CONFIG.PORT}/api/flavors`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

// Start the application
startServer();

// ============================================
// 12. EXPORTS FOR TESTING
// ============================================

module.exports = {
  scrapeKopps,
  scrapeMurfs,
  scrapeAllCulvers,
  scrapeLeonsStatic,
  scrapeGilles,
  scrapeAllStands,
  app,
};
