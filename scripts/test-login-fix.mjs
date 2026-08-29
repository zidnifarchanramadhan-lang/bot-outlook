import fs from "fs";

async function test() {
  const cookieJar = new Map();
  function updateCookies(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const h of raw) {
      const part = h.split(';')[0].trim();
      const eq = part.indexOf('=');
      if (eq > 0) cookieJar.set(part.substring(0, eq), part.substring(eq + 1));
    }
  }
  function getCookieHeader() {
    return Array.from(cookieJar.entries()).map(([k,v]) => k + '=' + v).join('; ');
  }
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  const res1 = await fetch('https://login.live.com/login.srf', { headers: { 'User-Agent': ua } });
  updateCookies(res1);
  const html1 = await res1.text();

  const ppftMatch = html1.match(/name=[\\"]*PPFT[\\"]*[^>]*value=[\\"]*([^\\">\s]+)[\\"]*/i) ||
                    html1.match(/value=[\\"]*([^\\">\s]+)[\\"]*[^>]*name=[\\"]*PPFT[\\"]*/i) ||
                    html1.match(/sFTTag:[^"']*["']<input[^>]*value=[\\"]*([^\\">\s]+)[\\"]*/i) ||
                    html1.match(/"sFTTag":\s*"[^"]*value=\\"([^\\"]+)\\"/i);
  const urlPostMatch = html1.match(/["']urlPost["']\s*:\s*["']([^"']+)["']/i) ||
                       html1.match(/urlPost:'([^']+)'/) ||
                       html1.match(/urlPost:"([^"]+)"/);

  console.log('PPFT found:', !!ppftMatch, ppftMatch ? ppftMatch[1].substring(0, 20) : null);
  console.log('urlPost found:', !!urlPostMatch, urlPostMatch ? urlPostMatch[1].substring(0, 50) : null);

  if (!ppftMatch || !urlPostMatch) return;

  const postUrl = urlPostMatch[1];
  const ppft = ppftMatch[1];

  const postBody = new URLSearchParams({
    login: 'b1ze7f9svkpgz6p@hotmail.com',
    loginfmt: 'b1ze7f9svkpgz6p@hotmail.com',
    passwd: 'D066u5d*5w',
    PPFT: ppft
  });

  const res2 = await fetch(postUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': ua,
      'Cookie': getCookieHeader(),
      'Referer': 'https://login.live.com/login.srf'
    },
    body: postBody.toString(),
    redirect: 'manual'
  });

  updateCookies(res2);
  console.log('Step 2 status:', res2.status);
  let location = res2.headers.get('location');
  console.log('Step 2 location:', location);
  const html2 = await res2.text();
  console.log('Step 2 html length:', html2.length);
fs.writeFileSync('debug_step2.html', html2);
  
  if (html2.includes('name="NAP"') || html2.includes('name="anon"')) {
    console.log('Detected NAP/anon intermediate post form!');
    const actionMatch = html2.match(/action="([^"]+)"/);
    const napMatch = html2.match(/name="NAP"[^>]*value="([^"]+)"/);
    const anonMatch = html2.match(/name="ANON"[^>]*value="([^"]+)"/);
    const tMatch = html2.match(/name="t"[^>]*value="([^"]+)"/);
    
    if (actionMatch) {
      console.log('Posting to action:', actionMatch[1]);
      const nextBody = new URLSearchParams();
      if (napMatch) nextBody.append("NAP", napMatch[1]);
      if (anonMatch) nextBody.append("ANON", anonMatch[1]);
      if (tMatch) nextBody.append("t", tMatch[1]);
      
      const formRes = await fetch(actionMatch[1], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': ua,
          'Cookie': getCookieHeader(),
        },
        body: nextBody.toString(),
        redirect: 'manual'
      });
      updateCookies(formRes);
      console.log('Intermediate post status:', formRes.status);
      location = formRes.headers.get('location') || location;
      console.log('Intermediate redirect location:', location);
    }
  }

  if (location && (location.includes("outlook.live.com") || location.includes("live.com"))) {
    console.log('Following redirect to:', location);
    const redirRes = await fetch(location, {
      headers: {
        'User-Agent': ua,
        Cookie: getCookieHeader(),
      },
      redirect: 'manual',
    });
    updateCookies(redirRes);
    console.log('Redirect status:', redirRes.status);
  }

  // Step 3: FindItem OWA
  const owaUrl = 'https://outlook.live.com/owa/service.svc?action=FindItem&EP=1';
  const findItemPayload = {
    __type: 'FindItemJsonRequest:#Exchange',
    Header: {
      __type: 'JsonRequestHeaders:#Exchange',
      RequestServerVersion: 'V2018_01_08',
      TimeZoneContext: {
        __type: 'TimeZoneContext:#Exchange',
        TimeZoneDefinition: {
          __type: 'TimeZoneDefinitionType:#Exchange',
          Id: 'SE Asia Standard Time',
        },
      },
    },
    Body: {
      __type: 'FindItemRequest:#Exchange',
      ItemShape: {
        __type: 'ItemResponseShape:#Exchange',
        BaseShape: 'IdOnly',
        AdditionalProperties: [
          { __type: 'PropertyUri:#Exchange', FieldURI: 'ItemSubject' },
          { __type: 'PropertyUri:#Exchange', FieldURI: 'ItemDateTimeReceived' },
          { __type: 'PropertyUri:#Exchange', FieldURI: 'ItemFrom' },
          { __type: 'PropertyUri:#Exchange', FieldURI: 'ItemPreview' },
          { __type: 'PropertyUri:#Exchange', FieldURI: 'MessageIsRead' },
        ],
      },
      ParentFolderIds: [
        { __type: 'DistinguishedFolderId:#Exchange', Id: 'inbox' },
        { __type: 'DistinguishedFolderId:#Exchange', Id: 'junkemail' },
      ],
      Paging: {
        __type: 'IndexedPageView:#Exchange',
        BasePoint: 'Beginning',
        Offset: 0,
        MaxEntriesReturned: 10,
      },
      SortOrder: [
        {
          __type: 'SortDirection:#Exchange',
          Order: 'Descending',
          Path: { __type: 'PropertyUri:#Exchange', FieldURI: 'ItemDateTimeReceived' },
        },
      ],
    },
  };

  const owaRes = await fetch(owaUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': ua,
      Cookie: getCookieHeader(),
      'X-OWA-Action': 'FindItem',
      'X-OWA-UrlPost': 'https://outlook.live.com/owa/',
      Action: 'FindItem',
    },
    body: JSON.stringify(findItemPayload),
  });

  console.log('OWA status:', owaRes.status);
  const owaText = await owaRes.text();
  console.log('OWA text sample:', owaText.substring(0, 300));
}
test();
