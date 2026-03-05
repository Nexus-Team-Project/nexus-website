import OpenAI from 'openai';
import { prisma } from '../config/database';
import { env } from '../config/env';

// ─── Simple TTL in-memory cache ───────────────────────────
// Avoids hitting DB on every AI message for data that rarely changes
interface CacheEntry<T> { value: T; expiresAt: number }
class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return undefined; }
    return entry.value;
  }
  set(key: string, value: T, ttlMs: number) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  delete(key: string) { this.store.delete(key); }
}

const promptCache    = new TtlCache<string>();
const examplesCache  = new TtlCache<Awaited<ReturnType<typeof prisma.aiExample.findMany>>>();
const PROMPT_TTL_MS  = 5 * 60 * 1000;   // 5 minutes
const EXAMPLE_TTL_MS = 10 * 60 * 1000;  // 10 minutes

// Lazy init — OpenAI throws at construction if key is empty; use placeholder so module loads
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY ?? 'sk-not-configured' });

const DEFAULT_SYSTEM_PROMPT = `אתה נציג תמיכה ומכירות של Nexus — אקו־סיסטם של פתרונות נאמנות ותשלומים.
עונה תמיד בעברית, בנימה מקצועית אך ידידותית וחמה.

הנחיות:
• הבן את צורך הלקוח ב-1-2 שאלות לפני שאתה ממליץ
• תשובות קצרות ולעניין — עד 3 משפטים
• אם הלקוח מעוניין בדמו או שאלה טכנית מורכבת — הצע נציג אנושי
• אל תמציא מחירים — השתמש רק בפרטים מהידע שסופק לך
• אם אין לך תשובה מדויקת — אמור בכנות ותציע נציג
• אם הלקוח מבקש נציג אנושי — ענה: ESCALATE
• שאל שאלות הכשרה: מה היית רוצה לשפר? איזה סוג ארגון? מה התפקיד שלך? כמה אנשים בקהילה?

משפט escalation: "אני מחבר אותך עכשיו לנציג מומחה שיוכל לעזור — הוא יחזור אליך תוך דקות."`;

const ESCALATION_TRIGGERS = [
  'נציג', 'אדם', 'בן אדם', 'דמו', 'demo', 'human', 'agent',
  'מחיר מדויק', 'הצעת מחיר', 'quote',
];

// ─── Embed text ───────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

// ─── RAG search ───────────────────────────────────────────

