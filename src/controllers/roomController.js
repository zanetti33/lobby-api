const { roomModel } = require('../models/roomModel');
const { sendRoomDeletedEvent, sendPlayerLeftEvent, sendPlayerJoinedEvent, sendGameStartedEvent, sendPlayerIsReadyEvent, sendPlayerKickedEvent } = require('../socket/roomSocket');
const axios = require('axios');
const isDebug = process.env.NODE_ENV == 'debug';

exports.listRooms = (req, res) => {
    const identifier = req.query.codeOrName;
    
    if (!identifier) {
        findAll(res);
    } else {
        findByCodeOrName(identifier, res);
    }
}

findAll = (res) => {
    roomModel.find()
        .then(doc => {
            res.json(doc);
        })
        .catch(err => {
            res.send(err);
        });
}

findByCodeOrName = (identifier, res) => {
    roomModel.findOne({
            $or: [
                { code: { $regex: identifier, $options: 'i' } },
                { name: { $regex: identifier, $options: 'i' } }
            ]
        })
        .then(room => {
            if (!room) {
                return res.status(404).send('Room not found.');
            }
            res.json(room);
        })
        .catch(err => {
            res.status(500).send(err);
        });
}

// Funzione di utilità per generare un codice alfanumerico di 5 caratteri
const generateRandomCode = () => {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Esclusi 0, 1, I, O per evitare confusioni quando i giocatori che cercano una partita lo digitano
    let result = '';
    for (let i = 0; i < 5; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

exports.createRoom = async (req, res) => {
    const { id, name, imageUrl } = req.userInfo;
    const { name: roomName, gameMode, roomCapacity } = req.body;

    if (!roomName || !gameMode || !roomCapacity) {
        return res.status(400).send('Missing parameters');
    }

    // Retry Logic
    let retries = 0;
    const MAX_RETRIES = 5;

    while (retries < MAX_RETRIES) {
        try {
            const code = generateRandomCode();
            const existingRoom = await roomModel.findOne({ code: code });
            
            if (existingRoom) {
                // Code taken, increment retry counter and loop again
                retries++;
                continue; 
            }

            // Create and Save (if code or name are now duplicates we retry)
            const room = new roomModel({
                code,
                name: roomName,
                gameMode,
                roomCapacity,
                players: [{
                    userId: id,
                    name,
                    imageUrl,
                    isHost: true,
                    isReady: true
                }]
            });

            const savedRoom = await room.save();
            return res.status(201).json(savedRoom);

        } catch (err) {
            if (err.code === 11000) {
                // If the error is about the Name, stop immediately
                if (err.keyPattern && err.keyPattern.name) {
                    return res.status(409).send('Room Name already exists');
                }
                
                // If the error is about the Code (rare race condition), retry
                if (err.keyPattern && err.keyPattern.code) {
                    retries++;
                    continue;
                }
            }

            // Handle Mongoose Validation Errors
            if (err.name === 'ValidationError') {
                return res.status(400).send(err.message);
            }

            console.error("Create Room Error:", err);
            return res.status(500).send('Internal Server Error');
        }
    }
    // If loop finishes without success
    return res.status(500).send('Could not generate a unique room code. Please try again.');
};

exports.getRoom = (req, res) => {
    roomModel.findById(req.params.id)
        .then(doc => {
            console.log(doc);
            if (!doc) {
                return res.status(404).send('Room not found.');
            }
            res.json(doc);
        })
        .catch(err => {
            res.status(500).send(err);
        });
}

exports.addPlayer = async (req, res) => {
    const roomId = req.params.id;
    const { id, name, imageUrl } = req.userInfo;
    const newPlayer = { userId: id, name, imageUrl };

    try {
        // Check if user is already in a room
        const existingRoom = await roomModel.findOne({ "players.userId": id });
        if (existingRoom) {
            if (existingRoom._id.toString() === roomId) {
                return res.status(200).json(existingRoom);
            }
            return res.status(409).send(`User already in a room (Code: ${existingRoom.code})`);
        }
        // ATOMIC UPDATE
        const updatedRoom = await roomModel.findOneAndUpdate(
            { 
                _id: roomId,
                status: { $ne: 'playing' }, // Ensure game hasn't started
                $expr: { $lt: [ { $size: "$players" }, "$roomCapacity" ] } // Ensure not full
            },
            { 
                $push: { players: newPlayer } 
            },
            { 
                new: true // Return the updated document
            }
        );
        // Check if it worked
        if (!updatedRoom) {
            // We can do a quick check to give a specific error
            const roomCheck = await roomModel.findById(roomId);
            if (!roomCheck) return res.status(404).send('Room not found');
            if (roomCheck.players.length >= roomCheck.roomCapacity) return res.status(403).send('Room is full');
            return res.status(400).send('Unable to join room (Started or Full)');
        }
        // Emit Socket Event
        sendPlayerJoinedEvent(req, roomId);
        return res.status(201).json(updatedRoom);
    } catch (err) {
        console.error(err);
        if (err.name === 'ValidationError') {
            return res.status(400).send(err.message);
        }
        return res.status(500).send('Internal Server Error');
    }
};

const mongoose = require('mongoose');

exports.isReady = async (req, res) => {
    const { id } = req.userInfo;
    const roomId = req.params.id;

    try {
        // ATOMIC UPDATE
        const updatedRoom = await roomModel.findOneAndUpdate(
            // find by room id, player id and status not playing
            { 
                _id: roomId, 
                "players.userId": id,
                status: { $ne: 'playing' } 
            },
            [{
                $set: {
                    players: {
                        $map: {
                            input: "$players",
                            as: "p",
                            in: {
                                $cond: [
                                    // find the player
                                    { $eq: ["$$p.userId", id] },
                                    
                                    // Toggle Logic
                                    { $mergeObjects: ["$$p", { isReady: { $not: "$$p.isReady" } }] },
                                    
                                    // Keep other players the same
                                    "$$p"
                                ]
                            }
                        }
                    }
                }
            }],
            { new: true }
        );

        // SUCCESS CASE
        if (updatedRoom) {
            const currentUser = updatedRoom.players.find(p => p.userId.toString() === id.toString());
            sendPlayerIsReadyEvent(req, roomId, { userId: id, isReady: currentUser.isReady });
            return res.status(200).json(updatedRoom);
        }

        // ERROR
        const roomCheck = await roomModel.findById(roomId);

        if (!roomCheck) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        // Check if user is in room
        const playerExists = roomCheck.players.some(p => p.userId.toString() === id.toString());
        if (!playerExists) {
            return res.status(404).json({ error: 'User is not a player in this room' });
        }

        // Check if game started
        if (roomCheck.status === 'playing') {
            return res.status(400).json({ error: 'Game is already started' });
        }

        // Fallback
        return res.status(500).json({ error: 'Update failed for unknown reason' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.startGame = async (req, res) => {
    const roomId = req.params.id;
    const userId = req.userInfo.id;

    try {
        // check room exists
        const room = await roomModel.findById(roomId);
        if (!room) return res.status(404).send('Room not found');

        // check you are host
        const currentUser = room.players.find(p => p.userId === userId);
        if (!currentUser || !currentUser.isHost) {
            return res.status(403).json({ message: 'Only the host can start the game' });
        }

        // check game not started yet
        if (room.status === 'playing') {
            return res.status(400).json({ message: 'Game is already started' });
        }

        // check minimum player count
        if (room.players.length < 6) {
            return res.status(400).json({ message: 'At least 6 players are required to start' });
        }

        // check all are ready
        const allReady = room.players.every(p => p.isReady === true);
        if (!allReady) {
            return res.status(400).json({ message: 'All players must be ready before starting' });
        }

        // ATOMIC UPDATE
        const updatedRoom = await roomModel.findOneAndUpdate(
            // all checks again: status, player number and their readiness
            {
                _id: roomId,
                status: 'waiting',
                $expr: { $gte: [{ $size: "$players" }, 6] },
                "players.isReady": { $ne: false } 
            },
            { 
                $set: { status: 'playing' } 
            },
            { new: true }
        );

        if (!updatedRoom) {
            // If this fails, it means the state changed between first check and the db operation
            return res.status(409).json({ 
                message: 'Cannot start: A player left or became unready at the last moment.' 
            });
        }

        // EXTERNAL SERVICE CALL
        try {
            // Send info to gameplay-service
            const responseGameData = await submitGameStart(updatedRoom);
            
            // Broadcast "Game Started" to sockets
            sendGameStartedEvent(req, roomId, responseGameData);
            
            // Return Success
            return res.sendStatus(204);
        } catch (extError) {
            // 4. COMPENSATION (Rollback)
            // If the game server failed to start, we MUST unlock the room 
            // so players aren't stuck in "playing" mode forever.
            console.error("Gameplay Service Failed. Rolling back room status...", extError);
            
            await roomModel.findByIdAndUpdate(roomId, { status: 'waiting' });
            
            return res.status(502).json({ message: "Failed to initialize game server. Please try again." });
        }

    } catch (err) {
        console.error("Start Game Error:", err);
        return res.status(500).send('Internal Server Error');
    }
};

submitGameStart = async (gameData) => {
    log(process.env.LOBBY_X_INTERNAL_SERVICE_ID);
    log(process.env.X_INTERNAL_SECRET);
    const response = await axios.post(process.env.GAME_SERVICE_URL + "/games", gameData, {
        headers: {
            // This identifies the Lobby Service to the Game Engine
            'x-internal-service-id': process.env.LOBBY_X_INTERNAL_SERVICE_ID ,
            'x-internal-secret': process.env.X_INTERNAL_SECRET 
        }
    });
    if (response.status !== 201) {
        log(response);
        throw new Error("Could not start new game");
    }
    return response.data;
}

exports.removePlayer = async (req, res) => {
    const { id: roomId } = req.params; 
    let { userId: targetUserId } = req.params; 
    const callerId = req.userInfo.id;

    // Default to self-removal if no target provided
    if (!targetUserId) targetUserId = callerId;

    try {
        // Check room exists
        const room = await roomModel.findById(roomId);
        if (!room) return res.status(404).send('Room not found');

        // Check Game Status
        if (room.status === 'playing') {
            return res.status(400).send('Game is already started');
        }

        // Find Players
        const caller = room.players.find(p => p.userId === callerId);
        const playerToRemove = room.players.find(p => p.userId === targetUserId);

        if (!playerToRemove) {
            return res.status(404).send('Player not found in this room');
        }

        // Authorization Check
        const isCallerHost = caller && caller.isHost;
        const isSelfRemoval = callerId === targetUserId;

        if (!isCallerHost && !isSelfRemoval) {
            return res.status(403).send('Unauthorized');
        }

        // Option A: Host Leaves -> Delete Room
        if (playerToRemove.isHost) {
            const deletedRoom = await roomModel.findOneAndDelete({
                _id: roomId,
                status: { $ne: 'playing' } // Safety check
            });

            if (!deletedRoom) return res.status(400).send('Game has started');

            sendRoomDeletedEvent(req, roomId);
            return res.status(200).json({ message: 'Room deleted' });
        } 
        
        // Option B: Regular Player leaves -> remove him
        else {
            const updatedRoom = await roomModel.findOneAndUpdate(
                { 
                    _id: roomId, 
                    status: { $ne: 'playing' } 
                },
                { 
                    $pull: { players: { userId: targetUserId } } 
                },
                { new: true }
            );

            if (!updatedRoom) return res.status(400).send('Game has started or room deleted');

            // Events handling
            if (isSelfRemoval) {
                sendPlayerLeftEvent(req, roomId, { userId: targetUserId }); 
            } else {
                sendPlayerKickedEvent(req, roomId, { userId: targetUserId });
            }

            return res.status(200).json(updatedRoom);
        }
    } catch (err) {
        console.error("Remove Player Error:", err);
        return res.status(500).send('Internal Server Error');
    }
};

exports.deleteRoom = (req, res) => {
    roomModel.findByIdAndDelete(req.params.id)
        .then(doc => {
            if (!doc) {
                return res.status(404).send('Room not found');
            }
            res.json(doc);
        })
        .catch(err => {
            res.status(500).send(err);
        });
}
