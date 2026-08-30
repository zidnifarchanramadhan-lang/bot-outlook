import puppeteer from "puppeteer-core";
import fs from "fs";

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

function getBrowserPath() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function debugFlow(email, password) {
  const executablePath = getBrowserPath();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.goto("https://login.live.com/", { waitUntil: "domcontentloaded" });
  console.log("1. Opened login.live.com");

  // Type email
  const emailSelector = 'input[type="email"], #usernameEntry, #i0116, input[name="loginfmt"]';
  await page.waitForSelector(emailSelector, { timeout: 10000 });
  await page.type(emailSelector, email, { delay: 25 });
  console.log("2. Typed email:", email);

  // Press Enter
  console.log("3. Pressing Enter...");
  await page.keyboard.press("Enter");

  // Password
  const passSelector = 'input[type="password"], #passwordEntry, #i0118, input[name="passwd"]';
  await page.waitForSelector(passSelector, { timeout: 10000 });
  await page.type(passSelector, password, { delay: 25 });
  console.log("4. Typed password.");

  // Sign In
  const signinBtn = await page.$('button[type="submit"], #idSIButton9, button#signInButton, input[type="submit"]');
  if (signinBtn) {
    console.log("5. Clicking Sign in...");
    await signinBtn.click();
  } else {
    await page.keyboard.press("Enter");
  }

  await new Promise(r => setTimeout(r, 4000));
  console.log("6. URL after sign in:", page.url());

  // Handle Passkey interrupt / KMSI / Privacy Notice / Security interrupts
  try {
    const interruptText = await page.evaluate(() => document.body.innerText).catch(() => "");
    console.log("Body sample:", interruptText.substring(0, 300));

    // Check for Cancel / Skip / No thanks / Next buttons
    const skipBtn = await page.$('#iCancel, #iSelectProofAction, a#iCancel, button#iCancel, input#iCancel, button#declineButton, a[href*="cancel"]');
    if (skipBtn) {
      console.log("Found Skip/Cancel button on interrupt page! Clicking...");
      await skipBtn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
    }

    const promptBtn = await page.$('button.ms-Button--primary, #acceptButton, #declineButton, #idSIButton9, button[type="submit"]');
    if (promptBtn) {
      console.log("Found Submit/OK button on interrupt page! Clicking...");
      await promptBtn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
    }
  } catch (e) {
    console.log("Interrupt handling err:", e.message);
  }

  // Go to Outlook
  console.log("8. Navigating to Outlook Mail...");
  await page.goto("https://outlook.live.com/mail/0/", { waitUntil: "domcontentloaded", timeout: 25000 });
  await new Promise(r => setTimeout(r, 2000));

  // Check if Outlook crashed with "Something went wrong / Refresh application"
  const needsRefresh = await page.evaluate(() => {
    const body = document.body ? document.body.innerText || "" : "";
    return body.includes("Something went wrong") || body.includes("Refresh the application") || body.includes("BootResult: fail");
  });

  if (needsRefresh) {
    console.log("Found 'Something went wrong' on Outlook! Clicking Refresh or reloading...");
    const refreshBtn = await page.$('button#refreshButton, a[role="button"], a.ms-Link');
    if (refreshBtn) {
      await refreshBtn.click().catch(() => {});
    } else {
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 4000));
  }

  await page.waitForSelector('div[data-convid], div[role="option"], [aria-label*="unread"], [aria-label*="read"]', { timeout: 16000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 4000));

  console.log("9. Outlook URL:", page.url());
  const extracted = await page.evaluate(() => {
    const items = [];
    const rows = document.querySelectorAll('div[data-convid], div[role="option"]');
    
    // Check if rows found
    if (rows && rows.length > 0) {
      for (const row of Array.from(rows).slice(0, 10)) {
        const text = (row.innerText || "").trim();
        if (text.length > 10) {
          items.push(text);
        }
      }
    }
    
    // Fallback: parse from body text if rows selector returned nothing
    if (items.length === 0) {
      const fullText = document.body ? document.body.innerText || "" : "";
      items.push("FALLBACK_BODY: " + fullText.substring(0, 500));
    }
    
    return items;
  });

  console.log("Extracted items count:", extracted.length);
  for (let i = 0; i < extracted.length; i++) {
    console.log(`[Item ${i + 1}]`, extracted[i].substring(0, 100));
  }

  await browser.close();
}

debugFlow("kkhzmm4e4pkqlwut@hotmail.com", "masuk12345");
