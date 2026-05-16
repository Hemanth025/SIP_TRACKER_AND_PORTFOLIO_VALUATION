const db = require("../utility/pgManager");

const toNumber = (value) => Number(value || 0);

const getDashboardData = async (req, res) => {
    try {
        const investorId = req.user.investorId;

        const latestNavQuery = `
            SELECT DISTINCT ON (fund_id)
                fund_id,
                nav_value,
                nav_date
            FROM fund_nav_history
            ORDER BY fund_id, nav_date DESC
        `;

        const summaryQuery = `
            SELECT
                (
                    SELECT COALESCE(SUM(transaction_amount), 0)
                    FROM investment_transactions
                    WHERE investor_id = $1
                ) AS total_investment,
                (
                    SELECT COALESCE(SUM(sip_amount), 0)
                    FROM sips
                    WHERE investor_id = $1
                    AND sip_status = 'ACTIVE'
                ) AS monthly_sip,
                (
                    SELECT COUNT(*)
                    FROM sips
                    WHERE investor_id = $1
                    AND sip_status = 'ACTIVE'
                ) AS active_sips,
                (
                    SELECT COUNT(*)
                    FROM investment_transactions
                    WHERE investor_id = $1
                ) AS total_transactions,
                (
                    SELECT COUNT(*)
                    FROM holdings
                    WHERE investor_id = $1
                ) AS active_funds,
                (
                    SELECT COALESCE(SUM(h.total_units * COALESCE(latest_nav.nav_value, h.average_purchase_nav, 0)), 0)
                    FROM holdings h
                    LEFT JOIN (${latestNavQuery}) latest_nav
                    ON h.fund_id = latest_nav.fund_id
                    WHERE h.investor_id = $1
                ) AS current_value
        `;

        const transactionsQuery = `
            SELECT
                it.transaction_id,
                mf.fund_name,
                mf.fund_type,
                it.transaction_amount,
                it.transaction_date,
                it.transaction_type,
                it.nav_value,
                it.units
            FROM investment_transactions it
            JOIN mutual_funds mf
                ON it.fund_id = mf.fund_id
            WHERE it.investor_id = $1
            ORDER BY it.transaction_date DESC
            LIMIT 50
        `;

        const holdingsQuery = `
            SELECT
                h.holding_id,
                h.fund_id,
                mf.fund_name,
                mf.fund_type,
                h.total_units,
                h.average_purchase_nav,
                COALESCE(latest_nav.nav_value, h.average_purchase_nav, 0) AS latest_nav,
                latest_nav.nav_date,
                h.total_units * h.average_purchase_nav AS invested_value,
                h.total_units * COALESCE(latest_nav.nav_value, h.average_purchase_nav, 0) AS current_value
            FROM holdings h
            JOIN mutual_funds mf
            ON h.fund_id = mf.fund_id
            LEFT JOIN (${latestNavQuery}) latest_nav
            ON h.fund_id = latest_nav.fund_id
            WHERE h.investor_id = $1
            ORDER BY current_value DESC
        `;

        const trendQuery = `
            SELECT *
            FROM (
                SELECT
                    date_trunc('month', transaction_date) AS month_start,
                    to_char(date_trunc('month', transaction_date), 'Mon YYYY') AS month,
                    COALESCE(SUM(transaction_amount), 0) AS amount,
                    COUNT(*) AS transaction_count
                FROM investment_transactions
                WHERE investor_id = $1
                GROUP BY date_trunc('month', transaction_date)
                ORDER BY month_start DESC
                LIMIT 6
            ) monthly
            ORDER BY month_start ASC
        `;

        const [
            summaryResult,
            transactionsResult,
            holdingsResult,
            trendResult
        ] = await Promise.all([
            db.query(summaryQuery, [investorId]),
            db.query(transactionsQuery, [investorId]),
            db.query(holdingsQuery, [investorId]),
            db.query(trendQuery, [investorId])
        ]);

        const summary = summaryResult.rows[0];
        const totalInvestment = toNumber(summary.total_investment);
        const currentValue = toNumber(summary.current_value);
        const totalReturns = currentValue - totalInvestment;
        const monthlySip = toNumber(summary.monthly_sip);

        const holdings = holdingsResult.rows.map((holding) => ({
            ...holding,
            total_units: toNumber(holding.total_units),
            average_purchase_nav: toNumber(holding.average_purchase_nav),
            latest_nav: toNumber(holding.latest_nav),
            invested_value: toNumber(holding.invested_value),
            current_value: toNumber(holding.current_value),
            returns: toNumber(holding.current_value) - toNumber(holding.invested_value)
        }));

        const allocation = holdings.map((holding) => ({
            fund_id: holding.fund_id,
            fund_name: holding.fund_name,
            fund_type: holding.fund_type,
            current_value: holding.current_value,
            percentage: currentValue > 0
                ? Number(((holding.current_value / currentValue) * 100).toFixed(2))
                : 0
        }));

        const transactions = transactionsResult.rows.map((transaction) => ({
            ...transaction,
            transaction_amount: toNumber(transaction.transaction_amount),
            nav_value: toNumber(transaction.nav_value),
            units: toNumber(transaction.units)
        }));

        const monthlyTrend = trendResult.rows.map((trend) => ({
            month: trend.month,
            amount: toNumber(trend.amount),
            transaction_count: toNumber(trend.transaction_count)
        }));

        return res.status(200).json({
            totalInvestment,
            currentValue,
            totalReturns,
            monthlySip,
            activeSips: toNumber(summary.active_sips),
            activeFunds: toNumber(summary.active_funds),
            totalTransactions: toNumber(summary.total_transactions),
            allocation,
            holdings,
            monthlyTrend,
            transactions,
            recentTransactions: transactions.slice(0, 5)
        });

    } catch (error) {

        return res.status(500).json({
            message: error.message
        });
    }
};

module.exports = {
    getDashboardData
};
