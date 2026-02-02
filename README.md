# ePub Reader Platform

An independent digital library and reader platform combining ePub reading, audiobooks, print-on-demand links, and ethical donation-based monetization.

## Features

- 📚 **ePub Reader** - Full-featured reader with Google Play Books-level polish
- 🎧 **Audiobook Support** - Optional audio for each book with playback controls
- 🖨️ **Print-on-Demand Links** - Connect readers to physical copies
- ❤️ **Donation-Based** - Voluntary support, no paywalls
- 🔐 **Admin Panel** - Complete content management system
- 📱 **Responsive** - Works on desktop and mobile

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: NextAuth.js
- **Storage**: UploadThing
- **ePub**: epub.js
- **Payments**: PayPal
- **UI**: Tailwind CSS + shadcn/ui

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- UploadThing account (free tier available)
- PayPal developer account (optional for development)

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
- PayPal credentials (if testing donations)

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

Open [http://localhost:3000](http://localhost:3000) in your browser.

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
2. Create an UploadThing account and get API keys
3. Configure environment variables in your hosting platform
4. Deploy to Vercel, Netlify, or your preferred platform

For detailed UploadThing setup, see [docs/UPLOADTHING.md](file:///c:/Users/Mobatly/Google%20Drive/Mobatly%20Web%20Dev/One%20Man%20Revolution/EPUB%20reader/docs/UPLOADTHING.md)

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
