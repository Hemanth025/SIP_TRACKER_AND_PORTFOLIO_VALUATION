// ─── Mock ALL external deps before any require() ────────────────────────────
jest.mock("../utility/pgManager.js", () => ({
    query: jest.fn(),
    pool: { query: jest.fn() },
    connect: jest.fn()
}));

jest.mock("../utility/redis.js", () => ({
    redisClient: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn()
    },
    connectRedis: jest.fn()
}));

// Bypass auth middleware
jest.mock("../middlewares/authMiddleware.js", () =>
    jest.fn((req, res, next) => {
        req.user = { investorId: 42, investor_id: 42, email: "dash@example.com" };
        next();
    })
);

// ─── Imports ─────────────────────────────────────────────────────────────────
const request = require("supertest");
const app     = require("../server");
const db      = require("../utility/pgManager.js");

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock data helpers
// ─────────────────────────────────────────────────────────────────────────────
const buildSummary = (overrides = {}) => ({
    total_investment: "50000",
    monthly_sip: "5000",
    active_sips: "3",
    total_transactions: "12",
    active_funds: "4",
    current_value: "58000",
    ...overrides
});

const mockTransactions = [
    {
        transaction_id: 1,
        fund_name: "Bluechip Fund",
        fund_type: "Equity",
        transaction_amount: "5000",
        transaction_date: "2026-05-15T00:00:00.000Z",
        transaction_type: "BUY",
        nav_value: "100",
        units: "50"
    }
];

const mockHoldings = [
    {
        holding_id: 1,
        fund_id: 3,
        fund_name: "Bluechip Fund",
        fund_type: "Equity",
        total_units: "100",
        average_purchase_nav: "95",
        latest_nav: "105",
        nav_date: "2026-05-15",
        invested_value: "9500",
        current_value: "10500"
    }
];

