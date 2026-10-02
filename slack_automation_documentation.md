# Slack Automation Project — System & Business Documentation

---

## Part I: Non-Technical Business Guide

### 1. Executive Summary & Business Objective
The **Slack Automation Project** is an automated cross-channel business intelligence and executive notification service developed for **Acentecom**. It monitors, aggregates, and reports daily financial and advertising performance across all active retail brands and sales channels:
* **Amazon US Marketplaces**:
  * **Magic-FP**
  * **Ledisa**
  * **Wellanova**
  * **Anrose**
* **Shopify Direct-to-Consumer (DTC) Stores & Ad Platforms**:
  * **Ledisa**
  * **GL-ME**
  * **Serabel**

Every morning at 05:00 AM Berlin time (CET/CEST), the automation engine pulls finalized performance data from the previous calendar day (yesterday, UTC), aggregates total revenue and marketing metrics across Amazon SP-API and Triple Whale, formats an executive briefing, and posts it into a dedicated corporate Slack channel.

By centralizing multi-platform metrics (Amazon gross sales, Shopify order revenue, Google Ads spend, Google conversion value, Meta/Facebook Ads spend, Meta conversion value, and pixel-attributed ROAS) into a single Slack message, leadership and brand managers obtain immediate visibility into business health without manual reporting.

```
+----------------------------------------------------------------------------------------------------+
|                                  SLACK AUTOMATION SYSTEM CONTEXT                                   |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|    +------------------------+                     +------------------------+                       |
|    |     Amazon SP-API      |                     |    Triple Whale API    |                       |
|    |  Daily Sales Metrics   |                     | DTC Revenue, Ads, ROAS |                       |
|    +-----------+------------+                     +------------+-----------+                       |
|                |                                               |                                   |
|                +-----------------------\ /---------------------+                                   |
|                                         v                                                          |
|                         +-------------------------------+                                          |
|                         |   SLACK AUTOMATION BACKEND    |                                          |
|                         |    Express.js Briefing Hub    |                                          |
|                         +---------------+---------------+                                          |
|                                         |                                                          |
|                +-----------------------/ \---------------------+                                   |
|                |                                               |                                   |
|    +-----------v------------+                     +------------v-----------+                       |
|    |    Google Sheets v4    |                     |     Slack Web API      |                       |
|    | Multi-Brand LWA Tokens |                     | Daily Executive Report |                       |
|    +------------------------+                     +------------------------+                       |
+----------------------------------------------------------------------------------------------------+
```

---

### 2. End-to-End Business Lifecycle

The automated reporting pipeline operates through five synchronized stages:

```
+-------------------------------------------------------------------------------------------------------+
|                                    DAILY REPORTING PIPELINE FLOW                                      |
+-------------------------------------------------------------------------------------------------------+
|                                                                                                       |
|  [ Stage 1: Credential Rotation & Token Verification ]                                               |
|  Cron triggers every 50 min (and before SP-API calls) -> Reads credentials from brand Token tabs      |
|  -> Calls Amazon LWA -> Stores fresh access tokens for Magic-FP, Ledisa, Wellanova, and Anrose        |
|                                    |                                                                  |
|                                    v                                                                  |
|  [ Stage 2: Amazon Sales Metrics Extraction ]                                                         |
|  Engine calculates yesterday's 24-hour UTC window -> Queries Amazon SP-API orderMetrics for 4 brands  |
|  -> Aggregates net sales revenue per brand                                                            |
|                                    |                                                                  |
|                                    v                                                                  |
|  [ Stage 3: Shopify DTC & Advertising Metrics Extraction ]                                           |
|  Queries Triple Whale Summary API for Ledisa, GL-ME, and Serabel -> Gathers Shopify Order Revenue,     |
|  Google Ads spend/revenue, and Meta Ads spend/revenue                                                 |
|                                    |                                                                  |
|                                    v                                                                  |
|  [ Stage 4: Attribution & ROAS Calculation ]                                                         |
|  Executes SQL query against Triple Whale OrcaBase -> Calculates 1-day attribution pixel ROAS for     |
|  Google Ads and Meta Ads across all DTC brands                                                        |
|                                    |                                                                  |
|                                    v                                                                  |
|  [ Stage 5: Executive Slack Notification Dispatch ]                                                  |
|  Aggregates metrics -> Formats currency numbers -> Constructs Slack Block Kit layout with brand       |
|  emojis -> Dispatches briefing to Slack corporate channel via chat.postMessage API                    |
|                                                                                                       |
+-------------------------------------------------------------------------------------------------------+
```

