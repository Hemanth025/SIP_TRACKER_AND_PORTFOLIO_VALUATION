const express = require("express");
const { loginUser } = require("../model/InvestorModel");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool } = require("../utility/pgManager.js");
const {redisClient} = require("../utility/redis.js");
const { successResponse, errorResponse } = require("../utility/responseHandler.js");


const displayInvestors= async (req, res) => {
  try {
    const cachedInvestors = await redisClient.get("all_investors");
    if(cachedInvestors){
      console.log("Investors fetched from Redis.. ");
      return res.status(200).json(JSON.parse(cachedInvestors));
    }

    const query = (`SELECT * FROM investors`);
    const result = await pool.query(query);
    await redisClient.set("all_investors", JSON.stringify(result.rows), {EX: 3600});
    console.log("Investors stored in Redis.. ");
    return res.status(200).json(result.rows);
  } catch (err) {
    return res.status(500).json({message : "Error Fetching Investors.. ", error: err.message});
  }
}


const getInvestorById = async (req, res) => {
  try {
    const investor_id = req.params.investor_id;

    if(req.user.investor_id !== Number(investor_id)){
    return errorResponse(
        res,
        403,
        "Unauthorized access"
    );}

    const cachedInvestor = await redisClient.get(`investor_${investor_id}`);
    if(cachedInvestor){
      console.log("Investor fetched from Redis.. ");
      return successResponse(res, 200, "Investor fetched from Redis cache", JSON.parse(cachedInvestor));
    }

    const query = (`
            SELECT
                i.investor_id,
                i.user_id,
                i.first_name,
                i.last_name,
                i.phone,
                i.dob,
                i.pan_number,
                i.adhaar_number,
                i.address,
                u.email
            FROM investors i
            INNER JOIN users u
            ON i.user_id = u.user_id
            WHERE i.investor_id = $1
            `);
    const result = await pool.query(query, [investor_id]);

    if(result.rows.length === 0){
      return errorResponse(
    res,
    404,
    "Investor not found"
);
    }

    await redisClient.set(`investor_${investor_id}`, JSON.stringify(result.rows[0]), {EX: 3600});
    console.log("Investor stored in Redis.. ");
    return successResponse(res, 200, "Investor fetched successfully", result.rows[0]);
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
}

const getInvestorHoldings = async (req, res) => {
  try {
    const investor_id = req.params.investor_id;
    const cachedHoldings = await redisClient.get(`holdings_${investor_id}`);

    if(cachedHoldings){
      console.log("Holdings fetched from Redis.. ");
      return res.status(200).json(JSON.parse(cachedHoldings));
    }

    const query = `SELECT
                    h.*,
                    mf.fund_name,
                    mf.fund_type,
                    COALESCE(latest_nav.nav_value, h.average_purchase_nav, 0) AS latest_nav,
                    latest_nav.nav_date,
                    h.total_units * COALESCE(latest_nav.nav_value, h.average_purchase_nav, 0) AS current_value
                   FROM holdings h
                   JOIN mutual_funds mf ON h.fund_id = mf.fund_id
                   LEFT JOIN (
                    SELECT DISTINCT ON (fund_id)
                      fund_id,
                      nav_value,
                      nav_date
                    FROM fund_nav_history
                    ORDER BY fund_id, nav_date DESC
                   ) latest_nav ON h.fund_id = latest_nav.fund_id
                   WHERE h.investor_id = $1
                   ORDER BY current_value DESC`;  
    const result = await pool.query(query, [investor_id]);

    await redisClient.set(`holdings_${investor_id}`, JSON.stringify(result.rows), {EX: 3600});
    console.log("Holdings stored in Redis");
    
    return successResponse(res, 200, "Investor Fetched Successfully.. ", result.rows[0]);  
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
}

const getInvestorNetWorth = async (req, res) => {
  try {
    const investor_id = req.params.investor_id;
    const cachedNetWorth = await redisClient.get(`networth_${investor_id}`);

    if(cachedNetWorth){
      console.log("Net Worth fetched from Redis..");
      return res.status(200).json(JSON.parse(cachedNetWorth));
    }

    const query = `SELECT i.investor_id, i.first_name, i.last_name, mf.fund_name, h.total_units, nav.nav_value, ROUND((h.total_units * nav.nav_value)::numeric, 2) AS current_value
    FROM investors i JOIN holdings h ON i.investor_id = h.investor_id 
    JOIN mutual_funds mf ON h.fund_id = mf.fund_id
    JOIN fund_nav_history nav ON mf.fund_id = nav.fund_id
    WHERE i.investor_id = $1`;
    const result = await pool.query(query, [investor_id]);

    if(result.rows.length === 0){
      return res.status(404).json({message : "Investor holding not found.. "});
    }

    let totalNetWorth = 0;
    result.rows.forEach((row) => {
      totalNetWorth += parseFloat(row.current_value);
    });

    const responseData = {
      investor_id : result.rows[0].investor_id,
      investor_name : result.rows[0].first_name + " " + result.rows[0].last_name,
      holdings : result.rows,
      totalNetWorth : totalNetWorth.toFixed(2)
    };
    
    await redisClient.set(
      `networth_${investor_id}`,
      JSON.stringify(responseData), {EX: 3600}
    );
    console.log("Net Worth stored in Redis..");
    return res.status(200).json(responseData);
  } catch (error) {
    return res.status(500).json({message : error.message});
  }
}

module.exports = {
  displayInvestors,
  getInvestorById,
  getInvestorHoldings,
  getInvestorNetWorth
};
