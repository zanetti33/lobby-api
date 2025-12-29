const express = require('express');
const router = express.Router();
const controller = require('../controllers/roomController');

router.route('/rooms')
    .get(controller.listRooms);

router.route('/rooms')
    .post(controller.createRoom);

router.route('/rooms/search/:codeOrName')
    .get(controller.getRoomByCodeOrName);

router.route('/rooms/:id')
    .get(controller.getRoom);

router.route('/rooms/:id/players')
    .post(controller.addPlayer);

router.route('/rooms/:id/players')
    .put(controller.isReady);

router.route('/rooms/:id/players/:userId')
    .delete(controller.removePlayer);

router.route('/rooms/:id')
    .delete(controller.deleteRoom);

module.exports = router;