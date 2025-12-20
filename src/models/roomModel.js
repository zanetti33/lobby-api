const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    code: {type: String, unique: true, length: 5, required: true},
    name: {type: String, unique: true, required: true},
    gameMode: { 
        type: String, 
        enum: ['classic', 'advanced'], 
        required: true 
    },
    numberOfPlayers: {type: Number, default: 1}, //the lobby starts with one player: the owner
    roomCapacity: {type: Number, required: true}
    //forse ci vorrà anche un vettore con id o username dei giocatori 
}, {
    versionKey: false
});

const roomModel = mongoose.model('Room', roomSchema)
module.exports = { roomModel }
