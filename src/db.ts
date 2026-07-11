import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

export const DEFAULT_CUSTOM_TEXTS: Record<string, string> = {
  windowTitle: 'Random Selector',
  appTitle: 'Random Selector',
  showVersion: 'true',
  showAuthor: 'true',
  authorName: '',
  btnStart: 'Start',
  btnStop: 'Stop',
  btnAuto: 'Auto',
  btnShowFloat: 'Show Float',
  btnHideFloat: 'Hide Float',
  btnShowMain: 'Show Main',
  btnHideMain: 'Hide Main',
  trayHideMain: 'Hide Main',
  trayShowMain: 'Show Main',
  trayQuit: 'Quit',
  hintText: 'Click "Start" button',
  floatingQuickPickHint: 'Click to pick',
  errorNoActiveItems: 'No active items available',
  errorRecordFailed: 'Failed to record selection',
  errorFloatingWindow: 'Failed to toggle floating window',
  errorToggleWindow: 'Failed to toggle main window',
};

export function applyDefaultCustomTexts(texts: Record<string, string>): Record<string, string> {
  for (const [key, fallback] of Object.entries(DEFAULT_CUSTOM_TEXTS)) {
    if (!texts[key]) {
      texts[key] = fallback;
    }
  }
  return texts;
}

export const DEFAULT_AUTO_DURATION = 2000;

export interface Item {
  id?: number;
  name: string;
  weight: number;
  selected_count: number;
  disabled: number;
  created_at?: string;
  config_id?: number;
}

let configChangedListeners: Array<() => void> = [];

export function onConfigChanged(callback: () => void) {
  configChangedListeners.push(callback);
  return () => {
    configChangedListeners = configChangedListeners.filter(l => l !== callback);
  };
}

export async function emitConfigChanged() {
  if (currentConfigId) {
    configSettingsCache.delete(currentConfigId);
  }
  for (const listener of configChangedListeners) {
    try {
      listener();
    } catch (e) {
      console.error('Config changed listener error:', e);
    }
  }
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('config-changed');
  } catch (e) {
    console.error('Failed to emit config-changed event:', e);
  }
}

export interface AppSettings {
  key: string;
  value: string;
  config_id?: number;
}

export interface Config {
  id?: number;
  name: string;
  is_active: number;
  created_at?: string;
}

let db: Database | null = null;
let currentConfigId: number | null = null;
let globalSettingsCache: Record<string, string> | null = null;
const configSettingsCache: Map<number, Record<string, string> | null> = new Map();

async function ensureDefaultConfig(): Promise<void> {
  if (!db) return;
  
  const activeConfig = await db.select('SELECT id FROM configs WHERE is_active = 1 LIMIT 1') as any[];
  
  if (activeConfig.length === 0) {
    const result = await db.execute(
      'INSERT INTO configs (name, is_active) VALUES ($1, $2)',
      ['Default', 1]
    );
    currentConfigId = result.lastInsertId as number;
  } else {
    currentConfigId = activeConfig[0].id;
  }
}

async function migrateConfigIds(): Promise<void> {
  if (!db) return;

  try {
    await db.execute('BEGIN TRANSACTION');

    let defaultConfigId = currentConfigId;
    if (!defaultConfigId) {
      const result = await db.execute(
        'INSERT INTO configs (name, is_active) VALUES ($1, $2)',
        ['Migrated', 0]
      );
      defaultConfigId = result.lastInsertId as number;
    }

    await db.execute('UPDATE items SET config_id = $1 WHERE config_id IS NULL', [defaultConfigId]);
    await db.execute('UPDATE settings SET config_id = $1 WHERE config_id IS NULL', [defaultConfigId]);
    await db.execute('UPDATE history SET config_id = $1 WHERE config_id IS NULL', [defaultConfigId]);

    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    console.error('Config migration failed:', e);
  }
}

