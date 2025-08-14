import wixData from 'wix-data';

const COLL = 'contact043';
const EMAIL_FIELD_KEY = 'email2'; // <-- keep this matching your field key

export async function isEmailUnique(email) {
  const raw = (email || '').trim();
  if (!raw) return false;

  const lower = raw.toLowerCase();

  // Try exact (legacy rows that kept original casing) OR lower (new rows we’ll store lowercase)
  const qExact = wixData.query(COLL).eq(EMAIL_FIELD_KEY, raw);
  const qLower = wixData.query(COLL).eq(EMAIL_FIELD_KEY, lower);

  const res = await qExact.or(qLower).limit(1).find({ suppressAuth: true });
  return res.totalCount === 0;
}
