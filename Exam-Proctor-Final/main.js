const { app, BrowserWindow, Menu, dialog, shell, clipboard } = require('electron');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { isValidDatabaseUrl, setEnvLine } = require('./backend/dbconfig');

// Default settings. Created automatically on first run.
const DEFAULT_ENV = `PORT=3000
`;

let envFile = '';              // path of the settings file
let quitWhenAllClosed = false; // becomes true once the main window exists

// Finds the .env file, creating it with defaults if it is missing.
function loadEnv() {
  envFile = app.isPackaged
    ? path.join(app.getPath('userData'), '.env')
    : path.join(__dirname, 'backend', '.env');

  if (!fs.existsSync(envFile)) {
    fs.mkdirSync(path.dirname(envFile), { recursive: true });
    fs.writeFileSync(envFile, DEFAULT_ENV);
  }
  require('dotenv').config({ path: envFile });

  // Make sure there is an instructor password. Created once, then reused.
  let newPassword = false;
  if (!process.env.ADMIN_PASSWORD) {
    const password = crypto.randomBytes(9).toString('base64url');
    fs.appendFileSync(envFile, '\nADMIN_PASSWORD=' + password + '\n');
    process.env.ADMIN_PASSWORD = password;
    newPassword = true;
  }
  return { newPassword };
}

// Saves the database address in the settings file.
function saveDatabaseUrl(url) {
  const text = fs.readFileSync(envFile, 'utf8');
  fs.writeFileSync(envFile, setEnvLine(text, 'DB_URL', url));
  process.env.DB_URL = url;
}

// Shows the instructor password, with a button to copy it.
async function showPassword() {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Instructor password',
    message: 'Your instructor password',
    detail:
      'The Admin Panel, Dashboard, and Live Activity pages ask for this password. ' +
      'Type any username.\n\n' +
      'Password: ' + process.env.ADMIN_PASSWORD + '\n\n' +
      'You can see it again under Help > Show Instructor Password.',
    buttons: ['Copy password', 'OK'],
    defaultId: 1
  });
  if (result.response === 0) clipboard.writeText(process.env.ADMIN_PASSWORD);
}

// Explains how to let students on other networks join.
function showTunnelHelp() {
  const port = process.env.PORT || 3000;
  dialog.showMessageBox({
    type: 'info',
    title: 'Share over the internet',
    message: 'Let students on other networks join',
    detail:
      'One-time setup: open Command Prompt and run\n' +
      '    winget install --id Cloudflare.cloudflared\n\n' +
      'Each time you hold an exam (keep this app open):\n' +
      '1. In Command Prompt, run\n' +
      '    cloudflared tunnel --url http://localhost:' + port + '\n' +
      '2. Copy the https://....trycloudflare.com address it prints.\n' +
      '3. Open the Admin Panel, paste it into "Public address", and send students the links.\n\n' +
      'The address changes every time you restart the tunnel. Keep the Command Prompt window open during the exam.'
  });
}

// ---------- Database address window ----------

