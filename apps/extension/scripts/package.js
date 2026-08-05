// Zips the built dist/ folder into a submittable package — for the Chrome Web Store
// and for affiliate/merchant program review applications that ask for the extension package.
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const releaseDir = path.join(root, 'release');

if (!fs.existsSync(dist)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const { version } = require(path.join(root, 'manifest.json'));
fs.mkdirSync(releaseDir, { recursive: true });
const outPath = path.join(releaseDir, `saverlly-extension-v${version}.zip`);

const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Packaged ${archive.pointer()} bytes -> ${outPath}`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(dist, false);
archive.finalize();
