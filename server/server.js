// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt"; // keep if used elsewhere
import session from "express-session";
import MongoStore from "connect-mongo";
import compression from "compression"; // 🆕 add compression
import { connectToDb, getDb, getClient } from "./db.js";
import path from "path";
import { fileURLToPath } from "url";
import "./queueWorker.js";

// ---- Route modules
import api from "./api.routes.js";
import ownerApi from "./api.owner.js";
import ownerSSE from "./api.owner.sse.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hard-coded CORS origin can be environment variable
// ---- CORS
app.use(cors({ origin: "http://localhost:5173", credentials: true }));

// ---- Compression (must come before routes)
app.use(compression()); // 🆕 enable gzip/brotli

// ---- JSON body (allow base64 images)
app.use(express.json({ limit: "50mb" }));

// If you might run behind a proxy later (e.g., Render, Fly):
app.set("trust proxy", 1);

// ---- Boot (connect DB FIRST so we can reuse the same client in session store)
connectToDb()
  .then(async () => {
    const db = getDb();

    // helpful indices (some dupes are fine if they already exist)
    db.collection("owners")
      .createIndex({ email: 1 }, { unique: true })
      .catch(() => {});

    // primary queue collection (index by venueId/restaurantId + position)
    db.collection("queue")
      .createIndex({ venueId: 1, position: 1 })
      .catch(() => {});
    db.collection("queue")
      .createIndex({ restaurantId: 1, position: 1 })
      .catch(() => {});

    // TTL for pending deletes
    db.collection("queue_pending")
      .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 })
      .catch(() => {});

    db.collection("announcements")
      .createIndex({ ownerId: 1, createdAt: -1 })
      .catch(() => {});
    db.collection("announcements")
      .createIndex({ ownerIdObj: 1, createdAt: -1 })
      .catch(() => {});

    db.collection("owner_settings")
      .createIndex({ ownerId: 1 }, { unique: true })
      .catch(() => {});
    db.collection("settings")
      .createIndex({ ownerId: 1 }, { unique: true })
      .catch(() => {});
    db.collection("queue")
      .createIndex({ venueId: 1, status: 1, customerId: 1 })
      .catch(() => {});
    db.collection("queue")
      .createIndex({ venueId: 1, status: 1, userId: 1 })
      .catch(() => {});

    // ---- Sessions (Mongo-backed)
    const client = await getClient();

    const sessionStore = MongoStore.create({
      client,
      dbName: process.env.DB_NAME,
      collectionName: "sessions",
      ttl: 60 * 60 * 8, // 8 hours
    });

    if (sessionStore.on) {
      sessionStore.on("connected", () => console.log("Session store ready ✅"));
      sessionStore.on("error", (err) =>
        console.error("Session store error ❌", err)
      );
    }
    console.log("Session store instance created:", !!sessionStore);

    app.use(
      session({
        name: "sooner.sid",
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: sessionStore,
        cookie: {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 1000 * 60 * 60 * 8,
        },
      })
    );

    console.log("Session store wired into express-session ✅");

    // ---- Modular API Routes
    app.use("/api", api);
    app.use("/api", ownerApi);
    app.use("/api", ownerSSE);

    // ---- Static (serves /public)
    app.use(express.static(path.join(__dirname, "..", "public")));

    // ---- Health
    app.get("/api/health", (_req, res) => {
      res.json({ ok: true, time: new Date().toISOString() });
    });

    // ---- Session diagnostics (optional)
    app.get("/api/debug/session", (req, res) => {
      res.json({
        id: req.sessionID,
        ownerId: req.session?.ownerId || null,
        keys: Object.keys(req.session || {}),
        cookie: req.session?.cookie || null,
      });
    });

    // ---- Listen
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error("DB connection failed:", e);
    process.exit(1);
  });
