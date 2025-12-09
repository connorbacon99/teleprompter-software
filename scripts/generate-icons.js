const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'icon.svg');

async function generateIcons() {
  console.log('Generating icons from SVG...');

  const svgBuffer = fs.readFileSync(svgPath);

  // Generate 512x512 PNG (electron-builder will create icns/ico from this)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('Created icon.png (512x512)');

  // Generate 1024x1024 PNG for high-res displays
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(assetsDir, 'icon@2x.png'));
  console.log('Created icon@2x.png (1024x1024)');

  // Generate various sizes for macOS iconset
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(assetsDir, `icon_${size}x${size}.png`));
  }
  console.log('Created all icon sizes for iconset');

  console.log('Done! Run "npm run build" to create the app with the new icon.');
}

generateIcons().catch(console.error);
