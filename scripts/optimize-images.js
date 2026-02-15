import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

async function optimizeImage(inputPath, outputPath, quality = 80) {
  try {
    const info = await sharp(inputPath)
      .webp({ quality })
      .toFile(outputPath);

    const inputSize = fs.statSync(inputPath).size;
    const outputSize = info.size;
    const savings = ((inputSize - outputSize) / inputSize * 100).toFixed(1);

    console.log(`✓ ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
    console.log(`  ${(inputSize / 1024 / 1024).toFixed(2)} MB -> ${(outputSize / 1024 / 1024).toFixed(2)} MB (${savings}% smaller)`);

    return info;
  } catch (error) {
    console.error(`✗ Error optimizing ${inputPath}:`, error.message);
  }
}

async function main() {
  console.log('🖼️  Optimizing hero images to WebP...\n');

  // Optimize hero images
  await optimizeImage(
    path.join(publicDir, 'hero-mockup-en.png'),
    path.join(publicDir, 'hero-mockup-en.webp'),
    85
  );

  await optimizeImage(
    path.join(publicDir, 'hero-mockup-he.png'),
    path.join(publicDir, 'hero-mockup-he.webp'),
    85
  );

  console.log('\n✅ Image optimization complete!');
}

main().catch(console.error);
