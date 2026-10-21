import { IDatabase } from './database.js';
import { SQLiteDatabase } from './sqlite.js';
import { SupabaseDatabase } from './supabase.js';

let dbInstance: IDatabase | null = null;

export async function getDatabase(): Promise<IDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey && supabaseUrl.trim() !== '' && serviceRoleKey.trim() !== '') {
    console.log('[Database] Connecting to Supabase PostgreSQL at:', supabaseUrl);
    const db = new SupabaseDatabase(supabaseUrl, serviceRoleKey);
    await db.init();
    dbInstance = db;
  } else {
    console.log('[Database] Using built-in local SQLite storage with Nasto House seed data');
    const db = new SQLiteDatabase();
    await db.init();
    dbInstance = db;
  }

  return dbInstance;
}

