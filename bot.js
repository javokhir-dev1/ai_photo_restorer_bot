import { Telegraf } from "telegraf";
import { sequelize } from "./config/db.js"

import dotenv from "dotenv"
dotenv.config()

export const bot = new Telegraf(process.env.BOT_TOKEN, {
    telegram: {
        apiRoot: process.env.BOT_API_ROOT || "https://api.telegram.org",
        client: {
            timeout: 300
        }
    }
})
async function startbot() {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ alter: true })
        console.log("connected to database");

        bot.launch();
        console.log("bot started successfully")
    } catch (err) {
        console.log(err)
    }
}

startbot()