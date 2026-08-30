/**
 * Helper to extract OTP / Verification codes from email subject and body
 */

export interface OTPExtractionResult {
  code: string;
  confidence: "high" | "medium" | "low";
  source: "subject" | "body";
}

const IGNORED_NUMBERS = new Set(["2024", "2025", "2026", "2027", "2028", "2029", "2030"]);

export function extractOTP(subject: string = "", bodyPreview: string = ""): OTPExtractionResult | null {
  const cleanSubject = subject.trim();
  const cleanBody = bodyPreview.trim();
  const fullText = `${cleanSubject} | ${cleanBody}`;

  // 1. Google style G-XXXXXX
  const googleMatch = fullText.match(/\b(G-\d{4,8})\b/i);
  if (googleMatch && googleMatch[1]) {
    return { code: googleMatch[1], confidence: "high", source: "body" };
  }

  // 2. Steam Guard alphanumeric code (e.g. "Steam Guard: 5X8TY" or "code: 5X8TY")
  if (/steam/i.test(fullText)) {
    const steamMatch = fullText.match(/\b([2-9BCDFGHJKMNPQRTVWXYZ]{5})\b/);
    if (steamMatch && steamMatch[1] && !/^\d{5}$/.test(steamMatch[1])) {
      return { code: steamMatch[1], confidence: "high", source: "subject" };
    }
  }

  // 3. High confidence contextual regex with keyword prefixes
  // e.g. "verification code is 849201", "OTP: 123456", "Kode OTP Anda adalah 918234", "Masukkan 465515"
  const contextualRegex = /(?:code|otp|kode|pin|passcode|verification|verifikasi|security code|login code|confirmation code|access code|masukkan|enter|gunakan|use)[\s\w]*?(?:is|adalah|:|—|-|=|\s)\s*#?\s*([A-Za-z0-9]{4,8})\b/i;

  const subCtx = cleanSubject.match(contextualRegex);
  if (subCtx && subCtx[1] && isValidOTPToken(subCtx[1])) {
    return { code: subCtx[1], confidence: "high", source: "subject" };
  }

  const bodyCtx = cleanBody.match(contextualRegex);
  if (bodyCtx && bodyCtx[1] && isValidOTPToken(bodyCtx[1])) {
    return { code: bodyCtx[1], confidence: "high", source: "body" };
  }

  // 4. Standalone 6-digit number in subject (common format: "849201 is your code")
  const subSix = cleanSubject.match(/\b(\d{6})\b/);
  if (subSix && subSix[1]) {
    return { code: subSix[1], confidence: "high", source: "subject" };
  }

  // 5. Standalone 4-8 digit number in subject
  const subDigits = cleanSubject.match(/\b(\d{4,8})\b/g);
  if (subDigits && subDigits.length > 0) {
    const valid = subDigits.filter(d => !IGNORED_NUMBERS.has(d));
    if (valid.length > 0) {
      return { code: valid[0], confidence: "medium", source: "subject" };
    }
  }

  // 6. Standalone 6-digit number in body
  const bodySix = cleanBody.match(/\b(\d{6})\b/);
  if (bodySix && bodySix[1]) {
    return { code: bodySix[1], confidence: "medium", source: "body" };
  }

  // 7. Any 4-8 digit number in body
  const bodyDigits = cleanBody.match(/\b(\d{4,8})\b/g);
  if (bodyDigits && bodyDigits.length > 0) {
    const valid = bodyDigits.filter(d => !IGNORED_NUMBERS.has(d));
    if (valid.length > 0) {
      return { code: valid[0], confidence: "low", source: "body" };
    }
  }

  return null;
}

function isValidOTPToken(token: string): boolean {
  if (!token) return false;
  // If token is purely alphabet letters (e.g. Canva, Google, Masuk), reject it
  if (/^[a-zA-Z]+$/.test(token)) {
    return false;
  }
  // Check if year
  if (IGNORED_NUMBERS.has(token)) {
    return false;
  }
  return true;
}
