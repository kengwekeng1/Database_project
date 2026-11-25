const { applicationDefault, getApp, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = getApps().length
  ? getApp()
  : initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });

const databaseId = process.env.FIRESTORE_DATABASE_ID;
const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

module.exports = db;
