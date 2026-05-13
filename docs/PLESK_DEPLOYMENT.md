# Deploying to Plesk Server

This guide covers deploying the ePub Reader Platform to a Plesk server.

> The automated Plesk packaging/deploy scripts use the **root** application files (`package.json`, `server.js`, and `prisma/`), not the legacy `plesk-deploy/` folder.

## Quick Start (One Command)

If your Plesk app and SSH access are already configured, deploy with:

```bash
npm run deploy:plesk
```

When run from the Plesk Node.js UI on the server, this command installs dependencies, applies Prisma migrations, generates the Prisma client, and builds the application in place. After it completes, restart the app from Plesk.

The production startup entrypoints (`server.js` and `app.js`) also run `prisma migrate deploy` automatically before boot by default, which protects Plesk restarts from serving code against a stale schema. Set `AUTO_RUN_PRISMA_MIGRATIONS="false"` only if you already run migrations elsewhere in your release process.

If `PLESK_*` deploy variables are missing, the command prompts for them on first run and can persist them to your local `.env`.

Set these in your local `.env` first:

```env
PLESK_SSH_HOST="your.server.com"
PLESK_SSH_USER="your-ssh-user"
PLESK_SSH_PORT="22"
PLESK_REMOTE_PATH="/var/www/vhosts/yourdomain.com/httpdocs"
```

## Prerequisites

- Plesk server with Node.js support
- SSH access to your server
- PostgreSQL database
- Domain configured in Plesk

## Deployment Steps

### 1. Prepare Your Server

In Plesk, create a new Node.js application:

- Go to **Websites & Domains** → **Node.js**
- Click **Enable Node.js**
- Set Node.js version to **18.x or higher**

### 2. Clone Repository

SSH into your server and navigate to your application directory:

```bash
cd /var/www/vhosts/yourdomain.com/httpdocs
git clone https://github.com/tshwanom/e-pub-reader.git .
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create `.env` file in Plesk or via SSH:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/epub_reader?schema=public"

# NextAuth
NEXTAUTH_URL="https://yourdomain.com"
NEXTAUTH_SECRET="your-production-secret-key"

# UploadThing
UPLOADTHING_SECRET="sk_live_..."
UPLOADTHING_APP_ID="your_app_id"

# Narration object storage (local disk example for single-server Plesk installs)
NARRATION_STORAGE_PROVIDER="local"
NARRATION_STORAGE_REGION=""
NARRATION_STORAGE_ENDPOINT=""
NARRATION_STORAGE_ACCESS_KEY_ID=""
NARRATION_STORAGE_SECRET_ACCESS_KEY=""
NARRATION_STORAGE_BUCKET_NAME=""
NARRATION_STORAGE_FORCE_PATH_STYLE="false"
NARRATION_STORAGE_PREFIX="narration"
NARRATION_STORAGE_SIGNED_URL_TTL_SECONDS="900"
NARRATION_STORAGE_LOCAL_DIR="storage"

# PayPal
PAYPAL_CLIENT_ID="your_client_id"
PAYPAL_CLIENT_SECRET="your_client_secret"
PAYPAL_MODE="live"

# Paystack
PAYSTACK_SECRET_KEY="your_paystack_secret_key"

# Currency conversion for multi-currency donations
CURRENCYBEACON_API_KEY="your_currencybeacon_api_key"

# Server
NODE_ENV="production"
PORT=3001
HOSTNAME="0.0.0.0"
```

> In local mode, leave the cloud endpoint, key, bucket, and any `R2_*` / `B2_*` compatibility variables blank. They are inactive unless you intentionally switch `NARRATION_STORAGE_PROVIDER` away from `local`.

### 5. Set Up Database

Run Prisma migrations:

```bash
npx prisma migrate deploy
npx prisma generate
```

If you are deploying donor narration support, make sure your production database has the latest narration schema before restart. The current schema includes narration voices, chapters, cues, and `NarrationStorageProvider` values for `S3`, `R2`, `B2`, and `LOCAL`.

If you choose `NARRATION_STORAGE_PROVIDER="local"`, generated narration audio and manifests are written under `NARRATION_STORAGE_LOCAL_DIR` using the object key path (for example `storage/narration/...`). Keep that directory persistent between deployments.

The deployment package only creates empty placeholders for `storage/`, `storage/uploads/`, and `storage/narration/`. It does not carry forward live uploads or generated narration audio, so use a persistent writable location if your deployment process replaces the extracted app directory on each release.

### 6. Build the Application

```bash
npm run build
```

### 7. Configure Plesk Node.js Settings

In Plesk Node.js settings:

- **Application mode**: Production
- **Application root**: `/var/www/vhosts/yourdomain.com/httpdocs`
- **Application startup file**: `server.js` (or `app.js`)
- **Custom environment variables**: Add all variables from `.env`

