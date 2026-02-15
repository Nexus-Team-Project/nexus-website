import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.join(__dirname, '../src/assets/logos');

const ffmpegPath = ffmpegInstaller.path;

const gifs = [
  { input: 'nexus-logo-animated.gif', output: 'nexus-logo-animated.webm' },
  { input: 'nexus-logo-animated-black.gif', output: 'nexus-logo-animated-black.webm' },
];

async function convertGifToWebM(inputPath, outputPath) {
  try {
    console.log(`Converting ${path.basename(inputPath)} to WebM...`);

    // FFmpeg command optimized for logos - smaller file size
    const command = `"${ffmpegPath}" -i "${inputPath}" -c:v libvpx-vp9 -b:v 150k -crf 35 -row-mt 1 -an "${outputPath}" -y`;

    await execAsync(command);

    const inputSize = fs.statSync(inputPath).size;
    const outputSize = fs.statSync(outputPath).size;
    const savings = ((inputSize - outputSize) / inputSize * 100).toFixed(1);

    console.log(`✓ ${path.basename(outputPath)}`);
    console.log(`  ${(inputSize / 1024 / 1024).toFixed(2)} MB -> ${(outputSize / 1024).toFixed(2)} KB (${savings}% smaller)\n`);

    return { inputSize, outputSize, savings };
  } catch (error) {
    console.error(`✗ Error converting ${inputPath}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🎬 Converting animated GIFs to WebM video format...\n');
  console.log(`Using ffmpeg: ${ffmpegPath}\n`);

  let totalSaved = 0;

  for (const gif of gifs) {
    const inputPath = path.join(assetsDir, gif.input);
    const outputPath = path.join(assetsDir, gif.output);

    if (!fs.existsSync(inputPath)) {
      console.log(`⚠️  ${gif.input} not found, skipping...`);
      continue;
    }

    const result = await convertGifToWebM(inputPath, outputPath);
    totalSaved += result.inputSize - result.outputSize;
  }

  console.log(`✅ Conversion complete!`);
  console.log(`💾 Total space saved: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);
