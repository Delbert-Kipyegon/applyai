import { Db, MongoClient } from "mongodb";

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

export async function getDb(): Promise<Db> {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI.");
  }

  if (!globalForMongo.mongoClientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    globalForMongo.mongoClientPromise = client.connect();
  }

  const client = await globalForMongo.mongoClientPromise;
  return client.db(process.env.MONGODB_DB_NAME || "boltiply");
}

export async function ensureIndexes() {
  const db = await getDb();

  await Promise.all([
    db.collection("rate_limits").createIndex({ key: 1, windowStart: 1 }, { unique: true }),
    db.collection("rate_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("devices").createIndex({ deviceHash: 1 }, { unique: true }),
    db.collection("generations").createIndex({ createdAt: -1 }),
    db.collection("generations").createIndex({ deviceHash: 1, createdAt: -1 }),
    db.collection("uploads").createIndex({ createdAt: -1 }),
    db.collection("admin_sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("admin_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
