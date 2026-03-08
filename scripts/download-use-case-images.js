import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public/use-cases');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const images = [
  { url: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&q=80', name: 'holiday-gifts' },
  { url: 'https://images.unsplash.com/photo-1549465220-1a8b9238f862?w=800&q=80', name: 'birthday-gifts' },
  { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80', name: 'bonuses' },
  { url: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80', name: 'annual-budget' },
];

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(filepath);
        downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(filepath);
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(filepath);
      reject(err);
    });
  });
}

async function optimizeImage(inputPath, outputPath) {
  const info = await sharp(inputPath)
    .resize(800, 500, { fit: 'cover' })
    .webp({ quality: 85 })
    .toFile(outputPath);
  console.log(`  Optimized: ${path.basename(outputPath)} (${(info.size / 1024).toFixed(1)} KB)`);
}

async function main() {
  console.log('Downloading and optimizing use case images...\n');

  for (const img of images) {
    const tmpPath = path.join(publicDir, `${img.name}-tmp.jpg`);
    const outPath = path.join(publicDir, `${img.name}.webp`);

    console.log(`Downloading: ${img.name}...`);
    try {
      await downloadImage(img.url, tmpPath);
      await optimizeImage(tmpPath, outPath);
      fs.unlinkSync(tmpPath);
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
  }

  console.log('\nDone!');
}

main();
