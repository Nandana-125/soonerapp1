// public/js/userDashboard.js — LIVE data + hearts + announcements + graceful fallbacks, with fixed API base + pagination

// ============== Helpers ==============
function qs(sel) {
  return document.querySelector(sel);
}
function qsa(sel) {
  return Array.from(document.querySelectorAll(sel));
}

// const API_BASE = "http://localhost:3000";
const API_BASE = window.location.origin;

// Toast (optional UI)
const toastEl = document.getElementById("toast");
const toastText = document.getElementById("toastText");
document
  .getElementById("toastClose")
  ?.addEventListener("click", () => toastEl?.classList.remove("show"));
function toast(msg) {
  if (!toastEl || !toastText) {
    console.log("[toast]", msg);
    return;
  }
  toastText.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

async function fetchJSON(url, opts = {}) {
  const r = await fetch(url, { credentials: "include", ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

const greetNameEl = document.getElementById("greetName");
if (greetNameEl)
  greetNameEl.textContent = localStorage.getItem("customerName") || "Customer";

// ====== Category buttons → Browse page ======
document.querySelectorAll(".categories button").forEach((btn) => {
  const raw = btn.getAttribute("data-type"); // e.g. "restaurants", "salons", etc.
  btn.addEventListener("click", () => {
    location.href = `browse.html?type=${encodeURIComponent(raw)}`;
  });
});

// Normalize plural/singular category names
function normalizeType(t) {
  const map = {
    restaurants: "restaurant",
    restaurant: "restaurant",
    salons: "salon",
    salon: "salon",
    clinics: "clinic",
    clinic: "clinic",
    events: "event",
    event: "event",
    services: "other",
    service: "other",
    other: "other",
  };
  return map[(t || "").toLowerCase()] || t;
}

// Category buttons → browse
qsa(".categories button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const raw = btn.getAttribute("data-type");
    const type = normalizeType(raw);
    if (type) location.href = `browse.html?type=${encodeURIComponent(type)}`;
  });
});

// Explore nearby
document.getElementById("exploreBtn")?.addEventListener("click", () => {
  location.href = "browse.html?nearby=1";
});

// Announcements banner
fetchJSON(`${API_BASE}/api/announcements/active`)
  .then((items) => {
    if (!items?.length) return;
    const b = document.querySelector(".banner .text");
    if (!b) return;
    const first = items[0];
    b.innerHTML = `<h2>${first.type === "offer" ? "🎁 Offer" : "📢 Announcement"}</h2><p>${first.message}</p>`;
  })
  .catch(() => {});

// Favorites (likes) — preload to render hearts
let likedSet = new Set();
async function loadLikes() {
  try {
    const likes = await fetchJSON(`${API_BASE}/api/likes`);
    likedSet = new Set(
      likes.map((x) => String(x.venueId || x.venue_id || x._id))
    );
  } catch (e) {
    likedSet = new Set();
  }
}
function isLiked(id) {
  return likedSet.has(String(id));
}

function heartButtonHTML(id) {
  const on = isLiked(id) ? "on" : "off";
  return `<button class="heart ${on}" aria-label="Favorite" data-like="${id}">♥</button>`;
}

async function toggleLike(venueId, btn) {
  try {
    const idStr = String(venueId);
    if (isLiked(idStr)) {
      await fetch(`${API_BASE}/api/likes/${encodeURIComponent(idStr)}`, {
        method: "DELETE",
        credentials: "include",
      });
      likedSet.delete(idStr);
      btn?.classList.remove("on");
      toast("Removed from favorites");
    } else {
      await fetch(`${API_BASE}/api/likes/${encodeURIComponent(idStr)}`, {
        method: "POST",
        credentials: "include",
      });
      likedSet.add(idStr);
      btn?.classList.add("on");
      toast("Added to favorites");
    }
  } catch (e) {
    if (e?.message?.includes("Unauthorized") || e?.status === 401) {
      const ret = encodeURIComponent(location.pathname + location.search);
      location.href = `ownerSignUp.html?role=customer&mode=login&returnTo=${ret}`;
      return;
    }
    toast("Action failed");
  }
}

// Card factory
// for places that don't have a linked image, i suggest handling that with a premade image with the place name centered to match the ui 
function makeCard(p) {
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `
    <div class="card-media">
      <img src="${p.heroImage || p.image || "./images/restaurant.jpg"}" alt="${p.name}">
    </div>
    <div class="body">
      <h3>${p.name}</h3>
      <div class="meta">⭐ ${p.rating ?? "—"} · ${p.city || ""}</div>
      <button data-id="${p._id}">Join Queue</button>
    </div>`;
  div.querySelector("button[data-id]")?.addEventListener("click", () => {
    location.href = `place.html?id=${encodeURIComponent(p._id)}`;
  });
  div.querySelector("button.heart")?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    toggleLike(p._id, ev.currentTarget);
  });
  return div;
}

