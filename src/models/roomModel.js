const mongoose = require('mongoose');

// TODO cambiare userModel in roomModel e cambiare i campi di conseguenza
const roomSchema = new mongoose.Schema({
    name: {type: String, unique: true}
}, {
    versionKey: false
});

const roomModel = mongoose.model('Room', roomSchema)
module.exports = { roomModel }
