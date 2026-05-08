CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  pro_until INTEGER
);

CREATE TABLE IF NOT EXISTS github_installation (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  installed_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_github_installation_user
  ON github_installation(user_id);
