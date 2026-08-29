import { bot } from "./src/bot.js";

console.log("🚀 Menjalankan bot Telegram dalam mode Long Polling (Local Dev)...");
console.log("Tekan Ctrl+C untuk menghentikan.\n");

bot.start({
  onStart(botInfo) {
    console.log(`✅ Bot berhasil berjalan sebagai @${botInfo.username}`);
  },
}).catch((err) => {
  console.error("❌ Terjadi error pada bot:", err);
});
