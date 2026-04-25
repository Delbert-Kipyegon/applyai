import { getDb } from "./mongodb";

type GenerationAdminRow = {
  profileName?: string;
  jobTitle?: string;
  company?: string;
  score?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  createdAt?: Date;
};

export async function getAdminStats() {
  const db = await getDb();
  const [deviceCount, generationCount, tokenTotals, rawGenerations] =
    await Promise.all([
      db.collection("devices").countDocuments(),
      db.collection("generations").countDocuments(),
      db
        .collection<GenerationAdminRow>("generations")
        .aggregate<{
          inputTokens: number;
          outputTokens: number;
          estimatedCostUsd: number;
        }>([
          {
            $group: {
              _id: null,
              inputTokens: { $sum: "$inputTokens" },
              outputTokens: { $sum: "$outputTokens" },
              estimatedCostUsd: { $sum: "$estimatedCostUsd" },
            },
          },
        ])
        .next(),
      db
        .collection<GenerationAdminRow>("generations")
        .find(
          {},
          {
            projection: {
              _id: 0,
              profileName: 1,
              jobTitle: 1,
              company: 1,
              score: 1,
              model: 1,
              inputTokens: 1,
              outputTokens: 1,
              estimatedCostUsd: 1,
              createdAt: 1,
            },
          },
        )
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
    ]);
  const recentGenerations = rawGenerations as GenerationAdminRow[];

  return {
    deviceCount,
    generationCount,
    tokenTotals: {
      inputTokens: tokenTotals?.inputTokens || 0,
      outputTokens: tokenTotals?.outputTokens || 0,
      estimatedCostUsd: tokenTotals?.estimatedCostUsd || 0,
    },
    recentGenerations: recentGenerations.map((generation) => ({
      ...generation,
      createdAt: generation.createdAt?.toISOString?.() || "",
    })),
  };
}
