import readline from "readline";

// Helper function to prompt user input
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function main() {
  console.log("\n=======================================================");
  console.log("   🔑 Microsoft Outlook / Hotmail OAuth2 Login Helper");
  console.log("=======================================================\n");

  let clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) {
    clientId = await askQuestion("Masukkan Microsoft Client ID (Application ID): ");
  }

  if (!clientId) {
    console.error("❌ Client ID tidak boleh kosong!");
    process.exit(1);
  }

  const tenant = process.env.MICROSOFT_TENANT_ID || "consumers";
  const scope = "offline_access Mail.Read User.Read";

  console.log("\n⏳ Meminta kode login dari Microsoft...");

  try {
    const deviceCodeRes = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          scope: scope,
        }),
      }
    );

    const deviceCodeData = await deviceCodeRes.json();

    if (!deviceCodeRes.ok) {
      console.error("❌ Gagal mendapatkan device code dari Microsoft:");
      console.error(deviceCodeData);
      process.exit(1);
    }

    console.log("\n" + "=".repeat(60));
    console.log("👉 1. Buka browser dan kunjungi: " + (deviceCodeData.verification_uri || "https://microsoft.com/devicelogin"));
    console.log("👉 2. Masukkan kode berikut:     " + deviceCodeData.user_code);
    console.log("👉 3. Login akun Hotmail/Outlook Anda dan klik 'Setujui / Allow'");
    console.log("=".repeat(60) + "\n");
    console.log("⏳ Menunggu konfirmasi login dari Anda di browser...\n");

    const intervalMs = (deviceCodeData.interval || 5) * 1000;
    const expiresAt = Date.now() + deviceCodeData.expires_in * 1000;

    while (Date.now() < expiresAt) {
      await new Promise((r) => setTimeout(r, intervalMs));

      const tokenRes = await fetch(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: deviceCodeData.device_code,
          }),
        }
      );

      const tokenData = await tokenRes.json();

      if (tokenRes.ok) {
        console.log("🎉 LOGIN BERHASIL!\n");
        console.log("=".repeat(60));
        console.log("📋 SALIN VARIABEL BERIKUT KE ENVIRONMENT VARIABLES VERCEL:");
        console.log("=".repeat(60));
        console.log(`MICROSOFT_CLIENT_ID=${clientId}`);
        console.log(`MICROSOFT_TENANT_ID=${tenant}`);
        console.log(`MICROSOFT_REFRESH_TOKEN=${tokenData.refresh_token}`);
        console.log("=".repeat(60) + "\n");
        return;
      }

      if (tokenData.error === "authorization_pending") {
        process.stdout.write(".");
        continue;
      }

      if (tokenData.error === "authorization_declined" || tokenData.error === "expired_token") {
        console.error(`\n❌ Login dibatalkan atau waktu habis: ${tokenData.error_description || tokenData.error}`);
        process.exit(1);
      }

      console.error(`\n❌ Error saat otentikasi:`, tokenData);
      process.exit(1);
    }

    console.error("\n❌ Waktu login habis. Silakan coba lagi.");
  } catch (err) {
    console.error("\n❌ Terjadi kesalahan jaringan:", err);
  }
}

main();
