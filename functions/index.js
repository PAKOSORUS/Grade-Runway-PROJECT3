// Backend Service entry point. Each callable only wraps a handler from lib/ so
// handlers can be tested against the Firestore emulator without HTTP.
const { onCall } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const accounts = require("./lib/accounts");
const learners = require("./lib/learners");
const history = require("./lib/history");

initializeApp();
const db = getFirestore();

const wrap = (handler) => onCall((request) => handler(db, request.auth, request.data));

exports.getLearnerProfile = wrap(learners.getLearnerProfile);
exports.listMyLearners = wrap(learners.listMyLearners);
exports.listChangeAudits = wrap(history.listChangeAudits);
exports.upsertUser =wrap(accounts.upsertUser);
exports.setUserStatus = wrap(accounts.setUserStatus);
exports.assignLearner = wrap(accounts.assignLearner);
exports.unassignLearner = wrap(accounts.unassignLearner);
exports.transferLearner = wrap(accounts.transferLearner);
