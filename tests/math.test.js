const { sum } = require("../controller/testing")

test("If 2 + 2 is added result should be 4", () => {
    expect(sum(2, 2)).toBe(4);
})

test("If 5 + 2 is added result should be 7", () => {
    expect(sum(5, 2)).toBe(7);
})

test("If 2 + 9 is added result should be 11", () => {
    expect(sum(2, 9)).toBe(11);
})

test("If 2  8 is added result should be 10", () => {
    expect(sum(2, 8)).toBe(10);
})

describe('Testing Authentication related', () => {
    test("User login validation", () => {
        const user = {email : "akshay@gmail.com", password: "null"};
        expect(user.email).toBeDefined();
        expect(user.password).not.toBeNull();
    })

    test("User Object Matching", () => {
        const user = {name : "Akshay"};
        expect(user).toEqual({name : "Akshay"})
    })
})