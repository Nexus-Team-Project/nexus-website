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
• תשובות קצרות ולעניין — עד 3 משפטים
• אל תמציא מחירים — השתמש רק בפרטים מהידע שסופק לך
• אם אין לך תשובה מדויקת — אמור בכנות ונסה לעזור בדרך אחרת
• אל תאיץ את השיחה — תן ללקוח להסביר את הצורך שלו

חוקים קריטיים להעברה לנציג:
• לעולם אל תציע להעביר לנציג לפני שאספת לפחות שם + (מייל או טלפון) מהלקוח
• אם הלקוח מבקש נציג — אמור: "בשמחה! כדי שהנציג יוכל לחזור אליך — מה שמך ומספר הטלפון או המייל שלך?"
• רק אחרי שקיבלת פרטי קשר — אמור ESCALATE
• אם אין לך מידע מספיק לענות — נסה לשאול שאלה ממוקדת במקום להעביר לנציג
• העברה לנציג היא אפשרות אחרונה, לא ראשונה

הנחיות קווליפיקציה (חשוב מאוד — לפני שאתה ממליץ על פתרון):

שלב 1 — הבנת הבעיה:
• "מה האתגר או הבעיה שאתם מנסים לפתור?"
• "מה אתם מחפשים — תוכנית נאמנות, מועדון הטבות, סליקה, או משהו אחר?"

שלב 2 — הכרת הארגון:
• "מה שם הארגון שלכם ומה התפקיד שלך?"
• "כמה לקוחות / עובדים / חברי קהילה יש לכם?"
• "באיזה תחום הארגון פועל?"

שלב 3 — איסוף פרטים:
• כשהלקוח מראה עניין, בקש: "מה המייל שלך כדי שנשלח לך פרטים נוספים?"
• אם הוא נותן שם/חברה/מייל/טלפון — סמן: [LEAD:field=value]
• לדוגמה: [LEAD:name=יוסי כהן] [LEAD:company=ABC Corp] [LEAD:email=yossi@abc.co.il]
• אל תבקש את כל הפרטים בבת אחת — שאל בהדרגה בשיחה טבעית

שלב 4 — המלצה:
• רק אחרי שהבנת את הצורך — המלץ על הפתרון המתאים
• הפנה לעמוד רלוונטי: [NAV:payments], [NAV:partners], [NAV:pricing]
• אם מתאים — הצע לתאם שיחה: [NAV:schedule]

שאלות טכניות:
• כשלקוח שואל על API, SDK, Webhooks, אינטגרציה — ענה בטון טכני מדויק
• השתמש במידע מהידע הטכני שסופק לך
• לשאלות טכניות מורכבות — הפנה לתיעוד: [NAV:api_docs]
• אם נדרש ליווי טכני אישי — הצע לתאם שיחה: [NAV:schedule]

ניווט בתוך הצ׳אט:
כשאתה מפנה לעמוד או שירות — הוסף תגית [NAV:key] בסוף ההודעה.
מפתחות זמינים:
• payments — עמוד פתרונות תשלומים
• partners — עמוד שותפים והטבות
• pricing — עמוד תמחור
• signup — הרשמה לחשבון חינם
• api_docs — תיעוד API למפתחים
• schedule — תיאום פגישה עם נציג
דוגמה: "אנחנו מציעים מגוון פתרונות סליקה שמתאימים לכל גודל עסק. [NAV:payments]"
ניתן לשלב מספר תגיות בהודעה אחת: [NAV:payments] [NAV:schedule]

