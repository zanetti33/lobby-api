const express = require('express');
const router = express.Router();
const controller = require('../controllers/roomController');

router.route('/rooms')
    .get(controller.listRooms);

router.route('/rooms')
    .post(controller.createRoom);

router.route('/rooms/:id')
    .get(controller.getRoom);

router.route('/rooms/room/addPlayer')
    .put(controller.addPlayer);

router.route('/rooms/room/removePlayer')
    .put(controller.removePlayer);

router.route('/rooms/room/delete')
    .delete(controller.deleteRoom);

module.exports = router;