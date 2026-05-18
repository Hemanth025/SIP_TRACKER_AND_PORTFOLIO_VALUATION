const db = require('../utility/dbManager.js');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const JWT_SECRET = "your_secret_key";


const createInvestor = (name, email, password) => {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO investors (name, email, password, ) VALUES (?, ?, ?)`;
    db.run(query, [name, email, password], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
};

const getInvestorByEmail = (email) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM investors WHERE email = ?`;
    db.get(query, [email], (err, row) => {
      if (err) {
        reject(err);
      }else{
        resolve(row);
      }
    });
  });
};

const getInvestorById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM investors WHERE id = ?`;
    db.get(query, [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

const deleteInvestorById = (id) => {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM investors WHERE id = ?`;
    db.run(query, [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
    });
  });
}


module.exports = {
  createInvestor,
  getInvestorByEmail,
  getInvestorById,
  deleteInvestorById, 
};