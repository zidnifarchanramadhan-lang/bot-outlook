import { webhookCallback } from "grammy";
import { bot } from "../src/bot.js";

// Vercel Serverless function handler
export default webhookCallback(bot, "http");

