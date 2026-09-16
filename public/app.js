const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Small hand-drawn line icons, reused everywhere instead of emoji so the
// UI reads as one consistent visual system rather than mixed platform emoji.
const ICONS = {
  flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c2.5 3 4 5.5 4 8.5a4 4 0 1 1-8 0C8 8.5 9.5 6 12 3z"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M12 13v3"/><path d="M9 20h6"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 11h6"/><path d="M9 15h6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4 10-10"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  sunrise: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v5"/><path d="M4.9 10.6l1.8 1.3"/><path d="M19.1 10.6l-1.8 1.3"/><path d="M3 18h18"/><path d="M6 18a6 6 0 0 1 12 0"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
};

const habitList = document.getElementById("habit-list");
const emptyState = document.getElementById("empty-state");
const todayHeading = document.getElementById("today-heading");
const form = document.getElementById("habit-form");
const daysPicker = document.getElementById("days-picker");
const specificDatePicker = document.getElementById("specific-date-picker");
const specificDateInput = document.getElementById("specific-date");
const progressSummary = document.getElementById("progress-summary");
const progressFill = document.getElementById("progress-fill");
const heatmap = document.getElementById("heatmap");
const statsBar = document.getElementById("stats-bar");
const exportBtn = document.getElementById("export-btn");
const filterBtns = document.querySelectorAll(".filter-btn");
const usernameDisplay = document.getElementById("username-display");
const logoutBtn = document.getElementById("logout-btn");
const reminderBanner = document.getElementById("morning-reminder");
const notifyBtn = document.getElementById("notify-btn");
const notifyBtnLabel = document.getElementById("notify-btn-label");
const reminderTimeInput = document.getElementById("reminder-time-input");
const reminderSaveStatus = document.getElementById("reminder-save-status");

// The user's saved reminder time, loaded from /api/settings on init.
// Falls back to 8:00 AM until that call resolves.
let reminderSettings = { reminderHour: 8, reminderMinute: 0 };

let currentFilter = "all";
let latestHabits = []; // cached from the last /api/habits load, so filtering doesn't need a refetch

// Show/hide the weekday picker based on the "daily / specific days" choice.
form.querySelectorAll('input[name="type"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    const type = form.querySelector('input[name="type"]:checked').value;
    daysPicker.classList.toggle("hidden", type !== "custom");
    specificDatePicker.classList.toggle("hidden", type !== "specific");
    if (type === "specific" && !specificDateInput.value) {
      specificDateInput.value = new Date().toISOString().slice(0, 10);
    }
  });
});

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderHabitList();
  });
});

exportBtn.addEventListener("click", () => {
  window.location.href = "/api/export";
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login.html";
});

// The server already redirects "/" to /login.html when there's no session,
// but any 401 from the API (e.g. a session that expired mid-use) should
// also bounce the user back to login rather than showing a broken page.
async function requireAuthOrRedirect() {
  const res = await fetch("/api/me");
  if (!res.ok) {
    window.location.href = "/login.html";
    return null;
  }
  const user = await res.json();
  usernameDisplay.innerHTML = `${ICONS.user} ${escapeHtml(user.username)}`;
  return user;
}

async function loadHabits() {
  const res = await fetch("/api/habits");
  const data = await res.json();

  const today = new Date(data.date + "T00:00:00");
  todayHeading.textContent = `Today — ${today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  })}`;

  latestHabits = data.habits.filter((h) => h.dueToday);
  renderStats(latestHabits);
  renderHabitList();
  renderMorningReminder();
  maybeSendBrowserNotification();
}

function renderStats(due) {
  const doneCount = due.filter((h) => h.completed).length;
  const bestStreak = due.reduce((max, h) => Math.max(max, h.longestStreak), 0);
  statsBar.innerHTML = `
    <span>${ICONS.clipboard} ${due.length} due today</span>
    <span>${ICONS.check} ${doneCount} done</span>
    <span>${ICONS.trophy} best streak: ${bestStreak}</span>
  `;
}

function renderHabitList() {
  const filtered = latestHabits.filter((h) => {
    if (currentFilter === "pending") return !h.completed;
    if (currentFilter === "done") return h.completed;
    return true;
  });

  habitList.innerHTML = "";
  emptyState.classList.toggle("hidden", latestHabits.length > 0);

  if (latestHabits.length > 0 && filtered.length === 0) {
    const msg = document.createElement("p");
    msg.className = "empty-state";
    msg.textContent =
      currentFilter === "done" ? "Nothing completed yet today." : "Nothing pending — all done.";
    habitList.appendChild(msg);
    return;
  }

  filtered.forEach((habit) => habitList.appendChild(renderHabitItem(habit)));
}