async function searchKnowledge(queryEmbedding: number[], limit = 3) {
  // pgvector cosine similarity search using raw query
  const vector = `[${queryEmbedding.join(',')}]`;

  const results = await prisma.$queryRawUnsafe<
    Array<{ id: string; title: string; content: string; similarity: number }>
  >(
    `SELECT id, title, content,
       1 - (embedding <=> $1::vector) AS similarity
     FROM "KnowledgeChunk"
     WHERE "isActive" = true
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vector,
    limit,
  );

  return results;
}

// ─── Get system prompt from DB (cached 5 min) ────────────

async function getSystemPrompt(): Promise<string> {
  const cached = promptCache.get('system_prompt');
  if (cached !== undefined) return cached;

  const config = await prisma.aiConfig.findUnique({ where: { key: 'system_prompt' } });
  const value = config?.value ?? DEFAULT_SYSTEM_PROMPT;
  promptCache.set('system_prompt', value, PROMPT_TTL_MS);
  return value;
}

// Expose cache invalidation so admin routes can bust it on update
export function invalidatePromptCache() { promptCache.delete('system_prompt'); }

// ─── Few-shot examples (cached 10 min) ───────────────────

async function getFewShotExamples(category?: string, limit = 2) {
  const cacheKey = `examples:${category ?? '*'}:${limit}`;
  const cached = examplesCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const examples = await prisma.aiExample.findMany({
    where: { isActive: true, ...(category && { category }) },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
  examplesCache.set(cacheKey, examples, EXAMPLE_TTL_MS);
  return examples;
}

// ─── Detect escalation need ───────────────────────────────

function detectEscalation(
  userText: string,
  bestSimilarity: number,
  messageCount: number,
): boolean {
  const textLower = userText.toLowerCase();
  if (ESCALATION_TRIGGERS.some((t) => textLower.includes(t.toLowerCase()))) return true;
  if (bestSimilarity < 0.35 && messageCount > 2) return true; // Very low confidence
  if (messageCount >= 5) return true; // Max AI messages
  return false;
}

// ─── Main: generate AI reply ──────────────────────────────

export async function generateReply(
  sessionId: string,
  userMessage: string,
  recentMessages: Array<{ sender: string; text: string }>,
): Promise<{ text: string; shouldEscalate: boolean } | null> {
  try {
    // 1. Embed the user question
    const queryEmbedding = await embedText(userMessage);

    // 2. RAG: search knowledge base
    const chunks = await searchKnowledge(queryEmbedding);
    const bestSimilarity = chunks[0]?.similarity ?? 0;

    // 3. Detect escalation before calling GPT
    const messageCount = recentMessages.filter((m) => m.sender === 'CUSTOMER').length;
    if (detectEscalation(userMessage, bestSimilarity, messageCount)) {
      return {
        text: 'אני מחבר אותך עכשיו לנציג מומחה שיוכל לעזור — הוא יחזור אליך תוך דקות.',
        shouldEscalate: true,
      };
    }

    // 4. Get dynamic system prompt from DB
    const systemPrompt = await getSystemPrompt();

    // 5. Build knowledge context
    const knowledgeContext = chunks.length > 0
      ? `\n\n--- מידע רלוונטי ---\n${chunks.map((c) => `**${c.title}:**\n${c.content}`).join('\n\n')}`
      : '';

    // 6. Get few-shot examples
    const examples = await getFewShotExamples(undefined, 2);
    const exampleContext = examples.length > 0
      ? `\n\n--- דוגמאות תשובות ---\n${examples
          .map((e) => `שאלה: ${e.question}\nתשובה: ${e.answer}`)
          .join('\n\n')}`
      : '';

    // 7. Build chat history (last 10 messages)
    const historyMessages: OpenAI.ChatCompletionMessageParam[] = recentMessages
      .slice(-10)
      .map((m) => ({
        role: m.sender === 'CUSTOMER' ? 'user' : 'assistant',
        content: m.text,
      }));

    // 8. Call GPT-4o-mini
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: systemPrompt + knowledgeContext + exampleContext,
        },
        ...historyMessages,
        { role: 'user', content: userMessage },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) return null;

    // 9. Check if AI decided to escalate
    const shouldEscalate = reply.toUpperCase().includes('ESCALATE');
    const finalText = shouldEscalate
      ? 'אני מחבר אותך עכשיו לנציג מומחה שיוכל לעזור — הוא יחזור אליך תוך דקות.'
      : reply;

    return { text: finalText, shouldEscalate };
  } catch (error) {
    console.error('[AI] generateReply error:', error);
    // Fallback message on error
    return {
      text: 'מצטערים, אירעה שגיאה זמנית. מחבר אותך לנציג...',
      shouldEscalate: true,
    };
  }
}

// ─── Admin: add knowledge chunk ───────────────────────────

export async function addKnowledgeChunk(data: {
  title: string;
  content: string;
  source?: string;
  language?: string;
}) {
  const embedding = await embedText(`${data.title}\n${data.content}`);
  const vector = `[${embedding.join(',')}]`;

  const chunk = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO "KnowledgeChunk" (id, title, content, source, language, embedding, "isActive", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::vector, true, NOW(), NOW())
     RETURNING id`,
    data.title,
    data.content,
    data.source ?? null,
    data.language ?? 'he',
    vector,
  );

  return chunk[0];
}

export async function updateKnowledgeChunk(id: string, data: {
  title?: string;
  content?: string;
  source?: string;
  isActive?: boolean;
}) {
  // Re-embed if content changed
  if (data.title || data.content) {
    const existing = await prisma.knowledgeChunk.findUnique({ where: { id } });
    if (!existing) throw new Error('Chunk not found');

    const newTitle = data.title ?? existing.title;
    const newContent = data.content ?? existing.content;
    const embedding = await embedText(`${newTitle}\n${newContent}`);
    const vector = `[${embedding.join(',')}]`;

    await prisma.$queryRawUnsafe(
      `UPDATE "KnowledgeChunk"
       SET title = $1, content = $2, source = $3, "isActive" = $4,
           embedding = $5::vector, "updatedAt" = NOW()
       WHERE id = $6`,
      newTitle, newContent, data.source ?? existing.source,
      data.isActive ?? existing.isActive, vector, id,
    );
  } else {
    await prisma.knowledgeChunk.update({
      where: { id },
      data: { isActive: data.isActive },
    });
  }
}

// ─── Admin: test AI response ──────────────────────────────

export async function testAiResponse(question: string) {
  const queryEmbedding = await embedText(question);
  const chunks = await searchKnowledge(queryEmbedding);
  const systemPrompt = await getSystemPrompt();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.4,
    max_tokens: 300,
    messages: [
      {
        role: 'system',
        content:
          systemPrompt +
          (chunks.length > 0
            ? `\n\n--- מידע רלוונטי ---\n${chunks.map((c) => `**${c.title}:**\n${c.content}`).join('\n\n')}`
            : ''),
      },
      { role: 'user', content: question },
    ],
  });

  return {
    answer: completion.choices[0]?.message?.content?.trim(),
    chunksUsed: chunks.map((c) => ({ id: c.id, title: c.title, similarity: c.similarity })),
    systemPromptPreview: systemPrompt.slice(0, 200) + '...',
  };
}
