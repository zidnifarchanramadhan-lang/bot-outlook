/**
 * Microsoft Graph API Client & OAuth2 Token Manager
 */

export interface EmailMessage {
  id: string;
  folder: string;
  subject: string;
  bodyPreview: string;
  fromName: string;
  fromAddress: string;
  date: Date;
  isRead: boolean;
}

export interface GraphConfig {
  clientId: string;
  clientSecret?: string;
  tenantId?: string;
  refreshToken: string;
}

const DEFAULT_FOLDERS = [
  { id: "inbox", name: "Inbox" },
  { id: "junkemail", name: "Junk Email" },
  { id: "deleteditems", name: "Deleted Items" },
];

/**
 * Gets a fresh access token from Microsoft OAuth2 endpoint using the refresh_token
 */
export async function getAccessToken(config: GraphConfig): Promise<string> {
  const tenant = config.tenantId || "consumers";
  const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
    scope: "offline_access Mail.Read User.Read",
  });

  if (config.clientSecret) {
    params.append("client_secret", config.clientSecret);
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = (await response.json()) as any;

  if (!response.ok) {
    const errorDescription = data.error_description || data.error || response.statusText;
    throw new Error(`Gagal refresh token Microsoft: ${errorDescription}`);
  }

  return data.access_token;
}

/**
 * Fetches recent emails from Inbox, Junk Email, and Deleted Items folders
 */
export async function fetchRecentEmails(
  config: GraphConfig,
  limitPerFolder: number = 5
): Promise<EmailMessage[]> {
  const accessToken = await getAccessToken(config);
  const allMessages: EmailMessage[] = [];

  for (const folder of DEFAULT_FOLDERS) {
    try {
      const url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folder.id}/messages?$top=${limitPerFolder}&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,receivedDateTime,from,isRead`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.error(`Gagal membaca folder ${folder.name}: ${response.statusText}`);
        continue;
      }

      const data = (await response.json()) as any;
      if (Array.isArray(data.value)) {
        for (const item of data.value) {
          allMessages.push({
            id: item.id,
            folder: folder.name,
            subject: item.subject || "(Tanpa Subjek)",
            bodyPreview: item.bodyPreview || "",
            fromName: item.from?.emailAddress?.name || "",
            fromAddress: item.from?.emailAddress?.address || "Unknown",
            date: new Date(item.receivedDateTime),
            isRead: !!item.isRead,
          });
        }
      }
    } catch (err) {
      console.error(`Error fetching folder ${folder.name}:`, err);
    }
  }

  // Sort all collected emails descending by date
  allMessages.sort((a, b) => b.date.getTime() - a.date.getTime());

  return allMessages;
}