משפט escalation: "אני מחבר אותך עכשיו לנציג מומחה שיוכל לעזור — הוא יחזור אליך תוך דקות."`;

// Only explicit "I want a human" triggers — removed sales-related words
// that the bot should handle itself (דמו, demo, מחיר מדויק, הצעת מחיר, quote)
const ESCALATION_TRIGGERS = [
  'נציג', 'אדם', 'בן אדם', 'human', 'agent',
];

// ─── Navigation map for in-chat page links ───────────────
export interface ChatAction {
  type: 'navigate' | 'external_link';
  label_he: string;
  label_en: string;
  url: string;
}

const NAVIGATION_MAP: Record<string, ChatAction> = {
  payments:  { type: 'navigate',      label_he: 'צפה בפתרונות תשלומים',  label_en: 'View Payments',        url: '/payments' },
  partners:  { type: 'navigate',      label_he: 'צפה בשותפים והטבות',    label_en: 'View Partners',        url: '/partners' },
  pricing:   { type: 'navigate',      label_he: 'צפה בתמחור',            label_en: 'View Pricing',         url: '/#pricing' },
  signup:    { type: 'navigate',      label_he: 'צור חשבון חינם',        label_en: 'Create Free Account',  url: '/signup' },
  api_docs:  { type: 'external_link', label_he: 'תיעוד API',             label_en: 'API Docs',             url: 'https://nexus-api-docs-production.up.railway.app/' },
  schedule:  { type: 'external_link', label_he: 'תאם פגישה',             label_en: 'Schedule Meeting',     url: 'https://app.apollo.io/#/meet/inbound-router/mis-xdv-oyk' },
};

/** Parse [LEAD:field=value] tags from AI response, return cleaned text + lead data. */
export function parseLeadTags(text: string): { cleanText: string; leadData: Record<string, string> } {
  const leadData: Record<string, string> = {};
  const cleanText = text.replace(/\[LEAD:(\w+)=([^\]]+)\]/g, (_match, field: string, value: string) => {
    leadData[field] = value.trim();
    return '';
  }).replace(/\s{2,}/g, ' ').trim();
  return { cleanText, leadData };
}

/** Parse [NAV:key] tags from AI response, return cleaned text + actions array. */
function parseNavigationActions(text: string, language: string = 'he'): { cleanText: string; actions: ChatAction[] } {
  const actions: ChatAction[] = [];
  const cleanText = text.replace(/\[NAV:(\w+)\]/g, (_match, key: string) => {
    const nav = NAVIGATION_MAP[key];
    if (nav) {
      // For internal navigation, add /he prefix for Hebrew routes
      const action = { ...nav };
      if (action.type === 'navigate' && language === 'he') {
        action.url = '/he' + action.url;
      }
      actions.push(action);
    }
    return ''; // Strip the tag from visible text
  }).replace(/\s{2,}/g, ' ').trim();

  return { cleanText, actions };
}

// ─── Embed text ───────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

// ─── Cosine similarity (computed in JS — no pgvector needed) ─

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── RAG search ───────────────────────────────────────────

async function searchKnowledge(queryEmbedding: number[], limit = 3) {
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { isActive: true, embedding: { isEmpty: false } },
    select: { id: true, title: true, content: true, embedding: true },
  });

  return chunks
    .map((c) => ({
      id: c.id,
      title: c.title,
      content: c.content,
      similarity: cosineSimilarity(queryEmbedding, c.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
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

/** Similarity-matched few-shot examples using embeddings (Phase 8D). */
async function getSimilarExamples(queryEmbedding: number[], limit = 2) {
  const examples = await prisma.aiExample.findMany({
    where: { isActive: true, embedding: { isEmpty: false } },
    select: { id: true, question: true, answer: true, embedding: true },
  });

  if (examples.length === 0) return [];

  return examples
    .map((e) => ({
      id: e.id,
      question: e.question,
      answer: e.answer,
      similarity: cosineSimilarity(queryEmbedding, e.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .filter((e) => e.similarity > 0.3); // Only include if reasonably similar
}

// ─── Detect escalation need ───────────────────────────────

function detectEscalation(
  userText: string,
  bestSimilarity: number,
  messageCount: number,
): { shouldEscalate: boolean; reason?: string; isExplicitRequest?: boolean } {
  const textLower = userText.toLowerCase();
  if (ESCALATION_TRIGGERS.some((t) => textLower.includes(t.toLowerCase()))) {
    return { shouldEscalate: true, reason: 'trigger_keyword', isExplicitRequest: true };
  }
  if (bestSimilarity < 0.25 && messageCount > 5) {
    return { shouldEscalate: true, reason: 'low_confidence' };
  }
  if (messageCount >= 12) {
    return { shouldEscalate: true, reason: 'max_messages' };
  }
  return { shouldEscalate: false };
}

// ─── Main: generate AI reply ──────────────────────────────

export async function generateReply(
  sessionId: string,
  userMessage: string,
  recentMessages: Array<{ sender: string; text: string }>,
  language: string = 'he',
  context?: { visitorId?: string; page?: string },
): Promise<{
  text: string;
  shouldEscalate: boolean;
  actions?: ChatAction[];
  leadData?: Record<string, string>;
  aiMetadata?: {
    chunksUsed: Array<{ id: string; title: string; similarity: number }>;
    bestSimilarity: number;
    tokensUsed?: { prompt: number; completion: number };
    escalationReason?: string;
  };
} | null> {
  try {
    // 1. Embed the user question
    const queryEmbedding = await embedText(userMessage);

    // 2. RAG: search knowledge base
    const chunks = await searchKnowledge(queryEmbedding);
    const bestSimilarity = chunks[0]?.similarity ?? 0;

    // 2b. Knowledge gap detection — track low-confidence questions
    if (bestSimilarity < 0.3) {
      prisma.knowledgeGap.create({
        data: {
          question: userMessage,
          bestScore: bestSimilarity,
          chunkId: chunks[0]?.id ?? null,
          sessionId,
        },
      }).catch((e) => console.error('[AI] Failed to log knowledge gap:', e));
    }

    // 3. Detect escalation before calling GPT
    const chunksUsedMeta = chunks.map((c) => ({ id: c.id, title: c.title, similarity: c.similarity }));
    const messageCount = recentMessages.filter((m) => m.sender === 'CUSTOMER').length;
    const escalation = detectEscalation(userMessage, bestSimilarity, messageCount);

    if (escalation.shouldEscalate) {
      // Check if we have lead data before allowing escalation
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId },
        select: { metadata: true },
      });
      const meta = (session?.metadata as Record<string, unknown>) ?? {};
      const leadInfo = (meta.leadData as Record<string, string>) ?? {};
      const hasLeadData = leadInfo.name || leadInfo.email || leadInfo.phone;

      // Only escalate immediately if: explicit "I want human" request AND we have lead data,
      // OR max_messages reached (safety valve)
      if ((escalation.isExplicitRequest && hasLeadData) || escalation.reason === 'max_messages') {
        return {
          text: 'אני מחבר אותך עכשיו לנציג מומחה שיוכל לעזור — הוא יחזור אליך תוך דקות.',
          shouldEscalate: true,
          aiMetadata: { chunksUsed: chunksUsedMeta, bestSimilarity, escalationReason: escalation.reason },
        };
      }
      // If explicit request but no lead data → let GPT ask for details (system prompt handles this)
      // If low_confidence but no explicit request → let GPT try to help
    }

    // 4. Get dynamic system prompt from DB
    const systemPrompt = await getSystemPrompt();

    // 4b. Inject visitor history (returning visitor memory)
    let visitorContext = '';
    if (context?.visitorId && messageCount === 0) {
      const history = await getVisitorHistory(context.visitorId);
      if (history) visitorContext = `\n\n--- הקשר מבקר ---\n${history}`;
    }

    // 4c. Inject page context
    let pageContext = '';
    if (context?.page) {
      const pc = getPageContext(context.page);
      if (pc) pageContext = `\n${pc}`;
    }

    // 5. Build knowledge context
    const knowledgeContext = chunks.length > 0
      ? `\n\n--- מידע רלוונטי ---\n${chunks.map((c) => `**${c.title}:**\n${c.content}`).join('\n\n')}`
      : '';

    // 6. Get few-shot examples (prefer similarity-matched, fallback to category-based)
    const similarExamples = await getSimilarExamples(queryEmbedding, 2);
    const examples = similarExamples.length > 0
      ? similarExamples
      : await getFewShotExamples(undefined, 2);
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
          content: systemPrompt + visitorContext + pageContext + knowledgeContext + exampleContext,
        },
        ...historyMessages,
        { role: 'user', content: userMessage },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) return null;

    const tokensUsed = completion.usage
      ? { prompt: completion.usage.prompt_tokens, completion: completion.usage.completion_tokens }
      : undefined;

    // 9. Check if AI decided to escalate
    const shouldEscalate = reply.toUpperCase().includes('ESCALATE');
    if (shouldEscalate) {
      return {
        text: 'אני מחבר אותך עכשיו לנציג מומחה שיוכל לעזור — הוא יחזור אליך תוך דקות.',
        shouldEscalate: true,
        aiMetadata: { chunksUsed: chunksUsedMeta, bestSimilarity, tokensUsed, escalationReason: 'ai_decided' },
      };
    }

    // 10. Parse [LEAD:field=value] tags → lead data
    const { cleanText: textAfterLead, leadData } = parseLeadTags(reply);

    // 11. Parse [NAV:key] tags → structured actions + clean text
    const { cleanText, actions } = parseNavigationActions(textAfterLead, language);

    return {
      text: cleanText,
      shouldEscalate: false,
      actions: actions.length > 0 ? actions : undefined,
      leadData: Object.keys(leadData).length > 0 ? leadData : undefined,
      aiMetadata: { chunksUsed: chunksUsedMeta, bestSimilarity, tokensUsed },
    };
  } catch (error) {
    console.error('[AI] generateReply error:', error);
    // Fallback message on error
    return {
      text: 'מצטערים, אירעה שגיאה זמנית. מחבר אותך לנציג...',
      shouldEscalate: true,
    };
  }
}

// ─── Returning visitor memory ───────────────────────────────

export async function getVisitorHistory(visitorId: string): Promise<string | null> {
  const previousSessions = await prisma.chatSession.findMany({
    where: { visitorId, status: { in: ['CLOSED', 'RESOLVED'] } },
    orderBy: { createdAt: 'desc' },
    take: 2,
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 10 } },
  });

  if (previousSessions.length === 0) return null;

  // Summarize the last conversation using GPT-4o-mini
  const lastSession = previousSessions[0];
  const msgs = lastSession.messages.map((m) => `${m.sender}: ${m.text}`).join('\n');

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 100,
      messages: [
        {
          role: 'system',
          content: 'סכם את השיחה הקודמת במשפט אחד או שניים בעברית. כלול את הנושא שנדון, מידע על הלקוח אם ניתן, ומה הסטטוס.',
        },
        { role: 'user', content: msgs },
      ],
    });

    const summary = completion.choices[0]?.message?.content?.trim();
    if (!summary) return null;

    const visitCount = previousSessions.length + 1;
    return `מבקר חוזר (ביקור ${visitCount}). בשיחה הקודמת: ${summary}`;
  } catch {
    return `מבקר חוזר (${previousSessions.length + 1} ביקורים קודמים).`;
  }
}

// ─── Smart page-context opening ─────────────────────────────

const PAGE_CONTEXT: Record<string, string> = {
  '/payments': 'המבקר נמצא בעמוד פתרונות תשלומים — התמקד בסליקה, ניהול תשלומים ועמלות.',
  '/he/payments': 'המבקר נמצא בעמוד פתרונות תשלומים — התמקד בסליקה, ניהול תשלומים ועמלות.',
  '/partners': 'המבקר נמצא בעמוד שותפים והטבות — דבר על שותפויות, מועדוני הטבות וברית אסטרטגית.',
  '/he/partners': 'המבקר נמצא בעמוד שותפים והטבות — דבר על שותפויות, מועדוני הטבות וברית אסטרטגית.',
  '/signup': 'המבקר נמצא בעמוד הרשמה — עזור לו להשלים הרשמה, ענה על שאלות אחרונות.',
  '/he/signup': 'המבקר נמצא בעמוד הרשמה — עזור לו להשלים הרשמה, ענה על שאלות אחרונות.',
  '/': 'המבקר בעמוד הראשי — שאל מה הוא מחפש והצע סיור מהיר בפתרונות.',
  '/he': 'המבקר בעמוד הראשי — שאל מה הוא מחפש והצע סיור מהיר בפתרונות.',
};

export function getPageContext(page: string | undefined): string | null {
  if (!page) return null;
  return PAGE_CONTEXT[page] ?? null;
}

// ─── Extract lead data from conversation (for escalation) ──

export async function extractLeadData(messages: Array<{ sender: string; text: string }>): Promise<Record<string, string>> {
  try {
    const conversationText = messages
      .map((m) => `${m.sender === 'CUSTOMER' ? 'לקוח' : 'נציג'}: ${m.text}`)
      .join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Extract contact details from this conversation. Return JSON with keys: name, company, email, phone, topic. Use null for missing values. Topic should be one of: sales, technical, billing, general.`,
        },
        { role: 'user', content: conversationText },
      ],
    });

    const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    const leadData: Record<string, string> = {};
    for (const [key, value] of Object.entries(result)) {
      if (value && typeof value === 'string' && value !== 'null') {
        leadData[key] = value;
      }
    }
    return leadData;
  } catch {
    return {};
  }
}

