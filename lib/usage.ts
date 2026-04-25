import { getDb, ensureIndexes } from "./mongodb";

export const GENERATION_LIMIT = 5;
export const WINDOW_MS = 24 * 60 * 60 * 1000;

type Identity = {
  deviceHash: string;
  ipHash: string;
  userAgentHash: string;
  userAgent: string;
};

type GenerationLog = {
  deviceHash: string;
  ipHash: string;
  userAgentHash: string;
  userAgent: string;
  profileName: string;
  jobTitle: string;
  company: string;
  score: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

let indexesReady: Promise<void> | null = null;

async function ensureUsageIndexes() {
  indexesReady ||= ensureIndexes();
  await indexesReady;
}

export async function checkAndIncrementGenerationLimit(identity: Identity) {
  await ensureUsageIndexes();
  const db = await getDb();
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
  const expiresAt = new Date(windowStart.getTime() + WINDOW_MS + 5 * 60 * 1000);
  const key = identity.deviceHash;

  const current = await db.collection("rate_limits").findOne<{ count: number }>({
    key,
    windowStart,
  });

  if (current && current.count >= GENERATION_LIMIT) {
    return {
      allowed: false,
      limit: GENERATION_LIMIT,
      remaining: 0,
      resetAt: new Date(windowStart.getTime() + WINDOW_MS),
    };
  }

  const result = await db.collection("rate_limits").findOneAndUpdate(
    { key, windowStart },
    {
      $inc: { count: 1 },
      $set: {
        deviceHash: identity.deviceHash,
        ipHash: identity.ipHash,
        userAgentHash: identity.userAgentHash,
        updatedAt: now,
      },
      $setOnInsert: {
        key,
        windowStart,
        expiresAt,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  const count = result?.count || 1;

  await db.collection("devices").updateOne(
    { deviceHash: identity.deviceHash },
    {
      $set: {
        ipHash: identity.ipHash,
        userAgentHash: identity.userAgentHash,
        userAgent: identity.userAgent.slice(0, 300),
        lastSeenAt: now,
      },
      $setOnInsert: {
        deviceHash: identity.deviceHash,
        firstSeenAt: now,
      },
      $inc: { generationAttempts: 1 },
    },
    { upsert: true },
  );

  return {
    allowed: true,
    limit: GENERATION_LIMIT,
    remaining: Math.max(0, GENERATION_LIMIT - count),
    resetAt: new Date(windowStart.getTime() + WINDOW_MS),
  };
}

export function estimateClaudeCost(inputTokens = 0, outputTokens = 0) {
  const inputCostPerMillion = Number(process.env.ANTHROPIC_INPUT_COST_PER_MTOK || 3);
  const outputCostPerMillion = Number(process.env.ANTHROPIC_OUTPUT_COST_PER_MTOK || 15);

  return (inputTokens / 1_000_000) * inputCostPerMillion + (outputTokens / 1_000_000) * outputCostPerMillion;
}

export async function logGeneration(log: GenerationLog) {
  await ensureUsageIndexes();
  const db = await getDb();
  const now = new Date();

  await Promise.all([
    db.collection("generations").insertOne({
      ...log,
      createdAt: now,
    }),
    db.collection("devices").updateOne(
      { deviceHash: log.deviceHash },
      {
        $set: {
          ipHash: log.ipHash,
          userAgentHash: log.userAgentHash,
          userAgent: log.userAgent.slice(0, 300),
          lastGenerationAt: now,
          lastSeenAt: now,
        },
        $inc: {
          successfulGenerations: 1,
          totalInputTokens: log.inputTokens,
          totalOutputTokens: log.outputTokens,
          totalEstimatedCostUsd: log.estimatedCostUsd,
        },
      },
      { upsert: true },
    ),
  ]);
}
