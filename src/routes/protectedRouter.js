const express = require('express');
const router = express.Router();
const controller = require('../controllers/roomController');

router.route('/rooms')
    .get(controller.listRooms);

module.exports = router;