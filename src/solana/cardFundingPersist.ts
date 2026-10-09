import type { CardFundingIntent, NormalizedFundingEvent } from "./cardFunding";
import { applyNormalizedEvent } from "./cardFunding";

/** D1 schema for durable card-funding intents. Created lazily by the Worker; unused while execution is disabled. */
export const CARD_FUNDING_SCHEMA = `
CREATE TABLE IF NOT EXISTS card_funding_intents (
  intent_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  room_code TEXT NOT NULL,
  destination_wallet TEXT NOT NULL,
  cluster TEXT NOT NULL,
  asset_mint TEXT NOT NULL,
  expected_base_units TEXT NOT NULL,
  body TEXT NOT NULL,
  payment TEXT NOT NULL,
  delivery TEXT NOT NULL,
  escrow TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS card_funding_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  PRIMARY KEY (provider, event_id)
);
`;

export type CardFundingDb = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T>() => Promise<T | null>;
      run: () => Promise<{ meta?: { changes?: number } }>;
    };
  };
};

export async function ensureCardFundingTables(db: CardFundingDb): Promise<void> {
  for (const statement of CARD_FUNDING_SCHEMA.split(";").map((part) => part.trim()).filter(Boolean)) {
    await db.prepare(statement).bind().run();
  }
}

export function serializeIntent(intent: CardFundingIntent): string {
  return JSON.stringify(intent);
}

export function deserializeIntent(raw: string): CardFundingIntent {
  const parsed = JSON.parse(raw) as CardFundingIntent;
  if (!parsed?.intentId || !parsed.idempotencyKey || !parsed.destinationWallet || !parsed.roomCode) {
    throw new Error("The funding intent is not usable");
  }
  if (parsed.externalExecutionEnabled !== false) throw new Error("Funding intent must keep external execution disabled");
  return { ...parsed, externalExecutionEnabled: false };
}

export async function loadIntentByIdempotency(db: CardFundingDb, idempotencyKey: string): Promise<CardFundingIntent | null> {
  const row = await db.prepare("SELECT body FROM card_funding_intents WHERE idempotency_key = ?").bind(idempotencyKey).first<{ body: string }>();
  return row ? deserializeIntent(row.body) : null;
}

export async function loadIntent(db: CardFundingDb, intentId: string): Promise<CardFundingIntent | null> {
  const row = await db.prepare("SELECT body FROM card_funding_intents WHERE intent_id = ?").bind(intentId).first<{ body: string }>();
  return row ? deserializeIntent(row.body) : null;
}

/** Conflict-safe upsert: same idempotency key returns the stored open intent. */
export async function saveIntent(db: CardFundingDb, intent: CardFundingIntent): Promise<{ saved: boolean; intent: CardFundingIntent }> {
  const body = serializeIntent(intent);
  const inserted = await db.prepare(
    `INSERT INTO card_funding_intents (
      intent_id, idempotency_key, room_code, destination_wallet, cluster, asset_mint, expected_base_units,
      body, payment, delivery, escrow, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(idempotency_key) DO NOTHING`,
  ).bind(
    intent.intentId,
    intent.idempotencyKey,
    intent.roomCode,
    intent.destinationWallet,
    intent.cluster,
    intent.assetMint,
    intent.expectedBaseUnits,
    body,
    intent.payment,
    intent.delivery,
    intent.escrow,
    intent.updatedAt,
  ).run();
  if ((inserted.meta?.changes ?? 0) > 0) return { saved: true, intent };
  const existing = await loadIntentByIdempotency(db, intent.idempotencyKey);
  if (!existing) throw new Error("Funding intent conflict could not be loaded");
  return { saved: false, intent: existing };
}

