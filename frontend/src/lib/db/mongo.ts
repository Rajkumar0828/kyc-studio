import { MongoClient, type Db } from "mongodb";

// Lazy: nothing connects at import or during `next build`. The client is created
// on first use and cached on globalThis so dev hot reloads reuse one connection.

export class MongoNotConfigured extends Error {
  constructor() {
    super("MONGODB_URI is not set");
  }
}

const g = globalThis as unknown as { _mongoClient?: Promise<MongoClient> };

export function mongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return Promise.reject(new MongoNotConfigured());
  return (g._mongoClient ??= new MongoClient(uri, { serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000 })
    .connect()
    .catch((e) => {
      g._mongoClient = undefined; // retry on the next call instead of caching the failure
      throw e;
    }));
}

export const getDb = async (): Promise<Db> => (await mongoClient()).db();

export async function closeMongo() {
  const c = g._mongoClient;
  g._mongoClient = undefined;
  if (c) await (await c.catch(() => null))?.close();
}

export type MongoStatus = "up" | "down" | "not_configured";

export async function pingMongo(): Promise<MongoStatus> {
  if (!process.env.MONGODB_URI) return "not_configured";
  try {
    await (await getDb()).command({ ping: 1 });
    return "up";
  } catch {
    return "down";
  }
}
