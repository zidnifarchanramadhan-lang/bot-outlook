import puppeteer, { Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from "fs";
import { extractOTP, OTPExtractionResult } from "./otp";

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

  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    // 1. Go to Microsoft Login
    await page.goto("https://login.live.com/", { waitUntil: "networkidle2", timeout: 25000 });

    // 2. Type email
    const emailSelector = 'input[type="email"], #usernameEntry, #i0116, input[name="loginfmt"]';
    await page.waitForSelector(emailSelector, { timeout: 10000 });
    await page.type(emailSelector, cleanEmail, { delay: 20 });

    // Click Next
    const nextBtn = await page.$('button[type="submit"], #idSIButton9, button#nextButton, input[type="submit"]');
    if (nextBtn) {
      await nextBtn.click();
    }

    await new Promise(r => setTimeout(r, 1500));

    // 3. Wait for password field or username error
    const passSelector = 'input[type="password"], #passwordEntry, #i0118, input[name="passwd"]';
    try {
      await page.waitForSelector(passSelector, { timeout: 8000 });
    } catch {
      // Check username error
      const userErr = await page.$eval('#usernameError, [role="alert"]', (el) => (el as HTMLElement).innerText || el.textContent || "").catch(() => null);
      if (userErr) {
        return { success: false, email: cleanEmail, messages: [], error: `Email salah: ${userErr}` };
      }
      return { success: false, email: cleanEmail, messages: [], error: "Form input password tidak ditemukan (Mungkin akun butuh verifikasi no HP / Checkpoint)." };
    }

    // 4. Type password
    await page.type(passSelector, cleanPass, { delay: 20 });
    await new Promise(r => setTimeout(r, 500));

    // Click Sign In
    const signinBtn = await page.$('button[type="submit"], #idSIButton9, button#signInButton, input[type="submit"]');
    if (signinBtn) {
      await signinBtn.click();
    }

    await new Promise(r => setTimeout(r, 3000));

    // 5. Check for password errors
    const passErr = await page.evaluate(() => {
      const el = document.querySelector('#passwordError, #i0118Error, [role="alert"]');
      if (el && el.textContent) return el.textContent.trim();
      const body = document.body.innerText;
      if (body.includes("password is incorrect") || body.includes("Kata sandi salah") || body.includes("That password is incorrect")) {
        return "Password salah. Periksa kembali password akun Anda.";
      }
      if (body.includes("Help us protect your account") || body.includes("account has been locked") || body.includes("Verifikasi")) {
        return "Akun terkunci / butuh verifikasi nomor HP dari Microsoft (Checkpoint).";
      }
      return null;
    });

    if (passErr) {
      return { success: false, email: cleanEmail, messages: [], error: passErr };
    }

    // 6. Handle "Stay signed in?" prompt
    const kmsiBtn = await page.$('#acceptButton, #declineButton, #idBtn_Back, #idSIButton9');
    if (kmsiBtn) {
      await kmsiBtn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
    }

    // 7. Navigate to Outlook Mailbox if not already there
    if (!page.url().includes("outlook.live.com")) {
      await page.goto("https://outlook.live.com/mail/0/", { waitUntil: "networkidle2", timeout: 30000 });
    }

    await new Promise(r => setTimeout(r, 4000));

    // 8. Extract emails from Outlook Web interface
    const emails = await page.evaluate(() => {
      const items: Array<{ subject: string; from: string; preview: string; dateStr: string }> = [];
      
      // Select conversation / message list items in OWA
      const rows = document.querySelectorAll('div[role="option"], div[role="listbox"] > div, div[data-convid]');
      
      for (const row of Array.from(rows).slice(0, 5)) {
        const text = (row as HTMLElement).innerText || "";
        const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length >= 2) {
          items.push({
            from: lines[0] || "",
            subject: lines[1] || "",
            preview: lines.slice(2).join(" "),
            dateStr: new Date().toISOString()
          });
        }
      }
      return items;
    });

    const parsedItems: DirectEmailItem[] = emails.map(item => {
      const otp = extractOTP(item.subject, item.preview);
      return {
        id: Math.random().toString(),
        folder: "Inbox",
        subject: item.subject || "(Tanpa Subjek)",
        bodyPreview: item.preview || "",
        fromName: item.from,
        fromAddress: item.from,
        date: new Date(),
        otpResult: otp
      };
    });

    return {
      success: true,
      email: cleanEmail,
      messages: parsedItems
    };
  } catch (err: any) {
    return {
      success: false,
      email: cleanEmail,
      messages: [],
      error: err.message || String(err)
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
