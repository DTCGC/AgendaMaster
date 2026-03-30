# Project Specification: Downtown Coquitlam Gavel Club Management App

## 1. Project Overview
Build a full-stack web application to manage club operations, specifically automating agenda creation and mass email distributions. The application must be mobile-compatible, prioritising desktop views.

## 2. Tech Stack & Architecture
* **Framework:** Next.js (App Router) using TypeScript. This acts as both the frontend UI and the server-side API, ensuring seamless component integration.
* **UI Components:** Tailwind CSS and `shadcn/ui`.
* **Database:** SQLite3, interfaced via a type-safe ORM (e.g., Prisma or Drizzle).
* **Infrastructure:** Deployed on a DigitalOcean Droplet with a Namecheap DNS.
* **Documentation:** Generate a detailed `README.md` containing full deployment instructions, API endpoints, and setup tutorials. All code must contain comprehensive docstrings and comments.

## 3. Aesthetics & Design System
* **Typeface:** Montserrat.
* **Primary Colours:** `#004165` (Loyal Blue - User UI), `#772432` (True Maroon - Admin UI).
* **Secondary Colours:** `#A9B2B1` (Cool Grey - Backgrounds), `#F2DF74` (Happy Yellow - Highlights/Accents).
* **Transparencies:** Use 70% opacity for top swatches over solid backgrounds (e.g., White over Loyal Blue, Loyal Blue over Cool Grey). Ensure WCAG text contrast ratios are maintained.
* **Assets:** Create an `/assets/images` directory. Organise provided Gavel Club logos into this structure. Implement standard error pages (404, 500) using the design system rather than browser defaults.
* **Navigation:** Implement a persistent top navigation bar. For standard logged-in members, the primary visible feature must be "Agenda". The admin view must contain additional navigation options (Calendar, Account Approvals, Communications, Archive) in the top bar.

## 4. Authentication & User Management
* **Auth Provider:** Google OAuth2 ("Log in with Google").
* **Access Tiers:**
    * **Public/Parents:** Can input an email to subscribe to the mailing list without an account.
    * **Members:** Must apply for an account (First Name, Last Name, Email). Accounts are pending until approved by an Admin.
    * **Admins:** Dedicated login with a securely hashed password stored in the database.
* **Security:** Stop execution and prompt me for a secure workflow regarding password hashing (e.g., bcrypt) and session token management (e.g., Auth.js/NextAuth) before implementing the server-side auth logic.

## 5. Core Workflow: Agenda & Email Generation (Member View)
* **Access Control:** The agenda creation tools are conditionally rendered. Only the member explicitly designated as the "Toastmaster" for the upcoming meeting (assigned via the Admin panel) can access the creation workflow. All other standard members are restricted to a read-only view of the Agenda page, displaying the finalised agenda (once created) and general club announcements or clarifying information.
* **Trigger:** A "Start" button on the main Agenda page, visible exclusively to the designated Toastmaster.
* **Step 1: Email Drafting:**
    * Provide a robust WYSIWYG text editor with subject and body fields.
    * Include a "How do I write the email?" pop-up containing a provided template.
    * **Data Processing:** Integrate a lightweight API or logic pipeline to silently correct basic grammatical and spelling errors, and enforce proper spacing formatting before saving.
    * Save the draft to the browser's `localStorage` to prevent data loss during the workflow.
* **Step 2: Agenda Parameters:**
    * Dropdown for Meeting Type (`Regular` or `Education`).
    * Text input for Meeting Theme (appended to the final document filename).