const mockTrend = [
    { month_start: "2026-04-01", month: "Apr 2026", amount: "10000", transaction_count: "4" },
    { month_start: "2026-05-01", month: "May 2026", amount: "5000",  transaction_count: "2" }
];

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD CONTROLLER — getDashboardData
// ─────────────────────────────────────────────────────────────────────────────
describe("DashboardController — getDashboardData", () => {
    beforeEach(() => jest.clearAllMocks());

    // Helper: seed db.query with 4 parallel calls (summaryQuery, transactionsQuery, holdingsQuery, trendQuery)
    const seedSuccessQueries = (summaryOverrides = {}) => {
        db.query
            .mockResolvedValueOnce({ rows: [buildSummary(summaryOverrides)] })  // summaryQuery
            .mockResolvedValueOnce({ rows: mockTransactions })                  // transactionsQuery
            .mockResolvedValueOnce({ rows: mockHoldings })                      // holdingsQuery
            .mockResolvedValueOnce({ rows: mockTrend });                        // trendQuery
    };

    // ── Happy path ────────────────────────────────────────────────────────────
    test("200 — returns complete dashboard data with correct shape", async () => {
        seedSuccessQueries();

        const res = await request(app).get("/api/dashboard");

        expect(res.statusCode).toBe(200);

        // Top-level numeric fields
        expect(res.body.totalInvestment).toBe(50000);
        expect(res.body.currentValue).toBe(58000);
        expect(res.body.totalReturns).toBe(8000);          // currentValue - totalInvestment
        expect(res.body.monthlySip).toBe(5000);
        expect(res.body.activeSips).toBe(3);
        expect(res.body.activeFunds).toBe(4);
        expect(res.body.totalTransactions).toBe(12);

        // Arrays present
        expect(Array.isArray(res.body.holdings)).toBe(true);
        expect(Array.isArray(res.body.allocation)).toBe(true);
        expect(Array.isArray(res.body.transactions)).toBe(true);
        expect(Array.isArray(res.body.monthlyTrend)).toBe(true);
        expect(Array.isArray(res.body.recentTransactions)).toBe(true);
    });

    test("200 — transactions are mapped to numeric types", async () => {
        seedSuccessQueries();

        const res = await request(app).get("/api/dashboard");

        expect(res.statusCode).toBe(200);
        const txn = res.body.transactions[0];
        expect(typeof txn.transaction_amount).toBe("number");
        expect(typeof txn.nav_value).toBe("number");
        expect(typeof txn.units).toBe("number");
    });

    test("200 — holdings are mapped to numeric types with returns calculated", async () => {
        seedSuccessQueries();

        const res = await request(app).get("/api/dashboard");

        const holding = res.body.holdings[0];
        expect(typeof holding.total_units).toBe("number");
        expect(typeof holding.average_purchase_nav).toBe("number");
        expect(typeof holding.latest_nav).toBe("number");
        expect(typeof holding.invested_value).toBe("number");
        expect(typeof holding.current_value).toBe("number");
        expect(typeof holding.returns).toBe("number");
        expect(holding.returns).toBe(holding.current_value - holding.invested_value);
    });

    test("200 — allocation percentages sum to ~100% (or 0 if no value)", async () => {
        // Use summary current_value that exactly equals the single holding's current_value
        // so the one holding gets 100% of the allocation
        db.query
            .mockResolvedValueOnce({ rows: [buildSummary({ current_value: "10500" })] })  // matches holding
            .mockResolvedValueOnce({ rows: mockTransactions })
            .mockResolvedValueOnce({ rows: mockHoldings })
            .mockResolvedValueOnce({ rows: mockTrend });

        const res = await request(app).get("/api/dashboard");

        const totalPct = res.body.allocation.reduce((sum, a) => sum + a.percentage, 0);
        expect(totalPct).toBeCloseTo(100, 0);
    });

    test("200 — recentTransactions contains at most 5 items", async () => {
        // Seed 10 transactions
        const tenTxns = Array.from({ length: 10 }, (_, i) => ({
            ...mockTransactions[0],
            transaction_id: i + 1
        }));

        db.query
            .mockResolvedValueOnce({ rows: [buildSummary()] })
            .mockResolvedValueOnce({ rows: tenTxns })
            .mockResolvedValueOnce({ rows: mockHoldings })
            .mockResolvedValueOnce({ rows: mockTrend });

        const res = await request(app).get("/api/dashboard");

        expect(res.statusCode).toBe(200);
        expect(res.body.recentTransactions.length).toBeLessThanOrEqual(5);
    });

    test("200 — monthlyTrend is ordered chronologically", async () => {
        seedSuccessQueries();

        const res = await request(app).get("/api/dashboard");

        const months = res.body.monthlyTrend.map((t) => t.month);
        expect(months).toEqual(["Apr 2026", "May 2026"]);
    });

    test("200 — handles investor with zero investments gracefully", async () => {
        db.query
            .mockResolvedValueOnce({
                rows: [buildSummary({
                    total_investment: "0",
                    monthly_sip: "0",
                    active_sips: "0",
                    total_transactions: "0",
                    active_funds: "0",
                    current_value: "0"
                })]
            })
            .mockResolvedValueOnce({ rows: [] })   // transactions
            .mockResolvedValueOnce({ rows: [] })   // holdings
            .mockResolvedValueOnce({ rows: [] });  // trend

        const res = await request(app).get("/api/dashboard");

        expect(res.statusCode).toBe(200);
        expect(res.body.totalInvestment).toBe(0);
        expect(res.body.currentValue).toBe(0);
        expect(res.body.totalReturns).toBe(0);
        expect(res.body.allocation).toEqual([]);
        expect(res.body.holdings).toEqual([]);
    });

    // ── allocation percentage when currentValue is 0 ─────────────────────────
    test("200 — allocation percentage is 0 when currentValue is 0", async () => {
        db.query
            .mockResolvedValueOnce({ rows: [buildSummary({ current_value: "0" })] })
            .mockResolvedValueOnce({ rows: mockTransactions })
            .mockResolvedValueOnce({ rows: mockHoldings })
            .mockResolvedValueOnce({ rows: mockTrend });

        const res = await request(app).get("/api/dashboard");

        expect(res.statusCode).toBe(200);
        res.body.allocation.forEach((a) => {
            expect(a.percentage).toBe(0);
        });
    });

    // ── DB error ──────────────────────────────────────────────────────────────
    test("500 — returns 500 when any DB query throws", async () => {
        db.query.mockRejectedValue(new Error("Promise.all failure — DB error"));

        const res = await request(app).get("/api/dashboard");

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/Promise.all failure/i);
    });

    test("500 — uses investorId from req.user when querying DB", async () => {
        seedSuccessQueries();

        await request(app).get("/api/dashboard");

        // All 4 parallel queries should pass investorId = 42 (from mocked middleware)
        db.query.mock.calls.forEach((call) => {
            expect(call[1]).toContain(42);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCANNON BENCHMARK — Dashboard endpoint
// ─────────────────────────────────────────────────────────────────────────────
describe("DashboardController — Autocannon Benchmarks", () => {
    let server;
    let port;

    beforeAll((done) => {
        // Seed fast responses for every incoming request
        db.query
            .mockResolvedValue({ rows: [buildSummary()] });

        server = app.listen(0, () => {
            port = server.address().port;
            done();
        });
    });

    afterAll(() => new Promise((resolve) => server.close(resolve)));

    test("GET /api/dashboard sustains ≥ 50 req/s with p99 < 300ms", (done) => {
        const autocannon = require("autocannon");

        // Re-seed for sustained load (mockResolvedValue works for all subsequent calls)
        db.query
            .mockResolvedValue({ rows: [buildSummary()] });

        const instance = autocannon(
            {
                url: `http://localhost:${port}/api/dashboard`,
                connections: 5,
                duration: 3,
                pipelining: 1
            },
            (err, result) => {
                if (err) return done(err);

                console.log("\n📊 [Autocannon] GET /api/dashboard");
                console.log(`  Requests/sec  : ${result.requests.average}`);
                console.log(`  Latency p99   : ${result.latency.p99} ms`);
                console.log(`  Throughput    : ${(result.throughput.average / 1024).toFixed(1)} KB/s`);

                expect(result.requests.average).toBeGreaterThanOrEqual(50);
                expect(result.latency.p99).toBeLessThan(300);
                done();
            }
        );

        autocannon.track(instance, { renderProgressBar: false });
    }, 15000);
});