1. **Credential Rotation & Token Verification**:
   * To ensure uninterrupted communication with Amazon Selling Partner API (SP-API), an automated background job refreshes Login with Amazon (LWA) access tokens across all brand spreadsheets.
   * If any token is nearing expiry, it is refreshed immediately prior to metrics collection.

2. **Amazon Sales Metrics Extraction**:
   * The backend dynamically calculates the previous day's complete UTC time window (`00:00:00Z` to `23:59:59Z`).
   * It queries the Amazon SP-API `orderMetrics` endpoint for the North American marketplace (`ATVPDKIKX0DER`) across Magic-FP, Ledisa, Wellanova, and Anrose.
   * Total sales figures are floored and aggregated by brand entity.

3. **Shopify DTC & Ad Channel Performance Extraction**:
   * For direct-to-consumer storefronts (**Ledisa**, **GL-ME**, **Serabel**), the backend queries the Triple Whale Summary API.
   * It extracts five core financial indicators per brand:
     * Shopify Gross Order Revenue
     * Google Ads Spend
     * Google Ads Conversion Value
     * Meta (Facebook) Ads Spend
     * Meta (Facebook) Conversion Value

4. **Multi-Touch Pixel ROAS Attribution**:
   * Standard platform-reported ROAS often suffers from duplicate attribution. To provide leadership with precise numbers, the backend executes a direct SQL query against the Triple Whale OrcaBase data lake.
   * It calculates true 1-day pixel ROAS for Google Ads and Meta Ads per brand.

5. **Slack Executive Briefing Assembly & Dispatch**:
   * Numbers are formatted with standard comma delimiters and currency symbols.
   * The backend compiles a structured Slack Block Kit message featuring custom brand badges (`🌟 Magic FP`, `🫐 Wellanova`, `🟣 ANROSE`, `🔹 Ledisa`, `🔴 GL-ME`, `🐮 Serabel`).
   * The message is posted directly to the configured Slack channel (`SLACK_CHANNEL_NAME`) using the official Slack Bot Token.

---

### 3. Google Sheets Architecture & Tab Directory

The application interfaces with four brand-specific Google Spreadsheets to retrieve and maintain Amazon SP-API authentication credentials.

#### Tab: Token Sheet (`GOOGLE_TOKEN_SHEET_NAME`, default `Token`)
* **Purpose**: Serves as a secure, decentralized storage vault for Amazon LWA OAuth2 credentials and active access tokens for each brand.
* **Spreadsheets Referenced**:
  * `MAGIC_FP_SHEETID`: Dedicated sheet for Magic-FP Amazon Seller Account.
  * `LEDISA_SHEETID`: Dedicated sheet for Ledisa Amazon Seller Account.
  * `WELLANOVA_SHEETID`: Dedicated sheet for Wellanova Amazon Seller Account.
  * `ANROSE_SHEETID`: Dedicated sheet for Anrose Amazon Seller Account.
* **Key Columns**:
  * `AccessToken`: The short-lived bearer token (valid for 60 minutes) used in the `x-amz-access-token` header when querying SP-API.
  * `RefreshToken`: The long-lived secret token used to request fresh access tokens from Amazon OAuth servers.
  * `clientId`: The LWA Application Client Identifier.
  * `clientSecret`: The LWA Application Secret Key.

---

### 4. Third-Party Integrations Directory

All external systems integrated into the backend are detailed below:

#### 1. Slack Web API Integration
* **Purpose**: Automated delivery of daily executive business reports to corporate team channels.
* **Authentication**: HTTP Bearer Token (`SLACK_BOT_TOKEN`) passed in request headers.
* **Endpoints Utilized**:
  * `POST https://slack.com/api/chat.postMessage`: Dispatches structured Block Kit JSON payloads to `SLACK_CHANNEL_NAME`.
* **Payload Architecture**:
  * Employs Block Kit sections, bold markdown text, and divider blocks to separate brand metrics clearly.
  * Includes fallback plain text (`"Daily Performance Report"`) for mobile and desktop notifications.

