exports.roomSocket = (socket) => {
    console.log(`User Connected: ${socket.userInfo.name} (${socket.userInfo.id})`);

    // Pass the socket to our logic handler
    registerJoinLobbyHandler(io, socket);
    registerSendMessageHandler(io, socket);
    registerDisconnectHandler(io, socket);
}

registerDisconnectHandler = (io, socket) => {
    socket.on("disconnect", () => {
        console.log(`User Disconnected: ${socket.userInfo.name} (${socket.userInfo.id})`);
        // Notify OTHER users in the room that someone left
        socket.to(roomId).emit("NOTIFICATION", `${socket.userInfo.name} left...`);
    });
};

// EVENT: User Joins a specific room channel
registerLobbyHandlers = (io, socket) => {
    socket.on("JOIN_LOBBY_ROOM", (roomId) => {
        // Socket.io "Rooms" are just string channels. 
        // We use the mongoDB Room ID as the channel name.
        socket.join(roomId);
        
        console.log(`${socket.userInfo.name} joined channel: ${roomId}`);
        // Notify OTHER users in the room that someone joined
        socket.to(roomId).emit("NOTIFICATION", `${socket.userInfo.name} joined!`);
    });
}

// EVENT: Simple Lobby Chat
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