function renderHabitItem(habit) {
  const li = document.createElement("li");
  li.className = "habit-item" + (habit.completed ? " completed" : "");

  const scheduleLabel =
    habit.type === "daily" ? "Every day" :
    habit.type === "custom" ? habit.days.map((d) => DAY_NAMES[d]).join(", ") :
    `Only ${formatDate(habit.specificDate)}`;

  li.innerHTML = `
    <div class="habit-main">
      <div class="habit-left">
        <input type="checkbox" class="habit-check" ${habit.completed ? "checked" : ""} />
        <div>
          <div class="habit-name ${habit.completed ? "completed-text" : ""}">${escapeHtml(habit.name)}</div>
          <div class="habit-meta">${scheduleLabel} · best ${habit.longestStreak} · ${habit.totalCompletions} total</div>
        </div>
      </div>
      <div class="habit-right">
        <span class="streak-badge">${ICONS.flame} ${habit.streak}</span>
        <button class="icon-btn history-btn" title="Show history">${ICONS.calendar}</button>
        <button class="icon-btn edit-btn" title="Edit habit">${ICONS.edit}</button>
        <button class="icon-btn delete-btn" title="Delete habit">${ICONS.trash}</button>
      </div>
    </div>
    <div class="habit-history hidden"></div>
    <div class="habit-edit-form hidden"></div>
  `;

  li.querySelector(".habit-check").addEventListener("change", () => toggleHabit(habit.id));
  li.querySelector(".delete-btn").addEventListener("click", () => deleteHabit(habit.id));
  li.querySelector(".history-btn").addEventListener("click", () => toggleHistory(li, habit.id));
  li.querySelector(".edit-btn").addEventListener("click", () => toggleEditForm(li, habit));

  return li;
}

async function toggleHabit(id) {
  await fetch(`/api/habits/${id}/toggle`, { method: "POST" });
  await Promise.all([loadHabits(), loadProgress()]);
}

async function deleteHabit(id) {
  if (!confirm("Delete this habit? This also removes its history.")) return;
  await fetch(`/api/habits/${id}`, { method: "DELETE" });
  await Promise.all([loadHabits(), loadProgress()]);
}

// ---------- mini history (last 14 days) ----------

async function toggleHistory(li, habitId) {
  const box = li.querySelector(".habit-history");
  const isHidden = box.classList.contains("hidden");

  // Close any other open history/edit panels for a tidier list.
  document.querySelectorAll(".habit-history:not(.hidden), .habit-edit-form:not(.hidden)").forEach((el) => {
    if (el !== box) el.classList.add("hidden");
  });

  if (!isHidden) {
    box.classList.add("hidden");
    return;
  }

  box.innerHTML = "Loading…";
  box.classList.remove("hidden");

  const res = await fetch(`/api/habits/${habitId}/history?days=14`);
  const data = await res.json();

  box.innerHTML = "";
  const row = document.createElement("div");
  row.className = "mini-history";
  data.history.forEach((d) => {
    const pill = document.createElement("div");
    pill.className = "mini-pill";
    pill.dataset.state = !d.due ? "off" : d.done ? "done" : "missed";
    pill.title = `${d.date}${!d.due ? " — not scheduled" : d.done ? " — done" : " — missed"}`;
    row.appendChild(pill);
  });
  box.appendChild(row);
}

// ---------- edit habit ----------

