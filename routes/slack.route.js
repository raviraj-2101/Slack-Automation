const cron = require("node-cron");
const express = require("express");
const { sendSlackMessage } = require("../controller/slack.controller");
const router = express.Router();

cron.schedule("0 5 * * *", async () => {
  try {
    console.log({
      message: `sendSlackMessage started`,
      log_type: "info",
      time: new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" })
    });

    await sendSlackMessage();
  } catch (error) {
    console.log({
      message: `Main Catch Error: ${JSON.stringify(error)}`,
      log_type: "error",
      time: new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" })
    });
  }
},
{
  scheduled: true,
  timezone: "Europe/Berlin"
}
);

router.get("/send", sendSlackMessage);

module.exports = router;
