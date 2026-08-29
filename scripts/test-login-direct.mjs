/**
 * Test ROPC and OWA direct authentication for Outlook / Hotmail
 */

async function testROPC(email, password, clientId) {
  console.log(`\nTesting ROPC for ${email} with client ${clientId}...`);
  try {
    const res = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "password",
        username: email,
        password: password,
        scope: "offline_access Mail.Read User.Read",
      }),
    });
    const data = await res.json();
    console.log("ROPC Response:", res.status, data);
    return data;
  } catch (err) {
    console.error("ROPC Error:", err);
  }
}

async function testLiveWebLogin(email, password) {
  console.log(`\nTesting Live.com Web Login simulation for ${email}...`);
  try {
    // 1. Get login page to extract PPFT and cookie
    const getRes = await fetch("https://login.live.com/login.srf", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const cookies = getRes.headers.getSetCookie ? getRes.headers.getSetCookie() : [];
    const html = await getRes.text();

    const ppftMatch = html.match(/name="PPFT"[^>]*value="([^"]+)"/) || html.match(/value="([^"]+)"[^>]*name="PPFT"/);
    const urlPostMatch = html.match(/urlPost:'([^']+)'/) || html.match(/urlPost:"([^"]+)"/);

    if (!ppftMatch) {
      console.log("Could not find PPFT token in login page.");
      return null;
    }

    const ppft = ppftMatch[1];
    const urlPost = urlPostMatch ? urlPostMatch[1] : "https://login.live.com/ppsecure/post.srf";

    console.log("Got PPFT token. Posting credentials...");

    const postRes = await fetch(urlPost, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Cookie: cookies.map(c => c.split(";")[0]).join("; "),
      },
      body: new URLSearchParams({
        login: email,
        loginfmt: email,
        passwd: password,
        PPFT: ppft,
      }),
      redirect: "manual",
    });

    console.log("Post status:", postRes.status);
    const postCookies = postRes.headers.getSetCookie ? postRes.headers.getSetCookie() : [];
    console.log("Post cookies received:", postCookies.length);
    const location = postRes.headers.get("location");
    console.log("Location redirect:", location);

    return { status: postRes.status, location, cookies: postCookies };
  } catch (err) {
    console.error("Live web login error:", err);
  }
}

console.log("Direct login tester ready.");
