import Database from '@tauri-apps/plugin-sql';

export interface Student {
  id?: number;
  name: string;
  weight: number;
  selected_count: number;
  created_at?: string;
}

export interface AppSettings {
  key: string;
  value: string;
}

let db: Database | null = null;

export async function initDatabase(): Promise<Database> {
  if (db) return db;
  db = await Database.load('sqlite:./config.db');
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      weight INTEGER DEFAULT 1,
      selected_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
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

export async function getAllStudents(): Promise<Student[]> {
  const database = await getDatabase();
  return await database.select<Student[]>('SELECT * FROM students ORDER BY id');
}

export async function addStudent(name: string, weight: number = 1): Promise<{ success: boolean; error?: string }> {
  const database = await getDatabase();
  
  const existing = await database.select<{id: number}[]>(
    'SELECT id FROM students WHERE name = $1',
    [name]
  );
  
  if (existing.length > 0) {
    return { success: false, error: '姓名已存在' };
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

export async function updateStudentWeight(id: number, weight: number): Promise<void> {
  const database = await getDatabase();
  await database.execute('UPDATE students SET weight = $1 WHERE id = $2', [weight, id]);
}

export async function updateStudentName(id: number, name: string): Promise<{ success: boolean; error?: string }> {
  const database = await getDatabase();
  
  const existing = await database.select<{id: number}[]>(
    'SELECT id FROM students WHERE name = $1 AND id != $2',
    [name, id]
  );
  
  if (existing.length > 0) {
    return { success: false, error: '姓名已存在' };
  }
  
  await database.execute('UPDATE students SET name = $1 WHERE id = $2', [name, id]);
  return { success: true };
}

export async function deleteStudent(id: number): Promise<void> {
  const database = await getDatabase();
  await database.execute('DELETE FROM students WHERE id = $1', [id]);
}

export async function clearAllStudents(): Promise<void> {
  const database = await getDatabase();
  await database.execute('DELETE FROM history');
  await database.execute('DELETE FROM students');
}

export async function importFromText(text: string): Promise<{ success: boolean; count: number; errors: string[] }> {
  const database = await getDatabase();
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  let count = 0;
  const errors: string[] = [];
  
  for (const line of lines) {
    const parts = line.split(/[,\t]/);
    const name = parts[0].trim();
    const weight = parts.length > 1 ? parseInt(parts[1]) || 1 : 1;
    
    if (!name) continue;
    
    const existing = await database.select<{id: number}[]>(
      'SELECT id FROM students WHERE name = $1',
      [name]
    );
    
    if (existing.length > 0) {
      errors.push(`"${name}" 已存在`);
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
      [nextId, name, weight]
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

export function weightedRandomSelect(students: Student[]): Student | null {
  if (students.length === 0) return null;
  
  const totalWeight = students.reduce((sum, s) => sum + s.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const student of students) {
    random -= student.weight;
    if (random <= 0) {
      return student;
    }
  }
  
  return students[students.length - 1];
}