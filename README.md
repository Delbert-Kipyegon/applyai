# Boltiply

Boltiply helps candidates turn a master CV and job description into a focused
one-page CV, cover letter, and match summary.

## Product Flow

1. **Master profile** - Paste the full CV once and save the reusable profile.
   You can also import a PDF, DOCX, TXT, Markdown, or RTF CV.
2. **Job details** - Paste the role title, company, and full job description.
3. **AI generation** - The server-side API calls Claude to tailor the documents.
   MongoDB limits each device to 5 generations per hour.
4. **Download** - Copy or download PDF/DOCX versions of the CV and cover letter.

## Tech Stack

- **Next.js App Router** for the product UI and API route.
- **React + TypeScript** for the multi-step application flow.
- **Anthropic Messages API** for CV and cover letter generation.
- **MongoDB** for rate limits, generation logs, and admin metrics.
- **VirusTotal free API** for optional hosted malware scanning before CV parsing.
- **Cloudinary** for optional storage of clean uploaded CV files as authenticated raw assets.
- **Local storage** for saved profile and application tracking.

## Quick Start

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Add your deployment secrets to `.env.local`:

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=boltiply
ADMIN_PASSWORD=change-this-password
ADMIN_SESSION_SECRET=change-this-long-random-secret
VIRUSTOTAL_API_KEY=your-virustotal-api-key
MALWARE_SCAN_REQUIRED=false
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
CLOUDINARY_CV_FOLDER=boltiply/cvs
```

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Project Structure

```text
boltiply/
├── app/
│   ├── admin/page.tsx         # Password-protected usage dashboard
│   ├── api/export/route.ts    # PDF/DOCX export endpoint
│   ├── api/generate/route.ts  # Claude generation, rate limit, logging
│   ├── api/import-cv/route.ts # CV scanning, validation, text extraction
│   ├── globals.css            # Product UI styling
│   ├── layout.tsx             # App shell and metadata
│   └── page.tsx               # Main multi-step Boltiply flow
├── lib/                       # MongoDB, security, export, upload helpers
├── .env.example
├── package.json
└── README.md
```

## Notes

The Anthropic API key is read only inside `app/api/generate/route.ts`, so it is
not exposed to the browser. Keep real secrets in `.env.local` and never commit
them.

VirusTotal uploads files to a third-party malware scanning service. Keep
`MALWARE_SCAN_REQUIRED=false` for local development without a key, and set it to
`true` in production once `VIRUSTOTAL_API_KEY` is configured.

Cloudinary upload is optional. If the Cloudinary env vars are present, clean CV
files are uploaded as authenticated `raw` assets after malware scanning.

Open `/admin` to view the minimal dashboard after setting `ADMIN_PASSWORD`.
