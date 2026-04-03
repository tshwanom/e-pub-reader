# Deploying Next.js to Plesk

This guide explains how to quickly and reliably deploy your Next.js application to a Plesk server using the custom `pack-for-plesk.js` script.

## 1. Build and Package Locally

Instead of running `npm run build` directly on your server, which is slow and often results in out-of-memory errors, use the custom packing script:

1. Open your terminal in the project directory.
2. Run the build command:
   ```bash
   npm run build:plesk
   ```
3. Once completed, a file named `plesk-deploy.zip` will be generated in your project folder.

## 2. Upload to Plesk

1. Log in to your **Plesk Control Panel**.
2. Navigate to **Websites & Domains** -> **[Your Domain name]**.
3. Click on the **File Manager** and open the root directory for your domain (usually `httpdocs` or a custom directory you set).
4. Click **Upload** and upload the `plesk-deploy.zip` file you generated.
5. Once uploaded, select the `.zip` file in the File Manager, click **Archive** -> **Extract Files**, and replace the existing content. Keep your `.env` file since it is not included in the zip archive for security reasons.

## 3. Configure Node.js Extension in Plesk

Ensure your domain has Node.js support enabled. In the **Websites & Domains** section for your domain:

1. Click on **Node.js** (or "Node.js App" if already enabled).
2. Configure the following settings:
   - **Document Root**: MUST point to the root directory folder you extracted the files in (e.g., `/httpdocs`). **DO NOT** point it to `.next` or `public`.
   - **Application Mode**: `production`
   - **Application Root**: The same as the Document Root (e.g., `/httpdocs`).
   - **Application Startup File**: `server.js` (this is explicit, Next.js uses our custom one)
3. Under the **Package Management** section in the Node.js panel:
   - Click the **NPM Install** button. This will quickly install only the production dependencies since you uploaded the `package.json` and `package-lock.json`. This is much faster than uploading `node_modules`.

## 4. Run Prisma Migrations (Optional)

If you made changes to the database schema:

1. Access your Plesk via SSH. OR open the Plesk Terminal.
2. Navigate to your application root folder (e.g., `cd httpdocs`).
3. Run the migrations:
   ```bash
   npx prisma migrate deploy
   ```

## 5. Restart Application

1. Go back to the **Node.js** section in your Plesk domain dashboard.
2. Click **Restart App**.
3. Visit your website to ensure the deployment is successful.