#### 2. Amazon Selling Partner API (SP-API) & Login with Amazon (LWA)
* **Purpose**: Automated extraction of daily Amazon marketplace sales metrics.
* **Authentication**: Multi-brand LWA token exchange (`AUTH_LINK`) storing access tokens in Google Sheets.
* **Endpoints Utilized**:
  * `GET ${ROOT_LINK_SELLER}/sales/v1/orderMetrics`:
    * Retrieves order revenue metrics for the US marketplace (`ATVPDKIKX0DER`) across yesterday's UTC interval.
    * Rate limiting is enforced with a mandatory 500ms delay between calls and 3-tier exponential backoff retries on HTTP 429 rate limits or 5xx server errors.

#### 3. Triple Whale Summary Page API
* **Purpose**: Extraction of direct-to-consumer store metrics across Shopify, Google Ads, and Meta Ads.
* **Authentication**: Custom API Key header (`x-api-key: TRIPLEWHALE_API_KEY`).
* **Endpoints Utilized**:
  * `POST https://api.triplewhale.com/api/v2/summary-page/get-data`:
    * Request payload contains `shopDomain`, `todayHour: 25`, and `period: { start, end }`.
    * Returns raw metric arrays filtered for `Order Revenue` (Shopify), `Google Ads`, `Google Conversion Value`, `Facebook Ads`, and `Facebook Meta Conversion Value`.

#### 4. Triple Whale OrcaBase SQL API
* **Purpose**: Advanced attribution modeling and pixel-accurate ROAS calculation.
* **Authentication**: Custom API Key header (`x-api-key: TRIPLEWHALE_API_KEY`).
* **Endpoints Utilized**:
  * `POST https://api.triplewhale.com/api/v2/orcabase/api/sql`:
    * Executes a custom SQL statement against the `pixel_joined_tvf()` table-valued function.
    * Computes spend, order revenue, and `pixel_roas` with a strict `1_day` attribution window across Google Ads and Meta Ads channels.

#### 5. Google Sheets API (v4)
* **Purpose**: Decentralized credential vault and token exchange store.
* **Authentication**: Google Cloud Service Account JWT via `config/service-account.json` with `spreadsheets` scope.
* **Capabilities Utilized**:
  * `spreadsheets.values.get`: Reads header positions and active credentials from `Token!1:1` and `Token!A:Z`.
  * `spreadsheets.values.update`: Writes freshly generated LWA access tokens back to row 2 of the `Token` sheet.

---

### 5. Automated Background Crons

The system operates two independent, automated background cron jobs:

```
+---------------------------------------------------------------------------------------------------------+
|                                        SCHEDULED BACKGROUND CRONS                                       |
+-------------------+--------------------+------------------------+---------------------------------------+
| Cron Schedule     | Timezone           | Target Function        | Primary Operational Responsibility    |
+-------------------+--------------------+------------------------+---------------------------------------+
| */50 * * * *      | System Local       | cronUpdateToken        | Refreshes Amazon LWA access tokens    |
| (Every 50 min)    |                    |                        | for Magic-FP, Ledisa, Wellanova,      |
|                   |                    |                        | and Anrose; updates Token sheets.     |
+-------------------+--------------------+------------------------+---------------------------------------+
| 0 5 * * *         | Europe/Berlin      | sendSlackMessage       | Compiles daily financial briefing and |
| (Daily at 5:00 AM)|                    |                        | dispatches Block Kit report to Slack. |
+-------------------+--------------------+------------------------+---------------------------------------+
```

---

## Part II: Technical Architecture & System Reference

### 6. System Architecture & File Structure

The project is structured as a lightweight, modular Express service:

```
acentecom-slack-automation/
├── config/
│   ├── googleAuth.js              # Service account client for Google Sheets API v4
│   └── service-account.json       # Google Cloud Service Account key (ignored by git)
├── controller/
│   ├── configAds.controller.js     # Amazon LWA token refresh for 4 brand sheets
│   └── slack.controller.js        # Multi-channel data aggregator & Slack dispatcher
├── routes/
│   ├── configSp.route.js          # Cron job for 50-minute Amazon LWA token updates
│   └── slack.route.js             # Cron job (05:00 Berlin) & manual GET /api/send endpoint
├── helper.js                       # Token retrieval utility & sheet column mapper
├── index.js                        # Express server entry point & route registration
├── package.json                    # Dependencies (express, axios, googleapis, moment, node-cron)
└── .env                            # Environment variables and API credentials
```

---

### 7. Core Business Logic & Data Aggregation Engine

