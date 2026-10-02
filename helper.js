

const { google } = require("googleapis");
const auth = require("./config/googleAuth");
const sheets = google.sheets({ version: "v4", auth });

const SHEET_NAME = process.env.GOOGLE_TOKEN_SHEET_NAME;

// Multiple Sheet IDs
const SHEET_IDS = {
  MAGIC_FP: process.env.MAGIC_FP_SHEETID?.trim(),
  LEDISA: process.env.LEDISA_SHEETID?.trim(),
  WELLANOVA: process.env.WELLANOVA_SHEETID?.trim(),
  ANROSE: process.env.ANROSE_SHEETID?.trim(),
};

async function getTokenSheetColumns(spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!1:1`, // header row
  });

  const headers = res.data.values?.[0] || [];
  return {
    ACCESS_TOKEN: headers.indexOf("AccessToken"),
    REFRESH_TOKEN: headers.indexOf("RefreshToken"),
    CLIENT_ID: headers.indexOf("clientId"),
    CLIENT_SECRET: headers.indexOf("clientSecret"),
    // EXPIRES_AT: headers.indexOf("ExpiresAt"),
  };
}


const getAccessToken = async (sheetLabel = "ANROSE") => {
  try {
    // Pick target sheet by label or ID
    const spreadsheetId = SHEET_IDS[sheetLabel] || sheetLabel;

    if (!spreadsheetId) {
      throw new Error(`Sheet ID not found for label: ${sheetLabel}`);
    }

    const COLUMNS = await getTokenSheetColumns(spreadsheetId);

    if (COLUMNS.ACCESS_TOKEN === -1) {
      throw new Error("AccessToken column not found in token sheet");
    }

    // Fetch all rows
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:Z`,
    });

    const [headers, ...rows] = sheetResponse.data.values || [];
    const row = rows[0]; // You can modify if you want specific row logic
    const accessToken = row?.[COLUMNS.ACCESS_TOKEN];

    if (!accessToken) {
      throw new Error("Empty access token found");
    }

    return accessToken;

  } catch (error) {
    console.error(`❌ Failed to get access token (${sheetLabel}):`, error.message);
    throw new Error(`Failed to get access token from ${sheetLabel}: ${error.message}`);
  }
};

module.exports = { getAccessToken };
