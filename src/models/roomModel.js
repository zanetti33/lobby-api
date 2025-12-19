const mongoose = require('mongoose');

// TODO cambiare userModel in roomModel e cambiare i campi di conseguenza
const roomSchema = new mongoose.Schema({
    code: {type: String, unique:true, length: 5},
    name: {type: String, unique: true},
    modality: { 
        type: String, 
        enum: ['classic', 'advanced'], 
        required: true 
    },
    numbOfPlayers: {type: Int, default: 0},
    roomCapacity: {type: Int, required: true}
}, {
    versionKey: false
});

const roomModel = mongoose.model('Room', roomSchema)
module.exports = { roomModel }
