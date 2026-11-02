// Runs once, and only when the Mongo data volume is EMPTY (docker-entrypoint-initdb.d).
// Creates the least-privilege user the app connects as: readWrite on kyc_studio only.
const user = process.env.MONGO_APP_USER;
const pwd = process.env.MONGO_APP_PASSWORD;
if (!user || !pwd) throw new Error("MONGO_APP_USER and MONGO_APP_PASSWORD must be set");
if (!/^[0-9a-f]{16,}$/i.test(pwd)) throw new Error("MONGO_APP_PASSWORD must be hex (URL-safe), at least 16 characters");

db.getSiblingDB("kyc_studio").createUser({ user, pwd, roles: [{ role: "readWrite", db: "kyc_studio" }] });
print(`[mongo-init] created app user for kyc_studio`);
