// dbconfig.js — reads the database settings and checks them.
// The normal way is one line in the settings file:  DB_URL="mysql://..."
// (the "Service URI" copied from the Aiven console). The older separate
// settings (DB_HOST, DB_USER, ...) still work for a local MySQL.

// True if the text looks like a MySQL Service URI.
function isValidDatabaseUrl(text) {
  try {
    const url = new URL(text);
    return url.protocol === 'mysql:' && !!url.hostname && !!url.username;
  } catch (err) {
    return false;
  }
}

function getDbConfig() {
  if (process.env.DB_URL) {
    const url = new URL(process.env.DB_URL);
    // Cloud databases require an encrypted connection.
    const sslMode = (url.searchParams.get('ssl-mode') || 'REQUIRED').toUpperCase();
    return {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)) || 'defaultdb',
      ssl: sslMode === 'DISABLED' ? undefined : { rejectUnauthorized: false }
    };
  }

  // Local MySQL (for example XAMPP).
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'exam_proctor',
    ssl: undefined
  };
}

// Sets KEY="value" in the text of a settings file (replaces the line if
// it exists, otherwise adds it at the end).
function setEnvLine(text, key, value) {
  const line = `${key}="${value}"`;
  const pattern = new RegExp('^' + key + '=.*$', 'm');
  if (pattern.test(text)) return text.replace(pattern, () => line);
  return text.replace(/\n*$/, '\n') + line + '\n';
}

module.exports = { getDbConfig, isValidDatabaseUrl, setEnvLine };
