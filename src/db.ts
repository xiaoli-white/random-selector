import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

export interface Item {
  id?: number;
  name: string;
  weight: number;
  selected_count: number;
  disabled: number;
  created_at?: string;
}

export interface AppSettings {
  key: string;
  value: string;
}

let db: Database | null = null;

export async function initDatabase(): Promise<Database> {
  if (db) return db;
  
  const dbPath = await invoke<string>('get_db_path');
  db = await Database.load(`sqlite:${dbPath}`);
  
  await db.execute('PRAGMA journal_mode = DELETE');
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      weight INTEGER DEFAULT 1,
      selected_count INTEGER DEFAULT 0,
      disabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await db.execute(`ALTER TABLE students ADD COLUMN disabled INTEGER DEFAULT 0`).catch(() => {});
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      student_name TEXT NOT NULL,
      selected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id)
    )
  `);
  
  return db;
}

export async function getDatabase(): Promise<Database> {
  if (!db) {
    return await initDatabase();
  }
  return db;
}

export async function getAllItems(): Promise<Item[]> {
  const database = await getDatabase();
  return await database.select<Item[]>('SELECT * FROM students ORDER BY id');
}

export async function addItem(name: string, weight: number = 1): Promise<{ success: boolean; error?: string }> {
  const database = await getDatabase();
  
  const existing = await database.select<{id: number}[]>(
    'SELECT id FROM students WHERE name = $1',
    [name]
  );
  
  if (existing.length > 0) {
    return { success: false, error: 'Name already exists' };
  }
  
  const result = await database.select<{id: number}[]>('SELECT id FROM students ORDER BY id');
  
  let nextId = 1;
  for (const row of result) {
    if (row.id !== nextId) break;
    nextId++;
  }
  
  await database.execute(
    'INSERT INTO students (id, name, weight) VALUES ($1, $2, $3)',
    [nextId, name, weight]
  );
  
  return { success: true };
}

export async function updateItemWeight(id: number, weight: number): Promise<void> {
  const database = await getDatabase();
  await database.execute('UPDATE students SET weight = $1 WHERE id = $2', [weight, id]);
}

export async function updateItemName(id: number, name: string): Promise<{ success: boolean; error?: string }> {
  const database = await getDatabase();
  
  const existing = await database.select<{id: number}[]>(
    'SELECT id FROM students WHERE name = $1 AND id != $2',
    [name, id]
  );
  
  if (existing.length > 0) {
    return { success: false, error: 'Name already exists' };
  }
  
  await database.execute('UPDATE students SET name = $1 WHERE id = $2', [name, id]);
  return { success: true };
}

export async function updateItemDisabled(id: number, disabled: number): Promise<void> {
  const database = await getDatabase();
  await database.execute('UPDATE students SET disabled = $1 WHERE id = $2', [disabled, id]);
}

export async function deleteItem(id: number): Promise<void> {
  const database = await getDatabase();
  await database.execute('DELETE FROM students WHERE id = $1', [id]);
}

export async function clearAllItems(): Promise<void> {
  const database = await getDatabase();
  await database.execute('DELETE FROM history');
  await database.execute('DELETE FROM students');
}

export async function importFromText(text: string): Promise<{ success: boolean; count: number; errors: string[]; items: Array<{name: string, weight: number}> }> {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const items: Array<{name: string, weight: number}> = [];
  const errors: string[] = [];

  for (const line of lines) {
    const parts = line.split(/[,\t]/);
    const name = parts[0].trim();
    const weight = parts.length > 1 ? parseInt(parts[1]) || 1 : 1;

    if (!name) continue;

    // Check if name already exists in the parsed items
    if (items.some(i => i.name === name)) {
      errors.push(`"${name}" duplicate in import`);
      continue;
    }

    items.push({ name, weight });
  }

  return { success: errors.length === 0, count: items.length, errors, items };
}

export async function importFromTextToDb(text: string): Promise<{ success: boolean; count: number; errors: string[] }> {
  const database = await getDatabase();
  const { items, errors: parseErrors } = await importFromText(text);
  let count = 0;
  const errors = [...parseErrors];

  for (const item of items) {
    const existing = await database.select<{id: number}[]>(
      'SELECT id FROM students WHERE name = $1',
      [item.name]
    );

    if (existing.length > 0) {
      errors.push(`"${item.name}" already exists`);
      continue;
    }

    const result = await database.select<{id: number}[]>('SELECT id FROM students ORDER BY id');
    let nextId = 1;
    for (const row of result) {
      if (row.id !== nextId) break;
      nextId++;
    }

    await database.execute(
      'INSERT INTO students (id, name, weight) VALUES ($1, $2, $3)',
      [nextId, item.name, item.weight]
    );
    count++;
  }

  return { success: errors.length === 0, count, errors };
}

export async function getSetting(key: string): Promise<string | null> {
  const database = await getDatabase();
  const result = await database.select<AppSettings[]>(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  );
  return result.length > 0 ? result[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.execute(
    'INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)',
    [key, value]
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const database = await getDatabase();
  const result = await database.select<AppSettings[]>('SELECT * FROM settings');
  const settings: Record<string, string> = {};
  result.forEach(row => {
    settings[row.key] = row.value;
  });
  return settings;
}

export async function saveAllSettings(settings: Record<string, string>): Promise<void> {
  const database = await getDatabase();
  for (const [key, value] of Object.entries(settings)) {
    await database.execute(
      'INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)',
      [key, value]
    );
  }
}

export async function addHistoryRecord(studentId: number, studentName: string): Promise<void> {
  const database = await getDatabase();
  await database.execute(
    'INSERT INTO history (student_id, student_name) VALUES ($1, $2)',
    [studentId, studentName]
  );
  await database.execute(
    'UPDATE students SET selected_count = selected_count + 1 WHERE id = $1',
    [studentId]
  );
}

export async function getHistory(limit: number = 50): Promise<any[]> {
  const database = await getDatabase();
  return await database.select(
    'SELECT * FROM history ORDER BY id DESC LIMIT $1',
    [limit]
  );
}

export async function resetHistory(): Promise<void> {
  const database = await getDatabase();
  await database.execute('DELETE FROM history');
  await database.execute('UPDATE students SET selected_count = 0');
}

export function weightedRandomSelect(items: Item[]): Item | null {
  const activeItems = items.filter(i => !i.disabled);
  if (activeItems.length === 0) return null;
  
  const totalWeight = activeItems.reduce((sum, s) => sum + s.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const item of activeItems) {
    random -= item.weight;
    if (random <= 0) {
      return item;
    }
  }
  
  return activeItems[activeItems.length - 1];
}

export async function verifyPassword(input: string): Promise<boolean> {
  const stored = await getSetting('admin_password_hash');
  if (!stored) return false;

  try {
    const salt = stored.substring(0, 8);
    const expectedHash = stored.substring(8);

    const encoder = new TextEncoder();
    const data = encoder.encode(input + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const inputHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    return inputHash === expectedHash;
  } catch {
    return false;
  }
}

export async function setPassword(password: string): Promise<void> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(4));
  const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  await setSetting('admin_password_hash', salt + hash);
}

export async function hasPassword(): Promise<boolean> {
  const hash = await getSetting('admin_password_hash');
  return !!hash;
}

export async function saveCustomTexts(texts: Record<string, string>): Promise<void> {
  await setSetting('custom_texts', JSON.stringify(texts));
}

export async function getCustomTexts(): Promise<Record<string, string>> {
  const stored = await getSetting('custom_texts');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return {};
    }
  }
  return {};
}

export async function getFloatingWindowState(): Promise<boolean> {
  const stored = await getSetting('floating_window_enabled');
  return stored === 'true';
}

export async function setFloatingWindowState(enabled: boolean): Promise<void> {
    await setSetting('floating_window_enabled', enabled ? 'true' : 'false');
}

export async function getMainWindowAlwaysOnTop(): Promise<boolean> {
    const stored = await getSetting('main_window_always_on_top');
    return stored === 'true';
}

export async function setMainWindowAlwaysOnTop(enabled: boolean): Promise<void> {
    await setSetting('main_window_always_on_top', enabled ? 'true' : 'false');
}
