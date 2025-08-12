import express from "express";
import cors from "cors";
import { Firestore } from "@google-cloud/firestore";
import { ulid } from "ulid";

const app = express();
app.use(express.json());
app.use(cors({ origin: true })); // if you know your Wix domain, set it explicitly

// public endpoints (no auth)
app.get("/healthz", (_req, res) => res.status(200).send("ok"));
app.get("/", (_req, res) =>
  res.type("text").send("PYA Members API is running. Use POST /members with X-API-Key.")
);

// API key gate for everything else
const REQUIRED_API_KEY = process.env.API_KEY;
app.use((req, res, next) => {
  if (req.path === "/healthz" || req.path === "/") return next();
  if ((req.header("x-api-key") || "") !== REQUIRED_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

const db = new Firestore(); // uses Cloud Run SA credentials

app.get("/healthz", (_, res) => res.send("ok"));

/**
 * POST /members
 * body: { firstName, lastName, email, tier }
 * returns: { memberId, status }
 */
app.post("/members", async (req, res) => {
  const { firstName, lastName, email, tier = "Member" } = req.body || {};
  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const emailKey = email.trim().toLowerCase();
  // Try to find existing by email (simple 1:1 constraint)
  const existing = await db.collection("members")
    .where("emailKey", "==", emailKey).limit(1).get();

  if (!existing.empty) {
    const doc = existing.docs[0]; // already exists -> return its memberId
    return res.json({ memberId: doc.id, status: doc.get("status") || "active" });
  }

  const memberId = ulid();
  await db.collection("members").doc(memberId).set({
    memberId,
    firstName, lastName, email,
    emailKey,
    tier,
    status: "active",
    createdAt: new Date(), updatedAt: new Date()
  });

  // TODO later: publish to Pub/Sub "member.created" for PassKit issuance
  return res.json({ memberId, status: "active" });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Members API on :${port}`));
