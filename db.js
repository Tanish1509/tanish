const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'habit-tracker.db');
const LEGACY_FILE = path.join(__dirname, 'data.json');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY,
  challenge_start_date TEXT NOT NULL,
  reminder_hour INTEGER NOT NULL DEFAULT 8,
  reminder_minute INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('daily','custom','specific')),
  specific_date TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS habit_days (
  habit_id INTEGER NOT NULL,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  PRIMARY KEY(habit_id, weekday),
  FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS completions (
  habit_id INTEGER NOT NULL,
  completion_date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(habit_id, completion_date),
  FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_completions_habit ON completions(habit_id);
`);

function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function getUser(userId) {
  return db.prepare('SELECT id, username, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE id = ?').get(userId);
}
function getUserByUsername(username) {
  return db.prepare('SELECT id, username, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE username = ?').get(username);
}
function createUser(username, passwordHash) {
  const createdAt = todayISO();
  const info = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, passwordHash, createdAt);
  db.prepare('INSERT INTO user_settings (user_id, challenge_start_date) VALUES (?, ?)').run(info.lastInsertRowid, createdAt);
  return getUser(info.lastInsertRowid);
}
function getSettings(userId) {
  let row = db.prepare('SELECT challenge_start_date AS challengeStartDate, reminder_hour AS reminderHour, reminder_minute AS reminderMinute FROM user_settings WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO user_settings (user_id, challenge_start_date) VALUES (?, ?)').run(userId, todayISO());
    row = db.prepare('SELECT challenge_start_date AS challengeStartDate, reminder_hour AS reminderHour, reminder_minute AS reminderMinute FROM user_settings WHERE user_id = ?').get(userId);
  }
  return row;
}
function updateSettings(userId, reminderHour, reminderMinute) {
  db.prepare('UPDATE user_settings SET reminder_hour = ?, reminder_minute = ? WHERE user_id = ?').run(reminderHour, reminderMinute, userId);
  return getSettings(userId);
}
function getHabit(id, userId) {
  const h = db.prepare('SELECT id, name, type, specific_date AS specificDate, created_at AS createdAt FROM habits WHERE id = ? AND user_id = ?').get(id, userId);
  if (!h) return null;
  h.days = db.prepare('SELECT weekday FROM habit_days WHERE habit_id = ? ORDER BY weekday').all(h.id).map(x => x.weekday);
  return h;
}
function getHabits(userId) {
  const habits = db.prepare('SELECT id, name, type, specific_date AS specificDate, created_at AS createdAt FROM habits WHERE user_id = ? ORDER BY id').all(userId);
  const days = db.prepare('SELECT habit_id, weekday FROM habit_days WHERE habit_id IN (SELECT id FROM habits WHERE user_id = ?) ORDER BY weekday').all(userId);
  const byHabit = new Map();
  for (const row of days) {
    if (!byHabit.has(row.habit_id)) byHabit.set(row.habit_id, []);
    byHabit.get(row.habit_id).push(row.weekday);
  }
  return habits.map(h => ({ ...h, days: byHabit.get(h.id) || [] }));
}
function createHabit(userId, { name, type, days = [], specificDate = null }) {
  const tx = db.transaction(() => {
    const info = db.prepare('INSERT INTO habits (user_id, name, type, specific_date, created_at) VALUES (?, ?, ?, ?, ?)').run(userId, name, type, specificDate, todayISO());
    const insertDay = db.prepare('INSERT INTO habit_days (habit_id, weekday) VALUES (?, ?)');
    for (const day of days) insertDay.run(info.lastInsertRowid, day);
    return getHabit(info.lastInsertRowid, userId);
  });
  return tx();
}
function updateHabit(id, userId, { name, type, days = [], specificDate = null }) {
  const tx = db.transaction(() => {
    if (!getHabit(id, userId)) return null;
    db.prepare('UPDATE habits SET name = ?, type = ?, specific_date = ? WHERE id = ? AND user_id = ?').run(name, type, specificDate, id, userId);
    db.prepare('DELETE FROM habit_days WHERE habit_id = ?').run(id);
    const insertDay = db.prepare('INSERT INTO habit_days (habit_id, weekday) VALUES (?, ?)');
    for (const day of days) insertDay.run(id, day);
    return getHabit(id, userId);
  });
  return tx();
}
function deleteHabit(id, userId) {
  return db.prepare('DELETE FROM habits WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}
function isCompleted(habitId, dateISO) {
  return Boolean(db.prepare('SELECT 1 FROM completions WHERE habit_id = ? AND completion_date = ? AND completed = 1').get(habitId, dateISO));
}
function setCompletion(habitId, dateISO, completed) {
  if (completed) db.prepare('INSERT INTO completions (habit_id, completion_date, completed) VALUES (?, ?, 1) ON CONFLICT(habit_id, completion_date) DO UPDATE SET completed = 1').run(habitId, dateISO);
  else db.prepare('DELETE FROM completions WHERE habit_id = ? AND completion_date = ?').run(habitId, dateISO);
}
function getExportData(userId) {
  const user = getUser(userId);
  const settings = getSettings(userId);
  const habits = getHabits(userId).map(h => ({ ...h, completions: db.prepare('SELECT completion_date AS date FROM completions WHERE habit_id = ? AND completed = 1 ORDER BY completion_date').all(h.id).map(r => r.date) }));
  return { user: { id: user.id, username: user.username, createdAt: user.createdAt }, settings, habits };
}
function migrateLegacyJson() {
  if (!fs.existsSync(LEGACY_FILE)) return;
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0) return;
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'));
    const tx = db.transaction(() => {
      const insertUser = db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)');
      const insertSettings = db.prepare('INSERT INTO user_settings (user_id, challenge_start_date, reminder_hour, reminder_minute) VALUES (?, ?, ?, ?)');
      const insertHabit = db.prepare('INSERT INTO habits (id, user_id, name, type, specific_date, created_at) VALUES (?, ?, ?, ?, ?, ?)');
      const insertDay = db.prepare('INSERT INTO habit_days (habit_id, weekday) VALUES (?, ?)');
      const insertCompletion = db.prepare('INSERT OR IGNORE INTO completions (habit_id, completion_date, completed) VALUES (?, ?, 1)');
      for (const user of legacy.users || []) {
        insertUser.run(user.id, user.username, user.passwordHash, user.createdAt || todayISO());
        const ud = legacy.userData?.[user.id] || {};
        insertSettings.run(user.id, ud.challengeStartDate || todayISO(), ud.reminderHour ?? 8, ud.reminderMinute ?? 0);
        for (const h of ud.habits || []) {
          insertHabit.run(h.id, user.id, h.name, h.type || 'daily', h.specificDate || null, h.createdAt || todayISO());
          for (const day of h.days || []) insertDay.run(h.id, day);
          for (const date of Object.keys(ud.completions?.[h.id] || {})) if (ud.completions[h.id][date]) insertCompletion.run(h.id, date);
        }
      }
    });
    tx();
    fs.renameSync(LEGACY_FILE, LEGACY_FILE + '.migrated');
    console.log('Migrated legacy data.json into SQLite.');
  } catch (err) {
    console.error('Legacy data migration skipped:', err.message);
  }
}
migrateLegacyJson();
module.exports = { db, todayISO, getUser, getUserByUsername, createUser, getSettings, updateSettings, getHabit, getHabits, createHabit, updateHabit, deleteHabit, isCompleted, setCompletion, getExportData };