// Render rows
async function renderSection(rowId, typeRaw) {
  const type = normalizeType(typeRaw);
  const row = document.getElementById(rowId);
  if (!row) return;
  row.innerHTML = "<div class='muted'>Loading…</div>";

  try {
    const listResp = await fetchJSON(
      `${API_BASE}/api/owners/public?type=${encodeURIComponent(type)}&limit=12&page=1`
    );
    const list = listResp.items || [];
    const sorted = list
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 5);

    row.innerHTML = "";
    sorted.forEach((p) => row.appendChild(makeCard(p)));
  } catch (e) {
    console.error("renderSection error", e);
    row.innerHTML = "<div class='muted'>Failed to load.</div>";
  }
}

// ---------- Active Queue box ----------
async function loadActiveQueueBox() {
  const sec = document.getElementById("activeQueueSection");
  const box = document.getElementById("activeQueueBox");
  if (!sec || !box) return;

  try {
    const q = await fetch("/api/queue/active", { credentials: "include" });
    if (q.status === 204) {
      // no active queue
      sec.style.display = "none";
      return;
    }
    if (!q.ok) throw new Error("Active queue fetch failed");
    const data = await q.json();

    // Guard for empty payload
    if (!data || !data.venueId) {
      sec.style.display = "none";
      return;
    }

    sec.style.display = ""; // show
    box.innerHTML = `
      <p>You’re in line at <b>${data.venueName || "—"}</b></p>
      <p>Position: <b>#${data.position ?? "?"}</b> · Party: ${data.people ?? "?"}</p>
      <p>Approx wait: ${data.approxWaitMins ? data.approxWaitMins + "m" : "—"}</p>
      <div class="row gap">
        <button class="btn small" onclick="location.href='place.html?id=${encodeURIComponent(data.venueId)}'">Open place</button>
        <button class="btn ghost small" onclick="location.href='place.html?id=${encodeURIComponent(data.venueId)}#queue'">Manage</button>
      </div>
    `;
  } catch (e) {
    // Hide on any error or unauth
    sec.style.display = "none";
  }
}

// ---------- Venues for Today ----------
async function loadTodayVenues() {
  const sec = document.getElementById("todayVenuesSection");
  const row = document.getElementById("todayVenuesRow");
  if (!sec || !row) return;

  try {
    // likes: [{ venueId }]
    // history: [{ venueId, count }]
    const [likesRes, histRes] = await Promise.allSettled([
      fetchJSON("/api/likes"),
      fetchJSON("/api/history"),
    ]);

    const likes = likesRes.status === "fulfilled" ? likesRes.value : [];
    const history = histRes.status === "fulfilled" ? histRes.value : [];

    // Build ranking keys: favorites get a big boost; then by visit count.
    const favIds = new Set(likes.map((x) => String(x.venueId || x._id || x)));
    const counts = new Map();
    history.forEach((h) => {
      const id = String(h.venueId || h._id || h);
      counts.set(id, (counts.get(id) || 0) + (h.count || 1));
    });

    // ranked unique ids (limit 5)
    const ranked = [...new Set([...favIds, ...counts.keys()])]
      .sort((a, b) => {
        const sa = (favIds.has(a) ? 100 : 0) + (counts.get(a) || 0);
        const sb = (favIds.has(b) ? 100 : 0) + (counts.get(b) || 0);
        return sb - sa;
      })
      .slice(0, 5);

    if (!ranked.length) {
      sec.style.display = "none";
      return;
    }

    // Fetch public details for each id
    const details = await Promise.all(
      ranked.map((id) =>
        fetchJSON(`/api/owners/public/${encodeURIComponent(id)}`).catch(
          () => null
        )
      )
    );
    const items = details.filter(Boolean);

    if (!items.length) {
      sec.style.display = "none";
      return;
    }

    // Render
    row.innerHTML = "";
    items.forEach((p) => row.appendChild(makeCard(p)));
    sec.style.display = ""; // show
  } catch (e) {
    sec.style.display = "none";
  }
}

(async function init() {
  await loadLikes();
  await loadActiveQueueBox();
  await loadTodayVenues();
  renderSection("restaurantsRow", "restaurant");
  renderSection("salonsRow", "salon");
  renderSection("clinicsRow", "clinic");
  renderSection("eventsRow", "event");
})();

// redirect to profile page on click
document.getElementById("avatar")?.addEventListener("click", () => {
  window.location.href = "userProfile.html";
});

(async function loadAvatar() {
  try {
    const me = await fetchJSON(`${API_BASE}/api/customers/me`);
    const img = document.getElementById("profilePic");
    if (me.avatar && img) img.src = me.avatar;
  } catch {}
})();

// Logout button → clear session + local data
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch(`${API_BASE}/api/customers/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      localStorage.clear();
      location.href = "ownerSignUp.html?role=customer&mode=login";
    }
  });
}

// Geolocation label (optional)
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      localStorage.setItem(
        "userLocation",
        JSON.stringify({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
      );
      qs("#userCity") && (qs("#userCity").textContent = "your location");
    },
    () => {
      qs("#userCity") && (qs("#userCity").textContent = "Boston");
    }
  );
} else {
  qs("#userCity") && (qs("#userCity").textContent = "Boston");
}
