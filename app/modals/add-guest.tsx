import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp,
  addDoc,
  writeBatch,
  doc,
} from "firebase/firestore";
import { db, auth } from "../../firebase/firebaseConfig";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  getUserRoomsRef,
  getUserRoomRef,
  getCurrentUserId,
} from "../../utils/userData";

type Meal = "breakfast" | "lunch" | "dinner";

export default function AddGuest() {
  const router = useRouter();

  const [guestName, setGuestName] = useState("");
  const [mobile, setMobile] = useState("");
  const [checkoutDate, setCheckoutDate] = useState<Date | null>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0); // Default to 11 AM tomorrow
    return tomorrow;
  });
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assignedRoom, setAssignedRoom] = useState<number | null>(null);

  const [selectedMeals, setSelectedMeals] = useState<Meal[]>([]);

  const toggleMeal = (meal: Meal) => {
    setSelectedMeals((prev) =>
      prev.includes(meal) ? prev.filter((m) => m !== meal) : [...prev, meal]
    );
  };

  const prettyMealText = (meals: Meal[]) => {
    if (!meals.length) return "-";
    const map: Record<Meal, string> = {
      breakfast: "Breakfast",
      lunch: "Lunch",
      dinner: "Dinner",
    };
    return meals.map((m) => map[m]).join(", ");
  };

  const pad2 = (n: number) => String(n).padStart(2, "0");

  const formatDateTimeLocal = (d: Date) => {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
      d.getDate()
    )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  const parseDateTimeLocal = (val: string) => {
    try {
      const [datePart, timePart] = val.split("T");
      if (!datePart || !timePart) return null;

      const [y, m, day] = datePart.split("-").map(Number);
      const [hh, mm] = timePart.split(":").map(Number);

      if (!y || !m || !day || Number.isNaN(hh) || Number.isNaN(mm)) return null;

      return new Date(y, m - 1, day, hh, mm, 0, 0);
    } catch {
      return null;
    }
  };

  const webDateValue = checkoutDate ? formatDateTimeLocal(checkoutDate) : "";
  const webMinValue = formatDateTimeLocal(new Date());

  const checkoutPreviousGuest = async (adminUid: string, guestDocId: string, roomNumber: number) => {
    try {
      const batch = writeBatch(db);

      batch.update(doc(db, "guests", guestDocId), {
        isActive: false,
        isLoggedIn: false,
        checkedOutAt: serverTimestamp(),
        checkoutReason: "replaced_by_new_booking"
      });

      const roomsQuery = query(
        collection(db, "users", adminUid, "rooms"),
        where("roomNumber", "==", roomNumber),
        where("status", "==", "occupied")
      );

      const roomsSnap = await getDocs(roomsQuery);
      roomsSnap.docs.forEach((roomDoc) => {
        batch.update(roomDoc.ref, {
          status: "available",
          guestName: null,
          guestMobile: null,
          guestId: null,
          assignedAt: null,
          checkoutAt: null,
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      console.log("Previous guest checked out successfully");
    } catch (error) {
      console.error("Error checking out previous guest:", error);
    }
  };

  const createNewBooking = async (adminUid: string, currentUser: any) => {
    try {
      const guestData = {
        adminId: adminUid,
        adminEmail: currentUser.email,
        guestMobile: mobile,
        guestName: guestName.trim(),
        roomNumber: null,
        isActive: true,
        isLoggedIn: false,
        createdAt: serverTimestamp(),
        checkoutAt: Timestamp.fromDate(checkoutDate!),
        mealPlan: selectedMeals,
      };

      const guestRef = await addDoc(collection(db, "guests"), guestData);

      const q = query(getUserRoomsRef(), where("status", "==", "available"));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        Alert.alert(
          "No Rooms Available",
          "Guest registered but no rooms available. Please setup rooms first."
        );
        return;
      }

      const roomDoc = snapshot.docs[0];
      const roomRef = getUserRoomRef(roomDoc.id);
      const roomNumber = roomDoc.data().roomNumber;

      await runTransaction(db, async (transaction) => {
        const roomSnap = await transaction.get(roomRef);
        if (!roomSnap.exists()) throw "Room missing";
        if (roomSnap.data().status !== "available") throw "Room already occupied";

        transaction.update(roomRef, {
          status: "occupied",
          guestName: guestName.trim(),
          guestMobile: mobile,
          assignedAt: serverTimestamp(),
          checkoutAt: Timestamp.fromDate(checkoutDate!),
          guestId: guestRef.id,
          adminEmail: currentUser.email,
          mealPlan: selectedMeals,
        });

        transaction.update(guestRef, {
          roomNumber: roomNumber,
        });
      });

      setAssignedRoom(roomNumber);

      const qrUrl = `https://roomio-guest.vercel.app/guest?admin=${encodeURIComponent(
        adminUid
      )}`;

      Alert.alert(
        "✅ Guest Added Successfully!",
        `Guest: ${guestName}\nMobile: ${mobile}\nRoom: ${roomNumber}\nMeal: ${prettyMealText(
          selectedMeals
        )}\n\nQR Code URL:\n${qrUrl}`,
        [
          {
            text: "Copy URL to Console",
            onPress: () => console.log("QR URL:", qrUrl),
          },
          {
            text: "OK",
            onPress: () => {
              setGuestName("");
              setMobile("");
              setCheckoutDate(null);
              setSelectedMeals([]);
              setAssignedRoom(null);
              router.replace("/(tabs)/rooms");
            },
          },
        ]
      );
    } catch (err) {
      console.error("Error creating booking:", err);
      Alert.alert("Error", "Failed to create booking");
    }
  };

  const assignRoom = async () => {
    if (!guestName.trim()) {
      Alert.alert("Invalid Name", "Guest name is required");
      return;
    }

    if (!/^[0-9]{10}$/.test(mobile)) {
      Alert.alert("Invalid Mobile", "Mobile number must be exactly 10 digits");
      return;
    }

    if (!checkoutDate) {
      Alert.alert("Invalid Checkout", "Please select checkout date & time");
      return;
    }

    if (checkoutDate <= new Date()) {
      Alert.alert("Invalid Checkout", "Checkout must be in the future");
      return;
    }

    setLoading(true);

    try {
      const uid = getCurrentUserId();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        Alert.alert("Error", "You must be logged in as admin");
        return;
      }

      const existingGuestQuery = query(
        collection(db, "guests"),
        where("adminId", "==", uid),
        where("guestMobile", "==", mobile),
        where("isActive", "==", true)
      );

      const existingGuestSnap = await getDocs(existingGuestQuery);

      if (!existingGuestSnap.empty) {
        const existingGuest = existingGuestSnap.docs[0].data();

        Alert.alert(
          "⚠️ Duplicate Booking Found",
          `Guest with mobile ${mobile} already has an active booking in Room ${existingGuest.roomNumber}.\n\nDo you want to check out the previous guest and assign a new room?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Checkout Previous & Continue",
              style: "destructive",
              onPress: async () => {
                await checkoutPreviousGuest(uid, existingGuestSnap.docs[0].id, existingGuest.roomNumber);
                await createNewBooking(uid, currentUser);
              }
            }
          ]
        );
        setLoading(false);
        return;
      }

      await createNewBooking(uid, currentUser);

    } catch (err) {
      console.error("Error adding guest:", err);
      Alert.alert("Error", "Failed to add guest");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.backgroundDecor}>
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />
          <View style={styles.bgCircle3} />
        </View>

        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#6B7280" />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.greeting}>Guest Management</Text>
            <Text style={styles.title}>Add New Guest</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconContainer}>
              <Ionicons name="person-add" size={24} color="#fff" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Check-in Guest</Text>
              <Text style={styles.cardSubtitle}>
                Register guest and assign available room
              </Text>
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Guest Name</Text>
              <View style={styles.inputWrapper}>
                <View style={styles.inputIconContainer}>
                  <Ionicons name="person-outline" size={18} color="#2563EB" />
                </View>
                <TextInput
                  placeholder="Enter guest name"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  value={guestName}
                  onChangeText={setGuestName}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mobile Number</Text>
              <View style={styles.inputWrapper}>
                <View style={styles.inputIconContainer}>
                  <Ionicons name="call-outline" size={18} color="#2563EB" />
                </View>
                <TextInput
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  maxLength={10}
                  style={styles.input}
                  value={mobile}
                  onChangeText={(text) => {
                    if (/^\d*$/.test(text)) setMobile(text);
                  }}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Checkout Date & Time</Text>
                {Platform.OS === "web" && (
                  <Pressable
                    onPress={() => {
                      const nextDay = new Date();
                      nextDay.setDate(nextDay.getDate() + 1);
                      nextDay.setHours(11, 0, 0, 0);
                      setCheckoutDate(nextDay);
                    }}
                    style={styles.shortcutBtn}
                  >
                    <Text style={styles.shortcutText}>Set Tomorrow 11AM</Text>
                  </Pressable>
                )}
              </View>

              {Platform.OS === "web" ? (
                <View style={[styles.datePicker, { cursor: "pointer" } as any]}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                  </View>

                  <TextInput
                    style={styles.webDateInput}
                    value={webDateValue}
                    onChangeText={(val) => {
                      if (!val) {
                        setCheckoutDate(null);
                        return;
                      }
                      const d = parseDateTimeLocal(val);
                      if (d) setCheckoutDate(d);
                    }}
                    // @ts-ignore
                    type="datetime-local"
                    min={webMinValue}
                  />

                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" style={{ marginRight: 10 }} />
                </View>
              ) : (
                <>
                  <Pressable style={styles.datePicker} onPress={() => setShowPicker(true)}>
                    <View style={styles.inputIconContainer}>
                      <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                    </View>
                    <Text style={styles.dateText}>
                      {checkoutDate
                        ? checkoutDate.toLocaleString()
                        : "Select checkout date & time"}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </Pressable>

                  {showPicker && (
                    <DateTimePicker
                      value={checkoutDate ?? new Date()}
                      mode="datetime"
                      minimumDate={new Date()}
                      onChange={(_, date) => {
                        setShowPicker(false);
                        if (date) setCheckoutDate(date);
                      }}
                    />
                  )}
                </>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Meal</Text>

              <View style={styles.mealRow}>
                <Pressable
                  onPress={() => toggleMeal("breakfast")}
                  style={({ pressed }) => [
                    styles.mealCircle,
                    selectedMeals.includes("breakfast") && styles.mealCircleSelected,
                    pressed && styles.mealCirclePressed,
                  ]}
                >
                  <Text style={styles.mealEmoji}>🍳</Text>
                  <Text
                    style={[
                      styles.mealLabel,
                      selectedMeals.includes("breakfast") && styles.mealLabelSelected,
                    ]}
                  >
                    Breakfast
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => toggleMeal("lunch")}
                  style={({ pressed }) => [
                    styles.mealCircle,
                    selectedMeals.includes("lunch") && styles.mealCircleSelected,
                    pressed && styles.mealCirclePressed,
                  ]}
                >
                  <Text style={styles.mealEmoji}>🍱</Text>
                  <Text
                    style={[
                      styles.mealLabel,
                      selectedMeals.includes("lunch") && styles.mealLabelSelected,
                    ]}
                  >
                    Lunch
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => toggleMeal("dinner")}
                  style={({ pressed }) => [
                    styles.mealCircle,
                    selectedMeals.includes("dinner") && styles.mealCircleSelected,
                    pressed && styles.mealCirclePressed,
                  ]}
                >
                  <Text style={styles.mealEmoji}>🍽️</Text>
                  <Text
                    style={[
                      styles.mealLabel,
                      selectedMeals.includes("dinner") && styles.mealLabelSelected,
                    ]}
                  >
                    Dinner
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.qrInfo}>
              <Ionicons name="qr-code" size={20} color="#2563EB" />
              <View style={styles.qrContent}>
                <Text style={styles.qrTitle}>QR Access Generated</Text>
                <Text style={styles.qrSubtitle}>
                  Guest can scan QR to access web services
                </Text>
              </View>
            </View>

            {assignedRoom && (
              <View style={styles.successContainer}>
                <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                <View style={styles.successContent}>
                  <Text style={styles.successTitle}>Room Assigned!</Text>
                  <Text style={styles.successSubtitle}>Room {assignedRoom} is now occupied</Text>
                </View>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                loading && styles.buttonDisabled,
                pressed && !loading && styles.buttonPressed,
              ]}
              onPress={assignRoom}
              disabled={loading}
            >
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.buttonText}>Adding Guest...</Text>
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  <Ionicons name="person-add" size={18} color="#fff" />
                  <Text style={styles.buttonText}>Add Guest & Assign Room</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </View>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Each admin’s guests & rooms stay fully isolated
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  backgroundDecor: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  bgCircle1: {
    position: "absolute",
    top: -80,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(37,99,235,0.08)",
  },
  bgCircle2: {
    position: "absolute",
    top: 150,
    left: -100,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(37,99,235,0.05)",
  },
  bgCircle3: {
    position: "absolute",
    bottom: 50,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(37,99,235,0.06)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: { flex: 1, alignItems: "center" },
  headerSpacer: { width: 40 },
  greeting: { color: "#6B7280", fontSize: 11, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    margin: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
    flex: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  cardTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  cardSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  formSection: { gap: 16 },
  inputGroup: { gap: 8 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  shortcutBtn: { backgroundColor: "rgba(37,99,235,0.08)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  shortcutText: { fontSize: 11, fontWeight: "700", color: "#2563EB" },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  inputIconContainer: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(37,99,235,0.05)",
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#111827",
  },
  datePicker: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  dateText: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#111827",
  },
  webDateInput: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#111827",
    outlineStyle: "none" as any,
  },
  mealRow: { flexDirection: "row", justifyContent: "space-between" },
  mealCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  mealCirclePressed: { transform: [{ scale: 0.98 }], opacity: 0.95 },
  mealCircleSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  mealEmoji: { fontSize: 26, marginBottom: 6 },
  mealLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    paddingHorizontal: 6,
  },
  mealLabelSelected: { color: "#FFFFFF" },

  qrInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37,99,235,0.1)",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  qrContent: { flex: 1, marginLeft: 12 },
  qrTitle: { fontSize: 15, fontWeight: "700", color: "#2563EB" },
  qrSubtitle: { fontSize: 13, color: "#2563EB", marginTop: 2 },

  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22,163,74,0.1)",
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  successContent: { flex: 1, marginLeft: 8 },
  successTitle: { fontSize: 15, fontWeight: "700", color: "#16A34A" },
  successSubtitle: { fontSize: 13, color: "#16A34A" },

  button: {
    backgroundColor: "#2563EB",
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonPressed: { backgroundColor: "#1D4ED8", transform: [{ scale: 0.98 }] },
  buttonDisabled: { opacity: 0.7 },
  buttonContent: { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
  buttonText: { color: "#FFF", fontSize: 16, fontWeight: "700" },

  footer: { paddingHorizontal: 16, paddingBottom: 20, alignItems: "center" },
  footerText: { fontSize: 12, color: "#9CA3AF", textAlign: "center" },
});