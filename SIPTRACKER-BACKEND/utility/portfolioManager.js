const db = require("./pgManager");

const getOrCreatePortfolioId = async (investorId, client = db) => {
    const existingPortfolio = await client.query(
        `SELECT portfolio_id FROM portfolios WHERE investor_id = $1 LIMIT 1`,
        [investorId]
    );

    if (existingPortfolio.rows.length > 0) {
        return existingPortfolio.rows[0].portfolio_id;
    }

    const createdPortfolio = await client.query(
        `INSERT INTO portfolios (investor_id) VALUES ($1) RETURNING portfolio_id`,
        [investorId]
    );

    return createdPortfolio.rows[0].portfolio_id;
};

module.exports = {
    getOrCreatePortfolioId
};
