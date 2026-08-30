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
    args: chromium.args,
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
        error: "Waktu login habis (Timeout). Coba kirim ulang beberapa saat lagi.",
      });
    }, 28000);
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
    await page.goto("https://login.live.com/login.srf", { waitUntil: "domcontentloaded", timeout: 15000 });

    // 2. Type email
    const emailSelector = 'input[type="email"], #usernameEntry, #i0116, input[name="loginfmt"]';
    await page.waitForSelector(emailSelector, { timeout: 8000 });
    await page.type(emailSelector, email, { delay: 20 });

    // Click Next
    const nextBtn = await page.$('button[type="submit"], #idSIButton9, button#nextButton, input[type="submit"]');
    if (nextBtn) {
      await nextBtn.click();
    }

    // 3. Wait for password field or username error
    const passSelector = 'input[type="password"], #passwordEntry, #i0118, input[name="passwd"]';
    try {
      await page.waitForSelector(passSelector, { timeout: 6000 });
    } catch {
      // Check username error
      const userErr = await safeEvaluate(page, () => {
        const el = document.querySelector('#usernameError, [role="alert"]');
        return el ? (el as HTMLElement).innerText || el.textContent : null;
      });
      if (userErr && userErr.trim().length > 0) {
        return { success: false, email, messages: [], error: `Email salah: ${userErr.trim()}` };
      }
      return { success: false, email, messages: [], error: "Form input password tidak ditemukan (Mungkin akun butuh verifikasi no HP / Checkpoint)." };
    }

    // 4. Type password
    await page.type(passSelector, pass, { delay: 20 });

    // Click Sign In
    const signinBtn = await page.$('button[type="submit"], #idSIButton9, button#signInButton, input[type="submit"]');
    if (signinBtn) {
      await signinBtn.click();
    }

    // Wait for navigation or error to appear
    await new Promise((r) => setTimeout(r, 2500));

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

    // 6. Handle "Stay signed in?" prompt (KMSI)
    try {
      const kmsiBtn = await page.$('#acceptButton, #declineButton, #idBtn_Back, #idSIButton9');
      if (kmsiBtn) {
        await kmsiBtn.click().catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch {
      // ignore
    }

    // Check again if redirected to security proofs / recovery email page after KMSI
    const postKmsiErr = await safeEvaluate(page, () => {
      const url = window.location.href;
      const body = document.body ? document.body.innerText || "" : "";
      if (
        url.includes("/proofs/") ||
        url.includes("proofs/Add") ||
        url.includes("account.live.com/proofs") ||
        body.includes("Mari lindungi akun Anda") ||
        body.includes("email pribadi agar Anda dapat kembali") ||
        body.includes("alamat email alternatif") ||
        body.includes("seseorang@example.com")
      ) {
        return "Akun disuruh memasukkan email pemulihan (Buka browser untuk menambahkan email pemulihan).";
      }
      return null;
    });

    if (postKmsiErr) {
      return { success: false, email, messages: [], error: postKmsiErr };
    }

    // 7. Navigate to Outlook Mailbox if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes("outlook.live.com")) {
      await page.goto("https://outlook.live.com/mail/0/", { waitUntil: "domcontentloaded", timeout: 12000 }).catch(() => {});
    }

    // Wait for email rows to load
    await page.waitForSelector('div[role="option"], div[role="listbox"] > div, div[data-convid]', { timeout: 6000 }).catch(() => {});

    // 8. Extract emails from Outlook Web interface
    const emails = await safeEvaluate(page, () => {
      const items: Array<{ subject: string; from: string; preview: string; dateStr: string }> = [];
      const rows = document.querySelectorAll('div[role="option"], div[role="listbox"] > div, div[data-convid]');

      for (const row of Array.from(rows).slice(0, 10)) {
        const text = (row as HTMLElement).innerText || "";
        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        if (lines.length >= 2) {
          items.push({
            from: lines[0] || "",
            subject: lines[1] || "",
            preview: lines.slice(2).join(" "),
            dateStr: new Date().toISOString(),
          });
        }
      }
      return items;
    });

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
