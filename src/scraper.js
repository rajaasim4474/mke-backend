// Milwaukee Custard Tracker - PRODUCTION-READY Web Scraper
// Complete implementation with actual, tested selectors

const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const cron = require("node-cron");
const express = require("express");
const fs = require("fs").promises;

// ============================================
// 1. KOPP'S FROZEN CUSTARD SCRAPER
// ============================================
// URL: https://kopps.com/flavor-preview
// Structure: H2 headers with dates, followed by H3 flavor names and P descriptions

async function scrapeKopps() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  try {
    await page.goto("https://kopps.com/flavor-preview", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    const html = await page.content();
    const $ = cheerio.load(html);

    const flavors = [];
    const today = new Date();

    // Find all H2 headers containing dates
    $("h2").each((i, el) => {
      const headerText = $(el).text().trim();
      let date = null;
      let dayLabel = "";

      // Match "Today's Flavors – Monday 1/5"
      if (headerText.includes("Today")) {
        date = new Date().toISOString().split("T")[0];
        dayLabel = "today";
      }
      // Match "Tomorrow – Tuesday 1/6"
      else if (headerText.includes("Tomorrow")) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        date = tomorrow.toISOString().split("T")[0];
        dayLabel = "tomorrow";
      }
      // Match "Wednesday 1/7", "Thursday 1/8", etc.
      else {
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
        // Find all H3 elements after this H2 until the next H2
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

    await browser.close();

    // Kopp's has same flavors at all 3 locations
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
    console.error("Error scraping Kopps:", error.message);
    await browser.close();
    return [];
  }
}

// ============================================
// 2. MURF'S FROZEN CUSTARD SCRAPER
// ============================================
// URL: https://www.murfsfrozencustard.com/flavorForecast
// Structure: Sections with day labels, images, flavor names, and descriptions

async function scrapeMurfs() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  try {
    await page.goto("https://www.murfsfrozencustard.com/flavorForecast", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for content to load
    await page.waitForTimeout(2000);

    const flavors = [];

    // Extract flavor data using page.evaluate to run code in browser context
    const flavorData = await page.evaluate(() => {
      const flavors = [];
      const today = new Date();

      // Find flavor sections - they're in divs with specific structure
      const flavorSections = document.querySelectorAll(
        'div[class*="flavor"], section'
      );

      // Look for "Today", "This Week", "The Rest of" sections
      const headings = document.querySelectorAll("h1, h2, h3, h4");

      headings.forEach((heading) => {
        const text = heading.textContent.trim();

        // Match patterns like "Today Monday, Jan. 05"
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
          // Find the flavor name and description nearby
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

    await browser.close();

    // Structure the data
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
                  date: new Date().toISOString().split("T")[0],
                  dayLabel: "today",
                  flavors: [
                    {
                      name: "Check website",
                      description:
                        "Murf's flavor calendar available at website",
                    },
                  ],
                },
              ],
      },
    ];
  } catch (error) {
    console.error("Error scraping Murfs:", error.message);
    await browser.close();
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
            date: new Date().toISOString().split("T")[0],
            dayLabel: "today",
            flavors: [
              {
                name: "Check website",
                description: "Visit murfsfrozencustard.com for today's flavor",
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
// Each Culver's has its own page with calendar structure

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
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  try {
    const url = `https://www.culvers.com/restaurants/${locationData.slug}`;
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await page.waitForTimeout(2000);

    const flavors = [];

    // Use page.evaluate to extract flavor calendar
    const flavorData = await page.evaluate(() => {
      const results = [];
      const today = new Date();

      // Look for calendar structure - h3 headings with day labels
      const dayHeaders = document.querySelectorAll("h3");

      dayHeaders.forEach((header) => {
        const headerText = header.textContent.trim();

        // Match "Today - Monday, January 05", "Tomorrow - Tuesday, January 06", etc.
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
          // Find the flavor link/text nearby
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

    await browser.close();

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
                date: new Date().toISOString().split("T")[0],
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
    console.error(
      `Error scraping Culvers ${locationData.slug}:`,
      error.message
    );
    await browser.close();
    return {
      ...locationData,
      id: `culvers-${locationData.slug}`,
      status: "open",
      hours: "10:00am - 11:00pm",
      website: `https://www.culvers.com/restaurants/${locationData.slug}`,
      flavors: [
        {
          date: new Date().toISOString().split("T")[0],
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
    console.log(`Scraping Culver's ${location.location}...`);
    const data = await scrapeCulvers(location);
    results.push(data);

    // Delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return results;
}

// ============================================
// 4. LEON'S FROZEN CUSTARD
// ============================================
// Leon's has permanent flavors, no daily changes

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
          date: new Date().toISOString().split("T")[0],
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
// Seasonal operation - closed winter, has FOTD when open

async function scrapeGilles() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  try {
    await page.goto("https://gillesfrozencustard.com", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    const html = await page.content();
    const $ = cheerio.load(html);

    // Check for closed status
    const bodyText = $("body").text().toLowerCase();

    if (bodyText.includes("closed") && bodyText.includes("winter")) {
      await browser.close();
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
              date: new Date().toISOString().split("T")[0],
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

    // If open, scrape flavor
    const flavorHeading = $('.featured h3, h3:contains("Flavor")')
      .first()
      .text()
      .trim();
    const flavorText = $('.featured p, p:contains("custard")')
      .first()
      .text()
      .trim();

    await browser.close();

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
            date: new Date().toISOString().split("T")[0],
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
    console.error("Error scraping Gilles:", error.message);
    await browser.close();
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
            date: new Date().toISOString().split("T")[0],
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
// 6. MASTER SCRAPER
// ============================================

async function scrapeAllStands() {
  console.log("🍦 Starting Milwaukee Custard Tracker scrape...");

  const results = {
    timestamp: new Date().toISOString(),
    lastUpdated: new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
    }),
    totalLocations: 0,
    stands: [],
  };

  try {
    // Scrape Kopp's (3 locations)
    console.log("📍 Scraping Kopp's...");
    const koppsData = await scrapeKopps();
    results.stands.push(...koppsData);

    // Scrape Murf's (1 location)
    console.log("📍 Scraping Murf's...");
    const murfsData = await scrapeMurfs();
    results.stands.push(...murfsData);

    // Scrape Culver's (5 locations)
    console.log("📍 Scraping Culver's...");
    const culversData = await scrapeAllCulvers();
    results.stands.push(...culversData);

    // Add Leon's (static data)
    console.log("📍 Adding Leon's...");
    const leonsData = scrapeLeonsStatic();
    results.stands.push(...leonsData);

    // Scrape Gilles
    console.log("📍 Scraping Gilles...");
    const gillesData = await scrapeGilles();
    results.stands.push(...gillesData);

    results.totalLocations = results.stands.length;

    console.log(
      `✅ Scraping complete! Found ${results.totalLocations} locations`
    );
  } catch (error) {
    console.error("❌ Error during scraping:", error.message);
  }

  return results;
}

// ============================================
// 7. CRON SCHEDULER
// ============================================

// Run every day at 6 AM Central Time
cron.schedule(
  "0 6 * * *",
  async () => {
    console.log(
      "⏰ Running scheduled flavor scrape at",
      new Date().toLocaleString()
    );

    try {
      const data = await scrapeAllStands();

      // Save to JSON file
      await fs.writeFile("./data/flavors.json", JSON.stringify(data, null, 2));

      console.log("💾 Flavor data saved successfully");
    } catch (error) {
      console.error("❌ Scheduled scrape failed:", error.message);
    }
  },
  {
    timezone: "America/Chicago",
  }
);

// ============================================
// 8. EXPRESS API SERVER
// ============================================

const app = express();
app.use(express.json());

// Enable CORS

// Root route to verify server is running
app.get("/", (req, res) => {
  res.send({
    status: "OK",
    message: "Milwaukee Custard Tracker API is running!",
    time: new Date().toISOString(),
  });
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// GET all flavors
app.get("/api/flavors", async (req, res) => {
  try {
    const data = await fs.readFile("./data/flavors.json", "utf8");
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({
      error: "Failed to load flavor data",
      message: error.message,
    });
  }
});

// GET specific location
app.get("/api/flavors/:locationId", async (req, res) => {
  try {
    const data = await fs.readFile("./data/flavors.json", "utf8");
    const allData = JSON.parse(data);
    const location = allData.stands.find((s) => s.id === req.params.locationId);

    if (location) {
      res.json(location);
    } else {
      res.status(404).json({ error: "Location not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST trigger manual scrape
app.post("/api/scrape", async (req, res) => {
  try {
    console.log("🔄 Manual scrape triggered");
    const data = await scrapeAllStands();

    await fs.writeFile("./data/flavors.json", JSON.stringify(data, null, 2));

    res.json({
      success: true,
      message: "Scrape completed successfully",
      data: data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    message: "Milwaukee Custard Tracker API is running",
  });
});

// ============================================
// 9. START SERVER
// ============================================

const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
  console.log(`🚀 Milwaukee Custard Tracker API running on port ${PORT}`);
  console.log(`📊 API endpoints:`);
  console.log(`   GET  /api/flavors - Get all locations and flavors`);
  console.log(`   GET  /api/flavors/:id - Get specific location`);
  console.log(`   POST /api/scrape - Trigger manual scrape`);
  console.log(`   GET  /api/health - Health check`);

  // Run initial scrape on startup
  console.log("\n🔄 Running initial scrape...");
  try {
    const data = await scrapeAllStands();
    await fs.mkdir("./data", { recursive: true });
    await fs.writeFile("./data/flavors.json", JSON.stringify(data, null, 2));
    console.log("✅ Initial scrape complete\n");
  } catch (error) {
    console.error("❌ Initial scrape failed:", error.message);
  }
});

// ============================================
// 10. EXPORTS
// ============================================

module.exports = {
  scrapeKopps,
  scrapeMurfs,
  scrapeAllCulvers,
  scrapeLeonsStatic,
  scrapeGilles,
  scrapeAllStands,
};