### 8. Configure Apache/Nginx Proxy

Plesk should automatically configure the reverse proxy. Verify:

- **Document root**: Points to your application directory
- **Proxy mode**: Enabled
- **Port**: 3001 (or your configured PORT)

### 9. Start the Application

In Plesk:

- Click **NPM Install** (if available)
- Click **Restart App**

Or via SSH:

```bash
npm start
```

### 10. Set Up Process Manager (PM2 - Recommended)

For better process management, use PM2:

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start server.js --name epub-reader

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
```

## Plesk-Specific Configuration

### Application Startup File

Plesk expects one of these files:

- ✅ `server.js` (created)
- ✅ `app.js` (created)
- `index.js`

Both `server.js` and `app.js` are identical and serve as entry points.

Both entrypoints use the shared `server-runtime.js` bootstrap so restarts apply pending Prisma migrations before Next.js begins serving traffic.

### Scripts Configuration

The `package.json` includes:

- `npm start` - Production server with custom server
- `npm run build` - Build Next.js application
- `npm run dev` - Development server (don't use in production)

### Port Configuration

The application reads the port from:

1. `PORT` environment variable (set in Plesk)
2. Default: 3001

Make sure Plesk's reverse proxy is configured to forward to this port.

## Troubleshooting

### Application Won't Start

1. **Check Node.js version**: Must be 18.x or higher

   ```bash
   node --version
   ```

2. **Check build output**: Ensure `npm run build` completed successfully

   ```bash
   ls -la .next/
   ```

3. **Check logs**: View Plesk logs or:
   ```bash
   pm2 logs epub-reader
   ```

### Database Connection Issues

1. Verify `DATABASE_URL` is correct
2. Check PostgreSQL is running
3. Ensure database user has proper permissions
4. Test connection:
   ```bash
   npx prisma db pull
   ```

### Port Already in Use

Change the PORT in environment variables or `.env`:

```bash
PORT=3001
```

### File Upload Issues

1. Verify UploadThing credentials are set
2. Check file permissions in upload directory
3. Ensure `UPLOADTHING_SECRET` and `UPLOADTHING_APP_ID` are correct

### Narration Storage Issues

1. Verify the `NARRATION_STORAGE_*` variables are set for your chosen provider
2. Confirm the bucket/container exists and the access keys can read private objects
3. For R2 or B2, ensure the endpoint/account settings match your provider dashboard
4. If donor narration reports `storage-not-configured`, compare the Plesk environment values against `.env.example`

### Local Narration Storage Notes

If you run donor narration storage locally on Plesk:

1. Set `NARRATION_STORAGE_PROVIDER="local"`
2. Point `NARRATION_STORAGE_LOCAL_DIR` at a persistent writable path (for example `storage` or a shared directory outside the release folder if deployments replace the app root)
3. Make sure the Node.js app user can create and read files there
4. Preserve that directory across deployments, backups, and restores
5. Remember the deployment package only restores empty placeholders under `storage/`; it does not restore your previously generated narration files

### Build Errors

If build fails due to memory:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

## Performance Optimization

### Enable Production Mode

Ensure `NODE_ENV=production` is set in environment variables.

### Enable Caching

Next.js automatically caches built pages. Ensure `.next/` directory persists between deployments.

### CDN Configuration

For static assets, configure Plesk to serve from CDN:

- Static files are in `.next/static/`
- Public files are in `public/`

## Monitoring

### Using PM2

```bash
# View status
pm2 status

# View logs
pm2 logs epub-reader

# Monitor resources
pm2 monit
```

### Plesk Monitoring

Use Plesk's built-in monitoring:

- **Websites & Domains** → **Statistics**
- **Node.js** → **Application Logs**

## Updating the Application

```bash
# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Run migrations
npx prisma migrate deploy

# Rebuild
npm run build

# Restart
pm2 restart epub-reader
# or in Plesk: Click "Restart App"
```

## Security Checklist

- [ ] Set strong `NEXTAUTH_SECRET`
- [ ] Use production PayPal credentials
- [ ] Use a production Paystack secret key
- [ ] Add a valid CurrencyBeacon API key for multi-currency donation conversion
- [ ] Enable HTTPS/SSL in Plesk
- [ ] Set proper file permissions (644 for files, 755 for directories)
- [ ] Don't commit `.env` to git
- [ ] Enable Plesk firewall
- [ ] Regular backups of database

## Support

For Plesk-specific issues, consult:

- [Plesk Node.js Documentation](https://docs.plesk.com/en-US/obsidian/administrator-guide/website-management/nodejs.74383/)
- [Next.js Custom Server Documentation](https://nextjs.org/docs/pages/building-your-application/configuring/custom-server)
