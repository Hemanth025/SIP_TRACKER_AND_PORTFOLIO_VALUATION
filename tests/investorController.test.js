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
const { pool } = require("../utility/pgManager.js");
const { redisClient } = require("../utility/redis.js");

// ─────────────────────────────────────────────────────────────────────────────
// INVESTOR CONTROLLER — displayInvestors
// ─────────────────────────────────────────────────────────────────────────────
describe("InvestorController — displayInvestors", () => {
    beforeEach(() => jest.clearAllMocks());

    const mockInvestors = [
        { investor_id: 1, first_name: "Alice", last_name: "Smith" },
        { investor_id: 2, first_name: "Bob",   last_name: "Jones" }
    ];

    test("200 — returns investors from Redis cache when available", async () => {
        redisClient.get.mockResolvedValue(JSON.stringify(mockInvestors));

        const res = await request(app).get("/api/investors");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(mockInvestors);
        expect(redisClient.get).toHaveBeenCalledWith("all_investors");
        expect(pool.query).not.toHaveBeenCalled();    // DB skipped on cache hit
    });

    test("200 — fetches investors from DB on cache miss and caches them", async () => {
        redisClient.get.mockResolvedValue(null);       // cache miss
        pool.query.mockResolvedValue({ rows: mockInvestors });
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app).get("/api/investors");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(mockInvestors);
        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(redisClient.set).toHaveBeenCalledWith(
            "all_investors",
            JSON.stringify(mockInvestors),
            { EX: 3600 }
        );
    });

    test("500 — returns 500 on DB error", async () => {
        redisClient.get.mockResolvedValue(null);
        pool.query.mockRejectedValue(new Error("Connection pool exhausted"));

        const res = await request(app).get("/api/investors");

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/Error Fetching Investors/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// INVESTOR CONTROLLER — getInvestorById
// ─────────────────────────────────────────────────────────────────────────────
describe("InvestorController — getInvestorById", () => {
    beforeEach(() => jest.clearAllMocks());

    const mockInvestor = {
        investor_id: 1,
        first_name: "Test",
        last_name: "User",
        email: "test@example.com"
    };

    test("200 — returns investor from cache when available", async () => {
        redisClient.get.mockResolvedValue(JSON.stringify(mockInvestor));

        const res = await request(app).get("/api/investors/1");

        expect(res.statusCode).toBe(200);
        expect(res.body.data).toEqual(mockInvestor);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test("200 — fetches investor from DB on cache miss", async () => {
        redisClient.get.mockResolvedValue(null);
        pool.query.mockResolvedValue({ rows: [mockInvestor] });
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app).get("/api/investors/1");

        expect(res.statusCode).toBe(200);
        expect(res.body.data).toEqual(mockInvestor);
        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(redisClient.set).toHaveBeenCalledWith(
            "investor_1",
            JSON.stringify(mockInvestor),
            { EX: 3600 }
        );
    });

    test("403 — returns 403 when requesting another investor's data", async () => {
        // req.user.investor_id = 1 but requesting investor_id = 999
        const res = await request(app).get("/api/investors/999");

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toMatch(/Unauthorized/i);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test("404 — returns 404 when investor not found in DB", async () => {
        redisClient.get.mockResolvedValue(null);
        pool.query.mockResolvedValue({ rows: [] }); // no results

        const res = await request(app).get("/api/investors/1");

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toMatch(/not found/i);
    });

    test("500 — returns 500 on DB error", async () => {
        redisClient.get.mockResolvedValue(null);
        pool.query.mockRejectedValue(new Error("DB timeout"));

        const res = await request(app).get("/api/investors/1");

        expect(res.statusCode).toBe(500);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// INVESTOR CONTROLLER — getInvestorHoldings
// ─────────────────────────────────────────────────────────────────────────────
describe("InvestorController — getInvestorHoldings", () => {
    beforeEach(() => jest.clearAllMocks());

    const mockHoldings = [
        {
            holding_id: 1,
            fund_name: "Bluechip Fund",
            total_units: 100,
            current_value: 12000
        }
    ];

    test("200 — returns holdings from cache when available", async () => {
        redisClient.get.mockResolvedValue(JSON.stringify(mockHoldings));

        const res = await request(app).get("/api/investors/1/holdings");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(mockHoldings);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test("200 — fetches holdings from DB on cache miss", async () => {
        redisClient.get.mockResolvedValue(null);
        pool.query.mockResolvedValue({ rows: mockHoldings });
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app).get("/api/investors/1/holdings");

        expect(res.statusCode).toBe(200);
        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(redisClient.set).toHaveBeenCalledWith(
            "holdings_1",
            JSON.stringify(mockHoldings),
            { EX: 3600 }
        );
    });

    test("500 — returns 500 on DB error", async () => {
        redisClient.get.mockResolvedValue(null);
        pool.query.mockRejectedValue(new Error("Query failed"));

        const res = await request(app).get("/api/investors/1/holdings");

        expect(res.statusCode).toBe(500);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// INVESTOR CONTROLLER — getInvestorNetWorth
// ─────────────────────────────────────────────────────────────────────────────
describe("InvestorController — getInvestorNetWorth", () => {
    beforeEach(() => jest.clearAllMocks());

    const mockNetWorth = [
        {
            investor_id: 1,
            first_name: "Test",
            last_name: "User",
            fund_name: "Bluechip Fund",
            total_units: "100",
            nav_value: "120.00",
            current_value: "12000.00"
        }
    ];

    test("200 — returns networth from cache when available", async () => {
        const cached = {
            investor_id: 1,
            investor_name: "Test User",
            holdings: mockNetWorth,
            totalNetWorth: "12000.00"
        };
        redisClient.get.mockResolvedValue(JSON.stringify(cached));

        const res = await request(app).get("/api/investors/1/networth");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(cached);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test("200 — computes networth from DB on cache miss", async () => {
        redisClient.get.mockResolvedValue(null);
        pool.query.mockResolvedValue({ rows: mockNetWorth });
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app).get("/api/investors/1/networth");

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ investor_id: 1, investor_name: "Test User" });
        expect(typeof res.body.totalNetWorth).toBe("string");
        expect(parseFloat(res.body.totalNetWorth)).toBeCloseTo(12000, 0);
    });

    test("404 — returns 404 when investor has no holdings", async () => {
        redisClient.get.mockResolvedValue(null);
        pool.query.mockResolvedValue({ rows: [] });

        const res = await request(app).get("/api/investors/1/networth");

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toMatch(/not found/i);
    });

    test("500 — returns 500 on DB error", async () => {
        redisClient.get.mockResolvedValue(null);
        pool.query.mockRejectedValue(new Error("DB failure"));

        const res = await request(app).get("/api/investors/1/networth");

        expect(res.statusCode).toBe(500);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCANNON BENCHMARK — Investor endpoints
// ─────────────────────────────────────────────────────────────────────────────
describe("InvestorController — Autocannon Benchmarks", () => {
    let server;
    let port;

    const mockInvestors = [
        { investor_id: 1, first_name: "Alice" },
        { investor_id: 2, first_name: "Bob" }
    ];

    beforeAll((done) => {
        redisClient.get.mockResolvedValue(JSON.stringify(mockInvestors));
        server = app.listen(0, () => {
            port = server.address().port;
            done();
        });
    });

    afterAll(() => new Promise((resolve) => server.close(resolve)));

    test("GET /api/investors sustains ≥ 100 req/s with p99 < 200ms", (done) => {
        const autocannon = require("autocannon");

        const instance = autocannon(
            {
                url: `http://localhost:${port}/api/investors`,
                connections: 10,
                duration: 3,
                pipelining: 1
            },
            (err, result) => {
                if (err) return done(err);

                console.log("\n📊 [Autocannon] GET /api/investors");
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

    test("GET /api/investors/:id sustains ≥ 100 req/s with p99 < 200ms", (done) => {
        const autocannon = require("autocannon");

        const cached = { investor_id: 1, first_name: "Test", last_name: "User", email: "test@example.com" };
        redisClient.get.mockResolvedValue(JSON.stringify(cached));

        const instance = autocannon(
            {
                url: `http://localhost:${port}/api/investors/1`,
                connections: 10,
                duration: 3,
                pipelining: 1
            },
            (err, result) => {
                if (err) return done(err);

                console.log("\n📊 [Autocannon] GET /api/investors/1");
                console.log(`  Requests/sec  : ${result.requests.average}`);
                console.log(`  Latency p99   : ${result.latency.p99} ms`);

                expect(result.requests.average).toBeGreaterThanOrEqual(100);
                expect(result.latency.p99).toBeLessThan(200);
                done();
            }
        );

        autocannon.track(instance, { renderProgressBar: false });
    }, 15000);
});
