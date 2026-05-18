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

jest.mock("../utility/portfolioManager.js", () => ({
    getOrCreatePortfolioId: jest.fn()
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
const { getOrCreatePortfolioId } = require("../utility/portfolioManager.js");

// ─────────────────────────────────────────────────────────────────────────────
// SIP CONTROLLER — createSIP
// ─────────────────────────────────────────────────────────────────────────────
describe("SipController — createSIP", () => {
    beforeEach(() => jest.clearAllMocks());

    const validBody = {
        fund_id: 3,
        sip_amount: 1000,
        sip_date: 15,
        start_date: "2026-05-15",
        end_date: "2027-05-15"
    };

    test("201 — creates SIP successfully", async () => {
        getOrCreatePortfolioId.mockResolvedValue(42);
        db.query.mockResolvedValue({ rows: [{ sip_id: 99 }] });
        redisClient.del.mockResolvedValue(1);

        const res = await request(app).post("/api/sips").send(validBody);

        expect(res.statusCode).toBe(201);
        expect(res.body.message).toMatch(/SIP Created Successfully/i);
        expect(res.body.sip_id).toBe(99);
        expect(getOrCreatePortfolioId).toHaveBeenCalledWith(1); // investorId from req.user
        expect(redisClient.del).toHaveBeenCalledWith("sip_99");
    });

    test("400 — returns 400 when required fields are missing", async () => {
        getOrCreatePortfolioId.mockResolvedValue(42);

        // Missing end_date
        const res = await request(app).post("/api/sips").send({
            fund_id: 3,
            sip_amount: 1000,
            sip_date: 15,
            start_date: "2026-05-15"
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/required/i);
    });

    test("500 — returns 500 on DB error during creation", async () => {
        getOrCreatePortfolioId.mockResolvedValue(42);
        db.query.mockRejectedValue(new Error("Insert failed"));

        const res = await request(app).post("/api/sips").send(validBody);

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/Error Creating SIP/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SIP CONTROLLER — getAllSIPs
// ─────────────────────────────────────────────────────────────────────────────
describe("SipController — getAllSIPs", () => {
    beforeEach(() => jest.clearAllMocks());

    const mockSIPs = [
        { sip_id: 1, fund_name: "Bluechip Fund", sip_amount: 1000 },
        { sip_id: 2, fund_name: "Small Cap Fund", sip_amount: 2000 }
    ];

    test("200 — returns all SIPs for authenticated investor", async () => {
        db.query.mockResolvedValue({ rows: mockSIPs });

        const res = await request(app).get("/api/sips");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(mockSIPs);
        expect(db.query).toHaveBeenCalledTimes(1);
        // Verify investor_id filter is applied
        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining("investor_id"),
            [1]   // investorId from req.user
        );
    });

    test("200 — returns empty array when investor has no SIPs", async () => {
        db.query.mockResolvedValue({ rows: [] });

        const res = await request(app).get("/api/sips");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([]);
    });

    test("500 — returns 500 on DB error", async () => {
        db.query.mockRejectedValue(new Error("Connection lost"));

        const res = await request(app).get("/api/sips");

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/Error fetching SIPs/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SIP CONTROLLER — getSipById
// ─────────────────────────────────────────────────────────────────────────────
describe("SipController — getSipById", () => {
    beforeEach(() => jest.clearAllMocks());

    const mockSIP = { sip_id: 9, fund_name: "Bluechip Fund", sip_amount: 1000 };

    test("200 — returns SIP from cache when available", async () => {
        redisClient.get.mockResolvedValue(JSON.stringify(mockSIP));

        const res = await request(app).get("/api/sips/9");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(mockSIP);
        expect(db.query).not.toHaveBeenCalled();
        expect(redisClient.get).toHaveBeenCalledWith("sip_9");
    });

    test("200 — fetches SIP from DB on cache miss and caches it", async () => {
        redisClient.get.mockResolvedValue(null);
        db.query.mockResolvedValue({ rows: [mockSIP] });
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app).get("/api/sips/9");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(mockSIP);
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(redisClient.set).toHaveBeenCalledWith(
            "sip_9",
            JSON.stringify(mockSIP),
            { EX: 3600 }
        );
    });

    test("400 — returns 400 when SIP not found", async () => {
        redisClient.get.mockResolvedValue(null);
        db.query.mockResolvedValue({ rows: [] });

        const res = await request(app).get("/api/sips/9");

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/SIP Not Found/i);
    });

    test("500 — returns 500 on DB error", async () => {
        redisClient.get.mockResolvedValue(null);
        db.query.mockRejectedValue(new Error("Query error"));

        const res = await request(app).get("/api/sips/9");

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/Error fetching SIP Details/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SIP CONTROLLER — processSips (transaction test)
// ─────────────────────────────────────────────────────────────────────────────
describe("SipController — processSips", () => {
    beforeEach(() => jest.clearAllMocks());

    const mockSip = {
        sip_id: 9,
        investor_id: 1,
        portfolio_id: 42,
        fund_id: 3,
        sip_amount: 1000
    };
    const mockNav = { fund_id: 3, nav_value: 100, nav_date: "2026-05-15" };
    const mockInstallment = { inst_id: 55 };

    // Simulate a mock DB client returned by db.connect()
    const buildMockClient = (overrides = {}) => ({
        query: jest.fn(),
        release: jest.fn(),
        ...overrides
    });

    test("200 — processes SIP and creates installment + transaction + new holding", async () => {
        const mockClient = buildMockClient();

        db.connect.mockResolvedValue(mockClient);
        mockClient.query
            .mockResolvedValueOnce(undefined)                              // BEGIN
            .mockResolvedValueOnce({ rows: [mockSip] })                   // sipQuery
            .mockResolvedValueOnce({ rows: [mockNav] })                   // navQuery
            .mockResolvedValueOnce({ rows: [mockInstallment] })           // installmentQuery
            .mockResolvedValueOnce({ rows: [{ transaction_id: 77 }] })    // transactionQuery
            .mockResolvedValueOnce({ rows: [] })                          // holdingCheckQuery (new holding)
            .mockResolvedValueOnce({ rows: [] })                          // insertHoldingQuery
            .mockResolvedValueOnce(undefined);                            // COMMIT

        redisClient.del.mockResolvedValue(1);

        const res = await request(app).post("/api/sips/9/process");

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toMatch(/SIP Processed Successfully/i);
        expect(res.body.installment_id).toBe(55);
        expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test("200 — processes SIP and UPDATES existing holding", async () => {
        const mockClient = buildMockClient();
        const existingHolding = { holding_id: 10, total_units: "50", average_purchase_nav: "80" };

        db.connect.mockResolvedValue(mockClient);
        mockClient.query
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({ rows: [mockSip] })
            .mockResolvedValueOnce({ rows: [mockNav] })
            .mockResolvedValueOnce({ rows: [mockInstallment] })
            .mockResolvedValueOnce({ rows: [{ transaction_id: 78 }] })
            .mockResolvedValueOnce({ rows: [existingHolding] })           // holding already exists
            .mockResolvedValueOnce({ rows: [] })                          // update holding
            .mockResolvedValueOnce(undefined);

        redisClient.del.mockResolvedValue(1);

        const res = await request(app).post("/api/sips/9/process");

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toMatch(/SIP Processed Successfully/i);
        expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test("404 — returns 404 when SIP not found", async () => {
        const mockClient = buildMockClient();

        db.connect.mockResolvedValue(mockClient);
        mockClient.query
            .mockResolvedValueOnce(undefined)        // BEGIN
            .mockResolvedValueOnce({ rows: [] })     // sipQuery → not found
            .mockResolvedValueOnce(undefined);       // ROLLBACK

        const res = await request(app).post("/api/sips/9/process");

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toMatch(/SIP NOT FOUND/i);
        expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test("404 — returns 404 when NAV details not found", async () => {
        const mockClient = buildMockClient();

        db.connect.mockResolvedValue(mockClient);
        mockClient.query
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({ rows: [mockSip] })
            .mockResolvedValueOnce({ rows: [] })     // navQuery → not found
            .mockResolvedValueOnce(undefined);       // ROLLBACK

        const res = await request(app).post("/api/sips/9/process");

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toMatch(/Nav Details not found/i);
        expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test("500 — rolls back and returns 500 on unexpected error", async () => {
        const mockClient = buildMockClient();

        db.connect.mockResolvedValue(mockClient);
        mockClient.query
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("Deadlock detected")); // sipQuery fails

        const res = await request(app).post("/api/sips/9/process");

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/Error Processing SIP/i);
        expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SIP CONTROLLER — getSIPTransactions
// ─────────────────────────────────────────────────────────────────────────────
describe("SipController — getSIPTransactions", () => {
    beforeEach(() => jest.clearAllMocks());

    const mockTransactions = [
        {
            transaction_id: 1,
            fund_name: "Bluechip Fund",
            transaction_type: "BUY",
            transaction_amount: 1000,
            nav_value: 100,
            units: 10,
            transaction_date: "2026-05-15"
        }
    ];

    test("200 — returns transactions from cache when available", async () => {
        redisClient.get.mockResolvedValue(JSON.stringify(mockTransactions));

        const res = await request(app).get("/api/sips/9/transactions");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(mockTransactions);
        expect(db.query).not.toHaveBeenCalled();
        expect(redisClient.get).toHaveBeenCalledWith("transactions_9");
    });

    test("200 — fetches transactions from DB on cache miss and caches them", async () => {
        redisClient.get.mockResolvedValue(null);
        db.query.mockResolvedValue({ rows: mockTransactions });
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app).get("/api/sips/9/transactions");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(mockTransactions);
        expect(redisClient.set).toHaveBeenCalledWith(
            "transactions_9",
            JSON.stringify(mockTransactions),
            { EX: 3600 }
        );
    });

    test("200 — returns empty array when SIP has no transactions", async () => {
        redisClient.get.mockResolvedValue(null);
        db.query.mockResolvedValue({ rows: [] });
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app).get("/api/sips/9/transactions");

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([]);
    });

    test("500 — returns 500 on DB error", async () => {
        redisClient.get.mockResolvedValue(null);
        db.query.mockRejectedValue(new Error("Transaction query failed"));

        const res = await request(app).get("/api/sips/9/transactions");

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/Error Fetching SIP Transactions/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCANNON BENCHMARK — SIP endpoints
// ─────────────────────────────────────────────────────────────────────────────
describe("SipController — Autocannon Benchmarks", () => {
    let server;
    let port;

    const mockSIP = { sip_id: 9, fund_name: "Bluechip Fund", sip_amount: 1000 };

    beforeAll((done) => {
        // Seed cache so every request is served from "Redis" (fast path)
        redisClient.get.mockResolvedValue(JSON.stringify(mockSIP));
        server = app.listen(0, () => {
            port = server.address().port;
            done();
        });
    });

    afterAll(() => new Promise((resolve) => server.close(resolve)));

    test("GET /api/sips/:sip_id sustains ≥ 100 req/s with p99 < 200ms", (done) => {
        const autocannon = require("autocannon");

        const instance = autocannon(
            {
                url: `http://localhost:${port}/api/sips/9`,
                connections: 10,
                duration: 3,
                pipelining: 1
            },
            (err, result) => {
                if (err) return done(err);

                console.log("\n📊 [Autocannon] GET /api/sips/9");
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

    test("GET /api/sips/:sip_id/transactions sustains ≥ 100 req/s with p99 < 200ms", (done) => {
        const autocannon = require("autocannon");

        const mockTxns = [{ transaction_id: 1 }];
        redisClient.get.mockResolvedValue(JSON.stringify(mockTxns));

        const instance = autocannon(
            {
                url: `http://localhost:${port}/api/sips/9/transactions`,
                connections: 10,
                duration: 3,
                pipelining: 1
            },
            (err, result) => {
                if (err) return done(err);

                console.log("\n📊 [Autocannon] GET /api/sips/9/transactions");
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
