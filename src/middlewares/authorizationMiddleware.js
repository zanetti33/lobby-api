const {validateToken} = require('../services/authorizationService');
const isDebug = process.env.NODE_ENV == 'debug';

exports.authorize = async (req, res, next) => {
    // If the request is for Socket.io, skip this middleware
    if (req.path.startsWith('/socket.io')) {
        return next();
    }
    const authHeader = req.headers['authorization']
    if (isDebug) {
        console.log(`[DEBUG] ${authHeader}`);
    }
    // Header format is: "Bearer <token>"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.sendStatus(401);
    }

    try {
        req.userInfo = await validateToken(token);
    } catch (err) {
        console.error(err);
        return res.sendStatus(403);
    }
    next();
};

exports.socketAuthorize = async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token; 
    
    log("[DEBUG] Token: " + token);
    if (!token) {
        return res.sendStatus(401);
    }
    try {
        socket.userInfo = await validateToken(token);
    } catch (err) {
        log(err);
        return res.sendStatus(403);
    }
    next();
};