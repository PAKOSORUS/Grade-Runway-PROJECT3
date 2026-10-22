// Backend Service entry point. Each callable only wraps a handler from lib/ so
// handlers can be tested against the Firestore emulator without HTTP.
const { onCall } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const accounts = require("./lib/accounts");
const learners = require("./lib/learners");
const history = require("./lib/history");
const chat = require("./lib/chat");
const eligibility = require("./lib/eligibility");

initializeApp();
const db = getFirestore();

const wrap = (handler) => onCall((request) => handler(db, request.auth, request.data));

exports.getLearnerProfile = wrap(learners.getLearnerProfile);
exports.listMyLearners = wrap(learners.listMyLearners);
exports.listChangeAudits = wrap(history.listChangeAudits);
exports.sendMessage = wrap(chat.sendMessage);
exports.resubmitMessage = wrap(chat.resubmitMessage);
exports.listApprovedMessages = wrap(chat.listApprovedMessages);
exports.listReviewQueue = wrap(chat.listReviewQueue);
exports.lockMessage = wrap(chat.lockMessage);
exports.decideMessage = wrap(chat.decideMessage);
exports.releaseLock = wrap(chat.releaseLock);
// releaseExpiredLocks is internal; a scheduler will call it in phase 5.
exports.upsertUser = wrap(accounts.upsertUser);
exports.setUserStatus = wrap(accounts.setUserStatus);
exports.assignLearner = wrap(accounts.assignLearner);
exports.unassignLearner = wrap(accounts.unassignLearner);
exports.transferLearner = wrap(accounts.transferLearner);

exports.setEligibilityCriteria = wrap(eligibility.setEligibilityCriteria);
exports.getEligibilityCriteria = wrap(eligibility.getEligibilityCriteria);
