import { Bot, InlineKeyboard } from "grammy";
import { config as loadDotenv } from "dotenv";
import { fetchMailDirect } from "./direct-outlook.js";
import { fetchMailWithBrowser } from "./browser-outlook.js";
import { fetchRecentEmails, GraphConfig, getAccessToken } from "./graph.js";
import { extractOTP } from "./otp.js";

loadDotenv();

const token = process.env.BOT_TOKEN || "";
if (!token) {
  console.warn("PERINGATAN: BOT_TOKEN belum disetel di environment variables.");
}

export const bot = new Bot(token);

// Middleware: Check allowed Telegram User IDs
bot.use(async (ctx, next) => {
  const allowedIdsStr = process.env.ALLOWED_USER_IDS;
  if (allowedIdsStr && ctx.from) {
    const allowedIds = allowedIdsStr
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    const senderId = String(ctx.from.id);
    if (allowedIds.length > 0 && !allowedIds.includes(senderId)) {
      await ctx.reply(
        `⛔ <b>Akses Ditolak!</b>\n\nBot ini diproteksi secara privat.\nID Telegram Anda: <code>${senderId}</code>\n\nTambahkan ID Anda ke environment variable <code>ALLOWED_USER_IDS</code> untuk mengizinkan akses.`,
        { parse_mode: "HTML" }
      );
      return;
    }
  }
  await next();
});

// Helper: Parse credentials from string (e.g. email:pass, email|pass, or email pass)
function parseCredentials(input: string): { email: string; pass: string } | null {
  const trimmed = input.trim();

  // Pattern 1: email:password or email|password or email----password
  const separatorMatch = trimmed.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[:|\s\-–—]+(.+)$/);
  if (separatorMatch) {
    return {
      email: separatorMatch[1].trim(),
      pass: separatorMatch[2].trim(),
    };
  }

  return null;
}

// Command: /start & /help
bot.command(["start", "help"], async (ctx) => {
  const welcomeText =
    `👋 <b>Halo! Selamat datang di Bot Ambil OTP Outlook / Hotmail.</b>\n\n` +
    `⚡ <b>CARA PENGGUNAAN SANGAT MUDAH (Tanpa Tautkan Kode):</b>\n\n` +
    `Cukup kirim format <b>email:password</b> langsung ke chat ini:\n` +
    `👉 <code>contoh@hotmail.com:passwordmu</code>\n` +
    `👉 <code>contoh@outlook.com|passwordmu</code>\n\n` +
    `Atau gunakan perintah:\n` +
    `• <code>/otp email@hotmail.com passwordmu</code>\n` +
    `• <code>/mail email@hotmail.com passwordmu</code> (lihat daftar email lengkap)\n\n` +
    `<i>Bot akan langsung login otomatis dan mengirimkan kode OTP terbaru Anda!</i>`;

  await ctx.reply(welcomeText, { parse_mode: "HTML" });
});

