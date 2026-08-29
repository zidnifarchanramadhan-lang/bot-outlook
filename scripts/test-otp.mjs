import { extractOTP } from "../dist/src/otp.js";

const testCases = [
  {
    subject: "Your TikTok verification code is 849201",
    body: "Use 849201 to log into your TikTok account.",
    expected: "849201",
  },
  {
    subject: "Google verification code",
    body: "G-492103 is your Google verification code. Do not share it.",
    expected: "492103",
  },
  {
    subject: "Steam Guard: 5X8TY",
    body: "Here is your Steam Guard code: 5X8TY",
    expected: "5X8TY",
  },
  {
    subject: "Kode Verifikasi Akun Anda",
    body: "Kode OTP Anda: 918234 berlaku selama 5 menit.",
    expected: "918234",
  },
  {
    subject: "Discord Login Details",
    body: "Your login security code is 782190",
    expected: "782190",
  },
  {
    subject: "Selamat Datang di Layanan Kami 2026",
    body: "Terima kasih telah bergabung. Kode akses masuk Anda adalah 4819.",
    expected: "4819",
  },
];

console.log("=== Testing OTP Extraction Engine ===");
let passed = 0;

for (const tc of testCases) {
  const result = extractOTP(tc.subject, tc.body);
  const success = result && result.code.includes(tc.expected);
  console.log(`- Subjek: "${tc.subject}" -> Result: ${result ? result.code : "NULL"} (Expected: ${tc.expected}) [${success ? "PASS" : "FAIL"}]`);
  if (success) passed++;
}

console.log(`\nResult: ${passed}/${testCases.length} tests passed.`);
if (passed === testCases.length) {
  console.log("✅ All OTP regex tests passed!");
}
