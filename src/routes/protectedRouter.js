const express = require('express');
const router = express.Router();
const controller = require('../controllers/roomController');

router.route('/rooms')
    .get(controller.listRooms)
    .post(controller.createRoom);

router.route('/rooms/search/:codeOrName')
    .get(controller.getRoomByCodeOrName);

router.route('/rooms/:id')
    .get(controller.getRoom)
    .delete(controller.deleteRoom);

router.route('/rooms/:id/players')
    .post(controller.addPlayer)
    .put(controller.isReady);

router.route('/rooms/:id/players/:userId')
    .delete(controller.removePlayer);

module.exports = router;