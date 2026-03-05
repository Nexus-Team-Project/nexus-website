/**
 * embed-knowledge.ts
 *
 * Generates OpenAI embeddings for all KnowledgeChunks that don't have one yet.
 * Run after seeding:  npx tsx scripts/embed-knowledge.ts
 *
 * Requires OPENAI_API_KEY and DATABASE_URL in .env
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required. Set it in .env');
    process.exit(1);
  }

  // Find chunks missing embeddings
  const chunksWithoutEmbedding = await prisma.$queryRawUnsafe<
    Array<{ id: string; title: string; content: string }>
  >(
    `SELECT id, title, content FROM "KnowledgeChunk"
     WHERE "isActive" = true AND embedding IS NULL
     ORDER BY "createdAt" ASC`,
  );

  if (chunksWithoutEmbedding.length === 0) {
    console.log('All knowledge chunks already have embeddings. Nothing to do.');
    return;
  }

  console.log(`Found ${chunksWithoutEmbedding.length} chunks without embeddings. Generating...`);

  let success = 0;
  let failed = 0;

  for (const chunk of chunksWithoutEmbedding) {
    try {
      const text = `${chunk.title}\n${chunk.content}`;
      const embedding = await embedText(text);
      const vector = `[${embedding.join(',')}]`;

      await prisma.$executeRawUnsafe(
        `UPDATE "KnowledgeChunk" SET embedding = $1::vector, "updatedAt" = NOW() WHERE id = $2`,
        vector,
        chunk.id,
      );

      success++;
      console.log(`  [${success}/${chunksWithoutEmbedding.length}] ${chunk.title}`);
    } catch (err) {
      failed++;
      console.error(`  FAILED: ${chunk.title}`, err);
    }

    // Small delay to respect rate limits
    if (success % 10 === 0) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\nDone! ${success} embedded, ${failed} failed.`);
}

main()
  .catch((e) => {
    console.error('embed-knowledge failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
