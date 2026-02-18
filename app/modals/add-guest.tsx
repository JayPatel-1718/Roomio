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
  ScrollView,
  StatusBar,
} from "react-native";
import { useState, useEffect, useRef } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
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
  const [checkinDate, setCheckinDate] = useState<Date | null>(new Date());
  const [checkoutDate, setCheckoutDate] = useState<Date | null>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0);
    return tomorrow;
  });
  const [showCheckinPicker, setShowCheckinPicker] = useState(false);
  const [showCheckoutPicker, setShowCheckoutPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assignedRoom, setAssignedRoom] = useState<number | null>(null);
  const [selectedMeals, setSelectedMeals] = useState<Meal[]>([]);
  const [isFocused, setIsFocused] = useState<{
    name: boolean;
    mobile: boolean;
    checkin: boolean;
    checkout: boolean;
  }>({ name: false, mobile: false, checkin: false, checkout: false });

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

  const webCheckinValue = checkinDate ? formatDateTimeLocal(checkinDate) : "";
  const webCheckoutValue = checkoutDate ? formatDateTimeLocal(checkoutDate) : "";
  const webMinValue = formatDateTimeLocal(new Date());

  // Inject web-specific styles for datetime input enhancement
  useEffect(() => {
    if (Platform.OS === "web") {
      const style = document.createElement("style");
      style.textContent = `
        input[type="datetime-local"] {
          color-scheme: light;
          accent-color: #2563EB;
        }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
          filter: invert(0.5);
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.2s ease;
        }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }
        .date-input-wrapper:focus-within {
          border-color: #2563EB !important;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12) !important;
          background-color: #FFFFFF !important;
        }
        .meal-option:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(37, 99, 235, 0.15) !important;
        }
        .btn-primary:hover {
          filter: brightness(1.05);
          transform: translateY(-1px);
        }
        @media (min-width: 768px) {
          .form-card {
            max-width: 680px;
            margin: 0 auto;
          }
        }
      `;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
  }, []);

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
        checkinAt: Timestamp.fromDate(checkinDate!),
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
          assignedAt: Timestamp.fromDate(checkinDate!),
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
              setCheckinDate(new Date());
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
    if (!checkinDate || !checkoutDate) {
      Alert.alert("Invalid Dates", "Please select both check-in and check-out dates");
      return;
    }
    if (checkoutDate <= checkinDate) {
      Alert.alert("Invalid Dates", "Checkout must be after check-in time");
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

  const formatDateDisplay = (date: Date | null) => {
    if (!date) return "Select date & time";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.backgroundDecor}>
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />
          <View style={styles.bgCircle3} />
          <LinearGradient
            colors={["rgba(37,99,235,0.05)", "transparent"]}
            style={styles.bgGradient}
          />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
              Platform.OS === "web" && styles.backButtonHover,
            ]}
          >
            <Ionicons name="arrow-back" size={20} color="#6B7280" />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.greeting}>Guest Management</Text>
            <Text style={styles.title}>Add New Guest</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[
            styles.card,
            Platform.OS === "web" && { maxWidth: 680, width: "100%", alignSelf: "center" }
          ]}>
            {/* Card Header */}
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
              {/* Guest Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Guest Name</Text>
                <View style={[
                  styles.inputWrapper,
                  isFocused.name && styles.inputFocused,
                ]}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="person-outline" size={18} color={isFocused.name ? "#2563EB" : "#9CA3AF"} />
                  </View>
                  <TextInput
                    placeholder="Enter guest name"
                    placeholderTextColor="#9CA3AF"
                    style={styles.input}
                    value={guestName}
                    onChangeText={setGuestName}
                    onFocus={() => setIsFocused(prev => ({ ...prev, name: true }))}
                    onBlur={() => setIsFocused(prev => ({ ...prev, name: false }))}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Mobile Number */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Mobile Number</Text>
                <View style={[
                  styles.inputWrapper,
                  isFocused.mobile && styles.inputFocused,
                ]}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="call-outline" size={18} color={isFocused.mobile ? "#2563EB" : "#9CA3AF"} />
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
                    onFocus={() => setIsFocused(prev => ({ ...prev, mobile: true }))}
                    onBlur={() => setIsFocused(prev => ({ ...prev, mobile: false }))}
                  />
                </View>
              </View>

              {/* Date Grid - Enhanced Calendar/Time Picker */}
              <View style={styles.dateGrid}>
                {/* Check-in */}
                <View style={styles.dateColumn}>
                  <Text style={styles.label}>Check-in Date & Time</Text>
                  {Platform.OS === "web" ? (
                    <View style={[
                      styles.datePicker,
                      isFocused.checkin && styles.datePickerFocused,
                    ]}>
                      <View style={styles.inputIconContainer}>
                        <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                      </View>
                      <TextInput
                        style={styles.webDateInput}
                        value={webCheckinValue}
                        onChangeText={(val) => {
                          if (!val) return;
                          const d = parseDateTimeLocal(val);
                          if (d) setCheckinDate(d);
                        }}
                        onFocus={() => setIsFocused(prev => ({ ...prev, checkin: true }))}
                        onBlur={() => setIsFocused(prev => ({ ...prev, checkin: false }))}
                        // @ts-ignore - native HTML5 datetime-local input
                        type="datetime-local"
                        min={webMinValue}
                      />
                    </View>
                  ) : (
                    <>
                      <Pressable
                        style={[
                          styles.datePicker,
                          isFocused.checkin && styles.datePickerFocused,
                        ]}
                        onPress={() => setShowCheckinPicker(true)}
                      >
                        <View style={styles.inputIconContainer}>
                          <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                        </View>
                        <Text
                          style={[
                            styles.dateText,
                            !checkinDate && styles.datePlaceholder,
                          ]}
                          numberOfLines={1}
                        >
                          {formatDateDisplay(checkinDate)}
                        </Text>
                        <View style={styles.datePickerChevron}>
                          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                        </View>
                      </Pressable>
                      {showCheckinPicker && (
                        <DateTimePicker
                          value={checkinDate ?? new Date()}
                          mode="datetime"
                          display={Platform.OS === "ios" ? "spinner" : "default"}
                          onChange={(_, date) => {
                            setShowCheckinPicker(false);
                            if (date) {
                              setCheckinDate(date);
                              // Auto-adjust checkout if it's before new checkin
                              if (checkoutDate && date >= checkoutDate) {
                                const newCheckout = new Date(date);
                                newCheckout.setDate(newCheckout.getDate() + 1);
                                setCheckoutDate(newCheckout);
                              }
                            }
                          }}
                          minimumDate={new Date()}
                        />
                      )}
                    </>
                  )}
                </View>

                {/* Check-out */}
                <View style={styles.dateColumn}>
                  <Text style={styles.label}>Check-out Date & Time</Text>
                  {Platform.OS === "web" ? (
                    <View style={[
                      styles.datePicker,
                      isFocused.checkout && styles.datePickerFocused,
                    ]}>
                      <View style={styles.inputIconContainer}>
                        <Ionicons name="exit-outline" size={18} color="#2563EB" />
                      </View>
                      <TextInput
                        style={styles.webDateInput}
                        value={webCheckoutValue}
                        onChangeText={(val) => {
                          if (!val) return;
                          const d = parseDateTimeLocal(val);
                          if (d) setCheckoutDate(d);
                        }}
                        onFocus={() => setIsFocused(prev => ({ ...prev, checkout: true }))}
                        onBlur={() => setIsFocused(prev => ({ ...prev, checkout: false }))}
                        // @ts-ignore
                        type="datetime-local"
                        min={webCheckinValue || webMinValue}
                      />
                    </View>
                  ) : (
                    <>
                      <Pressable
                        style={[
                          styles.datePicker,
                          isFocused.checkout && styles.datePickerFocused,
                        ]}
                        onPress={() => setShowCheckoutPicker(true)}
                      >
                        <View style={styles.inputIconContainer}>
                          <Ionicons name="exit-outline" size={18} color="#2563EB" />
                        </View>
                        <Text
                          style={[
                            styles.dateText,
                            !checkoutDate && styles.datePlaceholder,
                          ]}
                          numberOfLines={1}
                        >
                          {formatDateDisplay(checkoutDate)}
                        </Text>
                        <View style={styles.datePickerChevron}>
                          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                        </View>
                      </Pressable>
                      {showCheckoutPicker && (
                        <DateTimePicker
                          value={checkoutDate ?? new Date()}
                          mode="datetime"
                          display={Platform.OS === "ios" ? "spinner" : "default"}
                          minimumDate={checkinDate ?? new Date()}
                          onChange={(_, date) => {
                            setShowCheckoutPicker(false);
                            if (date) setCheckoutDate(date);
                          }}
                        />
                      )}
                    </>
                  )}
                </View>
              </View>

              {/* Meal Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Meal Plan</Text>
                <View style={styles.mealRow}>
                  {(["breakfast", "lunch", "dinner"] as Meal[]).map((meal) => {
                    const isSelected = selectedMeals.includes(meal);
                    const emoji = meal === "breakfast" ? "🍳" : meal === "lunch" ? "🍱" : "🍽️";
                    const label = meal.charAt(0).toUpperCase() + meal.slice(1);
                    return (
                      <Pressable
                        key={meal}
                        onPress={() => toggleMeal(meal)}
                        style={({ pressed }) => [
                          styles.mealCircle,
                          isSelected && styles.mealCircleSelected,
                          pressed && styles.mealCirclePressed,
                          Platform.OS === "web" && isSelected && { transform: [{ translateY: -2 }] }
                        ]}
                      >
                        <View style={styles.mealContent}>
                          <Text style={styles.mealEmoji}>{emoji}</Text>
                          <Text style={[
                            styles.mealLabel,
                            isSelected && styles.mealLabelSelected,
                          ]}>
                            {label}
                          </Text>
                        </View>
                        {isSelected && (
                          <View style={styles.mealCheckmark}>
                            <Ionicons name="checkmark" size={12} color="#fff" />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* QR Info */}
              <View style={styles.qrInfo}>
                <View style={styles.qrIcon}>
                  <Ionicons name="qr-code" size={18} color="#2563EB" />
                </View>
                <View style={styles.qrContent}>
                  <Text style={styles.qrTitle}>QR Access Generated</Text>
                  <Text style={styles.qrSubtitle}>
                    Guest can scan QR to access web services
                  </Text>
                </View>
              </View>

              {/* Success Message */}
              {assignedRoom && (
                <View style={styles.successContainer}>
                  <View style={styles.successIcon}>
                    <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                  </View>
                  <View style={styles.successContent}>
                    <Text style={styles.successTitle}>Room Assigned!</Text>
                    <Text style={styles.successSubtitle}>Room {assignedRoom} is now occupied</Text>
                  </View>
                </View>
              )}

              {/* Submit Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.buttonPrimary,
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
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Each admin's guests & rooms stay fully isolated
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ✨ Enhanced Styles - Optimized for all platforms
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  backgroundDecor: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    pointerEvents: "none",
  },
  bgGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40%",
  },
  bgCircle1: {
    position: "absolute",
    top: -100,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(37, 99, 235, 0.07)",
  },
  bgCircle2: {
    position: "absolute",
    top: "40%",
    left: -130,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(37, 99, 235, 0.05)",
  },
  bgCircle3: {
    position: "absolute",
    bottom: -70,
    right: -60,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "rgba(37, 99, 235, 0.04)",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    zIndex: 10,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonPressed: {
    backgroundColor: "#E5E7EB",
    transform: [{ scale: 0.96 }],
  },
  backButtonHover: {
    // Web hover handled via CSS
  },
  headerContent: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  headerSpacer: {
    width: 42,
  },
  greeting: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    margin: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09,
    shadowRadius: 24,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
    lineHeight: 20,
  },
  formSection: {
    gap: 20,
  },
  inputGroup: {
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    letterSpacing: 0.2,
    marginLeft: 2,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  inputFocused: {
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  inputIconContainer: {
    width: 48,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.06)",
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#111827",
    fontWeight: "500",
  },
  dateGrid: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: 14,
  },
  dateColumn: {
    flex: 1,
    gap: 10,
  },
  datePicker: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    minHeight: 52,
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  datePickerFocused: {
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  dateText: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#111827",
    fontWeight: "500",
  },
  datePlaceholder: {
    color: "#9CA3AF",
  },
  datePickerChevron: {
    padding: 16,
    paddingRight: 18,
  },
  webDateInput: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#111827",
    fontWeight: "500",
    borderWidth: 0,
    backgroundColor: "transparent",
    minHeight: 52,
    ...Platform.select({
      web: {
        outlineStyle: "none",
        cursor: "pointer",
      } as any,
      default: {},
    }),
  },
  mealRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  mealCircle: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
    position: "relative",
    overflow: "hidden",
  },
  mealCirclePressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.95,
  },
  mealCircleSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  mealContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  mealEmoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  mealLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4B5563",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  mealLabelSelected: {
    color: "#FFFFFF",
  },
  mealCheckmark: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  qrInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(37,99,235,0.08)",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.15)",
  },
  qrIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(37,99,235,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  qrContent: {
    flex: 1,
  },
  qrTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
    marginBottom: 2,
  },
  qrSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 18,
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(22,163,74,0.08)",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(22,163,74,0.15)",
  },
  successIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(22,163,74,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  successContent: {
    flex: 1,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#16A34A",
    marginBottom: 2,
  },
  successSubtitle: {
    fontSize: 12,
    color: "#16A34A",
    lineHeight: 18,
  },
  button: {
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
    overflow: "hidden",
    position: "relative",
  },
  buttonPrimary: {
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 9,
  },
  buttonPressed: {
    backgroundColor: "#1D4ED8",
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 2,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  footerText: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "500",
  },
});