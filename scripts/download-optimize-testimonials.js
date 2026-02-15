import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public/testimonials');

// Create testimonials directory if it doesn't exist
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const images = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1504593811423-6dd665756598?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400&h=400&fit=crop',
];

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      } else {
        reject(new Error(`Failed to download: ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

async function optimizeImage(inputPath, outputPath, quality = 85) {
  const info = await sharp(inputPath)
    .webp({ quality })
    .toFile(outputPath);

  const inputSize = fs.statSync(inputPath).size;
  const outputSize = info.size;
  const savings = ((inputSize - outputSize) / inputSize * 100).toFixed(1);

  return { inputSize, outputSize, savings };
}

async function main() {
  console.log('🖼️  Downloading and optimizing testimonial images...\n');

  for (let i = 0; i < images.length; i++) {
    const url = images[i];
    const tempPath = path.join(publicDir, `temp-${i + 1}.jpg`);
    const webpPath = path.join(publicDir, `person-${i + 1}.webp`);

    try {
      console.log(`[${i + 1}/${images.length}] Downloading image ${i + 1}...`);
      await downloadImage(url, tempPath);

      console.log(`[${i + 1}/${images.length}] Optimizing to WebP...`);
      const { inputSize, outputSize, savings } = await optimizeImage(tempPath, webpPath);

      console.log(`✓ person-${i + 1}.webp: ${(inputSize / 1024).toFixed(1)} KB -> ${(outputSize / 1024).toFixed(1)} KB (${savings}% smaller)\n`);

      // Remove temp file
      fs.unlinkSync(tempPath);
    } catch (error) {
      console.error(`✗ Error processing image ${i + 1}:`, error.message);
    }
  }

  console.log('✅ All testimonial images downloaded and optimized!');
}

main().catch(console.error);
