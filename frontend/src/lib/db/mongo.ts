import { MongoClient } from "mongodb";

// Cached on globalThis so Next.js hot reloads reuse one connection.
const g = globalThis as unknown as { _mongo?: Promise<MongoClient> };
export const mongo = (g._mongo ??= new MongoClient(process.env.MONGODB_URI!).connect());
export const db = async () => (await mongo).db();
