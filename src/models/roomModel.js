const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    code: {type: String, unique: true, length: 5, required: true},
    name: {type: String, unique: true, required: true},
    gameMode: { 
        type: String, 
        enum: ['classic', 'advanced'], 
        required: true 
    },
    players: [{
        userId: { type: String, required: true},
        name: { type: String, required: true },
        imageUrl: String,
        isHost: { type: Boolean, default: false },
        isReady: { type: Boolean, default: false },
        _id: false // Evita di creare un _id per ogni singolo oggetto giocatore nel vettore
    }],
    roomCapacity: {type: Number, required: true}
}, {
    versionKey: false
});

// Campo virtuale per calcolare il numero di giocatori dalla lunghezza del vettore
roomSchema.virtual('numberOfPlayers').get(function() {
    return this.players ? this.players.length : 0;
});

const roomModel = mongoose.model('Room', roomSchema)
module.exports = { roomModel }
