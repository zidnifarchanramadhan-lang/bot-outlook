import puppeteer from "puppeteer-core";
import fs from "fs";

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function getBrowserPath() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function testBrowserLogin(email, password) {
  const executablePath = getBrowserPath();
  console.log("Using browser at:", executablePath);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1280,800"
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

    console.log("Navigating to login.live.com...");
    await page.goto("https://login.live.com/login.srf", { waitUntil: "networkidle2", timeout: 30000 });

    // Enter email
    console.log("Waiting for email input...");
    await page.waitForSelector('input[name="loginfmt"], #i0116', { timeout: 10000 });
    await page.type('input[name="loginfmt"], #i0116', email, { delay: 30 });
    await page.click('#idSIButton9');

    // Wait for password input or error
    console.log("Waiting for password input or error...");
    try {
      await page.waitForSelector('input[name="passwd"], #i0118', { timeout: 8000 });
    } catch (e) {
      // Check if username error
      const userErr = await page.$eval('#usernameError', el => el.innerText).catch(() => null);
      if (userErr) {
        console.log("Username error:", userErr);
        return { success: false, error: userErr };
      }
      console.log("Form input password tidak ditemukan!");
      return { success: false, error: "Form input password tidak ditemukan (Mungkin butuh checkpoint / verifikasi)." };
    }

    console.log("Typing password...");
    await page.type('input[name="passwd"], #i0118', password, { delay: 30 });
    await new Promise(r => setTimeout(r, 500));
    await page.click('#idSIButton9');

    // Wait for response (error or stay signed in or redirect to outlook)
    console.log("Waiting for navigation or error...");
    await new Promise(r => setTimeout(r, 3000));

    // Check for password error
    const passErr = await page.$eval('#passwordError, #i0118Error', el => el.innerText).catch(() => null);
    if (passErr) {
      console.log("Password error:", passErr);
      return { success: false, error: passErr };
    }

    // Check if "Stay signed in?" prompt is shown
    const kmsiButton = await page.$('#acceptButton, #declineButton, #idBtn_Back, #idSIButton9');
    if (kmsiButton) {
      console.log("Handling 'Stay signed in' prompt...");
      await kmsiButton.click().catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log("Current URL:", page.url());

    // Navigate to Outlook Mail if not yet there
    if (!page.url().includes("outlook.live.com")) {
      console.log("Navigating to outlook.live.com/mail/0/...");
      await page.goto("https://outlook.live.com/mail/0/", { waitUntil: "networkidle2", timeout: 30000 });
    }

    console.log("Final URL:", page.url());
    const pageTitle = await page.title();
    console.log("Page title:", pageTitle);

    return { success: true, url: page.url() };
  } catch (err) {
    console.error("Test error:", err);
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

testBrowserLogin("b1ze7f9svkpgz6p@hotmail.com", "D066u5d*5w");
