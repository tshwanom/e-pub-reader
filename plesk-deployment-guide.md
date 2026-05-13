# Plesk Server-Side Deployment

This guide explains how to deploy your application directly on your Plesk server using the Plesk Node.js UI. This method requires no SSH configuration and no manual uploading of ZIP files.

## 1) Pull the latest code on your Server

Since you are managing Git yourself, simply ensure the latest version of your code is available on the Plesk server. 
- You can do this by using the **Plesk Git extension** to pull the latest commit, or by running `git pull` yourself.

## 2) Run the Deployment Script in Plesk

1. Log into your Plesk Panel.
2. Go to **Websites & Domains** and open the **Node.js** app for your domain.
3. Click the **Run script** button.
4. Type `deploy:plesk` and hit Run.

This single script (`scripts/deploy-plesk.js`) will execute the following steps locally on your server:
1. `npm install` (Installs/updates packages)
2. `npx prisma migrate deploy` (Applies any pending production database migrations)
3. `npx prisma generate` (Generates the database client for the server's OS)
4. `npm run build` (Compiles the Next.js production build)

The production startup entrypoints (`server.js` and `app.js`) also run `prisma migrate deploy` automatically before boot unless you explicitly set `AUTO_RUN_PRISMA_MIGRATIONS=false`.

## 3) Restart the App

Once the script finishes successfully:
1. In the Node.js Plesk UI, click the **Restart App** button.

Your server is now running the latest version!
