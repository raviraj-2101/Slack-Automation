const { default: axios } = require("axios");
const { cronUpdateToken } = require("./configAds.controller");
const { getAccessToken } = require("../helper");
const moment = require("moment");

const MIN_DELAY_REVENUE = 500;
let lastRevenueRequestTime = 0;

const fetchAmazonRevenueData = async (req, res) => {
  try {
    const marketplaceId =
      req?.body?.marketplaceId ||
      process.env.MARKET_PLACE_ID ||
      "ATVPDKIKX0DER";

    console.log("Fetching amazon revenue data started");

    // Step 1. Refresh all tokens first
    await cronUpdateToken();

    // Step 2. Get tokens from each sheet
    const tokenMap = {
      MAGIC_FP: await getAccessToken("MAGIC_FP"),
      LEDISA: await getAccessToken("LEDISA"),
      ANROSE: await getAccessToken("ANROSE"),
      WELLANOVA: await getAccessToken("WELLANOVA"),
    };

    const yesterday = moment().utc().subtract(1, "day");
    const startTime = yesterday.startOf("day").toISOString(); // e.g. 2025-10-29T00:00:00Z
    const endTime = yesterday.endOf("day").toISOString(); // e.g. 2025-10-29T23:59:59Z

    const interval = `${startTime}--${endTime}`;

    const allItems = [];
    // Step 3. Common recursive fetch function
    const fetchRecursive = async (
      accessToken,
      label,
      nextToken = null,
      retries = 3
    ) => {
      try {
        const now = Date.now();
        const timeSinceLastCall = now - lastRevenueRequestTime;
        if (timeSinceLastCall < MIN_DELAY_REVENUE) {
          await new Promise((resolve) =>
            setTimeout(resolve, MIN_DELAY_REVENUE - timeSinceLastCall)
          );
        }

        const response = await axios.get(
          `${process.env.ROOT_LINK_SELLER}/sales/v1/orderMetrics`,
          {
            headers: { "x-amz-access-token": accessToken },
            params: {
              granularity: "Total",
              marketplaceIds: marketplaceId,
              interval,
              ...(nextToken && { nextToken }),
            },
            timeout: 15000,
          }
        );

        if (response.headers["x-amzn-ratelimit-limit"]) {
          lastRevenueRequestTime = Date.now();
        }

        const summaries = response?.data?.payload || [];

        allItems.push(...summaries.map((s) => ({ ...s, source: label })));
      } catch (error) {
        if (
          (error.response?.status === 429 ||
            error.code === "ECONNABORTED" ||
            (error.response?.status && error.response.status >= 500)) &&
          retries > 0
        ) {
          const backoffTime = Math.min(5000, 500 * Math.pow(2, 3 - retries));
          console.warn(`⏳ ${label}: retrying in ${backoffTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
          await fetchRecursive(accessToken, label, nextToken, retries - 1);
        } else {
          console.error(`❌ ${label}: failed to fetch revenue:`, error.message);
          if (error.response) console.error(error.response.data);
        }
      }
    };

    // Step 4. Loop through all tokens
    for (const [label, token] of Object.entries(tokenMap)) {
      if (!token) {
        console.warn(`⚠️ Skipping ${label}: no access token found.`);
        continue;
      }
      console.log(`🚀 Fetching data for ${label}`);
      await fetchRecursive(token, label);
    }

    const revenueSummary = allItems.reduce((acc, item) => {
      const source = item.source;
      const amount = item.totalSales?.amount || 0;
      acc[source] = (acc[source] || 0) + Math.floor(amount);
      return acc;
    }, {});
    // console.log("🚀 ~ fetchRevenueData ~ revenueSummary:", revenueSummary);

    console.log("Fetching amazon revenue data completed");

    return revenueSummary;
  } catch (error) {
    console.error("❌ Error fetching revenue data:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const fetchShopifyData = async () => {
  try {
    console.log("🚀 fetch shopify revenue data started");
    const shopDomain = {
      LEDISA: process.env.LEDISA_DOMAIN,
      GL_ME: process.env.GL_ME_DOMAIN,
      SERABEL: process.env.SERABEL_DOMAIN,
    };

    const yesterday = moment().utc().subtract(1, "day");
    const startTime = yesterday.startOf("day").format("YYYY-MM-DD");
    const endTime = yesterday.endOf("day").format("YYYY-MM-DD");

    const allItems = [];
    // Step 3. Common recursive fetch function
    const fetchRecursive = async (domain, label, retries = 3) => {
      try {
        const response = await axios.post(
          "https://api.triplewhale.com/api/v2/summary-page/get-data",
          {
            shopDomain: domain,
            todayHour: 25,
            period: {
              start: startTime,
              end: endTime,
            },
          },
          {
            headers: { "x-api-key": process.env.TRIPLEWHALE_API_KEY },
          }
        );

        const summaries = response?.data?.metrics || [];

        allItems.push(...summaries.map((s) => ({ ...s, source: label })));
      } catch (error) {
        if (
          (error.response?.status === 429 ||
            error.code === "ECONNABORTED" ||
            (error.response?.status && error.response.status >= 500)) &&
          retries > 0
        ) {
          const backoffTime = Math.min(5000, 500 * Math.pow(2, 3 - retries));
          console.warn(`⏳ ${label}: retrying in ${backoffTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
          await fetchRecursive(domain, label, retries - 1);
        } else {
          console.error(`❌ ${label}: failed to fetch revenue:`, error.message);
          if (error.response) console.error(error.response.data);
        }
      }
    };

    // Step 4. Loop through all domains
    for (const [label, domain] of Object.entries(shopDomain)) {
      if (!domain) {
        console.warn(`⚠️ Skipping ${label}: no access domain found.`);
        continue;
      }
      console.log(`🚀 Fetching data for ${label}`);
      await fetchRecursive(domain, label);
    }

    // 🎯 Filter helper for reusable metric extraction
    const getMetricData = (title, service) =>
      allItems.filter(
        (item) =>
          item.title === title &&
          Array.isArray(item.services) &&
          item.services.includes(service)
      );

    // ✅ Metrics to extract
    const metricsToExtract = [
      { key: "shopifyRevenue", title: "Order Revenue", service: "shopify" },
      { key: "googleAds", title: "Google Ads", service: "google-ads" },
      {
        key: "googleRevenue",
        title: "Google Conversion Value",
        service: "google-ads",
      },
      { key: "facebookAds", title: "Facebook Ads", service: "facebook-ads" },
      {
        key: "facebookRevenue",
        title: "Facebook Meta Conversion Value",
        service: "facebook-ads",
      },
    ];

    // 🧩 Compute grouped metrics by source
    const finalMetrics = {};

    for (const { key, title, service } of metricsToExtract) {
      const filtered = getMetricData(title, service);

      const grouped = filtered.reduce((acc, item) => {
        if (!acc[item.source]) acc[item.source] = [];
        acc[item.source].push(item);
        return acc;
      }, {});

      const metricBySource = Object.fromEntries(
        Object.entries(grouped).map(([source, items]) => {
          const value = Number(items[0]?.values?.current ?? 0).toFixed(0);
          return [source, value];
        })
      );

      finalMetrics[key] = metricBySource;
    }

    // 🧾 Log all metrics neatly
    // console.log("📊 Final Metrics:", finalMetrics);

    console.log("🚀 fetch shopify revenue data completed ");
    return finalMetrics;
  } catch (error) {
    console.error("❌ Error fetching revenue data:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const fetchROASData = async () => {
  try {
    console.log("🚀 fetch roas data started");
    const shopDomain = {
      LEDISA: process.env.LEDISA_DOMAIN,
      GL_ME: process.env.GL_ME_DOMAIN,
      SERABEL: process.env.SERABEL_DOMAIN,
    };

    const yesterday = moment().utc().subtract(1, "day");
    const startTime = yesterday.startOf("day").format("YYYY-MM-DD");
    const endTime = yesterday.endOf("day").format("YYYY-MM-DD");

    const allItems = [];
    // Step 3. Common recursive fetch function
    const fetchRecursive = async (domain, label, retries = 3) => {
      try {
        const response = await axios.post(
          "https://api.triplewhale.com/api/v2/orcabase/api/sql",
          {
            shopId: domain,
            todayHour: 25,
            currency: "USD",
            query:
              "SELECT pj.event_date AS date, pj.channel AS channel, pj.attribution_window AS attribution_window, SUM(pj.spend) AS spend, SUM(pj.order_revenue) / nullif(SUM(pj.spend), 0) AS pixel_roas FROM pixel_joined_tvf() pj WHERE pj.event_date = @startDate AND pj.channel IN ('bing', 'facebook-ads', 'google-ads') AND pj.attribution_window = '1_day' GROUP BY pj.event_date, pj.channel, pj.attribution_window ORDER BY pj.event_date, pj.channel",
            period: {
              startDate: startTime,
              endDate: endTime,
            },
          },
          {
            headers: { "x-api-key": process.env.TRIPLEWHALE_API_KEY },
          }
        );

        const summaries = response?.data || [];

        allItems.push(...summaries.map((s) => ({ ...s, source: label })));
      } catch (error) {
        if (
          (error.response?.status === 429 ||
            error.code === "ECONNABORTED" ||
            (error.response?.status && error.response.status >= 500)) &&
          retries > 0
        ) {
          const backoffTime = Math.min(5000, 500 * Math.pow(2, 3 - retries));
          console.warn(`⏳ ${label}: retrying in ${backoffTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
          await fetchRecursive(domain, label, retries - 1);
        } else {
          console.error(`❌ ${label}: failed to fetch revenue:`, error.message);
          if (error.response) console.error(error.response.data);
        }
      }
    };

    // Step 4. Loop through all domains
    for (const [label, domain] of Object.entries(shopDomain)) {
      if (!domain) {
        console.warn(`⚠️ Skipping ${label}: no access domain found.`);
        continue;
      }
      console.log(`🚀 Fetching data for ${label}`);
      await fetchRecursive(domain, label);
    }

    // 🎯 Filter helper for reusable metric extraction
    const getMetricData = (channel, attribution_window) =>
      allItems.filter(
        (item) =>
          item.channel === channel &&
          item.attribution_window === attribution_window
      );

    // ✅ Metrics to extract
    const metricsToExtract = [
      {
        key: "googleRoas",
        channel: "facebook-ads",
        attribution_window: "1_day",
      },
      {
        key: "facebookRoas",
        channel: "google-ads",
        attribution_window: "1_day",
      },
    ];

    // 🧩 Compute grouped metrics by source
    const finalMetrics = {};

    for (const { key, channel, attribution_window } of metricsToExtract) {
      const filtered = getMetricData(channel, attribution_window);

      const grouped = filtered.reduce((acc, item) => {
        if (!acc[item.source]) acc[item.source] = [];
        acc[item.source].push(item);
        return acc;
      }, {});

      const metricBySource = Object.fromEntries(
        Object.entries(grouped).map(([source, items]) => {
          const value = Number(items[0]?.pixel_roas ?? 0).toFixed(2);
          return [source, value];
        })
      );

      finalMetrics[key] = metricBySource;
    }

    // 🧾 Log all metrics neatly
    // console.log("📊 Final Metrics:", finalMetrics);

    console.log("🚀 fetch roas data completed ");
    return finalMetrics;
  } catch (error) {
    console.error("❌ Error fetching revenue data:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const formatNumber = (num) => {
  if (num === undefined || num === null || num === "" || isNaN(num)) return "0";
  const parsed = Number(num);
  return parsed.toLocaleString("en-US", { maximumFractionDigits: 2 });
};


const sendSlackMessage = async (req, res) => {
  const revenueSummary = await fetchAmazonRevenueData();
  const shopifySummary = await fetchShopifyData();
  const roasSummary = await fetchROASData();
  console.log("🚀 ~ sendSlackMessage ~ revenueSummary:", revenueSummary);
  console.log("🚀 ~ sendSlackMessage ~ shopifySummary:", shopifySummary);
  console.log("🚀 ~ sendSlackMessage ~ roasSummary:", roasSummary);
  try { 
    const payload = {
      channel: process.env.SLACK_CHANNEL_NAME,
      text: "Daily Performance Report", // fallback text for notifications
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "🚀 Daily Acentecom Performance Report:",
          },
        },
        { type: "divider" },

        // Magic FP
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🌟 *Magic FP :*\n• AMZ Revenue: $ ${formatNumber(
              revenueSummary?.MAGIC_FP
            )} \n• AMZ TACOS: -`,
          },
        },

        // Wellanova
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🫐 *Wellanova :*\n• AMZ Revenue: $ ${formatNumber(
              revenueSummary?.WELLANOVA
            )} \n• AMZ TACOS: -`,
          },
        },

        // ANROSE
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🟣 *ANROSE :*\n• AMZ Revenue: $ ${formatNumber(
              revenueSummary?.ANROSE
            )} \n• AMZ TACOS: -`,
          },
        },

        // Ledisa
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔹 *Ledisa :*\n• AMZ Revenue: $ ${formatNumber(
              revenueSummary?.LEDISA
            )} \n• AMZ TACOS: - \n\n• Shopify Revenue: $ ${formatNumber(
              shopifySummary?.shopifyRevenue?.LEDISA
            )}  \n\n• G-Ads Spend: $ ${formatNumber(
              shopifySummary?.googleAds?.LEDISA
            )} \n• G-Ads Revenue (TW): $ ${formatNumber(
              shopifySummary?.googleRevenue?.LEDISA
            )} \n• G-Ads ROAS (TW):  ${
              formatNumber(roasSummary?.googleRoas?.LEDISA) || 0
            } \n\n• Meta Spend: $ ${formatNumber(
              shopifySummary?.facebookAds?.LEDISA
            )} \n• Meta Revenue (TW): $ ${formatNumber(
              shopifySummary?.facebookRevenue?.LEDISA
            )}  \n• Meta ROAS (TW):  ${
              formatNumber(roasSummary?.facebookRoas?.LEDISA) || 0
            }`,
          },
        },

        // GL-ME
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔴 *GL-ME :*\n• Shopify Revenue: $ ${formatNumber(
              shopifySummary?.shopifyRevenue?.GL_ME
            )} \n\n• G-Ads Spend: $ ${formatNumber(
              shopifySummary?.googleAds?.GL_ME
            )} \n• G-Ads Revenue (TW): $ ${formatNumber(
              shopifySummary?.googleRevenue?.GL_ME
            )} \n• G-Ads ROAS (TW):  ${
              formatNumber(roasSummary?.googleRoas?.GL_ME) || 0
            }  \n\n• Meta Spend: $ ${formatNumber(
              shopifySummary?.facebookAds?.GL_ME
            )} \n• Meta Revenue (TW): $ ${formatNumber(
              shopifySummary?.facebookRevenue?.GL_ME
            )} \n• Meta ROAS (TW):  ${
              formatNumber(roasSummary?.facebookRoas?.GL_ME) || 0
            }`,
          },
        },

        // Serabel
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🐮 *Serabel :*\n • AMZ Revenue: - \n• AMZ TACOS: - \n\n• Shopify Revenue: $ ${formatNumber(
              shopifySummary?.shopifyRevenue?.SERABEL
            )} \n\n• G-Ads Spend: $ ${formatNumber(
              shopifySummary?.googleAds?.SERABEL
            )} \n• G-Ads Revenue (TW): $ ${formatNumber(
              shopifySummary?.googleRevenue?.SERABEL
            )} \n• G-Ads ROAS (TW):  ${
              formatNumber(roasSummary?.googleRoas?.SERABEL) || 0
            }  \n\n• Meta Spend: $ ${formatNumber(
              shopifySummary?.facebookAds?.SERABEL
            )} \n• Meta Revenue (TW): $ ${formatNumber(
              shopifySummary?.facebookRevenue?.SERABEL
            )}  \n• Meta ROAS (TW):  ${
              formatNumber(roasSummary?.facebookRoas?.SERABEL) || 0
            } `,
          },
        },

        { type: "divider" },

      ],
    };

    const response = await axios.post(
      "https://slack.com/api/chat.postMessage",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = response.data;

    // ✅ Handle Slack response explicitly
    if (data.ok) {
      console.log("✅ Slack message sent successfully!");
      console.log(`📨 Channel: ${data.channel}`);
      if (res)
        res
          .status(200)
          .json({ success: true, message: "Slack message sent successfully!" });
    } else {
      console.error("❌ Slack API Error:", data.error);
      if (res) res.status(400).json({ success: false, error: data.error });
    }
  } catch (error) {
    console.error(
      "🔥 Slack message failed:",
      error.response?.data || error.message
    );
    if (res)
      res.status(500).json({
        success: false,
        error: error.response?.data?.error || error.message,
      });
  }
};

module.exports = { sendSlackMessage };