// ─── Detect escalation topic ────────────────────────────────

export function detectEscalationTopic(messages: Array<{ sender: string; text: string }>): string {
  const allText = messages.map((m) => m.text).join(' ').toLowerCase();

  const topicKeywords: Record<string, string[]> = {
    sales: ['מחיר', 'עלות', 'תמחור', 'pricing', 'quote', 'הצעת מחיר', 'דמו', 'demo', 'מועדון', 'הטבות', 'נאמנות'],
    technical: ['api', 'sdk', 'webhook', 'אינטגרציה', 'integration', 'bug', 'שגיאה', 'error', 'קוד', 'code', 'מפתח'],
    billing: ['חשבונית', 'תשלום', 'חיוב', 'invoice', 'billing', 'עמלה', 'commission', 'חשבון'],
  };

  let bestTopic = 'general';
  let bestScore = 0;

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    const score = keywords.filter((kw) => allText.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  return bestTopic;
}

// ─── Admin: add knowledge chunk ───────────────────────────

export async function addKnowledgeChunk(data: {
  title: string;
  content: string;
  source?: string;
  language?: string;
}) {
  const embedding = await embedText(`${data.title}\n${data.content}`);

  const chunk = await prisma.knowledgeChunk.create({
    data: {
      title: data.title,
      content: data.content,
      source: data.source ?? null,
      language: data.language ?? 'he',
      embedding,
      isActive: true,
    },
  });

  return { id: chunk.id };
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

    await prisma.knowledgeChunk.update({
      where: { id },
      data: {
        title: newTitle,
        content: newContent,
        source: data.source ?? existing.source,
        isActive: data.isActive ?? existing.isActive,
        embedding,
      },
    });
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
