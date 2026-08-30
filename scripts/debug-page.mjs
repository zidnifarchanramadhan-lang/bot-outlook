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
  await page.goto("https://outlook.live.com/mail/0/", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector('div[data-convid], div[role="option"]', { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 4000));

  console.log("9. Outlook URL:", page.url());
  const rows = await page.$$eval('div[data-convid], div[role="option"]', els => els.map(e => e.innerText));
  console.log("10. Found rows count:", rows.length);
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    console.log(`--- Email ${i + 1} ---`);
    console.log(rows[i]);
  }

  await browser.close();
}

debugFlow("kkhzmm4e4pkqlwut@hotmail.com", "masuk12345");
