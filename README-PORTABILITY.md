# Metro Split source and portability

This repository contains the full application source for the Receipt Split Site. The user interface and PDF/image text recognition run in the visitor's browser. Receipt records live in a Sites D1 database, and uploaded files live in a Sites R2 bucket. No receipt records or uploaded receipt files are committed to Git.

## Development

The project uses Node 22+, pnpm, Vinext, Cloudflare Workers, D1, and R2. Install dependencies with the included lockfile, generate/apply the SQL in `drizzle/`, and provide the logical `DB` and `BUCKET` bindings. The current deployment is managed by ChatGPT Sites through `.openai/hosting.json`.

## Hosting independently

This source is a starting point, not a one-click independent deployment. Before moving it to your own Cloudflare account or another host:

1. Replace the Sites-specific `cloudflare:workers` binding setup and deployment manifest with your own Worker, D1, and R2 configuration. Apply the checked-in schema migration.
2. Set up Firebase Authentication as described in `README.md`. The app verifies Google-backed Firebase ID tokens on owner API routes when configured. Remove the transitional ChatGPT sign-in/history-transfer path once all records have moved. Keep the `/api/claim/[token]` link scoped to one receipt.
3. Export the saved receipt records and uploaded files from the hosted database and bucket, then import them into your storage. Git contains only code, not live data.
4. Test upload, claim, persistence, and access controls on the new domain before switching users over.

The browser-side parser is in `lib/receipt.ts`, the PDF and OCR reader is in `lib/read-file.ts`, the interface is in `app/`, and the receipt API is in `app/api/`.
