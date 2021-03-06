const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
const shortid = require('shortid');

const config = require('../../config/config');
const Registration = require('../models/Registration');
const User = require('../models/User');
const userValidation = require('../../../shared/validation/userValidation');
const avatarUpload = require('../../config/multerUploader');

const registerRoutes = express.Router();

/**
 * Generate a registerId and send back a register object
 * Save a RegisterId document in DB
 */
registerRoutes.get('/register', passport.authenticate('jwt', { session: false }), function(req, res) {
    // @TODO: prevent a user to create too much registration document in a short amount of time
    // @TODO: use crypto number?
    const registerId = shortid.generate();
    const registerLink = `${req.hostname}:${config.port}${req.originalUrl}/${registerId}`;

    const registration = {
        registerId,
        link: registerLink,
        creator: req.user._id,
    };

    const registrationInstance = new Registration(registration);

    registrationInstance.save()
        .catch(err => {
            const reponse = {
                success: false,
                message: 'Unable to create registration',
            };
            return res.status(500).json(reponse);
        });

    const response = {
        success: true,
        data: registrationInstance.toObject(),
        message: 'Successfully created registration',
    };
    res.json(response);
});

/**
 * POST Create a new user in DB using a registration
 */
registerRoutes.post('/register', function(req, res) {
    avatarUpload(req, res, function (err) {
        if (err) {
            const response = {
                success: false,
                message: err.message,
            };
            return res.status(400).json(response);
        }

        // @TODO: Validate user data first, then retrieve registration, then save user
        Registration.findOne({ registerId: req.body.registerId })
            .then(registration => {
                // Validate registration
                if (!registration || registration.isUsed) {
                    throw {name: 'InvalidRegistration', message: 'Registration not found or already used'};
                }
                return registration;
            })
            .then(registration => {
                // Save the user in DB
                const birthDate = new Date(req.body.birthDate);
                const nextBirthDay = User.calculateNextBirthDay(birthDate);

                const userData = {
                    email: req.body.email,
                    password: req.body.password,
                    firstName: req.body.firstName,
                    lastName: req.body.lastName,
                    birthDate,
                    nextBirthDay,
                    profilePic: req.file.path,
                };

                if (!userValidation.isUserValid(userData)) {
                    throw { name: 'InvalidUserData', message: 'Invalid user data'};
                }
                const userInstance = new User(userData);

                return userInstance.save()
                    .then((user) => {
                        registration.isUsed = true;
                        registration.save();
                        return user;
                    });
            })
            .then(user => {
                // Send response
                const response = {
                    registration: user.toObject(),
                    message: 'Successfully registered',
                    success: true,
                };
                res.json(response);
            })
            .catch((err) => {
                if (err.name === 'InvalidRegistration') {
                    const fullRes = { success: false, message: err.message};
                    return res.status(404).json(fullRes);
                }
                if (err.name === 'MongoError') {
                    const fullRes = { success: false, message: 'Email already used' };
                    return res.status(400).json(fullRes);
                }
                if (err.name === 'InvalidUserData') {
                    const fullRes = { success: false, message: err.message };
                    return res.status(400).json(fullRes);
                }
                const fullRes = { success: false, message: 'Internal server error' };
                res.status(500).json(fullRes);
            });
    });
});

module.exports = registerRoutes;
