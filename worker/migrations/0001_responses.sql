CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  response_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS responses_event_question_idx
  ON responses (event_id, question_id, status, created_at);

CREATE INDEX IF NOT EXISTS responses_expiry_idx
  ON responses (expires_at);
