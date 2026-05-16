const db = require('../utility/pgManager.js');
const { redisClient } = require("../utility/redis.js");

const createFund = async(req, res) => {
    try{
        const { amc_id, fund_name, fund_code, fund_type} = req.body;
        const query = `INSERT INTO mutual_funds (amc_id, fund_name, fund_code, fund_type) VALUES ($1, $2, $3, $4) RETURNING fund_id`;
        const result = await db.query(query, [amc_id, fund_name, fund_code, fund_type]);

        await redisClient.del("all_funds");
        return res.status(201).json({message : "Fund Created Successfully.. ", fund_id : result.rows[0].fund_id});
    }catch(err){
        return res.status(500).json({message : "Error Creating Fund.. ", error : err.message});
    }
}

const getFunds = async(req, res) => {
    try {
        const cachedFunds = await redisClient.get("all_funds");

        if(cachedFunds){
            console.log("Funds fetched from Redis cache");
            return res.status(200).json(JSON.parse(cachedFunds));
        }

        const query = `SELECT mf.*, a.amc_name FROM mutual_funds mf
         JOIN amcs a ON mf.amc_id = a.amc_id`;
        const result = await db.query(query);

        await redisClient.set(
            "all_funds",
            JSON.stringify(result.rows), {EX : 3600}
        );
        console.log("Funds stored in Redis Cache.");
        return res.status(200).json(result.rows);
    } catch (error) {
        return res.status(500).json({message : "Error Fetching funds", error : error.message});
    }
}

const updateFund = async(req, res) => {
    try{
        const fund_id = req.params.fund_id;
        const { nav_value, nav_date} = req.body;
        const query = `INSERT INTO fund_nav_history(fund_id, nav_value, nav_date) VALUES ($1, $2, $3) RETURNING nav_id`;
        const result = await db.query(query, [fund_id, nav_value, nav_date]);

        await redisClient.del("all_funds");
        await redisClient.del(`fund_nav_${fund_id}`);
        return res.status(201).json({message : "Fund Updated Successfully.. ", nav_id : result.rows[0].nav_id,});
    }catch(err){
        console.log(err);
        return res.status(500).json({message : "Error updating the fund", error : err.message});
    }
}


module.exports = {
    createFund,
    getFunds,
    updateFund
}
