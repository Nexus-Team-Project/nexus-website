import axios from 'axios';
import { env } from '../config/env';
import { prisma } from '../config/database';

const MONDAY_API_URL = 'https://api.monday.com/v2';

// ─── Helpers ──────────────────────────────────────────────

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: env.MONDAY_API_TOKEN!,
    'API-Version': '2025-04',
  };
}

/** Parse column mapping from env or use defaults */
function getColumnMap(): Record<string, string> {
  if (env.MONDAY_COLUMN_MAP) {
    try {
      return JSON.parse(env.MONDAY_COLUMN_MAP);
    } catch {
      console.warn('[Monday] Invalid MONDAY_COLUMN_MAP JSON, using defaults');
    }
  }
  // Default column IDs — override via MONDAY_COLUMN_MAP env var
  return {
    email: 'email',
    company: 'company',
    phone: 'phone',
    source: 'source',
    status: 'status',
    topic: 'topic',
  };
}

async function graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await axios.post(MONDAY_API_URL, { query, variables }, { headers: headers() });
  if (res.data?.errors) {
    console.error('[Monday] GraphQL errors:', res.data.errors);
    throw new Error(res.data.errors[0]?.message ?? 'Monday.com API error');
  }
  return res.data?.data as T;
}

// ─── Create lead on Monday.com board ──────────────────────

export async function createLead(data: {
  name: string;
  email?: string;
  company?: string;
  phone?: string;
  source?: string;
  sessionId?: string;
  topic?: string;
}): Promise<string | null> {
  if (!env.MONDAY_API_TOKEN || !env.MONDAY_BOARD_ID) return null;

  try {
    // Check if lead already exists locally (by sessionId)
    if (data.sessionId) {
      const existing = await prisma.mondayItem.findFirst({ where: { sessionId: data.sessionId } });
      if (existing) {
        await updateItem(existing.mondayItemId, data);
        return existing.mondayItemId;
      }
    }

    const colMap = getColumnMap();
    const columnValues: Record<string, unknown> = {};

    if (data.email) columnValues[colMap.email] = data.email;
    if (data.company) columnValues[colMap.company] = data.company;
    if (data.phone) columnValues[colMap.phone] = data.phone;
    if (data.source) columnValues[colMap.source] = data.source;
    if (data.topic) columnValues[colMap.topic] = data.topic;
    columnValues[colMap.status] = { label: 'New Lead' };

    const query = `
      mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
        create_item(
          board_id: $boardId
          item_name: $itemName
          column_values: $columnValues
        ) {
          id
          name
        }
      }
    `;

    const result = await graphql<{ create_item: { id: string; name: string } }>(query, {
      boardId: env.MONDAY_BOARD_ID,
      itemName: data.name || 'Unknown Lead',
      columnValues: JSON.stringify(columnValues),
    });

    const mondayItemId = result?.create_item?.id;
    if (!mondayItemId) return null;

    // Save mapping to local DB
    await prisma.mondayItem.create({
      data: {
        mondayItemId: String(mondayItemId),
        boardId: env.MONDAY_BOARD_ID!,
        sessionId: data.sessionId,
        metadata: data as object,
      },
    });

    console.log(`[Monday] Created item ${mondayItemId} for ${data.name}`);
    return String(mondayItemId);
  } catch (err) {
    console.error('[Monday] createLead error:', err);
    return null;
  }
}

// ─── Update existing Monday.com item ──────────────────────

export async function updateItem(
  mondayItemId: string,
  data: Partial<{
    name: string;
    email: string;
    company: string;
    phone: string;
    status: string;
    topic: string;
  }>,
): Promise<void> {
  if (!env.MONDAY_API_TOKEN || !env.MONDAY_BOARD_ID) return;

  try {
    const colMap = getColumnMap();
    const columnValues: Record<string, unknown> = {};

    if (data.email) columnValues[colMap.email] = data.email;
    if (data.company) columnValues[colMap.company] = data.company;
    if (data.phone) columnValues[colMap.phone] = data.phone;
    if (data.status) columnValues[colMap.status] = { label: data.status };
    if (data.topic) columnValues[colMap.topic] = data.topic;

    if (Object.keys(columnValues).length === 0) return;

    const query = `
      mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(
          board_id: $boardId
          item_id: $itemId
          column_values: $columnValues
        ) {
          id
        }
      }
    `;

    await graphql(query, {
      boardId: env.MONDAY_BOARD_ID,
      itemId: mondayItemId,
      columnValues: JSON.stringify(columnValues),
    });

    console.log(`[Monday] Updated item ${mondayItemId}`);
  } catch (err) {
    console.error('[Monday] updateItem error:', err);
  }
}
