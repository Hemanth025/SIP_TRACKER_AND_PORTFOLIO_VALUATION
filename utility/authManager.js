const jwt = require('jsonwebtoken');
const db = require('../utility/pgManager.js');
const secretKey = 'SPITRACKER_AND_PORTFOLIOVALUATION_AS_SECRET_KEY';


const generateToken = (payload) => {
    return jwt.sign(
        payload,
        secretKey,
        {
            expiresIn:'1d'
        }
    );
};

const verifyJWT = (token) => {
    return jwt.verify(
        token,
        secretKey
    )
}

module.exports = {
    generateToken,
    verifyJWT
}