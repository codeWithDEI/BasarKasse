declare global { var __basarDB: D1Database | undefined; }
export function database():D1Database{if(!globalThis.__basarDB)throw new Error('Die zentrale Datenbank ist nicht erreichbar.');return globalThis.__basarDB}
