const redis = require("redis");

const client = redis.createClient({
    url: "redis://localhost:6379",
    socket: {
        reconnectStrategy: false
    }
});

client.on("connect", () => {
    console.log("Redis Connected Successfully... ");
});

client.on("error", (error) => {
    console.error(`Redis error: ${error.message}`);
});

const connectRedis = async () => {
    try {
        if(!client.isOpen){
            await client.connect();
        }
    } catch (error) {
        console.warn(`Redis unavailable, continuing without cache: ${error.message}`);
    }
};

const safeRedisCall = async (operation, fallback = null) => {
    try {
        if (!client.isReady) {
            return fallback;
        }

        return await operation();
    } catch (error) {
        console.warn(`Redis cache skipped: ${error.message}`);
        return fallback;
    }
};

const redisClient = {
    get isOpen() {
        return client.isOpen;
    },
    get isReady() {
        return client.isReady;
    },
    get: (key) => safeRedisCall(() => client.get(key)),
    set: (key, value, options) => safeRedisCall(() => client.set(key, value, options)),
    del: (key) => safeRedisCall(() => client.del(key), 0)
};

module.exports = {
    redisClient,
    connectRedis
}