* **Step 3: Role Assignment:**
    * **Fixed Roles:** Business Meeting (Andrew), Roles for Next Meeting (John).
    * **Major Roles:** Toastmaster (Current User), Speaker 1/2/3, Table Topics Master, Quizmaster. (These are pre-assigned by Admins and immutable on this screen).
    * **Minor Roles:** Sergeant at Arms, Timer, Grammarian, Filler Word Counter, Evaluator 1/2/3, Table Topics Evaluator 1/2.
    * **Assignment Logic:** The system must query the database and automatically assign minor roles to members based on the longest timestamp since their last role.
    * **Manual Override:** Users can manually shuffle or swap minor roles.
    * **Constraints:** No double roles allowed by default. Include a toggle to "Allow Double Roles", which disables the automatic shuffle and displays a warning prompt.
    * **Unassigned Members:** Provide a text area at the bottom to list members attending without a role.
* **Step 4: Review & Execution:**
    * Display a final preview of the email and the agenda data.
    * Prompt for Google API permissions if tokens are expired/missing.
    * **Action 1 (Drive):** Read the agenda schema from the database template, duplicate the blank Google Sheets template via the Google Drive API, populate it with the assigned roles, and save it to the user's Drive.
    * **Action 2 (Gmail):** Send the formatted email (with the Sheet link) to the mailing list via the Gmail API. 
    * **Fallback:** Provide a manual fallback option that autonomously copies the final formatted email text and the generated Google Sheet link to the user's clipboard.

## 6. Admin Panel Functions
* **Access:** Distinct UI space utilising the True Maroon colour scheme.
* **Calendar Management:** Display a calendar filtered to Fridays. Allow the admin to toggle specific Fridays "Off" (no meeting). Globally disable meetings for July and August.
* **Role Management:** View upcoming auto-generated meeting dates. The admin must designate the "Toastmaster" for the upcoming meeting; this assignment acts as the permission key unlocking the agenda creation workflow for that specific member. The admin can also pre-assign all other Major Roles for any future meeting (Assign Major Roles).
* **Account Approval:** View pending member account requests. Accept or deny them, triggering an automated notification email to the requester.
* **Communications:** A dedicated rich-text editor to draft and send mass business announcements to the club mailing list.
* **Archive:** View historical agendas and emails.

## 7. Database Requirements & Schema (SQLite3 + ORM)
Ensure strict normalisation. Build the following relational schema (interpreted for your chosen ORM, e.g., Prisma):

* **`User` Table:**
    * `id` (PK, UUID or Auto-increment)
    * `firstName` (String)
    * `lastName` (String)
    * `email` (String, Unique)
    * `role` (Enum: PENDING, MEMBER, ADMIN)
    * `passwordHash` (String, Nullable - only for admins)
    * `createdAt` (DateTime)
    * *Relations:* 1-to-Many with `RoleAssignment`.

* **`MeetingTemplate` Table:**
    * `id` (PK)
    * `type` (String, e.g., 'Regular', 'Education')
    * `schemaStructure` (JSON or Text - stores the imported CSV template structure)

* **`Meeting` Table:**
    * `id` (PK)
    * `date` (DateTime)
    * `typeId` (FK to `MeetingTemplate.id`)
    * `theme` (String)
    * `status` (Enum: SCHEDULED, CANCELLED, COMPLETED)
    * *Relations:* 1-to-Many with `RoleAssignment`.

* **`RoleAssignment` Table:**
    * `id` (PK)
    * `meetingId` (FK to `Meeting.id`)
    * `userId` (FK to `User.id`)
    * `roleName` (String, e.g., 'Timer', 'Speaker 1')
    * `assignedAt` (DateTime)

* **`Subscriber` Table:** (For parents/public mailing list)
    * `id` (PK)
    * `email` (String, Unique)
    * `subscribedAt` (DateTime)

* **`Settings` Table:** (For global app configurations)
    * `key` (String, PK)
    * `value` (String)

**Initial Migration:** Write a seed script to import the provided CSV agenda schema into the `MeetingTemplate` table upon database initialization.

## 8. Post-Development Task
* Once the core application is functional, pause and provide a step-by-step markdown guide on how to provision a Discord Bot (using `discord.py` or `discord.js`) that will fetch the finalised email text and Google Sheet link via an API endpoint and post it to a specific Discord announcement channel.