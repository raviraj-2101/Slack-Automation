const { default: axios } = require("axios");
const { google } = require("googleapis");
const auth = require("../config/googleAuth");
const sheets = google.sheets({ version: "v4", auth });

const SHEET_NAME = process.env.GOOGLE_TOKEN_SHEET_NAME;

// Collect all Sheet IDs from env
const SHEET_IDS = {
  MAGIC_FP: process.env.MAGIC_FP_SHEETID,
  LEDISA: process.env.LEDISA_SHEETID,
  WELLANOVA: process.env.WELLANOVA_SHEETID,
  ANROSE: process.env.ANROSE_SHEETID,
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
  };
}

async function processSheet(spreadsheetId, label) {
  console.log(`\n🔄 Processing sheet: ${label}`);

  try {
    const COLUMNS = await getTokenSheetColumns(spreadsheetId);

    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:Z`,
    });

    const values = sheetData.data.values || [];
    if (values.length < 2) {
      console.log(
        `⚠️ No data rows found in ${label} sheet (only headers or empty).`
      );
      return;
    }

    const data = values.slice(1); 

    //  Process each row sequentially
    for (let i = 0; i < 1; i++) {
      const row = data[i];
      let clientId;

      try {
        clientId = row[COLUMNS.CLIENT_ID];
        const clientSecret = row[COLUMNS.CLIENT_SECRET];
        const refreshToken = row[COLUMNS.REFRESH_TOKEN];

        if (!clientId || !clientSecret || !refreshToken) {
          console.warn(`⚠️ Missing credentials in row ${i + 2}, skipping.`);
          continue;
        }

        // 4️⃣ Generate new access token
        const { data: tokenData } = await axios.post(
          process.env.AUTH_LINK,
          new URLSearchParams({
            grant_type: "refresh_token",
            client_id: clientId,
            refresh_token: refreshToken,
            client_secret: clientSecret,
          }),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        // 5️⃣ Prepare updated values
        const updateValues = [];
        if (COLUMNS.ACCESS_TOKEN >= 0)
          updateValues.push(tokenData.access_token || "");
        if (COLUMNS.REFRESH_TOKEN >= 0)
          updateValues.push(tokenData.refresh_token || "");


        // 6️⃣ Update Google Sheet
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SHEET_NAME}!${String.fromCharCode(
            65 + COLUMNS.ACCESS_TOKEN
          )}${i + 2}:${String.fromCharCode(65 + COLUMNS.REFRESH_TOKEN)}${
            i + 2
          }`,
          valueInputOption: "USER_ENTERED",
          resource: { values: [updateValues] },
        });

        await new Promise((r) => setTimeout(r, 500)); // 0.5 second delay
      } catch (error) {
        console.error(
          `❌ Error in ${label} (${clientId || "unknown"}) at row ${i + 2}:`,
          error.message
        );
        if (error.response) console.error("API response:", error.response.data);
      }
    }

    console.log(`🎉 Finished processing ${label} sheet successfully.`);
  } catch (err) {
    console.error(`💥 Fatal error processing sheet ${label}:`, err.message);
  }
}

exports.cronUpdateToken = async () => {
  try {
    // Loop through all defined sheet IDs
    for (const [label, sheetId] of Object.entries(SHEET_IDS)) {
      if (sheetId) {
        await processSheet(sheetId, label);
      } else {
        console.warn(`⚠️ Sheet ID missing for ${label}`);
      }
    }
    console.log("\n🎉 All sheets processed successfully.");
  } catch (error) {
    console.error("❌ Global error:", error.message);
  }
};