async function ensureGlobalConfig(): Promise<void> {
  if (!db) return;

  const globalConfig = await db.select('SELECT id FROM configs WHERE id = 0 LIMIT 1') as any[];
  
  if (globalConfig.length === 0) {
    try {
      await db.execute(
        'INSERT INTO configs (id, name, is_active) VALUES (0, $1, $2)',
        ['__global_settings__', 0]
      );
    } catch (e) {
      console.error('Failed to create global config:', e);
    }
  }
}

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const dbPath = await invoke<string>('get_db_path');
  db = await Database.load(`sqlite:${dbPath}`);

  try { await db.execute('PRAGMA journal_mode = WAL'); } catch {}
  try { await db.execute('PRAGMA busy_timeout = 5000'); } catch {}

  await db.execute(`
    CREATE TABLE IF NOT EXISTS configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      weight REAL DEFAULT 1,
      selected_count INTEGER DEFAULT 0,
      disabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (config_id) REFERENCES configs(id)
    )
  `);

  await db.execute('ALTER TABLE items ADD COLUMN disabled INTEGER DEFAULT 0').catch(() => {});
  await db.execute('ALTER TABLE items ADD COLUMN config_id INTEGER NOT NULL DEFAULT 1').catch(() => {});

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      config_id INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (key, config_id),
      FOREIGN KEY (config_id) REFERENCES configs(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL DEFAULT 1,
      item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      selected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (config_id) REFERENCES configs(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    )
  `);

  await db.execute('ALTER TABLE history ADD COLUMN config_id INTEGER NOT NULL DEFAULT 1').catch(() => {});

  try { await db.execute('CREATE INDEX IF NOT EXISTS idx_history_config_id ON history(config_id)'); } catch {}
  try { await db.execute('CREATE INDEX IF NOT EXISTS idx_history_selected_at ON history(selected_at)'); } catch {}

  await ensureDefaultConfig();

  await migrateConfigIds();

  await ensureGlobalConfig();

  try {
    const { listen } = await import('@tauri-apps/api/event');
    await listen('global-settings-changed', () => {
      globalSettingsCache = null;
    });
  } catch (e) {
    console.error('Failed to register global-settings-changed listener:', e);
  }

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
  const configId = currentConfigId || 1;
  return await database.select<Item[]>(
    'SELECT * FROM items WHERE config_id = $1 ORDER BY id',
    [configId]
  );
}

export async function addItem(name: string, weight: number = 1, disabled: number = 0): Promise<{ success: boolean; error?: string }> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;

  const existing = await database.select<{id: number}[]>(
    'SELECT id FROM items WHERE name = $1 AND config_id = $2',
    [name, configId]
  );

  if (existing.length > 0) {
    return { success: false, error: 'Name already exists' };
  }

  await database.execute(
    'INSERT INTO items (config_id, name, weight, disabled) VALUES ($1, $2, $3, $4)',
    [configId, name, weight, disabled]
  );

  return { success: true };
}

export async function updateItemWeight(id: number, weight: number): Promise<void> {
  const database = await getDatabase();
  await database.execute('UPDATE items SET weight = $1 WHERE id = $2', [weight, id]);
}

export async function updateItemName(id: number, name: string): Promise<{ success: boolean; error?: string }> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;

  const existing = await database.select<{id: number}[]>(
    'SELECT id FROM items WHERE name = $1 AND id != $2 AND config_id = $3',
    [name, id, configId]
  );

  if (existing.length > 0) {
    return { success: false, error: 'Name already exists' };
  }

  await database.execute('UPDATE items SET name = $1 WHERE id = $2 AND config_id = $3', [name, id, configId]);
  return { success: true };
}

export async function updateItemDisabled(id: number, disabled: number): Promise<void> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;
  await database.execute('UPDATE items SET disabled = $1 WHERE id = $2 AND config_id = $3', [disabled, id, configId]);
}

export async function deleteItem(id: number): Promise<void> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;
  await database.execute('DELETE FROM history WHERE item_id = $1 AND config_id = $2', [id, configId]);
  await database.execute('DELETE FROM items WHERE id = $1 AND config_id = $2', [id, configId]);
}

export async function clearAllItems(): Promise<void> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;
  await database.execute('DELETE FROM history WHERE config_id = $1', [configId]);
  await database.execute('DELETE FROM items WHERE config_id = $1', [configId]);
}

export async function importFromText(text: string): Promise<{ success: boolean; count: number; errors: string[]; items: Array<{name: string, weight: number}> }> {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const items: Array<{name: string, weight: number}> = [];
  const errors: string[] = [];

  for (const line of lines) {
    const parts = line.split(/[,\t]/);
    const name = parts[0].trim();
    const weight = parts.length > 1 ? parseFloat(parts[1]) || 1 : 1;

    if (!name) continue;

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
  const configId = currentConfigId || 1;
  const { items, errors: parseErrors } = await importFromText(text);
  let count = 0;
  const errors = [...parseErrors];

  for (const item of items) {
    const existing = await database.select<{id: number}[]>(
      'SELECT id FROM items WHERE name = $1 AND config_id = $2',
      [item.name, configId]
    );

    if (existing.length > 0) {
      errors.push(`"${item.name}" already exists`);
      continue;
    }

    await database.execute(
      'INSERT INTO items (config_id, name, weight) VALUES ($1, $2, $3)',
      [configId, item.name, item.weight]
    );
    count++;
  }

  return { success: errors.length === 0, count, errors };
}

export async function getSetting(key: string): Promise<string | null> {
  const configId = currentConfigId || 1;
  if (!configSettingsCache.has(configId)) {
    const database = await getDatabase();
    const rows = await database.select<AppSettings[]>(
      'SELECT key, value FROM settings WHERE config_id = $1',
      [configId]
    );
    const cache: Record<string, string> = {};
    for (const row of rows) {
      cache[row.key] = row.value;
    }
    configSettingsCache.set(configId, cache);
  }
  const cache = configSettingsCache.get(configId);
  return cache ? (cache[key] ?? null) : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;
  await database.execute(
    'INSERT INTO settings (key, value, config_id) VALUES ($1, $2, $3) ON CONFLICT(key, config_id) DO UPDATE SET value = $2',
    [key, value, configId]
  );
  await emitConfigChanged();
}

export async function getGlobalSetting(key: string): Promise<string | null> {
  if (!globalSettingsCache) {
    const database = await getDatabase();
    const rows = await database.select<AppSettings[]>(
      'SELECT key, value FROM settings WHERE config_id = 0'
    );
    globalSettingsCache = {};
    for (const row of rows) {
      globalSettingsCache[row.key] = row.value;
    }
  }
  return globalSettingsCache[key] ?? null;
}

export async function setGlobalSetting(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.execute(
    'INSERT INTO settings (key, value, config_id) VALUES ($1, $2, 0) ON CONFLICT(key, config_id) DO UPDATE SET value = $2',
    [key, value]
  );
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('global-settings-changed');
  } catch (e) {
    console.error('Failed to emit global-settings-changed event:', e);
  }
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;
  const result = await database.select<AppSettings[]>(
    'SELECT * FROM settings WHERE config_id = $1',
    [configId]
  );
  const settings: Record<string, string> = {};
  result.forEach(row => {
    settings[row.key] = row.value;
  });
  return settings;
}

export async function saveAllSettings(settings: Record<string, string>): Promise<void> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;
  for (const [key, value] of Object.entries(settings)) {
    await database.execute(
      'INSERT INTO settings (key, value, config_id) VALUES ($1, $2, $3) ON CONFLICT(key, config_id) DO UPDATE SET value = $2',
      [key, value, configId]
    );
  }
}

export async function addHistoryRecord(itemId: number, itemName: string): Promise<void> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;
  await database.execute(
    'INSERT INTO history (config_id, item_id, item_name) VALUES ($1, $2, $3)',
    [configId, itemId, itemName]
  );
  await database.execute(
    'UPDATE items SET selected_count = selected_count + 1 WHERE id = $1 AND config_id = $2',
    [itemId, configId]
  );
}

export async function getHistory(limit: number = 50): Promise<any[]> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;
  return await database.select(
    'SELECT * FROM history WHERE config_id = $1 ORDER BY id DESC LIMIT $2',
    [configId, limit]
  );
}

export interface HistoryFilter {
  itemName?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

async function buildHistoryWhereClause(configId: number, filters: HistoryFilter): Promise<{ whereSql: string; params: any[] }> {
  let whereSql = 'WHERE config_id = $1';
  const params: any[] = [configId];
  let paramIndex = 2;

  if (filters.itemName && filters.itemName.trim()) {
    whereSql += ` AND item_name LIKE $${paramIndex}`;
    params.push(`%${filters.itemName.trim()}%`);
    paramIndex++;
  }

  if (filters.startTime) {
    whereSql += ` AND selected_at >= $${paramIndex}`;
    params.push(filters.startTime);
    paramIndex++;
  }

  if (filters.endTime) {
    whereSql += ` AND selected_at <= $${paramIndex}`;
    params.push(filters.endTime);
    paramIndex++;
  }

  return { whereSql, params };
}

export async function getHistoryWithFilters(filters: HistoryFilter = {}): Promise<any[]> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;
  const limit = filters.limit || 20;
  const offset = filters.offset || 0;

  const { whereSql, params } = await buildHistoryWhereClause(configId, filters);

  params.push(limit);
  let sql = `SELECT * FROM history ${whereSql} ORDER BY id DESC LIMIT $${params.length}`;

  if (offset > 0) {
    params.push(offset);
    sql += ` OFFSET $${params.length}`;
  }

  return await database.select(sql, params);
}

export async function getHistoryCount(filters: HistoryFilter = {}): Promise<number> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;

  const { whereSql, params } = await buildHistoryWhereClause(configId, filters);
  const result = await database.select<{ count: number }[]>(`SELECT COUNT(*) as count FROM history ${whereSql}`, params);
  return result[0]?.count ?? 0;
}

export async function resetHistory(): Promise<void> {
  const database = await getDatabase();
  const configId = currentConfigId || 1;
  await database.execute('DELETE FROM history WHERE config_id = $1', [configId]);
  await database.execute('UPDATE items SET selected_count = 0 WHERE config_id = $1', [configId]);
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
  const stored = await getGlobalSetting('admin_password_hash');
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

  await setGlobalSetting('admin_password_hash', salt + hash);
}

export async function hasPassword(): Promise<boolean> {
  const hash = await getGlobalSetting('admin_password_hash');
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
  const stored = await getGlobalSetting('floating_window_enabled');
  return stored === 'true';
}

export async function setFloatingWindowState(enabled: boolean): Promise<void> {
    await setGlobalSetting('floating_window_enabled', enabled ? 'true' : 'false');
}

export async function getFloatingWindowExpanded(): Promise<boolean> {
    const stored = await getGlobalSetting('floating_window_expanded');
    return stored === 'true';
}

export async function setFloatingWindowExpanded(enabled: boolean): Promise<void> {
    await setGlobalSetting('floating_window_expanded', enabled ? 'true' : 'false');
}

export async function getMainWindowAlwaysOnTop(): Promise<boolean> {
    const stored = await getGlobalSetting('main_window_always_on_top');
    return stored === 'true';
}

export async function setMainWindowAlwaysOnTop(enabled: boolean): Promise<void> {
    await setGlobalSetting('main_window_always_on_top', enabled ? 'true' : 'false');
}

export function getCurrentConfigId(): number | null {
  return currentConfigId;
}

export async function syncCurrentConfigId(): Promise<number | null> {
  const database = await getDatabase();
  const activeConfig = await database.select('SELECT id FROM configs WHERE is_active = 1 LIMIT 1') as any[];
  if (activeConfig.length > 0) {
    currentConfigId = activeConfig[0].id;
  }
  return currentConfigId;
}

export async function getAllConfigs(): Promise<Config[]> {
  const database = await getDatabase();
  return await database.select<Config[]>('SELECT * FROM configs WHERE id != 0 ORDER BY created_at');
}

export async function createConfig(name: string, isActive: boolean = false): Promise<{ success: boolean; error?: string; config?: Config }> {
  const database = await getDatabase();

  const existing = await database.select(
    'SELECT * FROM configs WHERE name = $1',
    [name]
  ) as any[];

  if (existing.length > 0) {
    return { success: false, error: 'Config name already exists' };
  }

  const result = await database.execute(
    'INSERT INTO configs (name, is_active) VALUES ($1, $2)',
    [name, isActive ? 1 : 0]
  );

  const newConfig = await database.select(
    'SELECT * FROM configs WHERE id = $1',
    [result.lastInsertId]
  ) as any[];
  
  if (newConfig.length > 0) {
    return { success: true, config: newConfig[0] as Config };
  }
  
  return { success: false, error: 'Failed to create config' };
}

export async function deleteConfig(id: number): Promise<{ success: boolean; error?: string }> {
  if (currentConfigId === id) {
    return { success: false, error: 'Cannot delete active config' };
  }

  const database = await getDatabase();

  await database.execute('DELETE FROM history WHERE config_id = $1', [id]);
  await database.execute('DELETE FROM items WHERE config_id = $1', [id]);
  await database.execute('DELETE FROM settings WHERE config_id = $1', [id]);
  await database.execute('DELETE FROM configs WHERE id = $1', [id]);

  return { success: true };
}

export async function switchConfig(id: number): Promise<{ success: boolean; error?: string }> {
  const database = await getDatabase();

  const config = await database.select(
    'SELECT * FROM configs WHERE id = $1',
    [id]
  ) as any[];

  if (config.length === 0) {
    return { success: false, error: 'Config not found' };
  }

  if (currentConfigId) {
    await database.execute(
      'UPDATE configs SET is_active = 0 WHERE id = $1',
      [currentConfigId]
    );
  }

  await database.execute(
    'UPDATE configs SET is_active = 1 WHERE id = $1',
    [id]
  );

  currentConfigId = id;
  await emitConfigChanged();
  return { success: true };
}

export async function copyConfig(sourceId: number, newName: string): Promise<{ success: boolean; error?: string; config?: Config }> {
  const database = await getDatabase();
  
  const sourceConfig = await database.select(
    'SELECT * FROM configs WHERE id = $1',
    [sourceId]
  ) as any[];
  
  if (sourceConfig.length === 0) {
    return { success: false, error: 'Source config not found' };
  }
  
  const existing = await database.select(
    'SELECT * FROM configs WHERE name = $1',
    [newName]
  ) as any[];
  
  if (existing.length > 0) {
    return { success: false, error: 'Config name already exists' };
  }
  
  const result = await database.execute(
    'INSERT INTO configs (name, is_active) VALUES ($1, 0)',
    [newName]
  );
  
  const newConfigId = result.lastInsertId;
  
  const items = await database.select(
    'SELECT * FROM items WHERE config_id = $1',
    [sourceId]
  ) as any[];

  for (const item of items) {
    await database.execute(
      'INSERT INTO items (config_id, name, weight, selected_count, disabled) VALUES ($1, $2, $3, $4, $5)',
      [newConfigId, item.name, item.weight, item.selected_count, item.disabled]
    );
  }
  
  const settings = await database.select(
    'SELECT * FROM settings WHERE config_id = $1',
    [sourceId]
  ) as any[];
  
  for (const setting of settings) {
    await database.execute(
      'INSERT INTO settings (key, value, config_id) VALUES ($1, $2, $3)',
      [setting.key, setting.value, newConfigId]
    );
  }
  
  const newConfig = await database.select(
    'SELECT * FROM configs WHERE id = $1',
    [newConfigId]
  ) as any[];
  
  if (newConfig.length > 0) {
    return { success: true, config: newConfig[0] as Config };
  }
  
  return { success: false, error: 'Failed to copy config' };
}

export async function renameConfig(id: number, newName: string): Promise<{ success: boolean; error?: string }> {
  const database = await getDatabase();

  const existing = await database.select(
    'SELECT * FROM configs WHERE name = $1 AND id != $2',
    [newName, id]
  ) as any[];

  if (existing.length > 0) {
    return { success: false, error: 'Config name already exists' };
  }

  await database.execute(
    'UPDATE configs SET name = $1 WHERE id = $2',
    [newName, id]
  );

  return { success: true };
}

export interface ExportedConfig {
  config: Config;
  items: Item[];
  settings: AppSettings[];
  history: any[];
}

export interface ExportData {
  exportedAt: string;
  configs: ExportedConfig[];
  globalSettings?: AppSettings[];
}

export async function exportConfig(configId: number): Promise<ExportedConfig | null> {
  const database = await getDatabase();

  const configs = await database.select('SELECT * FROM configs WHERE id = $1', [configId]) as any[];
  if (configs.length === 0) return null;

  const items = await database.select('SELECT * FROM items WHERE config_id = $1', [configId]) as any[];
  const settings = await database.select('SELECT * FROM settings WHERE config_id = $1', [configId]) as any[];
  const history = await database.select('SELECT * FROM history WHERE config_id = $1', [configId]) as any[];

  return {
    config: configs[0] as Config,
    items: items as Item[],
    settings: settings as AppSettings[],
    history,
  };
}

export async function exportConfigs(configIds: number[], includeGlobalSettings: boolean = false): Promise<ExportData> {
  const configs: ExportedConfig[] = [];
  for (const id of configIds) {
    const data = await exportConfig(id);
    if (data) {
      configs.push(data);
    }
  }

  const result: ExportData = {
    exportedAt: new Date().toISOString(),
    configs,
  };

  if (includeGlobalSettings) {
    const database = await getDatabase();
    const globalSettings = await database.select<AppSettings[]>(
      'SELECT * FROM settings WHERE config_id = 0'
    );
    result.globalSettings = globalSettings;
  }

  return result;
}

export async function importConfig(exportData: ExportData): Promise<{ success: boolean; imported: string[]; errors: string[] }> {
  const database = await getDatabase();
  const imported: string[] = [];
  const errors: string[] = [];

  try {
    await database.execute('BEGIN TRANSACTION');

    for (const exportedConfig of exportData.configs) {
      try {
        const existing = await database.select(
          'SELECT id FROM configs WHERE name = $1',
          [exportedConfig.config.name]
        ) as any[];

        let configId: number;

        if (existing.length > 0) {
          configId = existing[0].id;
          await database.execute('DELETE FROM items WHERE config_id = $1', [configId]);
          await database.execute('DELETE FROM settings WHERE config_id = $1', [configId]);
          await database.execute('DELETE FROM history WHERE config_id = $1', [configId]);
        } else {
          const result = await database.execute(
            'INSERT INTO configs (name, is_active) VALUES ($1, 0)',
            [exportedConfig.config.name]
          );
          configId = result.lastInsertId as number;
        }

        for (const item of exportedConfig.items) {
          await database.execute(
            'INSERT INTO items (config_id, name, weight, selected_count, disabled) VALUES ($1, $2, $3, $4, $5)',
            [configId, item.name, item.weight, item.selected_count, item.disabled]
          );
        }

        for (const setting of exportedConfig.settings) {
          await database.execute(
            'INSERT INTO settings (key, value, config_id) VALUES ($1, $2, $3)',
            [setting.key, setting.value, configId]
          );
        }

        for (const record of exportedConfig.history) {
          await database.execute(
            'INSERT INTO history (config_id, item_id, item_name, selected_at) VALUES ($1, $2, $3, $4)',
            [configId, record.item_id, record.item_name, record.selected_at]
          );
        }

        imported.push(exportedConfig.config.name);
      } catch (e) {
        errors.push(`Failed to import config "${exportedConfig.config.name}": ${(e as Error).message}`);
      }
    }

    if (exportData.globalSettings && exportData.globalSettings.length > 0) {
      try {
        for (const setting of exportData.globalSettings) {
          await database.execute(
            'INSERT INTO settings (key, value, config_id) VALUES ($1, $2, 0) ON CONFLICT(key, config_id) DO UPDATE SET value = $2',
            [setting.key, setting.value]
          );
        }
        imported.push('(Global Settings)');
      } catch (e) {
        errors.push(`Failed to import global settings: ${(e as Error).message}`);
      }
    }

    await database.execute('COMMIT');
  } catch (e) {
    await database.execute('ROLLBACK');
    errors.push(`Transaction failed: ${(e as Error).message}`);
  }

  return { success: errors.length === 0, imported, errors };
}
