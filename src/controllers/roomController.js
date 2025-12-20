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

exports.createRoom = (req, res) => {
    const room = new roomModel(req.body);
    //console.log(room);
    if (!room.code || !room.name || !room.gameMode || !room.roomCapacity) {
        return res.status(400).send('Missing parameters');
    }
    room.save()
        .then(doc => {
            res.json(doc);
        })
        .catch(err => {
            if (err.code === 11000) {
                return res.status(409).send('Room already registered (Code or Name already exists)');
            }
            if (err.name === 'ValidationError') {
                 return res.status(400).send(err.message);
            }
        });
}

exports.addPlayer = (req, res) => {
    roomModel.findOneAndUpdate(
        { 
            _id: req.roomInfo.id, 
            $expr: { $lt: ["$numberOfPlayers", "$roomCapacity"] } 
        },
        { $inc: { numberOfPlayers: 1 } },
        { new: true } // Restituisce il documento aggiornato
    )
    .then(doc => {
        if (!doc) {
            return roomModel.findById(req.roomInfo.id).then(room => {
                if (!room) {
                    return res.status(404).send('Room not found');
                }
                // Se la stanza esiste ma doc é null, allora è piena
                return res.status(409).json({
                    error: "ROOM_FULL",
                    message: "Room is full"
                });
            });
        }
        res.json(doc);
    })
    .catch(err => {
        res.status(500).send({ error: "Server Error", details: err.message });
    });
}

exports.removePlayer = (req, res) => {
    roomModel.findOneAndUpdate(
        { 
            _id: req.roomInfo.id, 
            numbOfPlayers: { $gt: 0 } // "Greater Than 0": evita numeri negativi
        },
        { $inc: { numberOfPlayers: -1 } },
        { new: true }
    )
    .then(doc => {
        if (!doc) {
            return roomModel.findById(req.roomInfo.id).then(room => {
                if (!room) {
                    return res.status(404).send('Room not found');
                }
                // Se la stanza esiste ma doc è null, significa che è già a 0
                return res.status(400).json({
                    error: "ROOM_EMPTY",
                    message: "Room empty"
                });
            });
        }
        res.json(doc);
    })
    .catch(err => {
        res.status(500).send({ error: "Server Error", details: err.message });
    });
}

exports.deleteRoom = (req, res) => {
    roomModel.findByIdAndDelete(req.roomInfo.id)
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
/*
exports.updateMovie = (req, res) => {
    userModel.findByIdAndUpdate(req.params.id, req.body, { new: true })
        .then(doc => {
            if (!doc) {
                return res.status(404).send('Movie not found');
            }
            res.json(doc);
        })
        .catch(err => {
            res.status(500).send(err);
        });
}

exports.deleteMovie = (req, res) => {
    userModel.findByIdAndDelete(req.params.id)
        .then(doc => {
            if (!doc) {
                return res.status(404).send('Movie not found');
            }
            res.json({ message: 'Movie deleted' });
        })
        .catch(err => {
            res.status(500).send(err);
        });
}

exports.findBestMovie = (req, res) => {
    userModel.findOne()
        .where('_id').equals('5692a15524de1e0ce2dfcfa3')
        // .sort({ released: -1 })
        .then(doc => {
            res.json(doc);
        })
        .catch(err => {
            res.status(500).send(err);
        });
}

exports.findMoviesByActorAndYearRange = (req, res) => {
    const { actor, startYear, endYear } = req.query;

    if (!actor || !startYear || !endYear) {
        return res.status(400).send('Missing query parameters');
    }

    userModel.find()
        .where('actors').equals(actor)
        .where('year').gte(startYear).lte(endYear)
        .then(docs => {
            res.json(docs);
        })
        .catch(err => {
            res.status(500).send(err);
        });
}
        */