#### A. Amazon Revenue Extraction (`fetchAmazonRevenueData`)
1. **Token Refresh Pre-Check**: Calls `cronUpdateToken()` to ensure access tokens in all 4 brand sheets are valid.
2. **Access Token Retrieval**: Reads active tokens for `MAGIC_FP`, `LEDISA`, `ANROSE`, and `WELLANOVA` via `getAccessToken()` in `helper.js`.
3. **Time Window Calculation**:
   ```javascript
   const yesterday = moment().utc().subtract(1, "day");
   const startTime = yesterday.startOf("day").toISOString(); // e.g. 2026-09-27T00:00:00Z
   const endTime = yesterday.endOf("day").toISOString();   // e.g. 2026-09-27T23:59:59Z
   const interval = `${startTime}--${endTime}`;
   ```
4. **SP-API Request Execution**:
   * Queries `${ROOT_LINK_SELLER}/sales/v1/orderMetrics` with query params `granularity: "Total"`, `marketplaceIds: marketplaceId`, and `interval`.
   * Enforces a minimum delay of 500ms between calls (`MIN_DELAY_REVENUE`).
   * Retries up to 3 times with exponential backoff (`Math.min(5000, 500 * Math.pow(2, 3 - retries))`) upon encountering HTTP 429, 5xx errors, or network aborts.
5. **Aggregation**: Floats are converted to integers via `Math.floor()` and summed per brand.

#### B. Shopify DTC & Ad Metric Extraction (`fetchShopifyData`)
1. **Target Domains**: Configured from environment variables:
   * `LEDISA`: `process.env.LEDISA_DOMAIN`
   * `GL_ME`: `process.env.GL_ME_DOMAIN`
   * `SERABEL`: `process.env.SERABEL_DOMAIN`
2. **Date Interval**: Formats yesterday's date as `YYYY-MM-DD`.
3. **Triple Whale Summary API Call**:
   * POSTs to `https://api.triplewhale.com/api/v2/summary-page/get-data` with header `x-api-key: TRIPLEWHALE_API_KEY`.
   * Passes `shopDomain`, `todayHour: 25`, and date range.
4. **Metric Filter Mapping**:
   * `shopifyRevenue`: Filtered by title `"Order Revenue"` and service `"shopify"`.
   * `googleAds`: Filtered by title `"Google Ads"` and service `"google-ads"`.
   * `googleRevenue`: Filtered by title `"Google Conversion Value"` and service `"google-ads"`.
   * `facebookAds`: Filtered by title `"Facebook Ads"` and service `"facebook-ads"`.
   * `facebookRevenue`: Filtered by title `"Facebook Meta Conversion Value"` and service `"facebook-ads"`.
5. **Extraction**: Values are parsed as numbers and rounded to whole currency amounts (`toFixed(0)`).

#### C. Pixel-Attributed ROAS Modeling (`fetchROASData`)
1. **Query Construction**:
   Executes a SQL query against Triple Whale OrcaBase:
   ```sql
   SELECT pj.event_date AS date, pj.channel AS channel, pj.attribution_window AS attribution_window,
          SUM(pj.spend) AS spend, SUM(pj.order_revenue) / nullif(SUM(pj.spend), 0) AS pixel_roas
   FROM pixel_joined_tvf() pj
   WHERE pj.event_date = @startDate
     AND pj.channel IN ('bing', 'facebook-ads', 'google-ads')
     AND pj.attribution_window = '1_day'
   GROUP BY pj.event_date, pj.channel, pj.attribution_window
   ORDER BY pj.event_date, pj.channel
   ```
2. **Extraction**:
   * `googleRoas`: Extracted where channel is `"facebook-ads"` (OrcaBase channel mapping key) with 1-day attribution.
   * `facebookRoas`: Extracted where channel is `"google-ads"` (OrcaBase channel mapping key) with 1-day attribution.
   * Values are formatted to 2 decimal places (`toFixed(2)`).

#### D. Slack Message Assembly & Formatting (`sendSlackMessage`)
* **Number Formatting Utility**:
  ```javascript
  const formatNumber = (num) => {
    if (num === undefined || num === null || num === "" || isNaN(num)) return "0";
    const parsed = Number(num);
    return parsed.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };
  ```
