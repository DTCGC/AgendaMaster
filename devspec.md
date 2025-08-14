# Gavel Club Agenda Builder – Developer Specification (Flask + SQLite)

> Scope: internal tool with shared login, no public hosting yet. Produces copy‑pasteable email text and a Google‑Sheets‑ready agenda. Stores generated artifacts on the droplet.

---

## 1) Tech Stack & Non‑Functional Requirements

* **Backend:** Python 3.x, **Flask** (Jinja2 templates), `flask-wtf` (CSRF), `werkzeug.security` for password hashing.
* **DB:** **SQLite** via `sqlite3` or SQLAlchemy Core/ORM (recommended: SQLAlchemy for migrations with Alembic-lite or simple custom migrations).
* **Session:** Flask server-side signed cookies; `SESSION_COOKIE_SECURE` (enable on HTTPS), `PERMANENT_SESSION_LIFETIME` configurable.
* **Auth:** Single shared password for members; separate admin password for admin portal.
* **Assets:** Static tutorial images for Google Sheets workflow.
* **Files:** Persist generated agendas/emails under `/data/meetings/` on droplet.
* **Reliability:** Deterministic randomization per meeting (seeded) for reproducibility.
* **Accessibility:** Minimal JS; progressive enhancement. Everything works with standard forms + server rendering.

---

## 2) Core User Flow

1. **Login** (shared password; optional admin password).
2. **Home** → big **CREATE AGENDA** button.
3. **Start Meeting**: choose *Meeting Type*, *Meeting Date (MM/DD)*, *Theme*.
4. **Email Wizard**: stepwise inputs (Intro → Body → Closing). Double‑spaced preview.
5. **Roles**: majors preselected from presets; minors randomized (with dropdown overrides). Preset roles **highlighted**.
6. **Agenda Preview**: TSV block copy‑pasteable to Google Sheets + tutorial link. User pastes share link back to app.
7. **Finalize**: App generates final subject + recipients + double‑spaced email body (with agenda link). One giant copy‑paste block.
8. **Logging**: Save TSV and email body to `/data/meetings/` + DB row.

---

## 3) Data Model (SQLite)

> SQL shown in portable form; adjust types (`TEXT`, `INTEGER`, `BOOLEAN`) as needed.

```sql
-- Shared credentials: one for members, one for admins
CREATE TABLE IF NOT EXISTS auth_credentials (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('member','admin')) UNIQUE,
  password_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Roster / recipients
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS recipients (
  id INTEGER PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- Meeting types and customizable templates
CREATE TABLE IF NOT EXISTS meeting_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- Roles catalog (major/minor)
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_major INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Template rows describe agenda structure for a meeting type
-- Each row is a line in the spreadsheet; role_id nullable for pure headers/breaks
CREATE TABLE IF NOT EXISTS template_rows (
  id INTEGER PRIMARY KEY,
  meeting_type_id INTEGER NOT NULL REFERENCES meeting_types(id),
  order_index INTEGER NOT NULL,
  label TEXT NOT NULL,            -- e.g., "Opening Remarks"
  default_duration_min INTEGER,   -- optional
  role_id INTEGER REFERENCES roles(id),
  notes TEXT
);

-- Admin-preassigned roles for the *next* meeting (staging/preset store)
CREATE TABLE IF NOT EXISTS role_presets_next (
  id INTEGER PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  meeting_type_id INTEGER REFERENCES meeting_types(id),
  created_at TEXT NOT NULL
);

-- Meetings master
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY,
  meeting_date TEXT NOT NULL,         -- ISO or MM/DD/YYYY
  theme TEXT,
  meeting_type_id INTEGER NOT NULL REFERENCES meeting_types(id),
  agenda_sheet_url TEXT,              -- user-pasted Google Sheets link (optional)
  agenda_tsv_path TEXT,               -- saved TSV file path
  email_subject TEXT,
  email_body TEXT,                    -- final double-spaced version
  created_by_role TEXT NOT NULL CHECK (created_by_role IN ('member','admin')),
  created_at TEXT NOT NULL
);

-- Concrete assignments for a meeting
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  member_id INTEGER REFERENCES members(id),
  is_preset INTEGER NOT NULL DEFAULT 0,
  UNIQUE(meeting_id, role_id)
);

-- Audit/log of downloaded artifacts
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('agenda_tsv','email_txt')),
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### Initial seed data

* `auth_credentials`: two rows (member/admin) with password hashes.
* `meeting_types`: Normal, Education Session, Mentorship, Debate, Event.
* `roles`: mark majors (e.g., Toastmaster, General Evaluator, Speaker 1–3) vs minors (Timer, Ah‑Counter, Grammarian, Ballot Counter, etc.).
* `template_rows`: ordered lines for each meeting type (headers, breaks, role slots).

---

## 4) Business Rules

* **Group login:** either *member* or *admin* role; stored in session.
* **Admin portal:** can edit templates, roles, recipients, members, and next‑meeting presets.
* **Preset highlighting:** When creating assignments, any `role_id` present in `role_presets_next` sets `assignments.is_preset=1` and is visually highlighted; TM can’t change it unless admin.
* **Randomization:**

  * Applies to minor roles only.
  * Exclude members not active, and those already assigned a major role for the same meeting.
  * Deterministic: seed RNG with `hash(f"{meeting_date}|{meeting_type_id}")` so reloading doesn’t reshuffle unexpectedly.
  * Allow single‑click “Re‑roll minors” which re-seeds with `seed ^ user_click_counter`.
* **Email formatting:** Double spacing by inserting a blank line between paragraphs; normalize line endings to `\n`.
* **Spreadsheet format:** Output as **TSV** (tabs, `\n` line breaks). Google Sheets accepts direct paste.
* **Logging:** Save TSV as `/data/meetings/{YYYYMMDD}_{id}_agenda.tsv`; email as `/data/meetings/{YYYYMMDD}_{id}_email.txt`.

---

## 5) Spreadsheet (TSV) Layout

Columns:

1. **Time** (optional)
2. **Segment** (from `template_rows.label`)
3. **Role** (from `roles.name` if role row)
4. **Member** (assigned name or blank)
5. **Notes** (template row notes or theme)

Example TSV (literal tabs between columns):

```
Time	Segment	Role	Member	Notes
6:00	Opening Remarks			Theme: {THEME}
	Speaker 1	Speaker 1	{NAME}	{TITLE}
	Timer	Timer	{NAME}	
