import express from "express";
import cors from "cors";
import { Firestore } from "@google-cloud/firestore";
import { ulid } from "ulid";

const app = express();
app.use(express.json());
app.use(cors({ origin: true })); // OK for backend calls; pin origin if you ever allow frontend

// ---- Public endpoints (no auth) ----
app.get("/healthz", (_req, res) => res.status(200).send("ok"));
app.get("/", (_req, res) =>
  res.type("text").send("PYA Members API is running. Use POST /members.")
);

// ---- Auth (Gateway OIDC or legacy X-API-Key) ----
// Keep this if Cloud Run is private and called via API Gateway.
const REQUIRED_API_KEY = process.env.API_KEY;
app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/healthz") return next();
  const hasOidc = (req.header("authorization") || "").startsWith("Bearer ");
  const keyOk = REQUIRED_API_KEY && (req.header("x-api-key") || "") === REQUIRED_API_KEY;
  if (!hasOidc && !keyOk) return res.status(401).json({ error: "Unauthorized" });
  next();
});

// ---- Firestore ----
const db = new Firestore({ databaseId: process.env.FIRESTORE_DB || "memberdb" });

// Optional: canonicalize gmail so duplicates like a.b+c@gmail.com collapse
function canonicalEmail(email) {
  let [local, domain] = String(email || "").trim().toLowerCase().split("@");
  if (!local || !domain) return "";
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") {
    local = local.split("+")[0].replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

// ---- Members ----
/**
 * POST /members
 * body: { firstName?, lastName?, email (required), tier?, address? }
 * returns: { memberId, status }
 *
 * Behavior:
 * - If a member with this email already exists, return it.
 * - If address provided later for a pending member, update and mark active.
 * - If creating without address, set status="pending-address".
 */
app.post("/members", async (req, res) => {
  try {
    const {
      firstName: fnRaw,
      lastName: lnRaw,
      email,
      tier = "Member",
      address
    } = req.body || {};

    if (!email) return res.status(400).json({ error: "Email required" });

    const firstName = (fnRaw ?? "Member").toString();
    const lastName  = (lnRaw ?? "").toString();

    // Build address object only if something meaningful was provided
    let addressObj: any = null;
    if (address) {
      if (typeof address === "string") {
        const v = address.trim();
        if (v) addressObj = { formatted: v };
      } else if (address.formatted || address.streetAddress) {
        addressObj = address;
      }
    }

    const emailKey = String(email).trim().toLowerCase();
    const emailCanonical = canonicalEmail(email);

    // Look up existing member by emailKey (keeps compatibility with existing docs)
    const existingSnap = await db
      .collection("members")
      .where("emailKey", "==", emailKey)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const docRef = existingSnap.docs[0].ref;
      const data = existingSnap.docs[0].data();

      // If they were pending and we now have an address, upgrade & save
      if (!data.address && addressObj) {
        await docRef.update({
          address: addressObj,
          addressText: addressObj.formatted || addressObj.streetAddress || null,
          status: "active",
          updatedAt: new Date()
        });
        return res.json({ memberId: existingSnap.docs[0].id, status: "active" });
      }

      // Otherwise just return the existing status
      return res.json({
        memberId: existingSnap.docs[0].id,
        status: data.status || "active"
      });
    }

    // Create new member (address optional)
    const memberId = ulid();
    const now = new Date();

    await db.collection("members").doc(memberId).set({
      memberId,
      firstName,
      lastName,
      email,
      emailKey,
      emailCanonical, // useful for future dedupe/analytics
      tier,
      address: addressObj,
      addressText: addressObj ? (addressObj.formatted || addressObj.streetAddress || null) : null,
      status: addressObj ? "active" : "pending-address",
      createdAt: now,
      updatedAt: now
    });

    return res.json({
      memberId,
      status: addressObj ? "active" : "pending-address"
    });
  } catch (err) {
    console.error("members error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`✅ Members API on :${port}`));
