const express = require('express');
const router = express.Router();
const controller = require('../controllers/roomController');

/*
router.route('/rooms')
    .post(controller.listRooms);
*/

router.route("/")
    .get((_, res) => {
        res.redirect(301, '/api-docs');
    });

module.exports = router;