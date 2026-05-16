const { getInvestorById } = require("../controller/InvestorController");
const { pool } = require("../utility/pgManager");
const { redisClient } = require("../utility/redis");
const {
    successResponse,
    errorResponse
} = require("../utility/responseHandler");


// Mock PostgreSQL
jest.mock("../utility/pgManager", () => ({
    pool: {
        query: jest.fn(),
    },

    connectDB: jest.fn(),
}));


// Mock Redis
jest.mock("../utility/redis", () => ({
    redisClient: {
        get: jest.fn(),
        set: jest.fn(),
    },

    connectRedis: jest.fn(),
}));


// Mock Response Handlers
jest.mock("../utility/responseHandler", () => ({
    successResponse: jest.fn(),
    errorResponse: jest.fn(),
}));


describe("Testing getInvestor controller", () => {

    let req;
    let res;

    beforeEach(() => {

        req = {

            params: {
                investor_id: 1,
            },

            user: {
                investor_id: 1,
            },
        };

        res = {};

        jest.clearAllMocks();
    });


    test("Should return unauthorized access", async () => {

        req.user.investor_id = 2;

        await getInvestorById(req, res);

        expect(errorResponse)
            .toHaveBeenCalledWith(
                res,
                403,
                "Unauthorized access"
            );
    });


    test("Should fetch investor from Redis cache", async () => {

        const investor = {
            investor_id: 1,
            first_name: "Gnani",
        };

        redisClient.get.mockResolvedValue(
            JSON.stringify(investor)
        );

        await getInvestorById(req, res);

        expect(redisClient.get)
            .toHaveBeenCalledWith(
                "investor_1"
            );

        expect(successResponse)
            .toHaveBeenCalledWith(
                res,
                200,
                "Investor fetched from Redis cache",
                investor
            );
    });


    test("Should fetch investor from PostgreSQL", async () => {

        redisClient.get.mockResolvedValue(null);

        pool.query.mockResolvedValue({
            rows: [
                {
                    investor_id: 1,
                    first_name: "Gnani",
                },
            ],
        });

        await getInvestorById(req, res);

        expect(pool.query)
            .toHaveBeenCalled();

        expect(redisClient.set)
            .toHaveBeenCalledWith(
                "investor_1",
                JSON.stringify({
                    investor_id: 1,
                    first_name: "Gnani",
                }),
                { EX: 3600 }
            );

        expect(successResponse)
            .toHaveBeenCalledWith(
                res,
                200,
                "Investor fetched successfully",
                {
                    investor_id: 1,
                    first_name: "Gnani",
                }
            );
    });


    test("Should return investor not found", async () => {

        redisClient.get.mockResolvedValue(null);

        pool.query.mockResolvedValue({
            rows: [],
        });

        await getInvestorById(req, res);

        expect(errorResponse)
            .toHaveBeenCalledWith(
                res,
                404,
                "Investor not found"
            );
    });


    test("Should return server error", async () => {

        redisClient.get.mockRejectedValue(
            new Error("Redis failed")
        );

        await getInvestorById(req, res);

        expect(errorResponse)
            .toHaveBeenCalledWith(
                res,
                500,
                "Redis failed"
            );
    });

});
