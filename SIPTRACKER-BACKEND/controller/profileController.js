const db = require("../utility/pgManager");
const { getOrCreatePortfolioId } = require("../utility/portfolioManager");

const getProfile = async (req, res) => {
    try {
        const investorId = req.user.investorId;
        const portfolioId = await getOrCreatePortfolioId(investorId);
        const query = (`SELECT
            i.*,
            u.email,
            $2::int AS portfolio_id
            FROM investors i
            JOIN users u
            ON i.user_id = u.user_id
            WHERE i.investor_id = $1`);
        const result =
            await db.query(query, [investorId, portfolioId]);
        return res.status(200).json({
            user: result.rows[0]
        });

    } catch (error) {

        return res.status(500).json({
            message: error.message
        });
    }
};

module.exports = {
    getProfile
};
