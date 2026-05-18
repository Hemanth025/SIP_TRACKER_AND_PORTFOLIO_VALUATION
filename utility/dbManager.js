const sqlite = require('sqlite3').verbose();

const db = new sqlite.Database(
  'C:/Users/DELL/Downloads/siptracker-db',
  (err) => {

    if (err) {

      if (process.env.NODE_ENV !== "test") {
        console.error('Error opening database:', err.message);
      }

    } else {

      if (process.env.NODE_ENV !== "test") {
        console.log('Connected to the SQLite database.');
      }

    }
  }
);

module.exports = db;