// Direct Handler: When user sends email:pass or /otp email pass
async function handleDirectMailCheck(ctx: any, email: string, pass: string) {
  const waitMsg = await ctx.reply(
    `⏳ <i>Sedang membuka browser & login ke <b>${escapeHTML(email)}</b>...</i>`,
    { parse_mode: "HTML" }
  );

  try {
    let result = await fetchMailWithBrowser(email, pass);
    if (!result.success && !result.error?.includes("Password") && !result.error?.includes("salah")) {
      // Fallback to direct HTTP fetcher
      const fallbackResult = await fetchMailDirect(email, pass);
      if (fallbackResult.success) {
        result = fallbackResult;
      }
    }

    if (!result.success) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        waitMsg.message_id,
        `❌ <b>Gagal membaca email:</b>\n<code>${escapeHTML(result.error || "Gagal login")}</code>\n\n` +
          `<i>Pastikan email dan password benar, dan akun tidak sedang terkunci.</i>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    if (result.messages.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        waitMsg.message_id,
        `📭 <b>Login Berhasil</b>, tetapi tidak ada email yang ditemukan dalam kotak masuk/spam akun <code>${escapeHTML(email)}</code>.`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // Format results
    const cards: string[] = [];
    let otpCount = 0;

    for (const msg of result.messages.slice(0, 3)) {
      const timeStr = msg.date.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
      const sender = msg.fromName ? `${msg.fromName} (${msg.fromAddress})` : msg.fromAddress;

      let card = `👤 <b>Dari:</b> ${escapeHTML(sender)}\n`;
      card += `🕒 <code>${timeStr} WIB</code>\n`;
      card += `📋 <b>Subjek:</b> ${escapeHTML(msg.subject)}\n`;

      if (msg.otpResult) {
        otpCount++;
        card += `\n🔑 <b>KODE OTP:</b> <code>${msg.otpResult.code}</code> <i>(klik untuk salin)</i>\n`;
      }

      if (msg.bodyPreview) {
        const previewShort =
          msg.bodyPreview.length > 180
            ? msg.bodyPreview.substring(0, 180) + "..."
            : msg.bodyPreview;
        card += `💬 <i>"${escapeHTML(previewShort)}"</i>\n`;
      }

      cards.push(card);
    }

    const header =
      otpCount > 0
        ? `✅ <b>KODE OTP DITEMUKAN!</b>\n📬 Akun: <code>${escapeHTML(email)}</code>\n\n`
        : `📬 <b>Email Terbaru:</b> (Akun: <code>${escapeHTML(email)}</code>)\n\n`;

    const finalResponse = header + cards.join("\n━━━━━━━━━━━━━━━━━━━━\n\n");

    await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, finalResponse, {
      parse_mode: "HTML",
    });
  } catch (err: any) {
    console.error("Error in handleDirectMailCheck:", err);
    await ctx.api.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      `❌ <b>Terjadi kesalahan:</b>\n<code>${escapeHTML(err.message || String(err))}</code>`,
      { parse_mode: "HTML" }
    );
  }
}

// Command: /otp
bot.command(["otp", "kode"], async (ctx) => {
  const text = ctx.message?.text || "";
  const rawParams = text.replace(/^\/(?:otp|kode)\s*/i, "").trim();

  const creds = parseCredentials(rawParams);
  if (creds) {
    await handleDirectMailCheck(ctx, creds.email, creds.pass);
    return;
  }

  // Fallback: If no credentials provided in message, check if environment variables exist
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_REFRESH_TOKEN) {
    await handleOAuthOTP(ctx, rawParams);
    return;
  }

  await ctx.reply(
    `ℹ️ <b>Format Perintah /otp:</b>\n\n` +
      `Kirim perintah beserta email dan password:\n` +
      `<code>/otp email@hotmail.com passwordmu</code>\n\n` +
      `Atau kirim langsung tanpa perintah:\n` +
      `<code>email@hotmail.com:passwordmu</code>`,
    { parse_mode: "HTML" }
  );
});

// Command: /mail
bot.command("mail", async (ctx) => {
  const text = ctx.message?.text || "";
  const rawParams = text.replace(/^\/mail\s*/i, "").trim();

  const creds = parseCredentials(rawParams);
  if (creds) {
    await handleDirectMailCheck(ctx, creds.email, creds.pass);
    return;
  }

  await ctx.reply(
    `ℹ️ <b>Format Perintah /mail:</b>\n\n` +
      `<code>/mail email@hotmail.com passwordmu</code>`,
    { parse_mode: "HTML" }
  );
});

// Listener: Catch direct messages like "user@hotmail.com:pass123" or "user@outlook.com|pass123"
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return; // Ignore commands handled above

  const creds = parseCredentials(text);
  if (creds) {
    await handleDirectMailCheck(ctx, creds.email, creds.pass);
  } else if (text.includes("@")) {
    await ctx.reply(
      `⚠️ Format tidak dikenali. Silakan kirim dengan format:\n<code>email:password</code>\n\nContoh:\n<code>akun@hotmail.com:sandi123</code>`,
      { parse_mode: "HTML" }
    );
  }
});

// Handler for OAuth fallback (if configured via env)
async function handleOAuthOTP(ctx: any, query?: string) {
  const waitMsg = await ctx.reply("⏳ <i>Sedang memeriksa folder Inbox & Spam...</i>", {
    parse_mode: "HTML",
  });

  try {
    const config: GraphConfig = {
      clientId: process.env.MICROSOFT_CLIENT_ID || "",
      refreshToken: process.env.MICROSOFT_REFRESH_TOKEN || "",
      tenantId: process.env.MICROSOFT_TENANT_ID || "consumers",
    };

    const emails = await fetchRecentEmails(config, 6);
    if (!emails || emails.length === 0) {
      await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, "📭 Tidak ada email ditemukan.");
      return;
    }

    let filtered = emails;
    if (query) {
      const q = query.toLowerCase();
      filtered = emails.filter(
        (e) =>
          e.fromAddress.toLowerCase().includes(q) ||
          e.fromName.toLowerCase().includes(q) ||
          e.subject.toLowerCase().includes(q) ||
          e.bodyPreview.toLowerCase().includes(q)
      );
    }

    const cards: string[] = [];
    let otpCount = 0;

    for (const email of filtered.slice(0, 3)) {
      const otp = extractOTP(email.subject, email.bodyPreview);
      const timeStr = email.date.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
      const sender = email.fromName ? `${email.fromName} (${email.fromAddress})` : email.fromAddress;

      let msg = `📬 <b>[${email.folder}]</b> ${escapeHTML(sender)}\n`;
      msg += `🕒 <code>${timeStr} WIB</code>\n`;
      msg += `📋 <b>Subjek:</b> ${escapeHTML(email.subject)}\n`;

      if (otp) {
        otpCount++;
        msg += `\n🔑 <b>KODE OTP:</b> <code>${otp.code}</code> <i>(klik untuk salin)</i>\n`;
      }
      if (email.bodyPreview) {
        msg += `💬 <i>"${escapeHTML(email.bodyPreview.substring(0, 180))}"</i>\n`;
      }
      cards.push(msg);
    }

    const header = otpCount > 0 ? `✅ <b>KODE OTP DITEMUKAN:</b>\n\n` : `📬 <b>Email Terbaru:</b>\n\n`;
    await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, header + cards.join("\n━━━━━━━━━━━━━━━━━━━━\n\n"), {
      parse_mode: "HTML",
    });
  } catch (err: any) {
    await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, `❌ Error: ${escapeHTML(err.message)}`);
  }
}

// Helper: Escape HTML special characters for Telegram
function escapeHTML(text: string): string {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
