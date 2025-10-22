// public/js/browse.js — LIVE filters, toasts, hearts, distance sort (nearby) with pagination + fixed API base

// ============== Helpers ==============
function qs(sel) {
  return document.querySelector(sel);
}
function qsa(sel) {
  return Array.from(document.querySelectorAll(sel));
}

// Toast
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

// Normalize plural/singular
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
    other: "other",
  };
  return map[(t || "").toLowerCase()] || t;
}

// Likes state
let likedSet = new Set();
async function loadLikes() {
  try {
    const likes = await fetchJSON(`${API_BASE}/api/likes`);
    likedSet = new Set(
      likes.map((x) => String(x.venueId || x.venue_id || x._id))
    );
  } catch {
    likedSet = new Set();
  }
}
function isLiked(id) {
  return likedSet.has(String(id));
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

// Distance helper
function getUserCoords() {
  try {
    return JSON.parse(localStorage.getItem("userLocation") || "null");
  } catch {
    return null;
  }
}
function km(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371,
    toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude),
    lat2 = toRad(b.latitude);
  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(hav));
}

// Build card
function buildCard(p) {
  const div = document.createElement("div");
  div.className = "card";
  const liked = isLiked(p._id);
  div.innerHTML = `
    <img src="${p.heroImage || p.image || "./images/restaurant.jpg"}" alt="${p.name}">
    <div class="body">
      <h3>${p.name}</h3>
      <div class="meta">⭐ ${p.rating ?? "—"} · ${p.city || ""}</div>
      <div class="row">
        <button class="join" data-id="${p._id}">Join Queue</button>
        <button class="heart ${liked ? "on" : ""}" aria-label="Favorite" data-like="${p._id}">♥</button>
      </div>
    </div>`;
  div.querySelector(".join")?.addEventListener("click", () => {
    location.href = `place.html?id=${encodeURIComponent(p._id)}`;
  });
  div.querySelector(".heart")?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    toggleLike(p._id, ev.currentTarget);
  });
  return div;
}

// --------- API base (fixed) ---------
// const API_BASE = "http://localhost:3000";
const API_BASE = window.location.origin;
const FETCH_CREDENTIALS = "same-origin";


// Load with filters
async function load() {
  const usp = new URLSearchParams(location.search);

  // Normalize type locally too
  const map = {
    restaurants: "restaurant",
    restaurant: "restaurant",
    salons: "salon",
    salon: "salon",
    clinics: "clinic",
    clinic: "clinic",
    events: "event",
    event: "event",
    others: "other",
    other: "other",
  };
  let type = usp.get("type") || "";
  if (type) type = map[type.toLowerCase()] || type;

  const q = (document.getElementById("q")?.value || usp.get("q") || "").trim();
  const loc = (document.getElementById("loc")?.value || "").trim();
  const price = document.getElementById("price")?.value || "";
  const rating = document.getElementById("rating")?.value || "";
  const cuisine = (document.getElementById("cuisine")?.value || "").trim();

  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (q) params.set("q", q);
  if (loc) params.set("city", loc);
  if (price) params.set("price", price);
  if (rating) params.set("rating", rating);
  if (cuisine) params.set("cuisine", cuisine);

  // Pagination defaults
  params.set("limit", "24");
  params.set("page", "1");

  const url = `${API_BASE}/api/owners/public?${params.toString()}`;

  try {
    const resp = await fetch(url, { credentials: "include" }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });

    const items = Array.isArray(resp) ? resp : resp.items || [];
    const grid = document.getElementById("venueGrid");
    grid.innerHTML = "";
    // can include loading state
    // grid.innerHTML = '<div class="loading">Loading venues...</div>';
    if (!items.length) {
      grid.innerHTML = "<p>No results found.</p>";
      return;
    }

    items.forEach((p) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <img src="${p.heroImage || "./images/restaurant.jpg"}" alt="${p.name}">
        <div class="body">
          <h3>${p.name}</h3>
          <div class="meta">⭐ ${p.rating ?? "—"} · ${p.city || ""}</div>
          <p class="muted">${p.cuisine || ""}</p>
          <button class="btn btn--sm btn--primary view-btn" data-id="${p._id}">
  View details
</button>
        </div>`;
      card.querySelector("button").addEventListener("click", () => {
        location.href = `place.html?id=${encodeURIComponent(p._id)}`;
      });
      grid.appendChild(card);
    });
  } catch (err) {
    console.error("Failed to load venues:", err);
    const grid = document.getElementById("venueGrid");
    grid.innerHTML = "<p style='color:#b91c1c'>Failed to load venues.</p>";
  }
}

qs("#apply")?.addEventListener("click", load);
qs("#clear")?.addEventListener("click", () => {
  qsa("input, select").forEach((el) => (el.value = ""));
  load();
});

load();
