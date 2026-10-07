# Exam Proctor — Combined Add-ons Build

This folder combines the original Exam Proctor application with the browser-extension and desktop-monitor add-ons.

## 1. Database

Create the `exam_proctor` database and run:

- `backend/sql/schema.sql`
- `backend/sql/activity.sql`

Run each once in MySQL Workbench or phpMyAdmin.

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

## 4. Desktop monitor

Install Python 3, then open a terminal in `monitor/`:

```bash
pip install -r requirements.txt
python monitor.py
```

Enter the same Student ID that will be used in the exam portal.

Windows is the easiest platform. Linux requires Xorg + `xdotool`; macOS requires Screen Recording permission.

## 5. Test pages

- Home: `http://localhost:3000/`
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
