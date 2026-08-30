import { webhookCallback } from "grammy";
import { bot } from "../src/bot.js";

// Vercel Serverless function handler with extended timeout for browser automation
export default webhookCallback(bot, "http", {
  onTimeout: "return",
  timeoutMilliseconds: 58000,
});


