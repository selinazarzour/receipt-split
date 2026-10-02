# Receipt Split

Upload a receipt PDF or photo, check its line items and adjustments, assign each item to one or more people, then calculate exact shares. An owner can save receipt history and give others a link to claim their items.

## Current receipt recognition

- Metro digital receipts have a dedicated parser for item discounts, category discounts, quantities, and tax.
- Other stores use a conservative line-item fallback. The app highlights unmatched totals and asks the owner to correct the result. This is **not** a guarantee that every store, language, currency, or receipt layout is recognized.
- PDF text is read locally with PDF.js. Scanned pages and images use Tesseract OCR in the browser. The original file is uploaded only when the owner saves a receipt.
- Prices currently display in CAD. Currency detection and deeper store-independent document understanding are future work.

## Run the project

Node 22+ and pnpm 11 are required. Run `pnpm install`, then `pnpm dev` for local development. The Site deployment uses Vinext on Cloudflare Workers, D1 for records, and R2 for receipt files. Apply the schema in `drizzle/` when setting up a new database. The current hosted project is configured by `.openai/hosting.json`; a separate host needs its own Cloudflare bindings and deployment setup.

## Google sign-in with Firebase

The code is ready for Firebase Authentication, but Google sign-in activates only when these four runtime values are set:

| Setting | Value from Firebase project |
| --- | --- |
| `FIREBASE_API_KEY` | Web app `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | Web app `authDomain` |
| `FIREBASE_PROJECT_ID` | Web app `projectId` |
| `FIREBASE_APP_ID` | Web app `appId` |

In [Firebase Console](https://console.firebase.google.com/), create a project and register a **Web app**. Under **Authentication → Sign-in method**, enable **Google**. Under **Authentication → Settings → Authorized domains**, add the domain of the deployed website without `https://`. Copy the four Web app configuration values into the site's runtime environment settings. These values identify a public web app; do not commit service-account private keys. Until all four values are present, the hosted Site continues using ChatGPT sign-in for saved history.

When Firebase is configured, the browser sends a Firebase ID token on owner requests. The Worker verifies its signature, issuer, audience, time claims, and subject against Google's public keys before using the Firebase user ID as a receipt owner. Claim links remain usable without sign-in. Existing ChatGPT-owned history does not move automatically: after signing in to both accounts, use **Transfer earlier receipts** in History.

## Data and portability

The Git repository contains source code and migrations, not saved receipt rows or uploaded receipt files. History can be downloaded as JSON from the app; originals can be opened from each saved receipt. For a move to independent hosting, migrate both D1 rows and R2 objects. See [README-PORTABILITY.md](README-PORTABILITY.md).
