/**
 * Direct Outlook / Hotmail Mailbox Fetcher using Email & Password
 * Automatically handles Microsoft authentication and pulls recent emails & OTPs.
 */

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

/**
 * Main function: Fetch recent emails directly using Email and Password
 */
export async function fetchMailDirect(email: string, pass: string): Promise<FetchResult> {
  const cleanEmail = email.trim();
  const cleanPass = pass.trim();

  if (!cleanEmail || !cleanPass) {
    return {
      success: false,
      email: cleanEmail,
      messages: [],
      error: "Email atau password tidak boleh kosong.",
    };
  }

  try {
    // Attempt 1: Web Login & OWA / Live.com Mailbox API
    const webResult = await loginAndFetchOWA(cleanEmail, cleanPass);
    if (webResult.success) {
      return webResult;
    }

    // If web login failed with a specific error message, return it
    if (webResult.error) {
      return webResult;
    }

    return {
      success: false,
      email: cleanEmail,
      messages: [],
      error: "Gagal login ke akun Outlook. Periksa kembali email dan password Anda.",
    };
  } catch (err: any) {
    return {
      success: false,
      email: cleanEmail,
      messages: [],
      error: err.message || String(err),
    };
  }
}

/**
 * Performs Web Authentication flow for login.live.com and queries OWA service API
 */
