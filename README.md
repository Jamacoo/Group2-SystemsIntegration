# TestGuard Companion

**Group 2 — Systems Integration Project**

🌐 **Live Website:** https://testguard-companion.onrender.com/

## About the Project

TestGuard Companion is a web-based examination monitoring system designed to support online exams conducted through Google Forms. It provides instructors with tools to manage examinations, monitor student activity, and review examination sessions through a centralized dashboard.

The system combines a web interface, backend API, browser extension, and database to record selected browser activities during an examination.

## Features

- **Admin Panel** — Create, edit, and delete exams and generate shareable student exam links.
- **Exam Portal** — Provide students with access to examinations through an embedded Google Form.
- **Browser Activity Monitoring** — Detect selected activities such as tab switching, loss of window focus, fullscreen exits, and right-click or copy attempts.
- **Dashboard** — Review examination sessions, flagged activities, and risk scores.
- **Live Activity Monitoring** — View activity records during examination sessions.
- **Database Integration** — Store examination details, student sessions, and recorded activity.
- **Browser Extension** — Extend monitoring capabilities through a compatible browser extension.
- **Optional Desktop Monitor** — Provide additional information about active desktop applications when the monitoring component is configured and running.

## Technologies Used

- HTML, CSS, and JavaScript
- Node.js
- Express.js
- MySQL
- Chrome Extension API
- Electron
- Python for the optional desktop-monitoring component

## Access the Website

Visit the hosted application:

**https://testguard-companion.onrender.com/**

From the homepage, users can access the Admin Panel, Dashboard, Live Activity page, and Setup Guide.

## Running the Project Locally

### Requirements

- Node.js and npm
- MySQL database
- A compatible Chromium-based browser
- Python, if using the optional desktop monitor

### 1. Configure the Database

Create the `exam_proctor` database and execute the following SQL files:

- `backend/sql/schema.sql`
- `backend/sql/activity.sql`

### 2. Configure Environment Variables

Create a `.env` file in the `backend` folder using `.env.example` as a reference. Enter the appropriate database connection details and other required configuration.

Keep credentials private and do not commit your actual `.env` file to a public repository.

### 3. Install Dependencies

Open a terminal in the `backend` directory and run:

```bash
npm install
```

### 4. Start the Backend

Run:

```bash
npm start
```

The local server should be available at `http://localhost:3000`.

### 5. Configure the Browser Extension

Open your browser's extensions page, enable Developer Mode, select **Load unpacked**, and choose the project's `extension` folder.

For local testing, the extension is configured for `http://localhost:3000/*`.

### 6. Optional Desktop Monitor

The desktop-monitoring component is optional. Refer to `monitor/requirements.txt` and `SETUP.md` for its dependencies and instructions.

## Project Structure

```text
Exam-Proctor-Final/
├── backend/
│   ├── routes/
│   ├── sql/
│   ├── db.js
│   ├── server.js
│   └── setup-db.js
├── extension/
├── monitor/
├── public/
│   ├── admin.html
│   ├── activity.html
│   ├── dashboard.html
│   ├── exam.html
│   ├── guide.html
│   ├── index.html
│   └── proctor.js
├── main.js
├── package.json
└── SETUP.md
```

## Basic Usage

**For instructors**
1. Open the website and access the Admin Panel.
2. Create an exam using its Google Forms embed URL.
3. Copy and share the generated student exam link.
4. Use the Dashboard and Live Activity page to review student sessions and detected activities.

**For students**
1. Open the exam link provided by the instructor.
2. Enter the required student information.
3. Start the examination.
4. Follow the examination instructions and avoid prohibited browser activities.

## Limitations

- Browser monitoring is limited by browser permissions and security restrictions.
- The system cannot directly inspect the contents of other applications through the browser alone.
- Some interactions inside an embedded Google Form may not be detectable.
- Additional desktop-application information depends on the optional desktop monitor being configured and running.
- Website availability depends on the hosting service and its configuration.

## Project Purpose

TestGuard Companion demonstrates the integration of web technologies, backend services, browser monitoring, and database management to support online examination monitoring.

**Course:** Systems Integration
