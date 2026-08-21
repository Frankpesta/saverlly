// One-off prep script (run manually, not part of the normal build) that generates the two
// wizard images Inno Setup wants — no existing brand asset is pre-sized for either. Same
// crop-then-compose technique already used twice elsewhere in this project for the dashboard
// and extension logo assets (see the design-fidelity memory): trim the source icon's
// transparent padding first, then place it deliberately rather than trusting raw dimensions.
//
// - small.png (55x58): Inno's per-page corner image — kept transparent so it blends into the
//   wizard's white page background instead of sitting in a visible box.
// - wizard.png (164x314): Inno's tall welcome/finish sidebar image — solid brand-black
//   (#1C1C1C) background with the teal icon centered, matching the same teal-on-dark treatment
//   already used for 02_main_logo_dark_bg.png elsewhere in the brand assets.
const sharp = require('sharp');
const path = require('path');

const designDir = path.join(__dirname, '..', '..', 'dashboard', 'design');
const sourceIcon = path.join(designDir, '05_logo_icon_filled.png');
const outDir = path.join(__dirname, 'assets');

const BRAND_BLACK = '#1c1c1c';

async function run() {
  const trimmed = await sharp(sourceIcon).trim().toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();

  // small.png: transparent canvas, icon scaled to fit within a small margin.
  const smallIconSize = 40;
  const smallIcon = await sharp(trimmed)
    .resize({ width: smallIconSize, height: smallIconSize, fit: 'inside' })
    .toBuffer();
  const smallIconMeta = await sharp(smallIcon).metadata();
  await sharp({
    create: { width: 55, height: 58, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: smallIcon,
        left: Math.round((55 - smallIconMeta.width) / 2),
        top: Math.round((58 - smallIconMeta.height) / 2),
      },
    ])
    .png()
    .toFile(path.join(outDir, 'small.png'));

  // wizard.png: solid brand-black canvas, icon scaled to a comfortable fraction of the width.
  const wizardIconWidth = 96;
  const wizardIconHeight = Math.round((wizardIconWidth / trimmedMeta.width) * trimmedMeta.height);
  const wizardIcon = await sharp(trimmed).resize({ width: wizardIconWidth, height: wizardIconHeight }).toBuffer();
  await sharp({
    create: { width: 164, height: 314, channels: 4, background: BRAND_BLACK },
  })
    .composite([
      {
        input: wizardIcon,
        left: Math.round((164 - wizardIconWidth) / 2),
        top: Math.round((314 - wizardIconHeight) / 2),
      },
    ])
    .png()
    .toFile(path.join(outDir, 'wizard.png'));

  console.log(`Generated ${path.join(outDir, 'small.png')} and ${path.join(outDir, 'wizard.png')}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