export async function replaceIntent(db: CardFundingDb, expectedUpdatedAt: number, intent: CardFundingIntent): Promise<boolean> {
  const written = await db.prepare(
    `UPDATE card_funding_intents
     SET body = ?, payment = ?, delivery = ?, escrow = ?, updated_at = ?
     WHERE intent_id = ? AND updated_at = ?`,
  ).bind(
    serializeIntent(intent),
    intent.payment,
    intent.delivery,
    intent.escrow,
    intent.updatedAt,
    intent.intentId,
    expectedUpdatedAt,
  ).run();
  return (written.meta?.changes ?? 0) > 0;
}

export async function recordProcessedEvent(
  db: CardFundingDb,
  provider: string,
  event: NormalizedFundingEvent,
  intentId: string,
  payloadHash: string,
): Promise<{ duplicate: boolean }> {
  const written = await db.prepare(
    `INSERT INTO card_funding_events (provider, event_id, intent_id, payload_hash, observed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(provider, event_id) DO NOTHING`,
  ).bind(provider, event.id, intentId, payloadHash, event.observedAt).run();
  return { duplicate: (written.meta?.changes ?? 0) === 0 };
}

export async function applyEventToStoredIntent(
  db: CardFundingDb,
  provider: string,
  intentId: string,
  event: NormalizedFundingEvent,
  payloadHash: string,
): Promise<{ ok: true; intent: CardFundingIntent; duplicate: boolean } | { ok: false; error: string }> {
  const recorded = await recordProcessedEvent(db, provider, event, intentId, payloadHash);
  const current = await loadIntent(db, intentId);
  if (!current) return { ok: false, error: "Funding intent not found" };
  if (recorded.duplicate) return { ok: true, intent: current, duplicate: true };
  const next = applyNormalizedEvent(current, event);
  if (next.intent.escrow === "entry-finalized" && current.escrow !== "entry-finalized") {
    return { ok: false, error: "A provider event cannot mark competition entry finalized" };
  }
  const saved = await replaceIntent(db, current.updatedAt, next.intent);
  if (!saved) return { ok: false, error: "Funding intent changed. Retry the verified event." };
  return { ok: true, intent: next.intent, duplicate: false };
}

/** In-memory store for unit tests. Mirrors uniqueness and CAS behavior. */
export function memoryCardFundingDb() {
  const intents = new Map<string, CardFundingIntent>();
  const byIdempotency = new Map<string, string>();
  const events = new Set<string>();
  const db: CardFundingDb = {
    prepare(sql: string) {
      const statement = {
        values: [] as unknown[],
        bind(...values: unknown[]) {
          statement.values = values;
          return {
            async first<T>() {
              if (sql.includes("FROM card_funding_intents WHERE idempotency_key")) {
                const id = byIdempotency.get(String(values[0]));
                return (id ? { body: serializeIntent(intents.get(id)!) } : null) as T | null;
              }
              if (sql.includes("FROM card_funding_intents WHERE intent_id")) {
                const intent = intents.get(String(values[0]));
                return (intent ? { body: serializeIntent(intent) } : null) as T | null;
              }
              return null;
            },
            async run() {
              if (sql.startsWith("CREATE TABLE") || sql.startsWith("CREATE ")) return { meta: { changes: 0 } };
              if (sql.includes("INSERT INTO card_funding_intents")) {
                const intent = deserializeIntent(String(values[7]));
                if (byIdempotency.has(intent.idempotencyKey)) return { meta: { changes: 0 } };
                intents.set(intent.intentId, intent);
                byIdempotency.set(intent.idempotencyKey, intent.intentId);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE card_funding_intents")) {
                const body = String(values[0]);
                const updatedAt = Number(values[4]);
                const intentId = String(values[5]);
                const expected = Number(values[6]);
                const current = intents.get(intentId);
                if (!current || current.updatedAt !== expected) return { meta: { changes: 0 } };
                const next = deserializeIntent(body);
                intents.set(intentId, { ...next, updatedAt });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO card_funding_events")) {
                const key = `${values[0]}:${values[1]}`;
                if (events.has(key)) return { meta: { changes: 0 } };
                events.add(key);
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
          };
        },
      };
      return statement;
    },
  };
  return { db, intents, events };
}
