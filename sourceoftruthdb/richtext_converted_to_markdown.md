PYA Members — Kaggle Cleanup README
===================================

Why we did this
---------------

Email isn’t a reliable _person identifier_ (parents share emails; typos happen). Our goal was to build a **clean, person-centric “source of truth” CSV** from the Wix contact043 export while keeping every legitimate member — even when they share the same email.

This notebook:

*   normalizes and inspects the data,
    
*   fixes address fields,
    
*   finds duplicate emails,
    
*   separates **distinct people** who share an email,
    
*   collapses **true duplicates** of the same person,
    
*   and outputs a clean source\_of\_truth.csv ready for GCP.
    

What went in
------------

**Input:** a single CSV exported from Wix (Live) containing at least these columns:

*   First Name, Last Name, Birthday, E-mail, Phone Number
    
*   Select an Address, Adres korespondencyjny
    
*   (meta) Created Date, Updated Date (used for tie-breaks when needed)
    

We worked entirely in Kaggle. No PII left Kaggle; interim results stayed in memory unless explicitly saved to /kaggle/working.

What we did (step by step)
--------------------------

### 1) Load & trim

*   Loaded the CSV from /kaggle/input/....
    
*   Kept only the columns we care about:First Name, Last Name, Birthday, E-mail, Phone Number,Select an Address, Adres korespondencyjny.
    

### 2) Address sync (text-only)

*   If **Select an Address** was empty **and** **Adres korespondencyjny** had a value, we **copied** it over.
    
*   This preserved the most complete address text in a single column for export.
    
*   Before export, we **dropped** Adres korespondencyjny to avoid duplication.
    

### 3) Quick sanity counts

*   Printed totals before/after the address sync to confirm how many rows gained a filled Select an Address.
    

### 4) Email duplicate analysis

*   Counted duplicate emails under three lenses (no changes yet; just visibility):
    
    *   **Exact (case-sensitive)**: raw string matches.
        
    *   **Case-insensitive**: lowercased.
        
    *   **Gmail-canonical (optional)**: lowercased + strip +tags + remove dots for gmail/googlemail.
        
*   Purpose: understand how many dupes are real vs. casing/noise.
    

### 5) Duplicate emails → are these _the same person_?

*   For **emails appearing >1 time**, we compared **birthdays** inside each email group to see if entries were:
    
    *   **same\_birthday** → likely the same person (true dupes),
        
    *   **conflict\_birthdays** → likely **different people** sharing the email,
        
    *   **no\_birthday\_data** → needs other signals.
        

### 6) Person identity modeling (lightweight but effective)

*   We normalized names (lowercased + removed Polish diacritics, e.g., _Michał_ → _michal_).
    
*   Built a **person key**:
    
    1.  last\_norm | first\_norm | DOB → **strong**
        
    2.  else last\_norm | first\_norm | phone\_digits(>=7) → **strong**
        
    3.  else last\_norm | first\_norm → **weak** (review-prone)
        
*   Marked \_has\_strong\_key when DOB or a long phone is present — better confidence it’s a distinct person.
    

### 7) Cull policy (keep people, drop duplicates of the same person)

*   **Shared email is allowed.** We **keep multiple people** under the same email if they differ by DOB (or other strong key).
    
*   **Within the same email + name**, if multiple DOBs exist, we **keep only the newest DOB** and **discard older DOB rows** (assume older is a typo/obsolete).
    
*   We then **collapsed one row per person\_key** (the “golden record” rule: most complete row wins; ties are stable).
    
*   Result is **members\_clean** in memory: one row per **distinct person**, even if many share an email.
    

### 8) Export (final)

*   Removed helper columns (anything starting with \_).
    
*   Dropped Adres korespondencyjny (already synced into Select an Address).
    
*   /kaggle/working/source\_of\_truth.csv
    

Design choices & rationale
--------------------------

*   **Email ≠ identity**: Families/parents share emails. We model people as unique by **(name, DOB)** when possible.
    
*   **DOB wins**: When conflicting DOBs exist for the same name/email, we kept the **newest DOB** (likely a correction).
    
*   **Conservative auto-merge**: We only auto-merge when confident (DOB or strong phone). Name-only groups are collapsed carefully (most complete row), but should be reviewed before irreversible merges downstream.
    
*   **Address**: Legacy Wix form stores address as text in multiple fields; we unified into Select an Address for one clear field. (Future signups should prefer a **structured** address in the new system.)
    

What you get
------------

*   **source\_of\_truth.csv**: one row per person, preserving legitimate shared emails.
    
*   Shared emails no longer block ingestion: the same E-mail can map to multiple members.
    

How to reproduce in Kaggle
--------------------------

1.  Add the private dataset with your Wix export.
    
2.  Run notebook cells in order:
    
    *   Load & trim,
        
    *   Address sync,
        
    *   Counts,
        
    *   Duplicate email analysis,
        
    *   Person-key culling,
        
    *   Final export.
        
3.  Download source\_of\_truth.csv from the **Output** tab.
    

Next steps (GCP “source of truth”)
----------------------------------

Pick one:

### Option A — Firestore (serverless, simplest)

*   **Members collection**: one doc per person (server-generated memberId or person\_key hash).
    
*   **Emails collection**: docId = email\_norm, containing { members: \[memberId…\] }.
    
*   Pros: easy, cheap, naturally supports shared emails → many members can link to one email.
    

### Option B — Cloud SQL (Postgres)

*   Tables: members, emails, and a join table member\_emails(member\_id, email\_id, is\_primary).
    
*   Pros: strong constraints & SQL analytics; useful for reporting, events, payments joins.
    

**Importer:** small Cloud Run job that reads source\_of\_truth.csv and:

*   upserts one **member** per row,
    
*   links the row’s E-mail to that member (append if the email already exists).
    

Operational notes
-----------------

*   **Privacy:** dataset stayed private; only /kaggle/working/source\_of\_truth.csv is produced.
    
*   **Auditability:** we kept deterministic rules (documented above). If needed, keep the intermediate reports (duplicate summaries) for review.
    
*   **Future signups:** on the new form/API, **store email lowercased** and **allow linking multiple members to one email**. Enforce person uniqueness by DOB+name (and/or school ID) server-side.
    

Quick glossary
--------------

*   **email\_lower / gmail-canon:** alternative ways to normalize emails for dedupe checks. We used these for _analysis_, not forced in the final export.
    
*   **person\_key:** stable identifier we used to collapse true duplicates:
    
    *   (last\_norm, first\_norm, DOB) preferred,
        
    *   or (last\_norm, first\_norm, phone\_digits>=7),
        
    *   otherwise (last\_norm, first\_norm) (weak).
        
*   **strong key:** person\_key that includes DOB or a long phone; safer to auto-merge/cull.
    

Questions & tweaks
------------------

*   Want a stricter policy (e.g., never drop older DOB rows)? We can switch to **“flag for review”** instead of deleting.
    
*   Want a formal **review file** of conflict groups before export? We can emit review\_needed.csv alongside the final CSV.
    
*   Ready to ship to **Firestore/Postgres**? I’ll drop in a small importer and infra steps.