* **Block Kit Assembly**:
  * Constructs a Slack Block Kit payload with dedicated sections per brand:
    * `🌟 Magic FP`: AMZ Revenue
    * `🫐 Wellanova`: AMZ Revenue
    * `🟣 ANROSE`: AMZ Revenue
    * `🔹 Ledisa`: AMZ Revenue, Shopify Revenue, Google Ads Spend & Revenue, Google ROAS, Meta Ads Spend & Revenue, Meta ROAS
    * `🔴 GL-ME`: Shopify Revenue, Google Ads Spend & Revenue, Google ROAS, Meta Ads Spend & Revenue, Meta ROAS
    * `🐮 Serabel`: Shopify Revenue, Google Ads Spend & Revenue, Google ROAS, Meta Ads Spend & Revenue, Meta ROAS
* **Dispatch**:
  * Sends POST request to `https://slack.com/api/chat.postMessage` with `SLACK_BOT_TOKEN`.
  * Logs delivery confirmation or captures and reports Slack API error codes (e.g. `channel_not_found`, `invalid_auth`).

---

### 8. API Endpoint Reference

#### 1. GET `/`
* **Purpose**: Health check endpoint to verify server status.
* **Authentication**: None.
* **cURL Example**:
```bash
curl -X GET "http://localhost:3000/"
```
* **Success Response (200 OK)**:
```
🚀 Server is running successfully!
```

#### 2. GET `/api/send`
* **Purpose**: Manual execution endpoint that triggers the complete data extraction and Slack dispatch flow on demand.
* **Authentication**: None (internal operations trigger).
* **cURL Example**:
```bash
curl -X GET "http://localhost:3000/api/send"
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Slack message sent successfully!"
}
```
* **Error Response (400 Bad Request / 500 Server Error)**:
```json
{
  "success": false,
  "error": "channel_not_found"
}
```

---

### 9. External Third-Party API Reference & Working cURL Examples

#### A. Slack Web API — Post Chat Message
* **Method**: `POST`
* **URL**: `https://slack.com/api/chat.postMessage`
* **Headers**:
  * `Authorization: Bearer YOUR_SLACK_BOT_TOKEN`
  * `Content-Type: application/json`
* **cURL Example**:
```bash
curl -X POST "https://slack.com/api/chat.postMessage" \
  -H "Authorization: Bearer YOUR_SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "C08ABC123XY",
    "text": "Daily Performance Report",
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "🚀 Daily Acentecom Performance Report:"
        }
      },
      { "type": "divider" },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "🌟 *Magic FP :*\n• AMZ Revenue: $ 12,450 \n• AMZ TACOS: -"
        }
      }
    ]
  }'
```

#### B. Amazon Selling Partner API (SP-API) — Order Metrics
* **Method**: `GET`
* **URL**: `https://sellingpartnerapi-na.amazon.com/sales/v1/orderMetrics`
* **Headers**:
  * `x-amz-access-token: YOUR_AMAZON_ACCESS_TOKEN`
* **Query Parameters**:
  * `granularity=Total`
  * `marketplaceIds=ATVPDKIKX0DER`
  * `interval=2026-09-27T00:00:00.000Z--2026-09-27T23:59:59.000Z`
* **cURL Example**:
```bash
curl -X GET "https://sellingpartnerapi-na.amazon.com/sales/v1/orderMetrics?granularity=Total&marketplaceIds=ATVPDKIKX0DER&interval=2026-09-27T00:00:00.000Z--2026-09-27T23:59:59.000Z" \
  -H "x-amz-access-token: YOUR_AMAZON_ACCESS_TOKEN"
```

#### C. Amazon Login with Amazon (LWA) — Token Refresh
* **Method**: `POST`
* **URL**: `https://api.amazon.com/auth/o2/token`
* **Headers**:
  * `Content-Type: application/x-www-form-urlencoded`
* **cURL Example**:
```bash
curl -X POST "https://api.amazon.com/auth/o2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&refresh_token=YOUR_REFRESH_TOKEN"
```

#### D. Triple Whale Summary Page API
* **Method**: `POST`
* **URL**: `https://api.triplewhale.com/api/v2/summary-page/get-data`
* **Headers**:
  * `x-api-key: YOUR_TRIPLEWHALE_API_KEY`
  * `Content-Type: application/json`
* **cURL Example**:
```bash
curl -X POST "https://api.triplewhale.com/api/v2/summary-page/get-data" \
  -H "x-api-key: YOUR_TRIPLEWHALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "shopDomain": "ledisa-brand.myshopify.com",
    "todayHour": 25,
    "period": {
      "start": "2026-09-27",
      "end": "2026-09-27"
    }
  }'
```

