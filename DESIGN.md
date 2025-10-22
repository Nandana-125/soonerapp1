# Sooner — Design Document

## 1) Project Description

Sooner is a web application that replaces physical walk‑in lines with a **virtual queue**. Customers browse venues (restaurants, salons, clinics, events), view **live queue metrics**, and join the queue remotely. Venue owners manage the queue, announcements, capacity, and service actions. The app reduces wait time, improves comfort, and increases venue throughput and satisfaction.

---

## 2) User Personas

### Persona A — Riya (Customer, 25)
- Lives in a busy city; hates waiting outside restaurants in winter.
- Wants to see **how long the wait is** and **join from home**.
- Needs simple UI on mobile; wants a clear timer when near turn.

### Persona B — Sam (Salon Owner, 38)
- Handles a steady stream of walk‑ins; calling no‑shows wastes time.
- Wants to **cap queue size**, **pause walk‑ins**, post **announcements/offers**.
- Needs to mark customers **served** and keep the line fair.

### Persona C — Dr. Lee (Clinic Admin, 44)
- Manages ad‑hoc consultations; seating is limited.
- Needs **capacity checks** and **priority** visibility.
- Requires **up‑to‑date status** for patients.

---

## 3) User Stories

- **As Riya**, I want to search and filter venues so I can quickly find a place that matches my taste and location.
- **As Riya**, I want to see **how many are in queue**, **approximate wait**, and **my position** at a glance.
- **As Riya**, when I’m within the next 5 parties, I want a **45‑minute timer** so I can show up before I lose my spot.
- **As Riya**, I want to cancel my spot easily if my plan changes.
- **As Riya**, after being served, I want to **rate and review** the venue.
- **As Sam**, I want to enable/disable walk‑ins and open/close the venue so the app allows joining only at the right times.
- **As Sam**, I want queue **capacity** to respect seating.
- **As Sam**, I want to post **announcements** and offers to boost traffic.
- **As Dr. Lee**, I want to see **who is arrived vs. remote** and keep timing fair.

---

## 4) Information Architecture & Data Model

### Collections
- **owners**: public profile (displayName, cuisine, location, approxPrice, avatar, gallery, features, rating)
- **owner_settings**: per venue operational flags (openStatus, walkinsEnabled, queueActive, totalSeats, avgWaitMins, maxBooking)
- **queue**: entries (venueId, customerId, name, email, partySize, status, joinedAt, [bridges: people, order, position])
- **customers**: account info (name, email, passwordHash, ...)
- **announcements**: venue messages (type, message/text, createdAt)
- **reviews**: ratings + comments (venueId, customerId, rating, comment, createdAt)
- **likes**: favorites (customerId, venueId)
- **activitylog**: events history (joined, cancelled, arrived, served)

### Key Relationships
- One owner ↔ one owner_settings (unique index on venueId).
- One customer ↔ many queue entries; at most one **active** at a time.
- One venue ↔ many reviews, likes, announcements.

---

## 5) Core Flows

### Browse & Search
1. Client calls `GET /api/owners/public?type=restaurant&city=Boston&...`.
2. Server returns projected list (small payload).

### Place Page (Live)
1. `GET /api/owners/public/:id` (sliced gallery).
2. Poll `GET /api/queue/metrics/:id` every 7s → badges, wait, position, seats left.
3. `GET /api/announcements/venue/:id` for banners.
4. `GET /api/reviews/venue/:id` for ratings and reviews.

### Join Queue
1. `POST /api/queue/:id/join` with `partySize`.
2. Validate: open + walk‑ins + active, capacity, max party size, duplicates.
3. Insert `status:"active"`, compute position by `joinedAt`, return `{ order, position, approxWaitMins }`.

### Near‑Turn Timer
- Start at **position ≤ 5**; store state in `localStorage` (per venue); pause on “I’m here”.

### Cancel
- `POST /api/queue/:id/cancel` → set `status:"cancelled"`, log activity; UI restores enter controls.

### Serve + Reviews
- Owner marks served → customer eligible to review via `POST /api/reviews/add`.

---

## 6) Wireframes 
![WhatsApp Image 2025-10-15 at 00 15 39 (2)](https://github.com/user-attachments/assets/8efdc62d-f43a-4e39-b4f8-938b7ab465eb)

![WhatsApp Image 2025-10-15 at 00 15 39 (1)](https://github.com/user-attachments/assets/cceadc70-8927-47fd-a2fa-9590c3ef5328)

![WhatsApp Image 2025-10-15 at 00 15 39](https://github.com/user-attachments/assets/0cbc6cd0-24bb-409c-8cff-2cdbd0e56ac7)

**Browse**
```
[Search bar] [Type] [City] [Cuisine] [Apply]
[Card][Card][Card]...
```

**Place**
```
Cover   Name  City • $$    [♡]
Chips: Cuisine • N in queue
Announcement (optional)
Live Queue: Count • ETA • Your Position
[Enter queue / Cancel] [People]
Timer (shows when ≤ 5): 45:00  [I'm here] [Owner let me in]
Reviews...
Info...
```

**User Dashboard**
```
Active Queue: <venue> — #pos — ETA — [Cancel]
Venues for Today: favorites + recents
```

---

## 7) Non‑Functional

- Performance: projections, indexes on hot paths.
- Security: sessions, no secrets in repo, input validation.
- Maintainability: modular server files; page‑scoped JS/CSS; lint/format.
- Deployability: ENV‑driven, static serving for public assets.

---

## 8) Open Items / Future Work

- Push/SMS notifications at state changes.
- Owner analytics, CSV exports.
- SSE/WebSocket for instant updates (replace polling).
- A11y and i18n.
