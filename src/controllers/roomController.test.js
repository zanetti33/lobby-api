const roomController = require('./roomController');
const { roomModel } = require('../models/roomModel');

//Mock dependencies
jest.mock('../models/roomModel');
jest.mock('axios');
jest.mock('../socket/roomSocket', () => ({
    sendRoomDeletedEvent: jest.fn(),
    sendPlayerLeftEvent: jest.fn(),
    sendPlayerJoinedEvent: jest.fn(),
    sendGameStartedEvent: jest.fn(),
    sendPlayerIsReadyEvent: jest.fn(),
    sendPlayerKickedEvent: jest.fn()
}));

describe('Room Controller', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
        // fake request and response
        mockReq = {
            userInfo: { id: 'user123', name: 'UserTest', imageUrl: '' },
            body: {},
            params: { id: 'room_123' }
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
            json: jest.fn(),
            sendStatus: jest.fn()
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createRoom', () => {
        test('don\'t create a room if required parameters are missing', async () => {
            mockReq.body = { gameMode: 'classic' }; // Missing name (and roomCapacity)

            await roomController.createRoom(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith('Missing parameters');
        });
    });

    describe('startGame', () => {
        test('don\'t start the game if the user trying to start is not the host', async () => {
            const mockRoom = {
                _id: 'room_123',
                status: 'waiting',
                players: [
                    { userId: 'host456', isHost: true },
                    { userId: 'user123', isHost: false } 
                ]
            };
            roomModel.findById.mockResolvedValue(mockRoom);

            await roomController.startGame(mockReq, mockRes);

            expect(roomModel.findById).toHaveBeenCalledWith('room_123');
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Only the host can start the game' });
        });

        test('check if there are at least 6 players in the room', async () => {
            const mockRoom = {
                _id: 'room_123',
                status: 'waiting',
                players: [
                    { userId: 'user123', isHost: true, isReady: true },
                    { userId: 'player2', isHost: false, isReady: true },
                    { userId: 'player3', isHost: false, isReady: true }
                ]
            };
            roomModel.findById.mockResolvedValue(mockRoom);

            await roomController.startGame(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'At least 6 players are required to start' });
        });
        
        test('all players must be ready', async () => {
            const mockRoom = {
                _id: 'room_123',
                status: 'waiting',
                players: [
                    { userId: 'user123', isHost: true, isReady: true },
                    { userId: 'p2', isHost: false, isReady: true },
                    { userId: 'p3', isHost: false, isReady: true },
                    { userId: 'p4', isHost: false, isReady: true },
                    { userId: 'p5', isHost: false, isReady: true },
                    { userId: 'p6', isHost: false, isReady: false } // Not ready
                ]
            };
            roomModel.findById.mockResolvedValue(mockRoom);

            await roomController.startGame(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'All players must be ready before starting' });
        });
    });

    describe('addPlayer', () => {
        test('check if the user is already in another room', async () => {
            const existingRoom = { _id: 'another_room_id', code: 'XYZ12' };
            // User is already in another room
            roomModel.findOne.mockResolvedValue(existingRoom);

            await roomController.addPlayer(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(409);
            expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('User already in a room'));
        });

        test('check if room is full', async () => {
            roomModel.findOne.mockResolvedValue(null); // Not in other rooms
            
            // Update failed because the room is full
            roomModel.findOneAndUpdate.mockResolvedValue(null);
            roomModel.findById.mockResolvedValue({ players: [1,2,3,4,5,6], roomCapacity: 6 });

            await roomController.addPlayer(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.send).toHaveBeenCalledWith('Room is full');
        });
    });

    describe('removePlayer', () => {
        test('delete the room if the host is leaving', async () => {
            // Host is leaving, so userId is not provided in params
            mockReq.params.userId = undefined;

            const mockRoom = {
                _id: 'room_abc',
                status: 'waiting',
                players: [{ userId: 'user123', isHost: true }]
            };
            roomModel.findById.mockResolvedValue(mockRoom);
            roomModel.findOneAndDelete.mockResolvedValue(mockRoom);

            await roomController.removePlayer(mockReq, mockRes);

            expect(roomModel.findOneAndDelete).toHaveBeenCalled();
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Room deleted' });
        });

        test('don\'t remove a player if the user (not host) tries to kick someone else', async () => {
            mockReq.params.userId = 'target_user_456';
            const mockRoom = {
                _id: 'room_abc',
                status: 'waiting',
                players: [
                    { userId: 'user123', isHost: false },
                    { userId: 'target_user_456', isHost: false }
                ]
            };
            roomModel.findById.mockResolvedValue(mockRoom);

            await roomController.removePlayer(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.send).toHaveBeenCalledWith('Unauthorized');
        });
    });
});