...
```

---

## 6) Routes (Server‑Rendered Pages)

### Auth

* `GET /login` – form with password + role selector (member/admin).
* `POST /login` – verify hash; set session `{role}`; redirect `/`.
* `POST /logout` – clear session.

### Member Flow

* `GET /` – home; big **CREATE AGENDA**.

* `GET /start` – form: meeting type, date (MM/DD or datepicker), theme.

* `POST /start` – create `meetings` row; redirect `/email/{meeting_id}`.

* `GET /email/<id>` – wizard stepper (Intro, Body, Closing + theme display). Multi-field or multi-step.

* `POST /email/<id>` – save draft in session/DB (not final); show **Preview** (double-spaced).

* `GET /roles/<id>` – display majors preselected (from presets), minors with randomized defaults; presets highlighted.

* `POST /roles/<id>/randomize` – re-roll minor roles (server recomputes deterministic RNG with click-count salt).

* `POST /roles/<id>` – save assignments (respect lock on presets for non-admins).

* `GET /agenda/<id>` – render TSV preview in `<textarea>` with **Copy** button; show tutorial link.

* `POST /agenda/<id>/save` – write TSV to file, compute SHA‑256, insert `artifacts` row; optional upload of returned Google Sheets share link.

* `GET /final/<id>` – produce subject `[Gavel Club MM/DD - {THEME}]`, recipient list (from `recipients`), and the final double‑spaced body containing the agenda link; display as single large copy‑paste block.

* `POST /final/<id>/complete` – persist `email_subject`, `email_body`; also save email `.txt` artifact.

### Admin Portal

* `GET /admin` – dashboard.
* `GET|POST /admin/recipients` – CRUD emails (bulk add via textarea, CSV import optional).
* `GET|POST /admin/members` – CRUD roster.
* `GET|POST /admin/roles` – CRUD roles (+ toggle major/minor, order\_index).
* `GET|POST /admin/templates` – edit `template_rows` per meeting type (drag order; add header/role line).
* `GET|POST /admin/presets` – set **roles for next meeting** (`role_presets_next`).
* `GET /admin/meetings` – list past meetings with download links.
* `POST /admin/password` – change member/admin passwords.

---

## 7) Request/Response (Key POST bodies)

* **POST /login**: `{ role: 'member'|'admin', password: '...' }`
* **POST /start**: `{ meeting_type_id, meeting_date, theme }`
* **POST /email/<id>**: `{ intro, body, closing }` (server composes `double_spaced_body` = join by `\n\n`).
* **POST /roles/<id>/randomize**: `{ salt_clicks }` (int).
* **POST /roles/<id>**: array of `{ role_id, member_id }` (only minors editable by members; majors editable by admin or if not preset).
* **POST /agenda/<id>/save**: `{ agenda_tsv, agenda_sheet_url? }`.
* **POST /final/<id>/complete**: `{ email_subject, email_body }`.

---

## 8) UI Behaviors

* **Highlight presets:** style preset rows with a badge “Preset (locked)” + disabled dropdown for members; admin sees “unlock” toggle.
* **Copy buttons:** Use `navigator.clipboard.writeText()` with fallback.
* **Tutorial:** `/help/google-sheets` page showing numbered images: open docs.google.com → sign in → Blank spreadsheet → paste TSV → Share → Copy link.
* **Validation:**

  * Meeting date required; theme optional but recommended.
  * At least N speakers/evaluators per template rules (validate on save).

---

## 9) Randomization Algorithm (Minor Roles)

1. Build candidate pool = active members minus those assigned a major role in this meeting.
2. Seed `random.Random(seed)`, where `seed = sha256(f"{meeting_date}|{meeting_type_id}|{salt_clicks}").int` (take int from hex).
3. Shuffle candidate pool; assign in template order to minor roles.
4. If candidates < minor slots, leave remaining blank (manual selection required).

---

## 10) Email Subject & Body Rules

* **Subject:** `[Gavel Club {MM/DD} - {Theme}]` (theme optional; if blank use `[Gavel Club {MM/DD}]`).
* **Body assembly:**

  * `intro`, blank line, `body`, blank line, `closing`, blank line, `Agenda link: {url}`.
  * Normalize to `\n`; render preview in monospace `<textarea>`.
  * Ensure double spacing by inserting an extra `\n` between paragraphs.

---

## 11) Security & Permissions

* Store only password hashes (`generate_password_hash`, PBKDF2). No plaintext passwords in DB or logs.
* CSRF on all POSTs.
* Session key in env var; cookie `httponly` true, `secure` true in prod.
* Rate‑limit login (simple counter per IP in memory or SQLite).
* Non‑admin users cannot modify preset major roles.

---

## 12) File I/O & Paths

* Root data dir: `/data/meetings/` (create at startup if missing).
* Filenames:

  * Agenda TSV: `{YYYYMMDD}_{meetingId}_agenda.tsv`
  * Email TXT: `{YYYYMMDD}_{meetingId}_email.txt`
* Compute SHA‑256 for each artifact and store in `artifacts`.

---

## 13) Minimal Flask Structure (suggested)

```
app/
  __init__.py
  auth.py
  main.py                # member flow routes
  admin.py
  models.py              # SQLAlchemy models or raw SQL helpers
  services/
    randomize.py
    email_format.py
    tsv_builder.py
    files.py
  templates/
    base.html
    home.html
    start.html
    email_wizard.html
    roles.html
    agenda_preview.html
    final.html
    admin/*.html
  static/
    css/app.css
    img/tutorial/*.png
migrations/
config.py
wsgi.py
```

---

## 14) Pseudocode Snippets

**Double‑space email**

```python
from textwrap import dedent

def double_space(*parts):
    clean = [p.strip() for p in parts if p and p.strip()]
    return ("\n\n".join(clean)).replace("\r\n", "\n").replace("\r", "\n")
```

**TSV builder**

```python
def build_agenda_tsv(meeting, template_rows, assignments, theme):
    lines = ["Time\tSegment\tRole\tMember\tNotes"]
    for row in sorted(template_rows, key=lambda r: r.order_index):
        role = find_role(row.role_id)
        member = find_member(assignments.get(row.role_id)) if row.role_id else ""
        seg = row.label
        notes = (row.notes or "")
        if theme and (not row.role_id and row.order_index == 0):
            notes = f"Theme: {theme}"
        lines.append(f"\t{seg}\t{role.name if role else ''}\t{member}\t{notes}")
    return "\n".join(lines)
```

**Minor-role randomize**

```python
import random, hashlib

def seed_from(meeting_date, mt_id, salt_clicks=0):
    s = f"{meeting_date}|{mt_id}|{salt_clicks}".encode()
    return int(hashlib.sha256(s).hexdigest(), 16) % (2**63)
```

---

## 15) Wireframe Notes (low‑fi)

* **Login**: role selector (radio: member/admin), password field.
* **Home**: centered "CREATE AGENDA" button.
* **Start**: dropdown meeting type; date picker; theme input; **Next**.
* **Email Wizard**: step chips at top; big textarea per section; **Next**.
* **Roles**: table with columns Role | Member (dropdown) | \[Preset badge]; buttons: **Randomize minors**, **Next**.
* **Agenda Preview**: large textarea with TSV; buttons: **Copy**, **Save**; link to tutorial.
* **Final**: subject (readonly), recipients (readonly list or textarea), giant textarea with final email; **Copy**, **Finish**.
* **Admin**: tabs for Recipients, Members, Roles, Templates, Presets, Meetings.

---

## 16) Test Cases (Happy Path)

1. Login as member → create Normal meeting 09/12 “Back to School”.
2. Fill email parts → preview double‑spaced.
3. Roles: presets lock Speaker 1/2; randomize minors; adjust one manually.
4. Agenda: copy TSV, paste to Google Sheets, share link, paste link back; save.
5. Final: copy final email block; complete. Artifacts exist on disk; admin can download.

**Edge Cases**

* No active members available for a minor role → leave blank; validation prompts user.
* Duplicate assignments attempt → server enforces `UNIQUE(meeting_id, role_id)`.
* Admin changes presets → members see updated lock/highlight immediately.

---

## 17) Next Steps (Build Order)

1. Auth + sessions + seed `auth_credentials`.
2. CRUD for meeting types, roles, templates (admin).
3. Member flow routes (`/start` → `/final`).
4. TSV/email generation + file logging.
5. Presets and highlight/locking.
6. Tutorial assets and polish.

