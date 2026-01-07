const { roomModel } = require('../models/roomModel');
const { sendRoomDeletedEvent, sendPlayerLeftEvent, sendPlayerJoinedEvent, sendGameStartedEvent } = require('../socket/roomSocket');
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

exports.createRoom = (req, res) => {
const { id, name, imageUrl } = req.userInfo;

    const attemptSave = () => {
        const code = generateRandomCode();

        roomModel.findOne({ code: code })
            .then(existingCode => {
                if (existingCode) return attemptSave(); //Se esiste, riprova

                const roomData = {
                    code: code,
                    name: req.body.name,
                    gameMode: req.body.gameMode,
                    roomCapacity: req.body.roomCapacity,
                    players: [{
                        userId: id,
                        name: name,
                        imageUrl: imageUrl,
                        isHost: true,
                        isReady: true
                    }]
                };

                const room = new roomModel(roomData);
                if (!room.name || !room.gameMode || !room.roomCapacity) {
                    return res.status(400).send('Missing parameters');
                }

                return room.save();
            })
            .then(doc => {
                if (doc) res.status(201).json(doc);
            })
            .catch(err => {
                if (err.code === 11000) {
                     return res.status(409).send('Room Name already exists');
                }
                if (err.name === 'ValidationError') {
                    return res.status(400).send(err.message);
                }
                res.status(500).send('Internal Server Error');
            });
    };

    attemptSave();
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

    try {
        // 1. Check if user is already in a room
        const existingRoom = await roomModel.findOne({ "players.userId": id });
        if (existingRoom) {
            if (existingRoom._id.toString() === roomId) {
                return res.status(200).json(existingRoom);
            }
            return res.status(409).send(`User already in a room (Code: ${existingRoom.code})`);
        }

        // 2. Find the target room
        const room = await roomModel.findById(roomId);
        if (!room) {
            return res.status(404).send('Room not found');
        }
        
        // 3. Check if game already started
        if(room.status == 'playing') {
                return res.status(400).send('Game is already started');
            }

        // 4. Check capacity
        if (room.players.length >= room.roomCapacity) {
            return res.status(403).send('Room is full');
        }

        // 5. Update and Save
        room.players.push({ userId: id, name, imageUrl });
        const savedRoom = await room.save();

        // 6. Emit Socket Event
        sendPlayerJoinedEvent(req, roomId);

        // 7. Respond to Client
        return res.status(201).json(savedRoom);

    } catch (err) {
        console.error(err);
        if (err.name === 'ValidationError') {
            return res.status(400).send(err.message);
        }
        return res.status(500).send('Internal Server Error');
    }
};

exports.isReady = (req, res) => {
    const { id } = req.userInfo;
    const roomId = req.params.id;

    roomModel.findById(roomId)
        .then(room => {
            if (!room) {
                return res.status(404).json({ error: 'Room not found' });
            }
            if (room.status === 'playing') {
                return res.status(400).json({ error: 'Game is already started' });
            }

            return roomModel.findOneAndUpdate(
                { _id: roomId, "players.userId": id },
                [{$set: {
                        players: {$map: {
                                    input: "$players",
                                    as: "p",
                                    in: {$cond: [
                                            { $eq: ["$$p.userId", id] },
                                            // Se l'ID coincide, inverte isReady
                                            { $mergeObjects: ["$$p", { isReady: { $not: "$$p.isReady" } } ] },
                                            // Altrimenti lascia il player così com'è
                                            "$$p"
                                        ]}
                                }}
                        }}],
                { new: true }
            );
        })
        .then(updatedRoom => {
            if (!updatedRoom) {
                return res.status(404).json({ error: 'User is not a player in this room' });
            }
            return res.status(200).json(updatedRoom);
        })
        .catch(err => {
            console.error(err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });
};

exports.startGame = (req, res) => {
    const roomId = req.params.id;
    const userId = req.userInfo.id;
    roomModel.findById(roomId)
        .then(room => {
            if (!room) {
                return res.status(404).send('Room not found');
            }

            const currentUser = room.players.find(p => p.userId.toString() === userId.toString());
            if (!currentUser || !currentUser.isHost) {
                return res.status(403).json({ message: 'Only the host can start the game' });
            }

            const allReady = room.players.every(p => p.isReady === true);
            if (!allReady) {
                return res.status(400).json({ message: 'All players must be ready before starting' });
            }

            if (room.players.length < 6) {
                return res.status(400).json({ message: 'At least 6 players are required to start' });
            }       
            room.status = 'playing';
            return room.save();
        })
        .then(async updatedRoom => {
            if (!updatedRoom || res.headersSent) return;
            try {
                // send info to gameplay-service to start the game
                const responseGameData = await submitGameStart(updatedRoom);
                // send the "GAME_STARTED" event to the players listening on the room socket
                sendGameStartedEvent(req, roomId, responseGameData);
                // return OK!
                return res.sendStatus(204);
            } catch (err) {
                await roomModel.findByIdAndUpdate(roomId, { status: 'waiting' });
                return res.status(502);
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send('Internal Server Error');
        });
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
        throw new Error("Could start new game");
    }
    return response.data;
}

exports.removePlayer = (req, res) => {
    const { id } = req.params; //roomId
    let { userId } = req.params; //player to remove
    const callerId = req.userInfo.id; //API caller
    //If the userId is not provided
    if (!userId) {
        userId = callerId;
    }

    roomModel.findById(id)
        .then(room => {
            if (!room) {
                return res.status(404).send('Room not found');
            }
            if (room.status == 'playing') {
                return res.status(400).send('Game is already started');
            }
            const caller = room.players.find(p => p.userId === callerId);
            const playerToRemove = room.players.find(p => p.userId === userId);
            if (!playerToRemove) {
                return res.status(404).send('Player not found in this room');
            }
            //only the host can remove other players otherwise a player can only remove himself
            const isCallerHost = caller && caller.isHost;
            const isSelfRemoval = callerId === userId;
            if (!isCallerHost && !isSelfRemoval) {
                return res.status(403).send('Unauthorized (Only the host can remove other players)');
            }
            //if playerToRemove is the Host, the room is deleted
            if (playerToRemove.isHost) {
                return roomModel.findByIdAndDelete(id)
                    .then(() => {
                        sendRoomDeletedEvent(req, id);
                        return res.status(200).json({ message: 'Room deleted because the host left' });
                    });
            } else {
                return roomModel.findByIdAndUpdate(
                    id,
                    { $pull: { players: { userId: userId } } },
                    { new: true }
                ).then(doc => {
                    sendPlayerLeftEvent(req, id);
                    res.json(doc);
                });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send('Internal Server Error while removing player');
        });
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