const SETUP_URL = 'http://db-setup.invalid/';
const SETUP_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Connect your database</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; background: #f8f9fa; color: #1a1a1a; }
  header { background: #7A0C22; color: #FFC72C; padding: 14px 24px; font-weight: bold; }
  main { padding: 20px 24px; }
  h2 { margin: 0 0 8px; color: #5C0918; }
  ol { padding-left: 20px; line-height: 1.6; }
  input[type=text] { width: 100%; box-sizing: border-box; padding: 9px; font-size: 13px; border: 1px solid #ccc; border-radius: 4px; }
  .row { margin-top: 14px; display: flex; gap: 10px; align-items: center; }
  button { background: #7A0C22; color: #fff; border: none; border-radius: 4px; padding: 9px 18px; font-size: 14px; cursor: pointer; }
  a { color: #7A0C22; font-size: 14px; }
  .note { font-size: 12px; color: #666; margin-top: 12px; }
</style></head><body>
<header>TestGuard</header>
<main>
  <h2>Connect your database</h2>
  <p>The app stores its data in a free Aiven MySQL database.</p>
  <ol>
    <li>Sign up at aiven.io (no card needed) and create a free MySQL service.</li>
    <li>When it shows as Running, open it and copy its <strong>Service URI</strong>.</li>
    <li>Paste it below.</li>
  </ol>
  <form action="${SETUP_URL}save" method="get">
    <input type="text" name="uri" placeholder="mysql://avnadmin:...@...aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED" autofocus>
    <div class="row">
      <button type="submit">Save and connect</button>
      <a href="${SETUP_URL}cancel">Cancel</a>
    </div>
  </form>
  <div class="note">The address contains your database password. Do not share it.</div>
</main></body></html>`;

// Opens the window and waits. Returns the address, or null if cancelled.
function askForDatabaseUrl() {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 620, height: 540, title: 'Connect your database',
      autoHideMenuBar: true, resizable: false
    });
    let finished = false;
    function finish(value) {
      if (finished) return;
      finished = true;
      resolve(value);
      if (!win.isDestroyed()) win.close();
    }

    // The form's buttons "navigate" to a made-up address; we catch that here.
    win.webContents.on('will-navigate', (event, positionalUrl) => {
      const target = event.url || positionalUrl;
      if (!target || !target.startsWith(SETUP_URL)) return;
      event.preventDefault();
      const parsed = new URL(target);
      if (parsed.pathname === '/save') {
        const value = (parsed.searchParams.get('uri') || '').trim();
        if (!isValidDatabaseUrl(value)) {
          dialog.showMessageBox(win, {
            type: 'warning',
            message: 'That does not look like a Service URI.',
            detail: 'It should start with mysql:// and include a password and a host name. Copy it again from the Aiven service page.'
          });
          return;
        }
        finish(value);
      } else {
        finish(null);
      }
    });
    win.on('closed', () => finish(null));
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SETUP_HTML));
  });
}

function friendlyDatabaseMessage(err) {
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    return 'The database rejected the username or password in the Service URI.';
  }
  if (err.code === 'ENOTFOUND') {
    return 'The database address could not be found. Check the Service URI and your internet connection.';
  }
  if (['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET'].includes(err.code)) {
    return 'Could not reach the database. Check your internet connection, and make sure the service shows as Running in the Aiven console (free services power off when they are not used).';
  }
  return 'Could not set up the database.';
}

// Makes sure the database address is set, the tables exist, and it works.
// Returns true if the app should continue.
async function connectDatabase() {
  while (true) {
    if (!process.env.DB_URL && !process.env.DB_HOST) {
      const url = await askForDatabaseUrl();
      if (!url) return false;
      saveDatabaseUrl(url);
    }

    try {
      await require('./backend/setup-db').setupDatabase();
      const pool = require('./backend/db');
      await pool.query('SELECT 1');
      return true;
    } catch (err) {
      delete require.cache[require.resolve('./backend/db')];
      const choice = await dialog.showMessageBox({
        type: 'error',
        title: 'Cannot connect to the database',
        message: friendlyDatabaseMessage(err),
        detail: err.message,
        buttons: ['Enter a different Service URI', 'Quit'],
        defaultId: 0
      });
      if (choice.response !== 0) return false;
      // Forget the address so the form is shown again.
      process.env.DB_URL = '';
      process.env.DB_HOST = '';
    }
  }
}

// Help menu: change the database address, then restart the app.
async function changeDatabaseSettings() {
  const url = await askForDatabaseUrl();
  if (!url) return;
  saveDatabaseUrl(url);
  await dialog.showMessageBox({
    type: 'info',
    message: 'Saved.',
    detail: 'The app will restart to use the new database.'
  });
  app.relaunch();
  app.exit(0);
}

// ---------- Browser extension help ----------

// Copies the browser extension to the Documents folder (so it is easy
// to find and stays put), opens that folder, and explains how to install it.
async function showExtensionHelp() {
  const source = app.isPackaged
    ? path.join(process.resourcesPath, 'extension')
    : path.join(__dirname, 'extension');
  const target = path.join(app.getPath('documents'), 'TestGuard Extension');

  try {
    fs.cpSync(source, target, { recursive: true });
  } catch (err) {
    dialog.showErrorBox('Could not prepare the extension', err.message);
    return;
  }

  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Install the browser extension',
    message: 'Install the TestGuard browser extension',
    detail:
      'The extension is needed so the exam can see which sites are opened.\n\n' +
      '1. Open Chrome or Edge, and go to chrome://extensions (or edge://extensions).\n' +
      '2. Turn on "Developer mode".\n' +
      '3. Click "Load unpacked".\n' +
      '4. Choose this folder:\n' + target + '\n\n' +
      'Do not move or delete that folder afterward.',
    buttons: ['Open extension folder', 'Close'],
    defaultId: 0
  });
  if (result.response === 0) {
    shell.openPath(target);
  }
}

// Shows the extension instructions once, the first time the app runs.
function showExtensionHelpOnFirstRun() {
  const flag = path.join(app.getPath('userData'), 'extension-help-shown');
  if (fs.existsSync(flag)) return;
  fs.mkdirSync(path.dirname(flag), { recursive: true });
  fs.writeFileSync(flag, 'shown');
  showExtensionHelp();
}

function createMenu() {
  const template = [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        { label: 'Install Browser Extension...', click: showExtensionHelp },
        { label: 'Share Over the Internet...', click: showTunnelHelp },
        { label: 'Show Instructor Password', click: showPassword },
        { label: 'Database Settings...', click: changeDatabaseSettings }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// The app's own window logs in to the instructor pages automatically.
app.on('login', (event, webContents, request, authInfo, callback) => {
  event.preventDefault();
  callback('admin', process.env.ADMIN_PASSWORD);
});

app.whenReady().then(async () => {
  const { newPassword } = loadEnv();

  if (!(await connectDatabase())) {
    app.quit();
    return;
  }
  require('./backend/server.js'); // starts the server

  createMenu();
  const win = new BrowserWindow({ width: 1200, height: 800, title: 'TestGuard' });
  quitWhenAllClosed = true;
  // Keep our title instead of the web page's <title>.
  win.on('page-title-updated', (event) => event.preventDefault());
  win.loadURL('http://localhost:3000/');

  if (newPassword) await showPassword();
  showExtensionHelpOnFirstRun();
});

// Closing the little database window must not quit the app.
app.on('window-all-closed', () => {
  if (quitWhenAllClosed) app.quit();
});
