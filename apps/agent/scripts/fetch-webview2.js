// Vendors the three WebView2 host assemblies the announcement overlay needs into
// apps/agent/vendor/webview2/, which scripts/package.js then ships into the installer.
//
// These come from the Microsoft.Web.WebView2 NuGet package rather than npm (there is no npm
// distribution) and are deliberately NOT committed — they're ~800KB of binaries that this script
// can reproduce exactly from a pinned version.
//
// Why lib/net462 and not one of the netcoreapp/net8 variants: the overlay is hosted by the
// scheduled task's `powershell.exe`, which is Windows PowerShell 5.1 running on .NET Framework
// 4.8. Loading a .NET Core assembly there fails at Add-Type. WebView2Loader.dll is the native
// loader the managed Core assembly P/Invokes into, so it has to sit alongside them.
//
// Note this vendors only the *host assemblies*. The WebView2 runtime itself (the actual browser)
// is a separate machine-wide component installed by the Evergreen bootstrapper that
// installer/saverlly-agent.iss runs — see the [Run] section there.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WEBVIEW2_VERSION = '1.0.2903.40';

// Microsoft's permanent link to the Evergreen *bootstrapper* (~2MB), which downloads and installs
// the current runtime at install time. Deliberately not the 130MB standalone offline installer:
// per the packaging decision, kiosks are online at install time and the runtime self-updates
// afterwards, so bundling 130MB into every setup.exe buys nothing.
const EVERGREEN_BOOTSTRAPPER_URL = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703';

const root = path.join(__dirname, '..');
const vendorRoot = path.join(root, 'vendor');
const vendorDir = path.join(vendorRoot, 'webview2');
const bootstrapperPath = path.join(vendorRoot, 'MicrosoftEdgeWebview2Setup.exe');

// Source path inside the .nupkg -> filename we ship.
const WANTED = [
  ['lib/net462/Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.Core.dll'],
  ['lib/net462/Microsoft.Web.WebView2.WinForms.dll', 'Microsoft.Web.WebView2.WinForms.dll'],
  ['runtimes/win-x64/native/WebView2Loader.dll', 'WebView2Loader.dll'],
];

function alreadyVendored() {
  return (
    WANTED.every(([, name]) => fs.existsSync(path.join(vendorDir, name))) &&
    fs.existsSync(bootstrapperPath)
  );
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

async function run() {
  if (alreadyVendored()) {
    console.log(`WebView2 host assemblies already vendored -> ${vendorDir}`);
    return;
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'saverlly-webview2-'));
  const nupkg = path.join(work, 'webview2.zip');
  const extracted = path.join(work, 'extracted');

  console.log(`Downloading Microsoft.Web.WebView2 ${WEBVIEW2_VERSION}…`);
  await download(
    `https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/${WEBVIEW2_VERSION}`,
    nupkg,
  );

  // A .nupkg is a zip. Expand-Archive avoids taking on an unzip dependency purely for a build
  // step that, by definition, only ever runs on Windows (it produces Windows exes).
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath '${nupkg}' -DestinationPath '${extracted}' -Force`,
    ],
    { stdio: 'inherit' },
  );

  fs.mkdirSync(vendorDir, { recursive: true });
  for (const [source, name] of WANTED) {
    const from = path.join(extracted, ...source.split('/'));
    if (!fs.existsSync(from)) {
      throw new Error(`${source} missing from the NuGet package — did its layout change?`);
    }
    fs.copyFileSync(from, path.join(vendorDir, name));
  }

  fs.rmSync(work, { recursive: true, force: true });
  console.log(`Vendored ${WANTED.length} WebView2 host assemblies -> ${vendorDir}`);

  console.log('Downloading the WebView2 Evergreen bootstrapper…');
  await download(EVERGREEN_BOOTSTRAPPER_URL, bootstrapperPath);
  console.log(`Vendored the Evergreen bootstrapper -> ${bootstrapperPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
