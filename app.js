const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Database setup
const dbPath = path.join(__dirname, 'db', 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      hours REAL NOT NULL,
      date TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating table:', err);
    } else {
      console.log('Sessions table ready');
    }
  });
}

// Helper: Calculate streak
function calculateStreak(callback) {
  db.all(
    'SELECT date FROM sessions ORDER BY date DESC',
    (err, rows) => {
      if (err) {
        callback(0);
        return;
      }

      if (rows.length === 0) {
        callback(0);
        return;
      }

      let streak = 1;
      let currentDate = new Date(rows[0].date);

      for (let i = 1; i < rows.length; i++) {
        const prevDate = new Date(rows[i].date);
        const dayDiff = (currentDate - prevDate) / (1000 * 60 * 60 * 24);

        if (dayDiff === 1) {
          streak++;
          currentDate = prevDate;
        } else {
          break;
        }
      }

      callback(streak);
    }
  );
}

// POST /study - Add study session
app.post('/study', (req, res) => {
  const { subject, hours } = req.body;

  if (!subject || subject.trim() === '') {
    return res.status(400).json({ error: 'Subject is required' });
  }

  if (!hours || typeof hours !== 'number' || hours <= 0) {
    return res.status(400).json({ error: 'Hours must be a number greater than 0' });
  }

  if (hours > 24) {
    return res.status(400).json({ error: 'Hours cannot exceed 24' });
  }

  const today = new Date().toISOString().split('T')[0];

  db.run(
    'INSERT INTO sessions (subject, hours, date) VALUES (?, ?, ?)',
    [subject.trim(), hours, today],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to save session' });
      }

      calculateStreak((streak) => {
        res.status(201).json({
          message: 'Study session added successfully',
          session: {
            id: this.lastID,
            subject: subject.trim(),
            hours: hours,
            date: today
          },
          currentStreak: streak
        });
      });
    }
  );
});

// GET /study - Get all sessions
app.get('/study', (req, res) => {
  db.all(
    'SELECT * FROM sessions ORDER BY date DESC',
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch sessions' });
      }

      if (rows.length === 0) {
        return res.json({
          message: 'No study sessions yet. Time to get started! 🚀',
          sessions: [],
          totalSessions: 0,
          totalHours: 0
        });
      }

      const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);

      res.json({
        message: 'All study sessions',
        sessions: rows,
        totalSessions: rows.length,
        totalHours: totalHours.toFixed(1)
      });
    }
  );
});

// GET /streak - Get current streak
app.get('/streak', (req, res) => {
  db.all(
    'SELECT COUNT(*) as total FROM sessions',
    (err, result) => {
      calculateStreak((streak) => {
        res.json({
          currentStreak: streak,
          totalSessions: result[0].total,
          message: streak > 0 
            ? `You're on a ${streak}-day streak! Keep it up! 🔥` 
            : 'No active streak yet. Start studying today!'
        });
      });
    }
  );
});

// DELETE /study/:id - Delete session
app.delete('/study/:id', (req, res) => {
  const id = req.params.id;

  db.run(
    'DELETE FROM sessions WHERE id = ?',
    [id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete session' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({ message: 'Session deleted successfully' });
    }
  );
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Study Streak Tracker API (SQLite)',
    endpoints: {
      'POST /study': 'Add a new study session',
      'GET /study': 'View all study sessions',
      'GET /streak': 'Get current streak',
      'DELETE /study/:id': 'Delete a session'
    }
  });
});

// Error handling
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🔥 Study Streak Tracker (SQLite) running on http://localhost:${PORT}`);
});