import puppeteer, { Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from "fs";
import { extractOTP, OTPExtractionResult } from "./otp.js";

export interface DirectEmailItem {
  id: string;
  folder: string;
  subject: string;
  bodyPreview: string;
  fromName: string;
  fromAddress: string;
  date: Date;
  otpResult?: OTPExtractionResult | null;
}

export interface FetchResult {
  success: boolean;
  email: string;
  messages: DirectEmailItem[];
  error?: string;
}

const LOCAL_CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

function getLocalBrowserPath(): string | null {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  for (const p of LOCAL_CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function launchBrowser(): Promise<Browser> {
  const localPath = getLocalBrowserPath();

  // If local Chrome or Edge exists (Local PC Dev), use it
  if (localPath && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    return puppeteer.launch({
      executablePath: localPath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280,800",
      ],
    });
  }

  // Otherwise, use @sparticuz/chromium for Vercel Serverless
  return puppeteer.launch({
    args: [
      ...chromium.args,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
    ],
    defaultViewport: { width: 1280, height: 800 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

export async function fetchMailWithBrowser(email: string, pass: string): Promise<FetchResult> {
  const cleanEmail = email.trim();
  const cleanPass = pass.trim();

  const timeoutPromise = new Promise<FetchResult>((resolve) => {
    setTimeout(() => {
      resolve({
        success: false,
        email: cleanEmail,
        messages: [],
        error: "Waktu login habis (Timeout). Server sedang lambat, coba ulangi beberapa saat lagi.",
      });
    }, 50000);
  });

  return Promise.race([runBrowserTask(cleanEmail, cleanPass), timeoutPromise]);
}

async function safeEvaluate<T>(page: any, fn: () => T, retries = 3): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      return await page.evaluate(fn);
    } catch (e: any) {
      if (e.message?.includes("Execution context was destroyed") || e.message?.includes("Target closed") || e.message?.includes("navigating")) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function runBrowserTask(email: string, pass: string): Promise<FetchResult> {
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    // 1. Go to Microsoft Login
    await page.goto("https://login.live.com/", { waitUntil: "domcontentloaded", timeout: 15000 });

    // 2. Type email
    const emailSelector = 'input[type="email"], #usernameEntry, #i0116, input[name="loginfmt"]';
    await page.waitForSelector(emailSelector, { timeout: 10000 });
    await page.type(emailSelector, email, { delay: 25 });

    // Press Enter to submit email
    await page.keyboard.press("Enter");

    // 3. Wait for password field or username error
    const passSelector = 'input[type="password"], #passwordEntry, #i0118, input[name="passwd"]';
    try {
      await page.waitForSelector(passSelector, { timeout: 9000 });
    } catch {
      // Check username error - element-based
      const userErr = await safeEvaluate(page, () => {
        const el = document.querySelector('#usernameError, [role="alert"]');
        if (el) {
          const txt = (el as HTMLElement).innerText || el.textContent || "";
          if (txt.trim().length > 0) return txt.trim();
        }
        const body = document.body ? document.body.innerText || "" : "";
        if (body.includes("doesn't exist") || body.includes("tidak ada") || body.includes("That Microsoft account doesn")) {
          return "Akun Microsoft tidak ditemukan.";
        }
        if (body.includes("sign in too many") || body.includes("terlalu banyak")) {
          return "Terlalu banyak percobaan login. Akun dibatasi sementara oleh Microsoft.";
        }
        return null;
      });
      if (userErr && userErr.trim().length > 0) {
        return { success: false, email, messages: [], error: userErr.trim() };
      }
      return { success: false, email, messages: [], error: "Form input password tidak ditemukan (Mungkin akun butuh verifikasi no HP / Checkpoint)." };
    }

    // 4. Type password
    await page.type(passSelector, pass, { delay: 25 });

    // Click Sign In or press Enter
    const signinBtn = await page.$('button[type="submit"], #idSIButton9, button#signInButton, input[type="submit"]');
    if (signinBtn) {
      await signinBtn.click().catch(() => {});
    } else {
      await page.keyboard.press("Enter");
    }

    // Wait for navigation or interrupt/error to appear
    await new Promise((r) => setTimeout(r, 4000));

    // 5. Check for password / checkpoint errors
    const passErr = await safeEvaluate(page, () => {
      const el = document.querySelector('#passwordError, #i0118Error, [role="alert"]');
      if (el && el.textContent && el.textContent.trim().length > 0) {
        return el.textContent.trim();
      }
      const body = document.body ? document.body.innerText || "" : "";
      if (
        body.includes("password is incorrect") ||
        body.includes("Kata sandi salah") ||
        body.includes("That password is incorrect") ||
        body.includes("That password is not correct")
      ) {
        return "Password salah. Periksa kembali password akun Anda.";
      }
      if (
        body.includes("tried to sign in too many times") ||
        body.includes("too many times with an incorrect account") ||
        body.includes("terlalu banyak percobaan")
      ) {
        return "Terlalu banyak percobaan login gagal. Akun dibatasi sementara oleh Microsoft.";
      }
      if (
        body.includes("Password sign-in isn't available") ||
        body.includes("sign-in isn't available") ||
        body.includes("Masuk dengan kata sandi tidak tersedia")
      ) {
        return "Login dengan password tidak tersedia untuk akun ini (Perlu login manual di browser / Verifikasi keamanan).";
      }
      if (
        window.location.href.includes("/proofs/") ||
        window.location.href.includes("proofs/Add") ||
        window.location.href.includes("account.live.com/proofs") ||
        body.includes("Mari lindungi akun Anda") ||
        body.includes("email pribadi agar Anda dapat kembali") ||
        body.includes("alamat email alternatif") ||
        body.includes("seseorang@example.com")
      ) {
        return "Akun disuruh memasukkan email pemulihan (Buka browser untuk menambahkan email pemulihan).";
      }
      if (
        body.includes("Help us protect your account") ||
        body.includes("account has been locked") ||
        body.includes("Akun Anda telah dikunci") ||
        body.includes("Bantu kami melindungi akun Anda") ||
        body.includes("Verifikasi")
      ) {
        return "Akun terkunci / butuh verifikasi nomor HP dari Microsoft (Checkpoint/Locked).";
      }
      if (
        body.includes("Approve a request") ||
        body.includes("Two-step verification") ||
        body.includes("Ketik kode") ||
        body.includes("Microsoft Authenticator")
      ) {
        return "Akun memerlukan Verifikasi 2 Langkah (2FA / Authenticator).";
      }
      return null;
    });

    if (passErr) {
      return { success: false, email, messages: [], error: passErr };
    }

    // 6. Handle Interrupts (Passkey / KMSI / Privacy Notice / Security Prompts)
    try {
      const skipBtn = await page.$('#iCancel, #iSelectProofAction, a#iCancel, button#iCancel, input#iCancel, button#declineButton, a[href*="cancel"]');
      if (skipBtn) {
        await skipBtn.click().catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));
      }

      const promptBtn = await page.$('button.ms-Button--primary, #acceptButton, #declineButton, #idSIButton9, button[type="submit"]');
      if (promptBtn) {
        await promptBtn.click().catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch {
      // ignore
    }

    // 7. Navigate directly to Outlook Mailbox
    await page.goto("https://outlook.live.com/mail/0/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));

    // If redirected back to login or interrupt, click any lingering prompt button
    if (page.url().includes("login.live.com") || page.url().includes("account.live.com") || page.url().includes("privacynotice")) {
      const lingeringBtn = await page.$('button.ms-Button--primary, #acceptButton, #declineButton, #idSIButton9, #iCancel, a#iCancel, button[type="submit"]');
      if (lingeringBtn) {
        await lingeringBtn.click().catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));
      }
      await page.goto("https://outlook.live.com/mail/0/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Check if Outlook crashed with "Something went wrong / Refresh application / BootResult: fail"
    const needsRefresh = await safeEvaluate(page, () => {
      const body = document.body ? document.body.innerText || "" : "";
      return body.includes("Something went wrong") || body.includes("Refresh the application") || body.includes("BootResult: fail");
    });

    if (needsRefresh) {
      console.log("[Browser] Found 'Something went wrong' on Outlook! Clicking Refresh or reloading...");
      const refreshBtn = await page.$('button#refreshButton, a[role="button"], a.ms-Link');
      if (refreshBtn) {
        await refreshBtn.click().catch(() => {});
      } else {
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 4000));
    }

    // Wait for email list to render
    await page.waitForSelector('div[data-convid], div[role="option"], [aria-label*="unread"], [aria-label*="read"]', { timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 4000));

    // 8. Extract emails from Outlook Web interface
    const emails = await safeEvaluate(page, () => {
      const items: Array<{ subject: string; from: string; preview: string; dateStr: string }> = [];
      const rows = document.querySelectorAll('div[data-convid], div[role="option"]');

      if (rows && rows.length > 0) {
        for (const row of Array.from(rows).slice(0, 10)) {
          const text = (row as HTMLElement).innerText || "";
          const lines = text
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

          if (lines.length >= 2) {
            // If first line is a single character (avatar initial letter like "C"), skip it
            let startIdx = 0;
            if (lines[0].length === 1 && lines.length >= 3) {
              startIdx = 1;
            }

            const from = lines[startIdx] || "";
            const subject = lines[startIdx + 1] || "";
            const preview = lines.slice(startIdx + 2).join(" ");

            items.push({
              from,
              subject,
              preview,
              dateStr: new Date().toISOString(),
            });
          }
        }
      }

      // Resilient fallback: If DOM rows was empty, scan document body text for email/OTP blocks
      if (items.length === 0) {
        const body = document.body ? document.body.innerText || "" : "";
        const lines = body.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (
            line.toLowerCase().includes("kode") ||
            line.toLowerCase().includes("code") ||
            line.toLowerCase().includes("verifikasi") ||
            line.toLowerCase().includes("verification") ||
            line.toLowerCase().includes("chatgpt") ||
            line.toLowerCase().includes("canva") ||
            line.toLowerCase().includes("tiktok") ||
            line.toLowerCase().includes("google") ||
            line.toLowerCase().includes("discord") ||
            line.toLowerCase().includes("password") ||
            line.toLowerCase().includes("sandi")
          ) {
            items.push({
              from: lines[Math.max(0, i - 1)] || "Outlook Mail",
              subject: line,
              preview: lines.slice(i, i + 3).join(" "),
              dateStr: new Date().toISOString(),
            });
            i += 2; // skip next couple lines to prevent duplicate chunks
          }
        }
      }

      return items;
    });

    console.log("[Browser] Current URL before extract:", page.url());
    const bodySample = await safeEvaluate(page, () => (document.body ? document.body.innerText.substring(0, 300) : "no-body"));
    console.log("[Browser] Body sample:", bodySample);
    console.log("[Browser] Extracted emails count:", emails ? emails.length : 0);

    const parsedItems: DirectEmailItem[] = (emails || []).map((item) => {
      const otp = extractOTP(item.subject, item.preview);
      return {
        id: Math.random().toString(),
        folder: "Inbox",
        subject: item.subject || "(Tanpa Subjek)",
        bodyPreview: item.preview || "",
        fromName: item.from,
        fromAddress: item.from,
        date: new Date(),
        otpResult: otp,
      };
    });

    return {
      success: true,
      email,
      messages: parsedItems,
    };
  } catch (err: any) {
    return {
      success: false,
      email,
      messages: [],
      error: err.message || String(err),
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
