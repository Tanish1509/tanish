const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const {
  todayISO, getUser, getUserByUsername, createUser, getSettings, updateSettings,
  getHabit, getHabits, createHabit, updateHabit, deleteHabit, isCompleted,
  setCompletion, getExportData,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const CHALLENGE_LENGTH_DAYS = 75;

app.use(express.json());
app.use(cookieSession({ name: 'session', secret: process.env.SESSION_SECRET || 'dev-only-change-me-please', maxAge: 30 * 24 * 60 * 60 * 1000 }));

app.get(['/login.html', '/signup.html'], (req, res, next) => {
  if (req.session?.userId) return res.redirect('/');
  next();
});
app.get(['/', '/index.html'], (req, res) => {
  if (!req.session?.userId) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

function requireAuth(req, res, next) {
  if (!req.session?.userId || !getUser(req.session.userId)) return res.status(401).json({ error: 'Not logged in.' });
  next();
}
function weekdayOf(dateISO) { return new Date(dateISO + 'T00:00:00').getDay(); }
function isDue(habit, dateISO) {
  if (habit.type === 'daily') return true;
  if (habit.type === 'custom') return habit.days.includes(weekdayOf(dateISO));
  if (habit.type === 'specific') return habit.specificDate === dateISO;
  return false;
}
function computeStreak(habit, fromDateISO, challengeStartDate) {
  if (habit.type === 'specific') return isCompleted(habit.id, habit.specificDate) ? 1 : 0;
  let streak = 0;
  let cursor = new Date(fromDateISO + 'T00:00:00');
  const start = new Date(challengeStartDate + 'T00:00:00');
  if (isDue(habit, fromDateISO) && !isCompleted(habit.id, fromDateISO)) cursor.setDate(cursor.getDate() - 1);
  while (cursor >= start) {
    const iso = todayISO(cursor);
    if (isDue(habit, iso)) {
      if (isCompleted(habit.id, iso)) streak++;
      else break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
function computeBestStats(habit, challengeStartDate) {
  if (habit.type === 'specific') return { longestStreak: isCompleted(habit.id, habit.specificDate) ? 1 : 0, totalCompletions: isCompleted(habit.id, habit.specificDate) ? 1 : 0 };
  const start = new Date(challengeStartDate + 'T00:00:00');
  const today = new Date(todayISO() + 'T00:00:00');
  let best = 0, current = 0, totalCompletions = 0;
  for (let cursor = new Date(start); cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
    const iso = todayISO(cursor);
    if (isDue(habit, iso)) {
      if (isCompleted(habit.id, iso)) { current++; totalCompletions++; best = Math.max(best, current); }
      else current = 0;
    }
  }
  return { longestStreak: best, totalCompletions };
}
function habitWithStatus(habit, dateISOValue, challengeStartDate) {
  const { longestStreak, totalCompletions } = computeBestStats(habit, challengeStartDate);
  return { ...habit, dueToday: isDue(habit, dateISOValue), completed: isCompleted(habit.id, dateISOValue), streak: computeStreak(habit, dateISOValue, challengeStartDate), longestStreak, totalCompletions };
}
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + 'T00:00:00').getTime()); }

// Auth
app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username?.trim() || !password) return res.status(400).json({ error: 'Username and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const uname = username.trim().toLowerCase();
  if (getUserByUsername(uname)) return res.status(409).json({ error: 'That username is already taken.' });
  const user = createUser(uname, await bcrypt.hash(password, 10));
  req.session.userId = user.id;
  res.status(201).json({ id: user.id, username: user.username });
});
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  const user = getUserByUsername(username.trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid username or password.' });
  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username });
});
app.post('/api/logout', (req, res) => { req.session = null; res.json({ ok: true }); });
app.get('/api/me', (req, res) => {
  const user = req.session?.userId ? getUser(req.session.userId) : null;
  if (!user) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ id: user.id, username: user.username });
});

// Settings
app.get('/api/settings', requireAuth, (req, res) => res.json(getSettings(req.session.userId)));
app.put('/api/settings', requireAuth, (req, res) => {
  const { reminderHour, reminderMinute } = req.body || {};
  if (!Number.isInteger(reminderHour) || reminderHour < 0 || reminderHour > 23 || !Number.isInteger(reminderMinute) || reminderMinute < 0 || reminderMinute > 59) return res.status(400).json({ error: 'Invalid reminder time.' });
  res.json(updateSettings(req.session.userId, reminderHour, reminderMinute));
});

// Habits
app.get('/api/habits', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const settings = getSettings(userId);
  const date = req.query.date || todayISO();
  if (!validDate(date)) return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
  res.json({ date, habits: getHabits(userId).map(h => habitWithStatus(h, date, settings.challengeStartDate)) });
});

