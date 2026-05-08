# ePub Reader Platform

An independent digital library and reader platform combining ePub reading, audiobooks, print-on-demand links, and ethical donation-based monetization.

## Features

- 📚 **ePub Reader** - Full-featured reader with Google Play Books-level polish
- 🎧 **Audiobook Support** - Optional audio for each book with playback controls
- 🎙️ **Multi-Voice Narration Studio** - Admin can sample Gemini voices, generate multiple narration options, and publish a default reader voice
- 🖨️ **Print-on-Demand Links** - Connect readers to physical copies
- ❤️ **Donation-Based** - Voluntary support with PayPal + Paystack and a USD-normalized multi-currency flow
- 🔐 **Admin Panel** - Complete content management system
- 📱 **Responsive** - Works on desktop and mobile

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: NextAuth.js
- **Book uploads**: UploadThing
- **Narration storage**: Local disk or S3-compatible object storage (S3 / R2 / B2)
- **AI narration**: Gemini TTS
- **ePub**: epub.js
- **Payments**: PayPal + Paystack
- **UI**: Tailwind CSS + shadcn/ui

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- UploadThing account (free tier available)
- PayPal developer account (optional for development)
- Paystack secret key (required if you want Paystack checkout)
- CurrencyBeacon API key (required for non-USD donation entry and Paystack conversion)

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up your environment variables:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - Random secret for NextAuth
- `UPLOADTHING_SECRET` and `UPLOADTHING_APP_ID` - Get from [uploadthing.com/dashboard](https://uploadthing.com/dashboard)
- `GEMINI_API_KEY` - Required for Gemini voice sampling and narration generation
- `NARRATION_STORAGE_PROVIDER` and `NARRATION_STORAGE_LOCAL_DIR` - Use `local` for single-server/Plesk installs; cloud vars can stay blank in local mode
- PayPal credentials (if testing donations)
- `PAYSTACK_SECRET_KEY` - Required for Paystack donation checkout
- `CURRENCYBEACON_API_KEY` - Required for currency normalization and Paystack ZAR conversion

3. Set up the database:

```bash
npx prisma migrate dev
```

4. (Optional) Seed the database:

```bash
npx prisma db seed
```

5. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── (public)/          # Public-facing pages
│   ├── admin/             # Admin panel
│   ├── api/               # API routes
│   └── read/              # ePub reader
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── reader/           # Reader components
│   ├── audio/            # Audio player
│   └── donations/        # Donation components
├── lib/                   # Utilities and helpers
├── prisma/               # Database schema
└── public/               # Static assets
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript compiler

### Database Management

```bash
# Create a migration
npx prisma migrate dev --name migration_name

# Generate Prisma client
npx prisma generate

# Open Prisma Studio
npx prisma studio
```

## Deployment

1. Set up a PostgreSQL database (Supabase, Railway, Neon, etc.)
2. Configure UploadThing API keys for EPUB/admin uploads
3. Choose narration storage: local disk for single-server/Plesk installs, or S3-compatible object storage if you want cloud delivery
4. Configure environment variables in your hosting platform
5. Deploy to Vercel, Plesk, or your preferred platform

For Plesk and persistent local narration storage guidance, see [docs/PLESK_DEPLOYMENT.md](docs/PLESK_DEPLOYMENT.md).

For detailed UploadThing setup, see [docs/UPLOADTHING.md](docs/UPLOADTHING.md).

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
