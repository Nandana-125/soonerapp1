// place.js — SAFE MODE: resilient init + live metrics + stateful 45-min timer + your previous behaviors

// ============== Helpers ==============
function qs(sel) {
  return document.querySelector(sel);
}
function text(el, val) {
  if (el) el.textContent = val ?? "—";
}

// ---- ID & HTML escaping helpers (add) ----
function getId(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    if (val.$oid) return String(val.$oid);
    if (val._id) return getId(val._id);
    if (typeof val.toString === "function") return String(val.toString());
  }
  try {
    return String(val);
  } catch {
    return "";
  }
}
function escHtml(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ]
  );
}
const escAttr = escHtml;

let editingReviewId = null; // keeps track if user is editing
let reviewsListBound = false; // ensures we attach one click handler only

const usp = new URLSearchParams(location.search);
const currentId = usp.get("id");

// Toast
const toastEl = qs("#toast");
const toastText = qs("#toastText");
qs("#toastClose")?.addEventListener("click", () =>
  toastEl?.classList.remove("show")
);
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

// fetchJSON that does NOT crash the page
async function fetchJSON(url, opts = {}) {
  try {
    const r = await fetch(url, { credentials: "include", ...opts });
    if (!r.ok) {
      console.warn(`[fetchJSON] ${url} -> HTTP ${r.status}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.warn(`[fetchJSON] ${url} failed:`, e);
    return null;
  }
}

// Show the main immediately so page is never blank
qs("#main")?.classList.remove("hidden");

// ============== Button state helpers ==============
function setEnterBtnState({
  label = "Enter queue",
  disabled = false,
  showPeople = true,
} = {}) {
  const enterBtn = qs("#enterBtn");
  const peopleRow = qs("#peopleRow");
  if (enterBtn) {
    enterBtn.textContent = label;
    enterBtn.disabled = !!disabled;
    enterBtn.classList.toggle("disabled", !!disabled);
  }
  if (peopleRow) peopleRow.classList.toggle("hidden", !showPeople);
}
function toggleQueueButtons(inQueue) {
  const enterBtn = qs("#enterBtn");
  const cancelBtn = qs("#cancelBtn");
  if (enterBtn) enterBtn.classList.toggle("hidden", !!inQueue);
  if (cancelBtn) {
    cancelBtn.classList.toggle("hidden", !inQueue);
    cancelBtn.disabled = false;
  }
  const row = qs("#peopleRow");
  if (row) row.classList.toggle("hidden", !!inQueue);
}

// ============== Stateful 45-min Timer ==============
const TIMER_DURATION_SEC = 45 * 60;
const TIMER_STORE_KEY = `queueTimer_${currentId}`;
let countdownT = null;
let pollingT = null;

let timerState = loadTimerState(); // { startedAt:number|null, paused:boolean, pauseLeftSec:number|null }

function loadTimerState() {
  try {
    return (
      JSON.parse(localStorage.getItem(TIMER_STORE_KEY)) || {
        startedAt: null,
        paused: false,
        pauseLeftSec: null,
      }
    );
  } catch {
    return { startedAt: null, paused: false, pauseLeftSec: null };
  }
}
function saveTimerState() {
  localStorage.setItem(TIMER_STORE_KEY, JSON.stringify(timerState));
}
function clearTimerState() {
  timerState = { startedAt: null, paused: false, pauseLeftSec: null };
  localStorage.removeItem(TIMER_STORE_KEY);
}
function hideTimer() {
  clearInterval(countdownT);
  countdownT = null;
  qs("#timerRow")?.classList.add("hidden");
}
function secondsLeft() {
  if (!timerState.startedAt) return null;
  if (timerState.paused && typeof timerState.pauseLeftSec === "number")
    return timerState.pauseLeftSec;
  const elapsed = Math.floor((Date.now() - timerState.startedAt) / 1000);
  return Math.max(0, TIMER_DURATION_SEC - elapsed);
}
function fmtMMSS(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60),
    s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function renderCountdown() {
  const left = secondsLeft();
  text(qs("#countdown"), left == null ? "45:00" : fmtMMSS(left));
}
function startCountdownIfNeeded() {
  if (!timerState.startedAt) {
    timerState.startedAt = Date.now();
    timerState.paused = false;
    timerState.pauseLeftSec = null;
    saveTimerState();
  }
  qs("#timerRow")?.classList.remove("hidden");
  clearInterval(countdownT);
  renderCountdown();
  countdownT = setInterval(() => {
    if (timerState.paused) {
      renderCountdown();
      return;
    }
    const left = secondsLeft();
    renderCountdown();
    if (left === 0) {
      clearInterval(countdownT);
      toast("⌛ 45 minutes are up — you may be removed from the queue");
      // optional auto-cancel:
      // cancelQueue().catch(()=>{});
    }
  }, 1000);
}

// ============== Venue/Announcements/Reviews ==============
async function loadVenue() {
  const v = await fetchJSON(
    `/api/owners/public/${encodeURIComponent(currentId)}`
  );
  if (!v) return;
  text(qs("#name"), v.name);
  text(qs("#rating"), v.rating ?? "—");
  const cover = qs("#cover");
  if (cover) cover.src = v.heroImage || "./images/restaurant.jpg";
  text(qs("#description"), v.description || "");
  text(qs("#features"), v.features || "");
  text(qs("#timing"), `${v.openTime || ""} - ${v.closeTime || ""}`);
  text(qs("#hours"), `${v.openTime || ""} — ${v.closeTime || ""}`);
  text(qs("#location"), v.location || v.city || "");
  text(qs("#price"), v.approxPrice || v.price || "—");
  text(qs("#cuisine"), v.cuisine || "—");
  const g = qs("#gallery");
  if (g && Array.isArray(v.gallery))
    g.innerHTML = v.gallery.map((src) => `<img src="${src}" alt="">`).join("");
}

async function loadAnnouncements() {
  const ann = await fetchJSON(
    `/api/announcements/venue/${encodeURIComponent(currentId)}`
  );
  if (Array.isArray(ann) && ann.length) {
    const a = ann[0];
    const banner = qs("#announcement"),
      icon = qs("#announcementIcon"),
      t = qs("#announcementText");
    if (banner && icon && t) {
      icon.textContent = a.type === "offer" ? "🎁" : "📢";
      t.textContent = a.text || a.message || "";
      banner.classList.remove("hidden");
    }
  }
}

// async function loadReviews() {
//   const avgEl = qs("#avgRating"),
//     totalEl = qs("#totalReviews"),
//     list = qs("#reviewsList");

//   try {
//     // fetch all reviews for this venue
//     const r = await fetchJSON(`/api/reviews/${encodeURIComponent(currentId)}`);

//     // if backend returned an array with reviews
//     if (Array.isArray(r) && r.length > 0) {
//       // compute average + total
//       const avg =
//         r.reduce((sum, x) => sum + (Number(x.rating) || 0), 0) / r.length;

//       if (avgEl) avgEl.textContent = avg.toFixed(1);
//       if (totalEl) totalEl.textContent = r.length;

//       // render all reviews with edit button for owner
//       if (list)
//         list.innerHTML = r
//           .map((x) => {
//             const myId = localStorage.getItem("customerId");
//             const isMine = String(x.userId) === String(myId);

//             return `
//             <div class="review">
//               <div class="row">
//                 <div class="star">⭐ ${
//                   x.rating?.toFixed ? x.rating.toFixed(1) : x.rating
//                 }</div>
//                 <div class="by">${x.name || "Anonymous"}</div>
//                 <div class="at">${
//                   x.createdAt ? new Date(x.createdAt).toLocaleString() : ""
//                 }</div>
//               </div>
//               <p>${(x.comments || "")
//                 .replace(/</g, "&lt;")
//                 .replace(/\n/g, "<br>")}</p>
//                 ${
//                   isMine
//                     ? `
//                       <div class="review-actions">
//                         <button class="btn small" data-edit="${x._id}" data-rate="${x.rating}" data-text="${x.comments || ""}">Edit</button>
//                         <button class="btn small danger" data-delete="${x._id}">Delete</button>
//                       </div>
//                     `
//                     : ""
//                 }
//             </div>`;
//           })
//           .join("");

//       // handle edit button clicks
//       list.addEventListener("click", async (e) => {
//         const btn = e.target;

//         // edit
//         if (btn.matches("[data-edit]")) {
//           editingReviewId = btn.dataset.edit;
//           const textEl = document.getElementById("revText");
//           const ratingEl = document.getElementById("revRating");
//           textEl.value = btn.dataset.text || "";
//           ratingEl.value = btn.dataset.rate || 5;
//           textEl.focus();
//           toast("Editing your review — update and press Post!");
//           return;
//         }

//         // delete
//         if (btn.matches("[data-delete]")) {
//           const id = btn.dataset.delete;
//           const confirmed = confirm("Delete this review?");
//           if (!confirmed) return;

//           try {
//             const res = await fetch(`/api/reviews/${id}`, {
//               method: "DELETE",
//               credentials: "include",
//             });
//             if (res.ok) {
//               toast("Review deleted!");
//               await loadReviews();
//             } else {
//               toast("Failed to delete review");
//             }
//           } catch (err) {
//             console.error(err);
//             toast("Error deleting review");
//           }
//         }
//       });

//       return; // stop here (skip local fallback)
//     }
//   } catch (err) {
//     console.error("Error loading reviews:", err);
//   }

//   // fallback to local storage if server fails
//   if (list) {
//     const arr = JSON.parse(
//       localStorage.getItem("reviews_" + currentId) || "[]"
//     );
//     list.innerHTML =
//       arr
//         .map((r) => {
//           const dt = new Date(r.at).toLocaleString();
//           return `<li><b>${r.user}</b> • ⭐ ${r.rating}<br>${r.text}<br><span class="muted">${dt}</span></li>`;
//         })
//         .join("") || "<p class='muted'>No reviews yet.</p>";
//   }
// }

// ============== Queue actions ==============
// async function joinQueue(people) {
//   const size = Math.max(1, Math.min(12, Number(people || 1)));
//   const venueId = currentId;

//   // const payload = { people: size, partySize: size, venueId };
//   const payload = {
//     venueId: "68eca3fe4bc49f3b1c2ee99e",
//     userId: "68eabb67f83cd1758cbaff78",
//     name: "Jeishu",
//     email: "jeishu@example.com",
//     phone: "+1-617-555-0199",
//     partySize: 3,
//     queueMode: "fifo",
//     joinedAt: new Date().toISOString(),
//     estimatedReadyAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
//     arrivalDeadline: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
//     timerPaused: false,
//     status: "active",
//     notes: "Client-side seeded test",
//   };

//   try {
//     // Try path-param route FIRST with the FULL payload
//     let r = await fetch(`/api/queue/${encodeURIComponent(venueId)}/join`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       credentials: "include",
//       body: JSON.stringify(payload),
//     });

//     // Fallback to the body route if path one isn't mounted
//     if (r.status === 404 || r.status === 405) {
//       r = await fetch(`/api/queue/join`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         credentials: "include",
//         body: JSON.stringify(payload),
//       });
//     }

//     if (r.status === 401) {
//       const ret = encodeURIComponent(location.pathname + location.search);
//       location.href = `ownerSignUp.html?role=customer&mode=login&returnTo=${ret}`;
//       return;
//     }

//     if (!r.ok) {
//       // Surface the exact server reason so you can fix the backend state quickly
//       let msg = "Failed to join queue";
//       try {
//         const err = await r.json();
//         if (err?.error) msg = `Failed to join queue: ${err.error}`;
//       } catch {
//         try {
//           msg = `Failed to join queue: ${await r.text()}`;
//         } catch {}
//       }
//       toast(msg);
//       return;
//     }

//     toast("✅ Joined queue");
//     toggleQueueButtons(true);
//     await refreshMetrics();
//   } catch (e) {
//     console.error("[joinQueue] network error:", e);
//     toast("Failed to join queue (network)");
//   }
// }

// === Replace your joinQueue with this ===
async function loadReviews() {
  const avgEl = qs("#avgRating"),
    totalEl = qs("#totalReviews"),
    list = qs("#reviewsList");

  // Figure out current user (prefer server; fallback to localStorage)
  let myId = localStorage.getItem("customerId") || "";
  try {
    const meResp = await fetch("/api/customers/me", { credentials: "include" });
    if (meResp.ok) {
      const me = await meResp.json();
      myId = getId(me.id || me._id || me.userId || me.customerId) || myId;
      if (myId) localStorage.setItem("customerId", myId);
    }
  } catch {
    /* non-fatal */
  }

  try {
    const r = await fetchJSON(`/api/reviews/${encodeURIComponent(currentId)}`);
    if (!Array.isArray(r)) throw new Error("Bad reviews payload");

    const total = r.length;
    const avg = total
      ? r.reduce((sum, x) => sum + (Number(x.rating) || 0), 0) / total
      : 0;

    if (avgEl) avgEl.textContent = total ? avg.toFixed(1) : "—";
    if (totalEl) totalEl.textContent = String(total);

    if (list) {
      if (total === 0) {
        list.innerHTML = "<p class='muted'>No reviews yet.</p>";
      } else {
        list.innerHTML = r
          .map((x) => {
            const authorId = getId(
              x.userId ||
                x.customerId ||
                x.authorId ||
                (x.user && (x.user.id || x.user._id)) ||
                (x.customer && (x.customer.id || x.customer._id))
            );
            const isMine = myId && authorId && authorId === myId;

            const reviewId = getId(x._id);
            const ratingVal = Number(x.rating) || 0;
            const created =
              x.createdAt || x.at || x.created || x.timestamp || null;

            return `
              <div class="review">
                <div class="row">
                  <div class="star">⭐ ${ratingVal.toFixed(1)}</div>
                  <div class="by">${escHtml(x.name || x.userName || "Anonymous")}</div>
                  <div class="at">${created ? new Date(created).toLocaleString() : ""}</div>
                </div>
                <p>${escHtml(x.comments || "").replace(/\n/g, "<br>")}</p>
                ${
                  isMine
                    ? `
                      <div class="review-actions">
                        <button class="btn small"
                                data-edit="${escAttr(reviewId)}"
                                data-rate="${escAttr(String(ratingVal))}"
                                data-text="${escAttr(x.comments || "")}">Edit</button>
                        <button class="btn small danger"
                                data-delete="${escAttr(reviewId)}">Delete</button>
                      </div>
                    `
                    : ""
                }
              </div>
            `;
          })
          .join("");
      }
    }

    // Attach one delegated click handler to the reviews container (once)
    if (list && !reviewsListBound) {
      reviewsListBound = true;
      list.addEventListener("click", async (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        // EDIT
        if (btn.dataset.edit) {
          editingReviewId = btn.dataset.edit;
          const textEl = document.getElementById("revText");
          const ratingEl = document.getElementById("revRating");
          if (textEl) textEl.value = btn.dataset.text || "";
          if (ratingEl) ratingEl.value = btn.dataset.rate || 5;
          toast("Editing your review — update and press Post!");
          return;
        }

        // DELETE
        if (btn.dataset.delete) {
          const id = btn.dataset.delete;
          const confirmed = confirm("Delete this review?");
          if (!confirmed) return;
          try {
            const res = await fetch(`/api/reviews/${encodeURIComponent(id)}`, {
              method: "DELETE",
              credentials: "include",
            });
            if (res.ok) {
              toast("Review deleted!");
              await loadReviews();
            } else {
              let msg = "Failed to delete review";
              try {
                const j = await res.json();
                if (j?.error) msg = `${msg}: ${j.error}`;
              } catch {}
              toast(msg);
            }
          } catch (err) {
            console.error(err);
            toast("Error deleting review");
          }
        }
      });
    }
  } catch (err) {
    console.error("Error loading reviews:", err);
    if (list) {
      list.innerHTML = "<p class='muted'>Could not load reviews.</p>";
    }
  }
}

// async function joinQueue(people) {
//   const size = Math.max(1, Math.min(12, Number(people || 1)));
//   const venueId = currentId;

//   if (!venueId) {
//     toast("Missing place ID");
//     return;
//   }

//   // pull the logged-in customer from backend
//   const meResp = await fetch("/api/customers/me", { credentials: "include" });
//   if (meResp.status === 401) {
//     const ret = encodeURIComponent(location.pathname + location.search);
//     location.href = `ownerSignUp.html?role=customer&mode=login&returnTo=${ret}`;
//     return;
//   }
//   if (!meResp.ok) {
//     toast("Could not load your profile");
//     return;
//   }
//   const me = await meResp.json();

//   // minimal payload: venue from page, user from session (customers collection)
//   const payload = {
//     venueId, // owner/venue ObjectId from the page (?id=)
//     userId: String(me.id), // customer _id
//     name: me.name || "Customer",
//     email: me.email || "",
//     partySize: size,
//     status: "active",
//   };

//   try {
//     // try path-param route first
//     let r = await fetch(`/api/queue/${encodeURIComponent(venueId)}/join`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       credentials: "include",
//       body: JSON.stringify(payload),
//     });

//     // fallback to body route if the above isn't mounted
//     if (r.status === 404 || r.status === 405) {
//       r = await fetch(`/api/queue/join`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         credentials: "include",
//         body: JSON.stringify(payload),
//       });
//     }

//     if (r.status === 401) {
//       const ret = encodeURIComponent(location.pathname + location.search);
//       location.href = `ownerSignUp.html?role=customer&mode=login&returnTo=${ret}`;
//       return;
//     }

//     if (!r.ok) {
//       let msg = "Failed to join queue";
//       try {
//         const err = await r.json();
//         if (err?.error) msg = `Failed to join queue: ${err.error}`;
//       } catch {}
//       toast(msg);
//       return;
//     }

//     toast("✅ Joined queue");
//     toggleQueueButtons(true);
//     await refreshMetrics();
//     startCountdownIfNeeded(); // optional: start local timer right away
//   } catch (e) {
//     console.error("[joinQueue] network error:", e);
//     toast("Failed to join queue (network)");
//   }
// }

async function joinQueue(people) {
  const size = Math.max(1, Math.min(12, Number(people || 1)));
  const venueId = currentId;

  if (!venueId) {
    toast("Missing place ID");
    return;
  }

  // Require a logged-in customer
  const meResp = await fetch("/api/customers/me", { credentials: "include" });
  if (meResp.status === 401) {
    const ret = encodeURIComponent(location.pathname + location.search);
    location.href = `ownerSignUp.html?role=customer&mode=login&returnTo=${ret}`;
    return;
  }
  if (!meResp.ok) {
    toast("Could not load your profile");
    return;
  }
  const me = await meResp.json();

  // Robust userId normalization (handles ObjectId objects/strings)
  const userId = getId(me.id) || getId(me._id) || "";

  const payload = {
    venueId,
    userId,
    name: me.name || "Customer",
    email: me.email || "",
    partySize: size,
    status: "active",
  };

  try {
    // Try path-param route first
    let r = await fetch(`/api/queue/${encodeURIComponent(venueId)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    // Fallback to body route
    if (r.status === 404 || r.status === 405) {
      r = await fetch(`/api/queue/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
    }

    if (r.status === 401) {
      const ret = encodeURIComponent(location.pathname + location.search);
      location.href = `ownerSignUp.html?role=customer&mode=login&returnTo=${ret}`;
      return;
    }

    if (!r.ok) {
      let msg = "Failed to join queue";
      try {
        const err = await r.json();
        if (err?.error) msg = `Failed to join queue: ${err.error}`;
      } catch {}
      toast(msg);
      return;
    }

    toast("✅ Joined queue");
    toggleQueueButtons(true);
    await refreshMetrics();
    startCountdownIfNeeded();
  } catch (e) {
    console.error("[joinQueue] network error:", e);
    toast("Failed to join queue (network)");
  }
}

// async function cancelQueue() {
//   try {
//     let r = await fetch(`/api/queue/${encodeURIComponent(currentId)}/cancel`, {
//       method: "POST",
//       credentials: "include",
//     });
//     if (r.status === 404) {
//       r = await fetch(`/api/queue/cancel`, {
//         method: "POST",
//         credentials: "include",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ venueId: currentId }),
//       });
//     }
//     if (!r.ok) {
//       toast("Failed to cancel");
//       return;
//     }
//     toast("❌ You left the queue");
//     clearTimerState();
//     hideTimer();
//     toggleQueueButtons(false);
//     await refreshMetrics();
//   } catch (e) {
//     toast("Failed to cancel");
//   }
// }
async function cancelQueue() {
  try {
    let r = await fetch(`/api/queue/${encodeURIComponent(currentId)}/cancel`, {
      method: "POST",
      credentials: "include",
    });
    if (r.status === 404) {
      r = await fetch(`/api/queue/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: currentId }),
      });
    }
    if (!r.ok) {
      toast("Failed to cancel");
      return;
    }
    let msg = "❌ You left the queue";
    try {
      const j = await r.json();
      if (j?.already) msg = "ℹ️ You were not in this queue";
    } catch {}
    toast(msg);
    clearTimerState();
    hideTimer();
    toggleQueueButtons(false);
    await refreshMetrics();
  } catch (e) {
    toast("Failed to cancel");
  }
}

async function arrived() {
  try {
    let r = await fetch(`/api/queue/${encodeURIComponent(currentId)}/arrived`, {
      method: "POST",
      credentials: "include",
    });
    if (r.status === 404) {
      r = await fetch(`/api/queue/arrived`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: currentId }),
      });
    }
    // Pause locally regardless
    timerState.paused = true;
    timerState.pauseLeftSec = secondsLeft() ?? TIMER_DURATION_SEC;
    saveTimerState();
    renderCountdown();
    toast("⏸️ Timer paused — we’ll wait here until the owner lets you in");
  } catch (e) {
    timerState.paused = true;
    timerState.pauseLeftSec = secondsLeft() ?? TIMER_DURATION_SEC;
    saveTimerState();
    renderCountdown();
    toast("⏸️ Timer paused (offline)");
  }
}

// ============== Live metrics ==============
function stopPolling() {
  if (pollingT) {
    clearInterval(pollingT);
    pollingT = null;
  }
}

// async function refreshMetrics() {
//   const m = await fetchJSON(
//     `/api/queue/metrics/${encodeURIComponent(currentId)}`
//   );
//   if (!m) {
//     console.warn("[metrics] no response; keeping initial disabled state");
//     return;
//   } // keep UI as-is on failure

//   text(qs("#queueBadge"), `${m.count} in queue`);
//   text(qs("#count"), m.count);
//   text(qs("#wait"), m.approxWaitMins ? `${m.approxWaitMins}m` : "—");
//   text(qs("#pos"), m.position ?? "—");
//   //text(qs("#status"), m.walkinsEnabled ? "true" : "false");

//   // Status label: base it only on walk-ins being enabled (and optional capacity)
//   const seatsLeft = m.capacity && (m.capacity.spotsLeft ?? null);
//   const seatsEl = qs("#seatsLeft");
//   if (seatsEl) text(seatsEl, seatsLeft ?? "—");

//   const peopleInp = qs("#people");
//   const people = Number(peopleInp?.value || 2);

//   // capacityOK: either unlimited (null/undefined) or enough seats for this party
//   const capacityOK =
//     seatsLeft == null || (typeof seatsLeft === "number" && people <= seatsLeft);

//   // venueAccepting is now ONLY: walk-ins enabled + capacity ok
//   const venueAccepting = !m.walkinsEnabled && capacityOK;

//   // Set the visible status text accordingly
//   text(qs("#status"), venueAccepting ? "Open" : "Closed");
//   const inQueue = Number.isFinite(m.position);
//   toggleQueueButtons(inQueue);

//   if (inQueue) {
//     setEnterBtnState({
//       label: "Enter queue",
//       disabled: false,
//       showPeople: false,
//     });
//   } else {
//     if (venueAccepting)
//       setEnterBtnState({
//         label: "Enter queue",
//         disabled: false,
//         showPeople: true,
//       });
//     else
//       setEnterBtnState({
//         label: "Queue Unavailable",
//         disabled: true,
//         showPeople: false,
//       });
//   }

//   // Timer rules
//   if (!inQueue) {
//     hideTimer();
//     clearTimerState();
//   } else {
//     if (m.position <= 5) startCountdownIfNeeded();
//     else {
//       if (timerState.startedAt) startCountdownIfNeeded();
//       else hideTimer();
//     }
//   }
// }

// ============== Bind UI & Init ==============
async function refreshMetrics() {
  const m = await fetchJSON(
    `/api/queue/metrics/${encodeURIComponent(currentId)}`
  );
  if (!m) {
    console.warn("[metrics] no response; keeping initial disabled state");
    return;
  }

  // Basic numbers
  text(qs("#queueBadge"), `${m.count} in queue`);
  text(qs("#count"), m.count);
  text(qs("#wait"), m.approxWaitMins ? `${m.approxWaitMins}m` : "—");
  text(qs("#pos"), m.position ?? "—");

  // Capacity display
  const seatsLeft = m.capacity && (m.capacity.spotsLeft ?? null);
  const seatsEl = qs("#seatsLeft");
  if (seatsEl) text(seatsEl, seatsLeft ?? "—");

  // Party size from the UI (for simple capacity check)
  const peopleInp = qs("#people");
  const people = Number(peopleInp?.value || 2);

  // capacityOK: unlimited (null/undefined) OR enough seats for this party
  const capacityOK =
    seatsLeft == null || (typeof seatsLeft === "number" && people <= seatsLeft);

  // ✅ Correct logic: "Open" only if walk-ins are enabled AND capacity is OK
  const venueAccepting = !!m.walkinsEnabled && capacityOK;

  // Status + buttons
  text(qs("#status"), venueAccepting ? "Open" : "Closed");

  const inQueue = Number.isFinite(m.position);
  toggleQueueButtons(inQueue);

  if (inQueue) {
    setEnterBtnState({
      label: "Enter queue",
      disabled: false,
      showPeople: false,
    });
  } else {
    if (venueAccepting) {
      setEnterBtnState({
        label: "Enter queue",
        disabled: false,
        showPeople: true,
      });
    } else {
      setEnterBtnState({ // a small suggestion here would be to make the queue unavailable button have a different color and change the cursor type when it's disabled
        label: "Queue Unavailable",
        disabled: true,
        showPeople: false,
      });
    }
  }

  // Timer rules
  if (!inQueue) {
    hideTimer();
    clearTimerState();
  } else {
    if (m.position <= 5) startCountdownIfNeeded();
    else {
      if (timerState.startedAt) startCountdownIfNeeded();
      else hideTimer();
    }
  }
} // also make sure to remove chunks of commented out code!

// function bindUI() {
//   qs("#enterBtn")?.addEventListener("click", () => {
//     const el = qs("#people");
//     let n = 2;
//     if (el) n = Math.max(1, Math.min(12, Number(el.value || 2)));
//     else {
//       const inp = prompt("How many people in your party?", "2");
//       if (inp === null) return;
//       const k = Math.max(1, Math.min(12, Number(inp)));
//       if (!Number.isFinite(k)) return;
//       n = k;
//     }
//     joinQueue(n);
//   });

//   const form = document.getElementById("reviewForm");
//   form?.addEventListener("submit", async (e) => {
//     e.preventDefault();
//     const allowed = await fetchJSON("/api/history"); // lightweight check
//     // keep your existing local posting if server not ready
//     const textEl = qs("#revText"),
//       ratingEl = qs("#revRating");
//     if (!textEl || !ratingEl) return;
//     const textV = (textEl.value || "").trim();
//     const ratingV = Number(ratingEl.value || 5);
//     if (!textV) {
//       toast("Write something first");
//       return;
//     }
//     try {
//       // if editing mode is active → PUT request
//       if (editingReviewId) {
//         const r = await fetch(`/api/reviews/${editingReviewId}`, {
//           method: "PUT",
//           credentials: "include",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({ rating: ratingV, comments: textV }),
//         });

//         if (r.ok) {
//           toast("Review updated!");
//           editingReviewId = null; // reset edit mode
//           textEl.value = "";
//           await loadReviews();
//           return;
//         }
//       }

//       // otherwise normal POST (new review)
//       const r = await fetch(`/api/reviews/${currentId}`, {
//         method: "POST",
//         credentials: "include",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           venueId: currentId,
//           rating: ratingV,
//           comments: textV,
//         }),
//       });

//       if (r.ok) {
//         textEl.value = "";
//         toast("Review posted!");
//         await loadReviews();
//         return;
//       }
//     } catch (err) {
//       console.error(err);
//     }
//   });
// }

// function bindUI() {
//   qs("#enterBtn")?.addEventListener("click", () => {
//     const el = qs("#people");
//     let n = 2;
//     if (el) n = Math.max(1, Math.min(12, Number(el.value || 2)));
//     else {
//       const inp = prompt("How many people in your party?", "2");
//       if (inp === null) return;
//       const k = Math.max(1, Math.min(12, Number(inp)));
//       if (!Number.isFinite(k)) return;
//       n = k;
//     }
//     joinQueue(n);
//   });

//   // 🔧 Missing before: wire up Cancel
//   const cancelBtn = qs("#cancelBtn");
//   cancelBtn?.addEventListener("click", async () => {
//     cancelBtn.disabled = true;
//     try {
//       await cancelQueue();
//     } finally {
//       cancelBtn.disabled = false;
//     }
//   });

//   // (optional) "I'm here" button
//   qs("#arrivedBtn")?.addEventListener("click", arrived);

//   const form = document.getElementById("reviewForm");
//   form?.addEventListener("submit", async (e) => {
//     e.preventDefault();
//     // ... (unchanged)
//   });
// }
function bindUI() {
  // Make sure non-form buttons don't accidentally submit the review form
  ["#enterBtn", "#cancelBtn", "#arrivedBtn"].forEach((sel) => {
    const b = qs(sel);
    if (b && (!b.getAttribute("type") || b.getAttribute("type") !== "button")) {
      b.setAttribute("type", "button");
    }
  });

  // ENTER
  qs("#enterBtn")?.addEventListener("click", () => {
    const el = qs("#people");
    let n = 2;
    if (el) n = Math.max(1, Math.min(12, Number(el.value || 2)));
    else {
      const inp = prompt("How many people in your party?", "2");
      if (inp === null) return;
      const k = Math.max(1, Math.min(12, Number(inp)));
      if (!Number.isFinite(k)) return;
      n = k;
    }
    joinQueue(n);
  });

  // CANCEL
  const cancelBtn = qs("#cancelBtn");
  cancelBtn?.addEventListener("click", async () => {
    cancelBtn.disabled = true;
    try {
      await cancelQueue();
    } finally {
      cancelBtn.disabled = false;
    }
  });

  // ARRIVED
  qs("#arrivedBtn")?.addEventListener("click", arrived);

  // POST / UPDATE REVIEW
  const form = document.getElementById("reviewForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const textEl = qs("#revText");
    const ratingEl = qs("#revRating");
    if (!textEl || !ratingEl) return;

    const textV = (textEl.value || "").trim();
    const ratingV = Number(ratingEl.value || 5);
    if (!textV) {
      toast("Write something first");
      return;
    }

    try {
      let r;
      if (editingReviewId) {
        // Edit existing review
        r = await fetch(`/api/reviews/${encodeURIComponent(editingReviewId)}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: ratingV, comments: textV }),
        });

        if (r.ok) {
          toast("Review updated!");
          editingReviewId = null;
          textEl.value = "";
          await loadReviews();
          return;
        }
      } else {
        // Create new review
        // I'd also suggest to have a bigger text box for reviews, and to have the text box expand for larger reviews 
        r = await fetch(`/api/reviews/${encodeURIComponent(currentId)}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            venueId: currentId,
            rating: ratingV,
            comments: textV,
          }),
        });

        if (r.ok) {
          textEl.value = "";
          toast("Review posted!");
          await loadReviews();
          return;
        }
      }

      // Handle non-OK responses
      if (r && r.status === 401) {
        const ret = encodeURIComponent(location.pathname + location.search);
        location.href = `ownerSignUp.html?role=customer&mode=login&returnTo=${ret}`;
        return;
      }
      let msg = "Failed to save review";
      try {
        const j = await r.json();
        if (j?.error) msg += `: ${j.error}`;
      } catch {}
      toast(msg);
    } catch (err) {
      console.error("Review submit error:", err);
      toast("Error posting review");
    }
  });
}

(async function init() {
  if (!currentId) {
    document.body.innerHTML =
      "<p style='padding:20px'>Place not specified.</p>";
    return;
  }

  // conservative default to avoid flashing
  setEnterBtnState({
    label: "Queue Unavailable",
    disabled: true,
    showPeople: false,
  });

  await loadVenue();
  await loadAnnouncements();
  await loadReviews();
  await refreshMetrics();

  // start polling
  pollingT = setInterval(refreshMetrics, 7000);

  // restore timer if previously started
  if (timerState.startedAt) startCountdownIfNeeded();

  bindUI();
})();
