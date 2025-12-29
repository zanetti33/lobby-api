const { roomModel } = require('../models/roomModel');

exports.listRooms = (req, res) => {
    roomModel.find()
        .then(doc => {
            res.json(doc);
        })
        .catch(err => {
            res.send(err);
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

exports.getRoomByCodeOrName = (req, res) => {
    const identifier = req.params.codeOrName;

    if (!identifier) {
        return res.status(400).send('Missing parameters');
    }

    roomModel.findOne({
        $or: [
            { code: identifier },
            { name: identifier }
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

exports.addPlayer = (req, res) => {
    const roomId = req.params.id;
    const { id, name, imageUrl } = req.userInfo;

    //Controlliamo se l'utente è già presente in QUALSIASI stanza del database
    roomModel.findOne({ "players.userId": id })
        .then(existingRoom => {
            if (existingRoom) {
                res.status(409).send(`User already in a room (Room Code: ${existingRoom.code})`);
                return null;
            }
            return roomModel.findById(roomId);
        })
        .then(room => {
            if (!room) {
                if(!res.headersSent){
                    res.status(404).send('Room not found');
                }
                return null;
            }
            //Controlliamo se la stanza è già piena
            if (room.players.length >= room.roomCapacity) {
                res.status(403).send('Room is full');
                return null;
            }
            const newPlayer = {
                userId: id,
                name: name,
                imageUrl: imageUrl,
            };
            room.players.push(newPlayer);
            return room.save();
        })
        .then(savedRoom => {
            if (savedRoom && !res.headersSent) {
                res.status(201).json(savedRoom);
            }
        })
        .catch(err => {
            console.error(err);
            if (!res.headersSent) {
                if (err.name === 'ValidationError') {
                    return res.status(400).send(err.message);
                }
                res.status(500).send('Internal Server Error');
            }
        });
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
                        return res.status(200).json({ message: 'Room deleted because the host left' });
                    });
            } else {
                return roomModel.findByIdAndUpdate(
                    id,
                    { $pull: { players: { userId: userId } } },
                    { new: true }
                ).then(doc => res.json(doc));
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
