const { roomModel } = require('../models/roomModel');
const isDebug = process.env.NODE_ENV == 'debug';

exports.roomSocket = (socket) => {
    log(`User Connected: ${socket.userInfo.name} (${socket.userInfo.id})`);

    registerJoinLobbyHandler(socket);
    //registerSendMessageHandler(io, socket);
    registerDisconnectHandler(socket);
}

// EVENT: User Disconnects
registerDisconnectHandler = (socket) => {
    socket.on("disconnecting", () => {
        log(`User Disconnected: ${socket.userInfo.name}`);
        // socket.rooms is a Set containing the socket ID and the rooms they joined
        const rooms = socket.rooms;

        rooms.forEach((roomId) => {
            // We don't want to broadcast to the user's private room (which is their own socket.id)
            if (roomId !== socket.id) {
                // Notify OTHER users in the room
                socket.to(roomId).emit("PLAYER_LEFT", {
                    id: socket.userInfo.id,
                    name: socket.userInfo.name,
                    imageUrl: socket.userInfo.imageUrl
                });
            }
        });
    });
}

// EVENT: User Joins a specific room channel
registerJoinLobbyHandler = (socket) => {
    socket.on("JOIN_LOBBY_ROOM", async (roomId) => {
        try {
            const userId = socket.userInfo.id; 

            // Security Check: DB Verification
            const room = await roomModel.findOne({ 
                _id: roomId, 
                "players.userId": userId 
            });

            if (!room) {
                log(`Security Alert: User ${userId} tried to join room ${roomId} but is not in DB.`);
                socket.emit("ERROR", { message: "Unauthorized to join this room." });
                return; 
            }

            // Actually Join the Socket Room
            socket.join(roomId);
            log(`Allowed ${socket.userInfo.name} to join socket channel ${roomId}`);

            // (Optional) Sync Game State
            // If the user refreshed the page, they might need the current game state immediately
            if (room.status === 'PLAYING') {
                socket.emit("GAME_STARTED", {
                    // TODO
                    // gameData: room.gameData
                });
            }

        } catch (err) {
            console.error("Socket Join Error:", err);
            socket.emit("ERROR", { message: "Internal Server Error" });
        }
    });
}

exports.sendPlayerLeftEvent = (req, roomId) => {
    const io = req.app.get('io');
    const userId = req.userInfo.id;
    io.to(roomId).emit("PLAYER_LEFT", {
        userId: userId
    });
    log(`Socket event PLAYER_LEFT (User: ${userId}) sent to room ${roomId}`);
}

exports.sendRoomDeletedEvent = (req, roomId) => {
    const io = req.app.get('io');
    io.to(roomId).emit("ROOM_DELETED");
    log(`Socket event ROOM_DELETED sent to room ${roomId}`);
    io.in(roomId).disconnectSockets(true);
}

exports.sendPlayerJoinedEvent = (req, roomId) => {
    const io = req.app.get('io');
    const {id, name, imageUrl} = req.userInfo;
    io.to(roomId).emit("PLAYER_JOINED", {
        userId: id,
        name: name,
        imageUrl: imageUrl
    });
    log(`Socket event PLAYER_JOINED (User: ${id}) sent to room ${roomId}`);
}

exports.sendPlayerIsReadyEvent = (req, roomId, data) => {
    const io = req.app.get('io');
    io.to(roomId).emit("PLAYER_READY", data);
    log(`Socket event PLAYER_READY (User: ${data.userId}) sent to room ${roomId}`);
}

exports.sendGameStartedEvent = (req, roomId, data) => {
    const io = req.app.get('io');
    io.to(roomId).emit("GAME_STARTED", data);
    log(`Socket event GAME_STARTED sent to room ${roomId}`);
}

log = (message) => {
    if (isDebug) {
        console.log(message);
    }
}

// Next features
/*
registerSendMessageHandler = (io, socket) => {
    socket.on("SEND_MESSAGE", ({ roomId, message }) => {
        console.log(`Message from ${socket.userInfo.name} in room ${roomId}: ${message}`);
        // Broadcast the message to ALL users in the room
        io.in(roomId).emit("CHAT_MESSAGE", {
            sender: socket.userInfo.name,
            text: message,
            timestamp: new Date()
        });
    });
};
*/