#### E. Triple Whale OrcaBase SQL API
* **Method**: `POST`
* **URL**: `https://api.triplewhale.com/api/v2/orcabase/api/sql`
* **Headers**:
  * `x-api-key: YOUR_TRIPLEWHALE_API_KEY`
  * `Content-Type: application/json`
* **cURL Example**:
```bash
curl -X POST "https://api.triplewhale.com/api/v2/orcabase/api/sql" \
  -H "x-api-key: YOUR_TRIPLEWHALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "shopId": "ledisa-brand.myshopify.com",
    "todayHour": 25,
    "currency": "USD",
    "query": "SELECT pj.event_date AS date, pj.channel AS channel, pj.attribution_window AS attribution_window, SUM(pj.spend) AS spend, SUM(pj.order_revenue) / nullif(SUM(pj.spend), 0) AS pixel_roas FROM pixel_joined_tvf() pj WHERE pj.event_date = @startDate AND pj.channel IN (\x27bing\x27, \x27facebook-ads\x27, \x27google-ads\x27) AND pj.attribution_window = \x271_day\x27 GROUP BY pj.event_date, pj.channel, pj.attribution_window ORDER BY pj.event_date, pj.channel",
    "period": {
      "startDate": "2026-09-27",
      "endDate": "2026-09-27"
    }
  }'
```

---

### 10. Environment Variables & Configuration Reference

The following environment variables are required in `.env`:

```ini
# Application Server Port
PORT=3000

# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token-placeholder
SLACK_CHANNEL_NAME=C08ABC123XY

# Brand Google Sheet IDs (Holding LWA Tokens for Amazon SP-API)
MAGIC_FP_SHEETID=1_MAGIC_FP_SHEET_ID_PLACEHOLDER
LEDISA_SHEETID=1_LEDISA_SHEET_ID_PLACEHOLDER
WELLANOVA_SHEETID=1_WELLANOVA_SHEET_ID_PLACEHOLDER
ANROSE_SHEETID=1_ANROSE_SHEET_ID_PLACEHOLDER
GOOGLE_TOKEN_SHEET_NAME=Token

# Amazon SP-API & LWA Configuration
AUTH_LINK=https://api.amazon.com/auth/o2/token
ROOT_LINK_SELLER=https://sellingpartnerapi-na.amazon.com
MARKET_PLACE_ID=ATVPDKIKX0DER

# Triple Whale Analytics Configuration
TRIPLEWHALE_API_KEY=your_triplewhale_api_key_placeholder
LEDISA_DOMAIN=ledisa-brand.myshopify.com
GL_ME_DOMAIN=gl-me-brand.myshopify.com
SERABEL_DOMAIN=serabel-brand.myshopify.com

# Optional Slack App Metadata
appid=your_slack_app_id_placeholder
clientid=your_slack_client_id_placeholder
verificationtoken=your_verification_token_placeholder
webhookurl=https://hooks.slack.com/services/placeholder
```

#### Service Account Placement
* A valid Google Cloud Service Account key must be saved at:
  `config/service-account.json`
* The service account must have **Viewer/Editor** permissions on all referenced Google Spreadsheets.

---

### 11. Operational Verification & Validation Checklist

Before releasing or verifying the system, complete the following validation checklist:

* [ ] **Service Account Authentication**: Confirm `config/service-account.json` exists and can authenticate via `config/googleAuth.js`.
* [ ] **LWA Token Rotation**: Run `cronUpdateToken()` to verify that access tokens refresh across Magic-FP, Ledisa, Wellanova, and Anrose sheets without errors.
* [ ] **Amazon SP-API Sales Extraction**: Test `fetchAmazonRevenueData()` to ensure yesterday's UTC orders metrics return valid numbers.
* [ ] **Triple Whale Summary API Connectivity**: Verify that `fetchShopifyData()` retrieves revenue and ad metrics for Ledisa, GL-ME, and Serabel.
* [ ] **Triple Whale OrcaBase SQL Query**: Verify that `fetchROASData()` executes without syntax or timeout errors and computes valid ROAS values.
* [ ] **Slack Bot Channel Delivery**: Call `GET /api/send` and verify that the formatted Block Kit report appears in the designated Slack channel.
* [ ] **Timezone Alignment**: Confirm the Slack cron runs at 05:00 AM Europe/Berlin time and evaluates the complete 24-hour UTC window of the previous calendar day.
