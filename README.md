# 🤖 Telegram Bot Outlook & Hotmail OTP Fetcher (Direct Email:Password)

Bot Telegram untuk membaca email dan mengambil kode OTP secara langsung dengan format **`email:password`** (tanpa perlu tautkan kode perangkat / device code), siap di-deploy ke **Vercel Serverless**.

---

## ⚡ Cara Penggunaan di Telegram

Anda cukup mengirim pesan ke Bot dengan salah satu format berikut:

```text
contoh@hotmail.com:password123
```
atau
```text
contoh@outlook.com|password123
```
atau
```text
/otp contoh@hotmail.com password123
```

**Balasan Bot:**
```text
✅ KODE OTP DITEMUKAN!
📬 Akun: contoh@hotmail.com

👤 Dari: TikTok (no-reply@tiktok.com)
🕒 21:05:10 WIB
📋 Subjek: Your verification code is 849201

🔑 KODE OTP: 849201 (klik untuk salin)
💬 "Gunakan kode 849201 untuk masuk ke akun Anda..."
```

---

## 🚀 Cara Setup & Deploy ke Vercel (Hanya 2 Menit)

### 1. Buat Bot di Telegram
1. Buka Telegram ➜ Cari **`@BotFather`** ➜ Kirim `/newbot`.
2. Dapatkan **`BOT_TOKEN`** (contoh: `7123456789:AAH...`).
3. Cari ID akun Telegram Anda di **`@userinfobot`** untuk mengisi **`ALLOWED_USER_IDS`** (agar bot Anda privat dan tidak bisa dipakai orang lain).

### 2. Deploy ke Vercel
1. Upload folder `telegram-bot` ke GitHub Anda.
2. Buka [vercel.com/new](https://vercel.com/new) dan import repository Anda.
3. Tambahkan 2 Environment Variables:
   - `BOT_TOKEN`: Token bot dari `@BotFather`
   - `ALLOWED_USER_IDS`: ID Telegram Anda
4. Klik **Deploy**.

### 3. Pasang Webhook Telegram
Setelah deploy di Vercel selesai, Anda akan mendapatkan URL (contoh: `https://bot-otp-anda.vercel.app`).

Buka URL ini di browser Anda:
```text
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<NAMA-DOMAIN-VERCEL-ANDA>/api/webhook
```

Selesai! Bot Anda sekarang sudah aktif 24 jam dan siap menerima `email:password` untuk mengeluarkan kode OTP.
