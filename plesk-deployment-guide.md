# One-Command Plesk Deployment

You can now deploy with a single command:

```bash
npm run deploy:plesk
```

The command builds the app, uploads it to your Plesk server, extracts it, installs dependencies, runs Prisma steps, and restarts the app.

## 1) One-time setup

1. Make sure your Plesk app is already created once in **Websites & Domains → Node.js**.
2. In Plesk Node.js settings, keep:
   - **Application mode**: `production`
   - **Application startup file**: `server.js`
   - **Application root**: your deploy path (usually `httpdocs`)
3. Keep your production `.env` file on the server in your app root.
4. Configure local deploy variables in your local `.env` (not committed):

```env
PLESK_SSH_HOST="your.server.com"
PLESK_SSH_USER="your-ssh-user"
PLESK_SSH_PORT="22"
PLESK_REMOTE_PATH="/var/www/vhosts/yourdomain.com/httpdocs"
PLESK_SSH_KEY="" # optional
PLESK_RUN_MIGRATIONS="true"
```

## 2) Deploy

From your project root, run:

```bash
npm run deploy:plesk
```

## 3) What this command does

`npm run deploy:plesk` performs all of this automatically:

1. Runs `npm run build:plesk` (build + create `plesk-deploy.zip`)
2. Uploads the zip to your server with SSH/SCP
3. Extracts it in `PLESK_REMOTE_PATH`
4. Runs install command (`npm ci --no-audit --no-fund` by default)
5. Runs `npx prisma generate`
6. Runs `npx prisma migrate deploy` (unless disabled)
7. Restarts app using `mkdir -p tmp && touch tmp/restart.txt` (default)

## 4) Optional knobs (all in `.env`)

- `PLESK_RUN_PRISMA_GENERATE="false"` → skip Prisma generate
- `PLESK_RUN_MIGRATIONS="false"` → skip DB migrations
- `PLESK_SKIP_BUILD="true"` → skip local build/package
- `PLESK_INSTALL_COMMAND="npm install --no-audit --no-fund"` → custom install command
- `PLESK_RESTART_COMMAND="..."` → custom restart command for your server setup

## 5) Notes

- Requires local `ssh` and `scp` commands available in PATH.
- Keep secrets in `.env` only.
- If your server does not use Passenger restart behavior, set `PLESK_RESTART_COMMAND` to your real restart command.
