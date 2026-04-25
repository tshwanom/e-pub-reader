const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const ZIP_NAME = 'plesk-deploy.zip';

console.log('🚀 Starting Next.js Production Build for Plesk...');

try {
  // 1. Run the build
  console.log('Running npm run build...');
  execSync('npm run build', {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });
  console.log('✅ Build successful.');

  // 2. Create a file to stream archive data to.
  const output = fs.createWriteStream(path.join(__dirname, '..', ZIP_NAME));
  const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
  });

  // Listen for all archive data to be written
  output.on('close', function() {
    console.log(`\n📦 Successfully created ${ZIP_NAME}.`);
    console.log(`Total size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
    console.log('\nYou can now upload this zip file to your Plesk server and extract it.');
  });

  // Good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
      console.warn('Warning:', err);
    } else {
      throw err;
    }
  });

  // Good practice to catch this error explicitly
  archive.on('error', function(err) {
    throw err;
  });

  // Pipe archive data to the file
  archive.pipe(output);

  // 3. Add necessary folders and files
  const rootDir = path.join(__dirname, '..');

  // Folders to include entirely
  const foldersToInclude = ['.next', 'public', 'prisma'];
  foldersToInclude.forEach(folder => {
    const folderPath = path.join(rootDir, folder);
    if (fs.existsSync(folderPath)) {
      console.log(`Adding folder: ${folder}/`);
      archive.directory(folderPath, folder);
    } else {
      console.warn(`⚠️ Warning: Folder ${folder} not found, skipping.`);
    }
  });

  // Individual files to include
  const filesToInclude = ['package.json', 'package-lock.json', 'server.js'];
  filesToInclude.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`Adding file: ${file}`);
      archive.file(filePath, { name: file });
    } else {
      console.warn(`⚠️ Warning: File ${file} not found, skipping.`);
    }
  });

  // 4. Finalize the archive (ie we are done appending files but streams have to finish yet)
  console.log('Zipping files, please wait...');
  archive.finalize();

} catch (error) {
  console.error('\n❌ Packaging failed.');
  console.error(error.message);
  process.exit(1);
}
