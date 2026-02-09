# Gmail MCP Server

MCP server for Gmail integration with Volcano Agent SDK. Enables AI agents to read, analyze, and manage Gmail emails.

## Features

- List unread emails
- Get full email body content
- Mark emails as spam
- Mark emails as read
- Mark emails as important
- Delete emails

## Setup

### 1. Install Dependencies

```bash
npm install googleapis express zod
```

### 2. Get Gmail API OAuth Token

> **Troubleshooting:** If you see `Error 400: redirect_uri_mismatch`, see "Fixing OAuth Playground" below.

#### Option A: Using gcloud CLI (Easiest for Testing)

```bash
# Install gcloud (if not already installed)
brew install --cask google-cloud-sdk  # macOS
# Or see: https://cloud.google.com/sdk/docs/install

# Login and get token
gcloud auth login
gcloud auth print-access-token

# Or use the helper script
./mcp/gmail/oauth-helper.mjs
```

#### Option B: Using Desktop App Credentials (You Already Have This!)

If you already created a **Desktop app** OAuth client:

**First, enable the redirect URI for the helper script:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. Click on your Desktop app OAuth 2.0 Client ID
3. You won't see "Authorized redirect URIs" section for Desktop apps - that's normal!
4. Click **DOWNLOAD JSON** button to download your credentials
5. Open the JSON file and note your `client_id` and `client_secret`

**Then use the helper script:**

```bash
# Set your Desktop app credentials (from the downloaded JSON)
export GMAIL_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GMAIL_CLIENT_SECRET="your-client-secret"

# Run the helper (opens browser, gets token automatically)
./mcp/gmail/get-token-desktop.mjs
```

The script will:
1. Open your browser for Google sign-in
2. Start a local server on `http://localhost:3000` to receive the callback
3. Exchange the authorization code for an access token
4. Print the token for you to use

**Note:** Desktop apps work with `localhost` redirects automatically. They don't work with OAuth Playground because that requires a Web application type OAuth client.

#### Option C: OAuth 2.0 Playground

**First, fix the redirect URI error:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. Click your OAuth 2.0 Client ID
3. Under **Authorized redirect URIs**, add:
   ```
   https://developers.google.com/oauthplayground
   ```
4. Click **Save** and wait 5 minutes for it to propagate

**Then get your token:**
1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in top right
3. Check "Use your own OAuth credentials"
4. Enter your OAuth Client ID and Secret
5. In "Step 1", find "Gmail API v1" and select:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.readonly`
6. Click "Authorize APIs"
7. In "Step 2", click "Exchange authorization code for tokens"
8. Copy the **Access token**

### 3. Start the Server

```bash
PORT=3800 node mcp/gmail/server.mjs
```

## Usage with Volcano Agent SDK

### Basic Usage (Access Token Only)

```typescript
import { agent, llmOpenAI, mcp } from "@volcano/agent";

const llm = llmOpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!, 
  model: "gpt-5"
});

const gmail = mcp("http://localhost:3800/mcp", {
  auth: {
    type: 'bearer',
    token: process.env.GMAIL_ACCESS_TOKEN
  }
});

// Automatic spam detection
const results = await agent({ llm })
  .then({
    prompt: "Get my unread emails and analyze them for spam. Mark any spam emails accordingly.",
    mcps: [gmail]
  })
  .run();

console.log(results[0].llmOutput);
```

### With Automatic Token Refresh (Recommended)

Never worry about expired tokens! Volcano automatically refreshes them:

```typescript
const gmail = mcp("http://localhost:3800/mcp", {
  auth: {
    type: 'bearer',
    token: process.env.GMAIL_ACCESS_TOKEN,          // Can be expired!
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,  // Long-lived refresh token
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET
  }
});

// Even if your access token expires during this workflow,
// Volcano will automatically refresh it and continue!
const results = await agent({ llm })
  .then({ prompt: "Analyze all my emails", mcps: [gmail] })
  .run();
```

When Volcano detects a 401 error, it:
1. Uses your refresh token to get a new access token
2. Retries the failed request automatically
3. Caches the new token for future requests

## Available Tools

### `list_unread_emails`
List unread emails from inbox (single page, up to 100 emails).

**Parameters:**
- `maxResults` (number, optional): Max emails to return (default: 50, max: 100)
- `query` (string, optional): Additional Gmail search query
- `pageToken` (string, optional): Page token from previous call to get next batch

**Returns:** Object with emails array, count, and nextPageToken for pagination

### `list_all_unread_emails` ⭐ Recommended
List ALL unread emails from inbox (automatically handles pagination).

**Parameters:**
- `query` (string, optional): Additional Gmail search query
- `maxTotal` (number, optional): Maximum total emails across all pages (default: 500)

**Returns:** All unread emails (up to maxTotal), automatically paginating through Gmail API

**Use this for:** "Get all my unread emails" or "Check my entire inbox"

### `get_email_body`
Get full email body content.

**Parameters:**
- `emailId` (string): Email ID from list_unread_emails

**Returns:** Full email details including body (truncated to 10KB)

### `mark_as_spam`
Mark an email as spam and move to spam folder.

**Parameters:**
- `emailId` (string): Email ID to mark as spam

### `mark_as_read`
Mark an email as read.

**Parameters:**
- `emailId` (string): Email ID to mark as read

### `mark_as_important`
Mark an email as important/starred.

**Parameters:**
- `emailId` (string): Email ID to mark as important

### `delete_email`
Permanently delete an email (use with caution).

**Parameters:**
- `emailId` (string): Email ID to delete

## Security Notes

- Access tokens expire (typically after 1 hour)
- For production, implement token refresh flow
- Never commit OAuth credentials to version control
- Use environment variables for tokens

## Example Search Queries

```typescript
// List unread emails from specific sender
{ maxResults: 5, query: "from:newsletter@example.com" }

// List unread important emails
{ maxResults: 10, query: "is:important" }

// List unread emails with attachments
{ maxResults: 20, query: "has:attachment" }
```

