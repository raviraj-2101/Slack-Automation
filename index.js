const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const router = require("./routes/slack.route");
const configSPRoutes = require("./routes/configSp.route");


app.use(express.json());
app.use(cors());
app.use("/api", router);
app.use("/api/createConfig", configSPRoutes);

app.get("/", (req, res) => {
    res.send("🚀 Server is running successfully!");
});

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});
