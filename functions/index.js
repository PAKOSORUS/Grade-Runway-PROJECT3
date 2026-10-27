// Backend Service entry point. Each callable only wraps a handler from lib/ so
// handlers can be tested against the Firestore emulator without HTTP.
const { onCall } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const accounts = require("./lib/accounts");
const learners = require("./lib/learners");
const history = require("./lib/history");
const chat = require("./lib/chat");
const policy = require("./lib/policy");
const thresholds = require("./lib/thresholds");
const risk = require("./lib/risk");
const situation = require("./lib/situation");
const sync = require("./lib/sync");
const register = require("./lib/register");

initializeApp();
const db = getFirestore();

const wrap = (handler) => onCall((request) => handler(db, request.auth, request.data));

exports.getLearnerProfile = wrap(learners.getLearnerProfile);
exports.listMyLearners = wrap(learners.listMyLearners);
exports.listChangeAudits = wrap(history.listChangeAudits);
exports.getSystemPolicy = wrap(policy.getSystemPolicy);
exports.setSystemPolicy = wrap(policy.setSystemPolicy);
exports.listThresholds = wrap(thresholds.listThresholds);
exports.setThreshold = wrap(thresholds.setThreshold);
// Manual trigger for OP-07; the sync job will call risk.assessAll directly.
exports.runRiskAssessment = wrap(risk.runRiskAssessment);
exports.importLearningData = wrap(sync.importLearningData);
exports.listSyncRuns = wrap(sync.listSyncRuns);
exports.getLearnerSituation = wrap(situation.getLearnerSituation);
exports.getLearnerHistory = wrap(situation.getLearnerHistory);
exports.sendMessage =wrap(chat.sendMessage);
exports.resubmitMessage = wrap(chat.resubmitMessage);
exports.listApprovedMessages = wrap(chat.listApprovedMessages);
exports.listReviewQueue = wrap(chat.listReviewQueue);
exports.lockMessage = wrap(chat.lockMessage);
exports.decideMessage = wrap(chat.decideMessage);
exports.releaseLock = wrap(chat.releaseLock);
// releaseExpiredLocks is internal; a scheduler will call it in phase 5.
exports.registerSelf = wrap(register.registerSelf);
exports.getMyProfile = wrap(register.getMyProfile);
exports.upsertUser = wrap(accounts.upsertUser);
exports.setUserStatus = wrap(accounts.setUserStatus);
exports.assignLearner = wrap(accounts.assignLearner);
exports.unassignLearner = wrap(accounts.unassignLearner);
exports.transferLearner = wrap(accounts.transferLearner);