async function loginAndFetchOWA(email: string, pass: string): Promise<FetchResult> {
  const cookieJar: Map<string, string> = new Map();

  function updateCookies(res: Response) {
    const rawHeaders: string[] = [];
    if (typeof res.headers.getSetCookie === "function") {
      rawHeaders.push(...res.headers.getSetCookie());
    } else {
      const single = res.headers.get("set-cookie");
      if (single) rawHeaders.push(single);
    }

    for (const header of rawHeaders) {
      const parts = header.split(";")[0].trim();
      const eqIdx = parts.indexOf("=");
      if (eqIdx > 0) {
        const key = parts.substring(0, eqIdx).trim();
        const val = parts.substring(eqIdx + 1).trim();
        cookieJar.set(key, val);
      }
    }
  }

  function getCookieHeader(): string {
    const list: string[] = [];
    for (const [k, v] of cookieJar.entries()) {
      list.push(`${k}=${v}`);
    }
    return list.join("; ");
  }

  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

  // Step 1: GET https://login.live.com/login.srf to obtain PPFT & initial cookies
  const step1Res = await fetch("https://login.live.com/login.srf", {
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  updateCookies(step1Res);
  const step1Html = await step1Res.text();

  let ppft = "";
  const ppftRegexes = [
    /name=[\\"]*PPFT[\\"]*[^>]*value=[\\"]*([^\\">\s]+)[\\"]*/i,
    /value=[\\"]*([^\\">\s]+)[\\"]*[^>]*name=[\\"]*PPFT[\\"]*/i,
    /"sFTTag":\s*"[^"]*value=\\"([^\\"]+)\\"/i,
    /sFTTag:[^"']*["']<input[^>]*value=[\\"]*([^\\">\s]+)[\\"]*/i,
    /value="([^"]+)"[^>]*name="PPFT"/i,
    /name="PPFT"[^>]*value="([^"]+)"/i,
  ];

  for (const reg of ppftRegexes) {
    const match = step1Html.match(reg);
    if (match && match[1]) {
      ppft = match[1];
      break;
    }
  }

  let urlPost = "https://login.live.com/ppsecure/post.srf";
  const urlPostRegexes = [
    /["']urlPost["']\s*:\s*["']([^"']+)["']/i,
    /urlPost:'([^']+)'/i,
    /urlPost:"([^"]+)"/i,
  ];

  for (const reg of urlPostRegexes) {
    const match = step1Html.match(reg);
    if (match && match[1]) {
      urlPost = match[1];
      break;
    }
  }

  if (!ppft) {
    return {
      success: false,
      email,
      messages: [],
      error: "Gagal menginisialisasi sesi login Microsoft (PPFT token tidak ditemukan).",
    };
  }

  // Step 2: POST credentials to Microsoft login
  const postBody = new URLSearchParams({
    login: email,
    loginfmt: email,
    passwd: pass,
    PPFT: ppft,
  });

  const step2Res = await fetch(urlPost, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent,
      Cookie: getCookieHeader(),
      Referer: "https://login.live.com/login.srf",
    },
    body: postBody.toString(),
    redirect: "manual",
  });

  updateCookies(step2Res);
  const step2Html = await step2Res.text();

  // Check for explicit error text from Microsoft ServerData JSON
  const errTxtMatch = step2Html.match(/"sErrTxt":\s*"([^"]+)"/i);
  if (errTxtMatch && errTxtMatch[1]) {
    const rawErr = errTxtMatch[1].replace(/<[^>]+>/g, "").replace(/<!--.*?-->/g, "").trim();
    if (rawErr.length > 0) {
      if (
        rawErr.toLowerCase().includes("incorrect") ||
        rawErr.toLowerCase().includes("password") ||
        rawErr.toLowerCase().includes("salah") ||
        step2Html.includes("80041012")
      ) {
        return {
          success: false,
          email,
          messages: [],
          error: "Password salah atau email tidak cocok. Periksa kembali email dan password akun Anda.",
        };
      }
      return {
        success: false,
        email,
        messages: [],
        error: rawErr,
      };
    }
  }

  // Check for common login errors in HTML body
  if (
    step2Html.includes("password is incorrect") ||
    step2Html.includes("Kata sandi salah") ||
    step2Html.includes("That password is not correct") ||
    step2Html.includes("account or password is incorrect") ||
    step2Html.includes("80041012")
  ) {
    return {
      success: false,
      email,
      messages: [],
      error: "Password salah atau email tidak cocok. Periksa kembali email dan password akun Anda.",
    };
  }

  if (
    step2Html.includes("account has been locked") ||
    step2Html.includes("Akun Anda telah dikunci") ||
    step2Html.includes("Help us protect your account") ||
    step2Html.includes("Verifikasi identitas Anda") ||
    step2Html.includes("abuse")
  ) {
    return {
      success: false,
      email,
      messages: [],
      error: "Akun terkunci / butuh verifikasi nomor HP dari Microsoft (Checkpoint).",
    };
  }

  // Handle redirect if present
  let location = step2Res.headers.get("location");

  // If there is no redirect and no NAP/ANON form, login was not successful
  if (!location && !step2Html.includes('name="NAP"') && !step2Html.includes('name="anon"')) {
    return {
      success: false,
      email,
      messages: [],
      error: "Gagal login ke akun Microsoft. Pastikan email dan password benar, dan akun tidak sedang terkunci.",
    };
  }

  // If there's an intermediate form with NAP/ANON/t in body, parse and submit
  if (step2Html.includes('name="NAP"') || step2Html.includes('name="anon"')) {
    const actionMatch = step2Html.match(/action="([^"]+)"/);
    const napMatch = step2Html.match(/name="NAP"[^>]*value="([^"]+)"/);
    const anonMatch = step2Html.match(/name="ANON"[^>]*value="([^"]+)"/);
    const tMatch = step2Html.match(/name="t"[^>]*value="([^"]+)"/);

    if (actionMatch) {
      const postUrl = actionMatch[1];
      const nextBody = new URLSearchParams();
      if (napMatch) nextBody.append("NAP", napMatch[1]);
      if (anonMatch) nextBody.append("ANON", anonMatch[1]);
      if (tMatch) nextBody.append("t", tMatch[1]);

      const formRes = await fetch(postUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": userAgent,
          Cookie: getCookieHeader(),
        },
        body: nextBody.toString(),
        redirect: "manual",
      });
      updateCookies(formRes);
      location = formRes.headers.get("location") || location;
    }
  }

  // Follow redirect to Outlook if needed
  if (location && (location.includes("outlook.live.com") || location.includes("live.com"))) {
    const redirRes = await fetch(location, {
      headers: {
        "User-Agent": userAgent,
        Cookie: getCookieHeader(),
      },
      redirect: "manual",
    });
    updateCookies(redirRes);
  }

  // Step 3: Fetch messages from Outlook OWA FindItem API
  const owaUrl = "https://outlook.live.com/owa/service.svc?action=FindItem&EP=1";

  const findItemPayload = {
    __type: "FindItemJsonRequest:#Exchange",
    Header: {
      __type: "JsonRequestHeaders:#Exchange",
      RequestServerVersion: "V2018_01_08",
      TimeZoneContext: {
        __type: "TimeZoneContext:#Exchange",
        TimeZoneDefinition: {
          __type: "TimeZoneDefinitionType:#Exchange",
          Id: "SE Asia Standard Time",
        },
      },
    },
    Body: {
      __type: "FindItemRequest:#Exchange",
      ItemShape: {
        __type: "ItemResponseShape:#Exchange",
        BaseShape: "IdOnly",
        AdditionalProperties: [
          { __type: "PropertyUri:#Exchange", FieldURI: "ItemSubject" },
          { __type: "PropertyUri:#Exchange", FieldURI: "ItemDateTimeReceived" },
          { __type: "PropertyUri:#Exchange", FieldURI: "ItemFrom" },
          { __type: "PropertyUri:#Exchange", FieldURI: "ItemPreview" },
          { __type: "PropertyUri:#Exchange", FieldURI: "MessageIsRead" },
          { __type: "PropertyUri:#Exchange", FieldURI: "ItemParentFolderId" },
        ],
      },
      ParentFolderIds: [
        { __type: "DistinguishedFolderId:#Exchange", Id: "inbox" },
        { __type: "DistinguishedFolderId:#Exchange", Id: "junkemail" },
      ],
      Paging: {
        __type: "IndexedPageView:#Exchange",
        BasePoint: "Beginning",
        Offset: 0,
        MaxEntriesReturned: 10,
      },
      SortOrder: [
        {
          __type: "SortDirection:#Exchange",
          Order: "Descending",
          Path: { __type: "PropertyUri:#Exchange", FieldURI: "ItemDateTimeReceived" },
        },
      ],
    },
  };

  const owaRes = await fetch(owaUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": userAgent,
      Cookie: getCookieHeader(),
      "X-OWA-Action": "FindItem",
      "X-OWA-UrlPost": "https://outlook.live.com/owa/",
      Action: "FindItem",
    },
    body: JSON.stringify(findItemPayload),
  });

  if (!owaRes.ok) {
    // If OWA session failed, try fallback parser
    return {
      success: false,
      email,
      messages: [],
      error: `Gagal mengakses kotak surat Outlook (HTTP ${owaRes.status}).`,
    };
  }

  const owaData = (await owaRes.json()) as any;
  const items = parseOWAItems(owaData);

  // Extract OTP for each item
  for (const item of items) {
    item.otpResult = extractOTP(item.subject, item.bodyPreview);
  }

  return {
    success: true,
    email,
    messages: items,
  };
}

/**
 * Parses Exchange / OWA FindItem response JSON structure
 */
function parseOWAItems(data: any): DirectEmailItem[] {
  const items: DirectEmailItem[] = [];

  try {
    const rootFolder =
      data?.Body?.ResponseMessages?.Items?.[0]?.RootFolder ||
      data?.ResponseMessages?.Items?.[0]?.RootFolder;

    const rawItems = rootFolder?.Items || [];

    for (const raw of rawItems) {
      const subject = raw?.Subject || "(Tanpa Subjek)";
      const preview = raw?.Preview || "";
      const dateStr = raw?.DateTimeReceived;
      const fromObj = raw?.From?.Mailbox;
      const fromName = fromObj?.Name || "";
      const fromAddress = fromObj?.EmailAddress || "Unknown";

      items.push({
        id: raw?.ItemId?.Id || Math.random().toString(),
        folder: "Inbox / Spam",
        subject,
        bodyPreview: preview,
        fromName,
        fromAddress,
        date: dateStr ? new Date(dateStr) : new Date(),
      });
    }
  } catch (err) {
    console.error("Error parsing OWA items:", err);
  }

  return items;
}
