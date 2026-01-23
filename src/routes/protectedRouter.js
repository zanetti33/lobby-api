const express = require('express');
const router = express.Router();
const controller = require('../controllers/roomController');

router.route('/rooms')
    .get(controller.listRooms)
    .post(controller.createRoom);

router.route('/rooms/:id')
    .get(controller.getRoom);

router.route('/rooms/:id/players')
    .post(controller.addPlayer)
    .delete(controller.removePlayer)
    .put(controller.isReady);

router.route('/rooms/:id/start')
    .post(controller.startGame);

router.route('/rooms/:id/players/:userId')
    .delete(controller.removePlayer);

module.exports = router;