function toggleEditForm(li, habit) {
  const box = li.querySelector(".habit-edit-form");
  const isHidden = box.classList.contains("hidden");

  document.querySelectorAll(".habit-history:not(.hidden), .habit-edit-form:not(.hidden)").forEach((el) => {
    if (el !== box) el.classList.add("hidden");
  });

  if (!isHidden) {
    box.classList.add("hidden");
    return;
  }

  const dayCheckboxes = DAY_NAMES_FULL.map((name, i) => {
    const checked = habit.days.includes(i) ? "checked" : "";
    return `<label><input type="checkbox" value="${i}" ${checked} /> ${DAY_NAMES[i]}</label>`;
  }).join("");

  box.innerHTML = `
    <input type="text" class="edit-name" value="${escapeHtml(habit.name)}" />
    <div class="type-choice">
      <label><input type="radio" name="edit-type-${habit.id}" value="daily" ${habit.type === "daily" ? "checked" : ""} /> Every day</label>
      <label><input type="radio" name="edit-type-${habit.id}" value="custom" ${habit.type === "custom" ? "checked" : ""} /> Specific weekdays</label>
      <label><input type="radio" name="edit-type-${habit.id}" value="specific" ${habit.type === "specific" ? "checked" : ""} /> Specific date</label>
    </div>
    <div class="days-picker edit-days ${habit.type === "custom" ? "" : "hidden"}">${dayCheckboxes}</div>
    <div class="specific-date-picker edit-specific-date ${habit.type === "specific" ? "" : "hidden"}">
      <label>Task date</label>
      <input type="date" class="edit-date" value="${habit.specificDate || ""}" />
    </div>
    <div class="edit-actions">
      <button class="save-edit-btn" type="button">Save</button>
      <button class="cancel-edit-btn" type="button">Cancel</button>
    </div>
  `;
  box.classList.remove("hidden");

  const editDaysBox = box.querySelector(".edit-days");
  const editDateBox = box.querySelector(".edit-specific-date");
  box.querySelectorAll(`input[name="edit-type-${habit.id}"]`).forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      editDaysBox.classList.toggle("hidden", radio.value !== "custom");
      editDateBox.classList.toggle("hidden", radio.value !== "specific");
    });
  });

  box.querySelector(".cancel-edit-btn").addEventListener("click", () => box.classList.add("hidden"));

  box.querySelector(".save-edit-btn").addEventListener("click", async () => {
    const name = box.querySelector(".edit-name").value.trim();
    const type = box.querySelector(`input[name="edit-type-${habit.id}"]:checked`).value;
    const days = Array.from(editDaysBox.querySelectorAll("input:checked")).map((cb) => Number(cb.value));
    const specificDate = box.querySelector(".edit-date").value || null;

    if (!name) {
      alert("Habit name can't be empty.");
      return;
    }
    if (type === "custom" && days.length === 0) {
      alert("Pick at least one weekday.");
      return;
    }
    if (type === "specific" && !specificDate) {
      alert("Pick a specific date.");
      return;
    }

    const res = await fetch(`/api/habits/${habit.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, days, specificDate }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Could not save changes.");
      return;
    }

    await Promise.all([loadHabits(), loadProgress()]);
  });
}

// ---------- add habit ----------

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("habit-name").value.trim();
  const type = form.querySelector('input[name="type"]:checked').value;
  const days = Array.from(daysPicker.querySelectorAll("input:checked")).map((cb) => Number(cb.value));
  const specificDate = specificDateInput.value || null;

  if (type === "custom" && days.length === 0) {
    alert("Pick at least one day.");
    return;
  }
  if (type === "specific" && !specificDate) {
    alert("Pick a specific date.");
    return;
  }

  const res = await fetch("/api/habits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, type, days, specificDate }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.error || "Could not add habit.");
    return;
  }

  form.reset();
  daysPicker.classList.add("hidden");
  specificDatePicker.classList.add("hidden");
  await Promise.all([loadHabits(), loadProgress()]);
});

// ---------- overall progress ----------

async function loadProgress() {
  const res = await fetch("/api/progress");
  const data = await res.json();

  progressSummary.textContent =
    `Day ${data.dayNumber} of ${data.challengeLengthDays} · ` +
    `${data.completionRate}% of due habits completed · ` +
    `${data.daysRemaining} days left`;

  progressFill.style.width = `${data.completionRate}%`;

  // Heatmap: last 30 days (or fewer if the challenge just started).
  const recent = data.history.slice(-30);
  heatmap.innerHTML = "";
  recent.forEach((d) => {
    const level = d.due === 0 ? 0 : Math.min(3, Math.ceil((d.done / d.due) * 3));
    const cell = document.createElement("div");
    cell.className = "day";
    cell.dataset.level = level;
    cell.title = `${d.date}: ${d.done}/${d.due} done`;
    heatmap.appendChild(cell);
  });
}

function formatDate(dateString) {
  if (!dateString) return "No date";
  const d = new Date(dateString + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- morning reminder ----------
//
// Two layers, both best-effort:
//  1. An in-app banner — always works, shown once the user's saved
//     reminder time has passed for the day and something's still unlogged.
//  2. A real OS notification via the Notification API, IF the user opts
//     in. This only fires while this tab/page is actually loaded — a
//     plain web page (no service worker + push server) can't wake up on
//     its own when the browser is closed. That's a real limitation, not
//     a bug: true "notify me even when the app isn't open" reminders need
//     server-sent push, which is out of scope for this stack. Documented
//     in the README.
//
// The reminder time itself is saved server-side per account (GET/PUT
// /api/settings), so it follows the user across devices/browsers, unlike
// the notification permission which is inherently per-browser.

function todayKeyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// True from the saved reminder time onward, for the rest of the day —
// this is what "remind me at 8:00" means: it goes off once 8:00 arrives,
// not only in some fixed early window.
function isReminderTimeReached() {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = reminderSettings.reminderHour * 60 + reminderSettings.reminderMinute;
  return nowMinutes >= targetMinutes;
}

function reminderDismissedToday() {
  return localStorage.getItem("reminder-dismissed") === todayKeyLocal();
}

function dismissReminderForToday() {
  localStorage.setItem("reminder-dismissed", todayKeyLocal());
  reminderBanner.classList.add("hidden");
}

function renderMorningReminder() {
  const pending = latestHabits.filter((h) => !h.completed);

  if (!isReminderTimeReached() || pending.length === 0 || reminderDismissedToday()) {
    reminderBanner.classList.add("hidden");
    reminderBanner.innerHTML = "";
    return;
  }

  const names = pending.map((h) => escapeHtml(h.name));
  const list =
    names.length <= 3
      ? names.join(", ")
      : `${names.slice(0, 3).join(", ")}, and ${names.length - 3} more`;

  reminderBanner.innerHTML = `
    <div class="reminder-icon">${ICONS.sunrise}</div>
    <div class="reminder-body">
      <div class="reminder-title">${pending.length} habit${pending.length === 1 ? "" : "s"} still unlogged today</div>
      <div class="reminder-list">${list}</div>
    </div>
    <button class="reminder-dismiss" title="Dismiss for today">${ICONS.trash}</button>
  `;
  reminderBanner.classList.remove("hidden");
  reminderBanner.querySelector(".reminder-dismiss").addEventListener("click", dismissReminderForToday);
}

// ---------- reminder time setting ----------

function formatTimeInputValue(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function loadReminderSettings() {
  try {
    const res = await fetch("/api/settings");
    if (res.ok) {
      reminderSettings = await res.json();
    }
  } catch (err) {
    // Keep the 8:00 default if this fails — not worth blocking the app over.
  }
  reminderTimeInput.value = formatTimeInputValue(reminderSettings.reminderHour, reminderSettings.reminderMinute);
}

reminderTimeInput.addEventListener("change", async () => {
  const [h, m] = reminderTimeInput.value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return;

  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reminderHour: h, reminderMinute: m }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.error || "Could not save reminder time.");
    return;
  }

  reminderSettings = await res.json();
  // A newly saved time should be able to trigger the banner right away,
  // even if it was dismissed under the old time earlier today.
  localStorage.removeItem("reminder-dismissed");
  renderMorningReminder();

  reminderSaveStatus.classList.remove("hidden");
  setTimeout(() => reminderSaveStatus.classList.add("hidden"), 1800);
});

// ---------- browser notification (opt-in) ----------

function notificationsEnabled() {
  return localStorage.getItem("notifications-enabled") === "true" && "Notification" in window && Notification.permission === "granted";
}

function updateNotifyBtnLabel() {
  if (!("Notification" in window)) {
    notifyBtn.classList.add("hidden"); // unsupported browser — don't offer a dead button
    return;
  }
  notifyBtnLabel.textContent = notificationsEnabled() ? "Reminders on" : "Reminders off";
  notifyBtn.classList.toggle("active-toggle", notificationsEnabled());
}

notifyBtn.addEventListener("click", async () => {
  if (!("Notification" in window)) return;

  if (notificationsEnabled()) {
    localStorage.setItem("notifications-enabled", "false");
    updateNotifyBtnLabel();
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    localStorage.setItem("notifications-enabled", "true");
    maybeSendBrowserNotification(); // fire immediately if the reminder time has already passed
  }
  updateNotifyBtnLabel();
});

function maybeSendBrowserNotification() {
  if (!notificationsEnabled() || !isReminderTimeReached()) return;

  const pending = latestHabits.filter((h) => !h.completed);
  if (pending.length === 0) return;

  const notifiedKey = localStorage.getItem("notified-on");
  if (notifiedKey === todayKeyLocal()) return; // already sent one today

  new Notification("Waypoint — reminder", {
    body: `${pending.length} habit${pending.length === 1 ? "" : "s"} still unlogged today.`,
  });
  localStorage.setItem("notified-on", todayKeyLocal());
}

(async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return; // already redirecting to /login.html
  updateNotifyBtnLabel();
  await loadReminderSettings();
  loadHabits();
  loadProgress();

  // Re-check periodically so the banner can appear on its own once the
  // saved reminder time arrives, without needing a page refresh.
  setInterval(renderMorningReminder, 5 * 60 * 1000);
})();
