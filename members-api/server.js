import express from "express";
import cors from "cors";
import { Firestore } from "@google-cloud/firestore";
import { ulid } from "ulid";

const app = express();
app.use(express.json());
// If you will call from Wix FRONTEND via the Gateway, set your site origin explicitly.
// If you call from Wix BACKEND (recommended), CORS doesn't matter here.
app.use(cors({ origin: true }));

// ---- Public endpoints (no auth) ----
app.get("/healthz", (_req, res) => res.status(200).send("ok"));
app.get("/", (_req, res) =>
  res.type("text").send("PYA Members API is running. Use POST /members.")
);

// ---- Optional: if you still want to accept either Gateway OIDC or a legacy X-API-Key ----
// Comment OUT this whole block if you rely solely on IAM via API Gateway.
const REQUIRED_API_KEY = process.env.API_KEY;
app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/healthz") return next();

  // API Gateway -> Cloud Run (private) will include Authorization: Bearer <ID token>
  const hasOidc = (req.header("authorization") || "").startsWith("Bearer ");
  const keyOk = REQUIRED_API_KEY && (req.header("x-api-key") || "") === REQUIRED_API_KEY;

  if (!hasOidc && !keyOk) return res.status(401).json({ error: "Unauthorized" });
  next();
});

// Firestore client (uses Cloud Run SA)
const db = new Firestore({ databaseId: process.env.FIRESTORE_DB || "memberdb" });

/**
 * POST /members
 * body: { firstName, lastName, email, tier? }
 * returns: { memberId, status }
 */
app.post("/members", async (req, res) => {
  try {
    const { firstName, lastName, email, tier = "Member" } = req.body || {};
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const emailKey = String(email).trim().toLowerCase();

    // Idempotency: dedupe by normalized email
    const existing = await db.collection("members").where("emailKey", "==", emailKey).limit(1).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      return res.json({ memberId: doc.id, status: doc.get("status") || "active" });
    }

    const memberId = ulid();
    const now = new Date();
    await db.collection("members").doc(memberId).set({
      memberId,
      firstName,
      lastName,
      email,
      emailKey,
      tier,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return res.json({ memberId, status: "active" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal error" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`✅ Members API on :${port}`));
