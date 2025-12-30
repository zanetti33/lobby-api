const { roomModel } = require('../models/roomModel');
const { sendRoomDeletedEvent, sendPlayerLeftEvent, sendPlayerJoinedEvent } = require('../socket/roomSocket');

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

        // 3. Check capacity
        if (room.players.length >= room.roomCapacity) {
            return res.status(403).send('Room is full');
        }

        // 4. Update and Save
        room.players.push({ userId: id, name, imageUrl });
        const savedRoom = await room.save();

        // 5. Emit Socket Event
        sendPlayerJoinedEvent(req, roomId);

        // 6. Respond to Client
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
    const { ready } = req.body;

    if (ready === undefined) {
        return res.status(400).send('Missing "ready" parameter in request body');
    }
    // Cerchiamo la stanza che ha quell'ID e che contiene il giocatore con quell'ID
    // Usiamo l'operatore posizionale "$" per aggiornare solo il giocatore trovato
    roomModel.findOneAndUpdate(
        { _id: req.params.id, "players.userId": id },
        { $set: { "players.$.isReady": ready } },
        { new: true } // Restituisce il documento aggiornato
    )
    .then(doc => {
        if (!doc) {
            return res.status(404).send('Room not found or user is not a player in this room');
        }
        res.json(doc);
    })
    .catch(err => {
        console.error(err);
        res.status(500).send('Internal Server Error while updating ready status');
    });
};

exports.removePlayer = (req, res) => {
    const { id } = req.params; // roomId
    let { userId } = req.params;
    //If the userId is not provided
    if (userId == '{userId}') {
        userId = req.userInfo.id;
    }

    roomModel.findById(id)
        .then(room => {
            if (!room) {
                return res.status(404).send('Room not found');
            }
            const playerToRemove = room.players.find(p => p.userId === userId);
            if (!playerToRemove) {
                return res.status(404).send('Player not found in this room');
            }
            //Se il giocatore è l'host, cancelliamo l'intera stanza
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
                    sendPlayerLeftEvent(req, id)
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
