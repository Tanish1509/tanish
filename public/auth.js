function showAuthError(message) {
  const el = document.getElementById("auth-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

async function submitAuth(endpoint, body) {
  const el = document.getElementById("auth-error");
  el.classList.add("hidden");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      showAuthError(data.error || "Something went wrong. Try again.");
      return;
    }

    window.location.href = "/";
  } catch (err) {
    showAuthError("Could not reach the server. Is it running?");
  }
}