app.post('/api/habits', requireAuth, (req, res) => {
  const { name, type, days = [], specificDate = null } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Task/habit name is required.' });
  if (!['daily', 'custom', 'specific'].includes(type)) return res.status(400).json({ error: 'type must be daily, custom, or specific.' });
  if (type === 'custom' && (!Array.isArray(days) || days.length === 0)) return res.status(400).json({ error: 'Pick at least one weekday.' });
  if (type === 'specific' && !validDate(specificDate)) return res.status(400).json({ error: 'Pick a valid specific date.' });
  const cleanDays = type === 'custom' ? [...new Set(days.map(Number))].filter(d => d >= 0 && d <= 6).sort((a,b) => a-b) : [];
  if (type === 'custom' && cleanDays.length === 0) return res.status(400).json({ error: 'Pick at least one weekday.' });
  const habit = createHabit(req.session.userId, { name: name.trim(), type, days: cleanDays, specificDate: type === 'specific' ? specificDate : null });
  const settings = getSettings(req.session.userId);
  res.status(201).json(habitWithStatus(habit, todayISO(), settings.challengeStartDate));
});

app.put('/api/habits/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, type, days = [], specificDate = null } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Task/habit name is required.' });
  if (!['daily', 'custom', 'specific'].includes(type)) return res.status(400).json({ error: 'Invalid type.' });
  if (type === 'custom' && (!Array.isArray(days) || days.length === 0)) return res.status(400).json({ error: 'Pick at least one weekday.' });
  if (type === 'specific' && !validDate(specificDate)) return res.status(400).json({ error: 'Pick a valid specific date.' });
  const cleanDays = type === 'custom' ? [...new Set(days.map(Number))].filter(d => d >= 0 && d <= 6).sort((a,b) => a-b) : [];
  const habit = updateHabit(id, req.session.userId, { name: name.trim(), type, days: cleanDays, specificDate: type === 'specific' ? specificDate : null });
  if (!habit) return res.status(404).json({ error: 'Habit not found.' });
  const settings = getSettings(req.session.userId);
  res.json(habitWithStatus(habit, todayISO(), settings.challengeStartDate));
});

app.delete('/api/habits/:id', requireAuth, (req, res) => {
  if (!deleteHabit(Number(req.params.id), req.session.userId)) return res.status(404).json({ error: 'Habit not found.' });
  res.json({ ok: true });
});

app.post('/api/habits/:id/toggle', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const date = req.body?.date || todayISO();
  const habit = getHabit(id, req.session.userId);
  if (!habit) return res.status(404).json({ error: 'Habit not found.' });
  if (!validDate(date) || !isDue(habit, date)) return res.status(400).json({ error: 'This task is not scheduled for that date.' });
  setCompletion(id, date, !isCompleted(id, date));
  const settings = getSettings(req.session.userId);
  res.json(habitWithStatus(habit, date, settings.challengeStartDate));
});

app.get('/api/habits/:id/history', requireAuth, (req, res) => {
  const habit = getHabit(Number(req.params.id), req.session.userId);
  if (!habit) return res.status(404).json({ error: 'Habit not found.' });
  const days = Math.min(75, Math.max(1, Number(req.query.days) || 14));
  const settings = getSettings(req.session.userId);
  const today = new Date(todayISO() + 'T00:00:00');
  const start = new Date(settings.challengeStartDate + 'T00:00:00');
  const history = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if (d < start) continue;
    const iso = todayISO(d);
    history.push({ date: iso, due: isDue(habit, iso), done: isCompleted(habit.id, iso) });
  }
  res.json({ habitId: habit.id, history });
});

app.get('/api/export', requireAuth, (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="habit-tracker-backup-${todayISO()}.json"`);
  res.json(getExportData(req.session.userId));
});

app.get('/api/progress', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const settings = getSettings(userId);
  const habits = getHabits(userId);
  const start = new Date(settings.challengeStartDate + 'T00:00:00');
  const today = new Date(todayISO() + 'T00:00:00');
  const dayNumber = Math.min(CHALLENGE_LENGTH_DAYS, Math.max(1, Math.floor((today - start) / 86400000) + 1));
  const history = [];
  let totalDue = 0, totalDone = 0;
  for (let i = 0; i < dayNumber; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const iso = todayISO(d);
    let due = 0, done = 0;
    for (const habit of habits) if (isDue(habit, iso)) { due++; if (isCompleted(habit.id, iso)) done++; }
    totalDue += due; totalDone += done; history.push({ date: iso, due, done });
  }
  res.json({ challengeStartDate: settings.challengeStartDate, challengeLengthDays: CHALLENGE_LENGTH_DAYS, dayNumber, daysRemaining: Math.max(0, CHALLENGE_LENGTH_DAYS - dayNumber), completionRate: totalDue === 0 ? 0 : Math.round((totalDone / totalDue) * 100), history });
});

app.listen(PORT, () => console.log(`Habit tracker running at http://localhost:${PORT}`));
