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
  await page.goto("https://login.live.com/", { waitUntil: "networkidle2" });
  console.log("1. Opened login.live.com");

  // Type email
  await page.waitForSelector('input[type="email"], #usernameEntry, #i0116', { timeout: 10000 });
  await page.type('input[type="email"], #usernameEntry, #i0116', email, { delay: 30 });
  console.log("2. Typed email:", email);

  // Press Enter
  console.log("3. Pressing Enter key...");
  await page.keyboard.press("Enter");
  await new Promise(r => setTimeout(r, 4000));

  // If issue looking up account, press enter or click next again
  let bodyCheck = await page.evaluate(() => document.body.innerText);
  if (bodyCheck.includes("issue looking up your account")) {
    console.log("Retrying next button click...");
    const btn = await page.$('#idSIButton9, button[type="submit"], button#nextButton');
    if (btn) await btn.click();
    await new Promise(r => setTimeout(r, 4000));
  }

  const inputsAfterEmail = await page.$$eval("input", els => els.map(e => ({ name: e.name, id: e.id, type: e.type })));
  console.log("4. Inputs after email:", inputsAfterEmail);

  // Check if password input is present
  const passSelector = 'input[type="password"], #passwordEntry, #i0118, input[name="passwd"]';
  await page.waitForSelector(passSelector, { timeout: 10000 }).catch(() => {});
  const passInput = await page.$(passSelector);

  if (passInput) {
    console.log("5. Found password input! Typing password...");
    await page.type(passSelector, password, { delay: 20 });
    const signinBtn = await page.$('button[type="submit"], #idSIButton9, button#signInButton, input[type="submit"]');
    if (signinBtn) {
      console.log("6. Clicking Sign in button...");
      await signinBtn.click();
    }
    await new Promise(r => setTimeout(r, 4000));
    console.log("7. URL after sign in:", page.url());
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("8. Body text sample:", bodyText.substring(0, 300));
    
    // Check buttons on privacy notice page
    const buttons = await page.$$eval("button, input[type='button'], input[type='submit'], a.btn", els => els.map(e => ({ text: e.innerText || e.value, id: e.id, class: e.className, type: e.type })));
    console.log("9. Buttons on page:", buttons);
    
    // Find the OK button or submit button
    const okBtn = await page.$('button.ms-Button--primary, button[type="button"], button#idSIButton9, button[type="submit"]');
    if (okBtn) {
      console.log("Clicking OK button on privacy notice...");
      await Promise.all([
        page.waitForNavigation({ timeout: 15000 }).catch(e => console.log("Nav timeout:", e.message)),
        okBtn.click()
      ]);
      console.log("URL after privacy OK click:", page.url());
    }

    // Now navigate to Outlook Mail
    console.log("Navigating to https://outlook.live.com/mail/0/ ...");
    await page.goto("https://outlook.live.com/mail/0/", { waitUntil: "networkidle2", timeout: 20000 }).catch(e => console.log("Outlook goto err:", e.message));
    console.log("Outlook Mail URL:", page.url());
    await new Promise(r => setTimeout(r, 6000));
    
    const extracted = await page.evaluate(() => {
      const selectors = [
        'div[role="option"]',
        'div[role="listbox"] > div',
        'div[data-convid]',
        '[aria-label*="unread"]',
        '[aria-label*="read"]',
        'div.customScrollBar > div > div'
      ];
      
      const res = {};
      for (const s of selectors) {
        const count = document.querySelectorAll(s).length;
        res[s] = count;
      }
      
      const rows = document.querySelectorAll('div[role="option"], div[role="listbox"] > div, div[data-convid]');
      const items = [];
      for (const row of Array.from(rows).slice(0, 10)) {
        const text = row.innerText || "";
        items.push(text);
      }
      return { counts: res, items };
    });
    console.log("Extracted result:", JSON.stringify(extracted, null, 2));
  } else {
    console.log("5. Password input NOT found!");
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("Body text:", bodyText.substring(0, 300));
  }

  await browser.close();
}

debugFlow("kkhzmm4e4pkqlwut@hotmail.com", "masuk12345");
