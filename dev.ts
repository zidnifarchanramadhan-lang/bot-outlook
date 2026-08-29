import http from "http";
import { bot } from "./src/bot.js";

// Healthcheck HTTP server on port 7860 for Hugging Face Spaces
const port = process.env.PORT || 7860;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>🤖 Telegram Bot Outlook OTP is Running 24/7 on Hugging Face!</h1>");
  })
  .listen(port, () => {
    console.log(`🌐 Healthcheck server listening on port ${port}`);
  });

console.log("🚀 Menjalankan bot Telegram dalam mode Long Polling...");
console.log("Tekan Ctrl+C untuk menghentikan.\n");

bot
  .start({
    onStart(botInfo) {
      console.log(`✅ Bot berhasil berjalan sebagai @${botInfo.username}`);
    },
  })
  .catch((err) => {
    console.error("❌ Terjadi error pada bot:", err);
  });
