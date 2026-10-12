# TestGuard — Combined Add-ons Build

This folder combines the original Exam Proctor application with the browser-extension and desktop-monitor add-ons.

## 1. Database

Create the `exam_proctor` database and run:

- `backend/sql/schema.sql`
- `backend/sql/activity.sql`

Run each once in MySQL Workbench or phpMyAdmin.

## 1b. Professor accounts

Every professor creates their own account on `/login.html` (**Create account**: name, email, password) and only sees their own exams and the records under them. Anyone can sign up.

- When hosting online, set `SESSION_SECRET` to a long random text (it signs the login cookie). If you don't, the database address is used.
- Exams that existed before accounts were added go to the **first** account created.
- Existing databases are upgraded automatically when the server starts (a `professors` table and an `exams.professor_id` column are added).

## 2. Backend

Open a terminal in `backend/`:

```bash
npm install
npm start
```

The server should run at `http://localhost:3000`.

Check:

`http://localhost:3000/api/health`

It should report `dbConnected: true`.

If your MySQL password is not blank, edit `backend/.env` first.

## 3. Browser extension

In Chrome/Edge/Brave/Opera, open the extensions page, enable Developer Mode, choose **Load unpacked**, and select this project's `extension/` folder.

The extension is configured for local testing at `http://localhost:3000/*`.

## 4. Desktop monitor (optional, not required)

Students only need the browser extension. `monitor/monitor.py` is an optional extra that names other apps (Word, PDF readers); without it, those show as "Switched tab" / "Left exam window".

## 5. Test pages

- Home: `http://localhost:3000/`
- Log in / create account: `http://localhost:3000/login.html`
- Admin: `http://localhost:3000/admin.html`
- Dashboard: `http://localhost:3000/dashboard.html`
- Live Activity: `http://localhost:3000/activity.html`
- Exam: `http://localhost:3000/exam.html?examId=1`

## 6. Test flow

1. Start MySQL.
2. Start the backend with `npm start`.
3. Load/enable the browser extension.
4. Start `monitor.py` and enter a Student ID.
5. Create/select a test exam in Admin Panel.
6. Open the student exam link.
7. Enter the same Student ID and start the exam.
8. Test a tab switch and opening another desktop application.
9. Check Dashboard and Live Activity.

## Important

This build intentionally does not include the original local MySQL password. Set your own value in `backend/.env` before running it.
