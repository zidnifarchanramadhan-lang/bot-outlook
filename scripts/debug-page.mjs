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
  await page.type('input[type="email"], #usernameEntry, #i0116', email, { delay: 20 });
  console.log("2. Typed email:", email);

  // Click next button
  const nextBtn = await page.$('button[type="submit"], #idSIButton9, button#nextButton, input[type="submit"]');
  if (nextBtn) {
    console.log("3. Clicking Next button...");
    await nextBtn.click();
  }

  await new Promise(r => setTimeout(r, 2000));
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
  } else {
    console.log("5. Password input NOT found!");
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("Body text:", bodyText.substring(0, 300));
  }

  await browser.close();
}

debugFlow("ncvdrwhxt3z@hotmail.com", "masuk12345");
