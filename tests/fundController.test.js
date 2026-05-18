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
        req.user = { investorId: 1, investor_id: 1, email: "test@example.com" };
        next();
    })
);

// ─── Imports ─────────────────────────────────────────────────────────────────
const request  = require("supertest");
const app      = require("../server");
const db       = require("../utility/pgManager.js");
const { redisClient } = require("../utility/redis.js");

// ─────────────────────────────────────────────────────────────────────────────
// FUND CONTROLLER — createFund
// ─────────────────────────────────────────────────────────────────────────────
describe("FundController — createFund", () => {
    beforeEach(() => jest.clearAllMocks());

    const validBody = {
        amc_id: 1,
        fund_name: "Bluechip Growth Fund",
        fund_code: "BGF001",
        fund_type: "Equity"
    };

    test("201 — creates fund successfully and clears cache", async () => {
        db.query.mockResolvedValue({ rows: [{ fund_id: 10 }] });
        redisClient.del.mockResolvedValue(1);

        const res = await request(app).post("/api/funds").send(validBody);

        expect(res.statusCode).toBe(201);
        expect(res.body.message).toMatch(/Fund Created Successfully/i);
        expect(res.body.fund_id).toBe(10);
        expect(redisClient.del).toHaveBeenCalledWith("all_funds");
        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining("INSERT INTO mutual_funds"),
            [1, "Bluechip Growth Fund", "BGF001", "Equity"]
        );
    });

    test("201 — creates fund with only required fields", async () => {
        db.query.mockResolvedValue({ rows: [{ fund_id: 11 }] });
        redisClient.del.mockResolvedValue(1);

        const res = await request(app).post("/api/funds").send({
            amc_id: 2,
            fund_name: "Debt Fund",
            fund_code: "DF001",
            fund_type: "Debt"
        });

        expect(res.statusCode).toBe(201);
        expect(res.body.fund_id).toBe(11);
    });

    test("500 — returns 500 on DB insert error", async () => {
        db.query.mockRejectedValue(new Error("Unique constraint violation"));

        const res = await request(app).post("/api/funds").send(validBody);

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/Error Creating Fund/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// FUND CONTROLLER — getFunds
// ─────────────────────────────────────────────────────────────────────────────
describe("FundController — getFunds", () => {
    beforeEach(() => jest.clearAllMocks());

    const mockFunds = [
        { fund_id: 1, fund_name: "Bluechip Fund", amc_name: "SBI MF", fund_type: "Equity" },
        { fund_id: 2, fund_name: "Debt Fund",     amc_name: "HDFC MF", fund_type: "Debt" }
    ];

    test("200 — returns funds from Redis cache when available", async () => {
        redisClient.get.mockResolvedValue(JSON.stringify(mockFunds));

        const res = await request(app).get("/api/funds");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(mockFunds);
        expect(redisClient.get).toHaveBeenCalledWith("all_funds");
        expect(db.query).not.toHaveBeenCalled();
    });

    test("200 — fetches funds from DB on cache miss and caches them", async () => {
        redisClient.get.mockResolvedValue(null);
        db.query.mockResolvedValue({ rows: mockFunds });
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app).get("/api/funds");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(mockFunds);
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(redisClient.set).toHaveBeenCalledWith(
            "all_funds",
            JSON.stringify(mockFunds),
            { EX: 3600 }
        );
    });

    test("200 — returns empty array when no funds exist", async () => {
        redisClient.get.mockResolvedValue(null);
        db.query.mockResolvedValue({ rows: [] });
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app).get("/api/funds");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([]);
    });

    test("500 — returns 500 on DB error", async () => {
        redisClient.get.mockResolvedValue(null);
        db.query.mockRejectedValue(new Error("Network timeout"));

        const res = await request(app).get("/api/funds");

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/Error Fetching funds/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// FUND CONTROLLER — updateFund
// ─────────────────────────────────────────────────────────────────────────────
describe("FundController — updateFund", () => {
    beforeEach(() => jest.clearAllMocks());

    const updateBody = { nav_value: 121.45, nav_date: "2026-05-15" };

    test("201 — updates NAV and invalidates related caches", async () => {
        db.query.mockResolvedValue({ rows: [{ nav_id: 77 }] });
        redisClient.del.mockResolvedValue(1);

        const res = await request(app).put("/api/funds/5").send(updateBody);

        expect(res.statusCode).toBe(201);
        expect(res.body.message).toMatch(/Fund Updated Successfully/i);
        expect(res.body.nav_id).toBe(77);

        // Both caches must be busted
        expect(redisClient.del).toHaveBeenCalledWith("all_funds");
        expect(redisClient.del).toHaveBeenCalledWith("fund_nav_5");
        expect(redisClient.del).toHaveBeenCalledTimes(2);
    });

    test("201 — inserts NAV record with correct params", async () => {
        db.query.mockResolvedValue({ rows: [{ nav_id: 78 }] });
        redisClient.del.mockResolvedValue(1);

        await request(app).put("/api/funds/5").send(updateBody);

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining("INSERT INTO fund_nav_history"),
            ["5", 121.45, "2026-05-15"]
        );
    });

    test("500 — returns 500 on DB insert error", async () => {
        db.query.mockRejectedValue(new Error("FK constraint violation"));

        const res = await request(app).put("/api/funds/5").send(updateBody);

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/Error updating the fund/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCANNON BENCHMARK — Fund endpoints
// ─────────────────────────────────────────────────────────────────────────────
describe("FundController — Autocannon Benchmarks", () => {
    let server;
    let port;

    const mockFunds = [
        { fund_id: 1, fund_name: "Bluechip Fund", amc_name: "SBI MF" }
    ];

    beforeAll((done) => {
        redisClient.get.mockResolvedValue(JSON.stringify(mockFunds));
        server = app.listen(0, () => {
            port = server.address().port;
            done();
        });
    });

    afterAll(() => new Promise((resolve) => server.close(resolve)));

    test("GET /api/funds sustains ≥ 100 req/s with p99 < 200ms (cache hit)", (done) => {
        const autocannon = require("autocannon");

        const instance = autocannon(
            {
                url: `http://localhost:${port}/api/funds`,
                connections: 10,
                duration: 3,
                pipelining: 1
            },
            (err, result) => {
                if (err) return done(err);

                console.log("\n📊 [Autocannon] GET /api/funds");
                console.log(`  Requests/sec  : ${result.requests.average}`);
                console.log(`  Latency p99   : ${result.latency.p99} ms`);
                console.log(`  Throughput    : ${(result.throughput.average / 1024).toFixed(1)} KB/s`);

                expect(result.requests.average).toBeGreaterThanOrEqual(100);
                expect(result.latency.p99).toBeLessThan(200);
                done();
            }
        );

        autocannon.track(instance, { renderProgressBar: false });
    }, 15000);
});
