const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.autoCheckoutRooms = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    const snapshot = await admin
      .firestore()
      .collection("rooms")
      .where("status", "==", "occupied")
      .where("checkoutAt", "<=", now)
      .get();

    if (snapshot.empty) {
      console.log("No rooms to auto-checkout");
      return null;
    }

    const batch = admin.firestore().batch();

    snapshot.forEach((doc) => {
      batch.update(doc.ref, {
        status: "available",
        guestName: null,
        guestMobile: null,
        assignedAt: null,
        checkoutAt: null,
      });
    });

    await batch.commit();
    console.log("Auto-checkout completed");

    return null;
  });
