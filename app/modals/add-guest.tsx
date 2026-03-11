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
  Modal,
  useWindowDimensions,
} from "react-native";
import { useState, useEffect } from "react";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { useTheme } from "../../context/ThemeContext";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
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
  orderBy,
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

// Helper to format room number with leading zeros
const formatRoomNumber = (num: number): string => {
  if (num < 10) return `00${num}`;
  if (num < 100) return `0${num}`;
  return `${num}`;
};

export default function AddGuest() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { theme: activeTheme, colors: theme, setMode } = useTheme();
  const isDark = activeTheme === 'dark';
  const isWide = width >= 820;

  // Add derived theme properties that might be missing in context
  const inputBg = isDark ? '#262626' : '#F9FAFB';
  const placeholder = theme.textMuted;
  const modalBackdrop = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)';

  const [guestName, setGuestName] = useState("");
  const [aadharNumber, setAadharNumber] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [checkinDate, setCheckinDate] = useState<Date | null>(new Date());
  const [checkoutDate, setCheckoutDate] = useState<Date | null>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0);
    return tomorrow;
  });

  const [availableRooms, setAvailableRooms] = useState<any[]>([]);
  const [nextAvailableRoom, setNextAvailableRoom] = useState<any>(null);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [showRoomPicker, setShowRoomPicker] = useState(false);

  // iOS modal pickers
  const [showCheckinPicker, setShowCheckinPicker] = useState(false);
  const [showCheckoutPicker, setShowCheckoutPicker] = useState(false);
  const [iosTempCheckin, setIosTempCheckin] = useState<Date>(new Date());
  const [iosTempCheckout, setIosTempCheckout] = useState<Date>(new Date());

  const [loading, setLoading] = useState(false);
  const [assignedRoom, setAssignedRoom] = useState<number | null>(null);
  const [selectedMeals, setSelectedMeals] = useState<Meal[]>([]);
  const [isFocused, setIsFocused] = useState<{
    name: boolean;
    mobile: boolean;
    email: boolean;
    aadhar: boolean;
    checkin: boolean;
    checkout: boolean;
  }>({
    name: false,
    mobile: false,
    email: false,
    aadhar: false,
    checkin: false,
    checkout: false
  });


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

  // Fetch available rooms on load and whenever a room might be assigned
  const fetchAvailableRooms = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoadingRooms(false);
      return;
    }

    setLoadingRooms(true);
    try {
      const q = query(
        getUserRoomsRef(),
        where("status", "==", "available")
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const rooms = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as any)
        })).sort((a: any, b: any) => (Number(a.roomNumber) || 0) - (Number(b.roomNumber) || 0));

        setAvailableRooms(rooms);

        // Implement Random Assignment: Filter rooms 1-10 for preference
        const preferredPool = rooms.filter(r => {
          const num = Number(r.roomNumber);
          return num >= 1 && num <= 10;
        });

        // Use preferredPool if available, else use all available rooms
        const selectionPool = preferredPool.length > 0 ? preferredPool : rooms;
        const randomIndex = Math.floor(Math.random() * selectionPool.length);
        const randomChoice = selectionPool[randomIndex];

        setNextAvailableRoom(randomChoice);

        // Only auto-select if no room is selected or the selected room is no longer available
        setSelectedRoom((prev: any) => {
          if (!prev) return randomChoice;
          const found = rooms.find(r => r.id === prev.id);
          return found || randomChoice;
        });
      } else {
        setAvailableRooms([]);
        setNextAvailableRoom(null);
        setSelectedRoom(null);
      }
    } catch (err: any) {
      console.error("Error fetching available rooms:", err);
      // If error contains "index", it's a Firestore indexing issue
      if (err.message?.includes("index")) {
        console.warn("Firestore index required for this query combination.");
      }
    } finally {
      setLoadingRooms(false);
    }
  };

  // Initial fetch and refresh when component mounts
  useEffect(() => {
    fetchAvailableRooms();

    // Set up a refresh interval to keep room availability updated
    const interval = setInterval(fetchAvailableRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  // Web-only styling for native datetime-local indicator
  useEffect(() => {
    if (Platform.OS === "web") {
      const style = document.createElement("style");
      style.textContent = `
        input[type="datetime-local"] {
          color-scheme: light;
          accent-color: #2563EB;
        }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
          cursor: pointer;
          opacity: 0.75;
          transition: opacity 0.2s ease;
        }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }
      `;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
  }, []);

  const checkoutPreviousGuest = async (
    adminUid: string,
    guestDocId: string,
    roomNumber: number
  ) => {
    try {
      const batch = writeBatch(db);

      batch.update(doc(db, "guests", guestDocId), {
        isActive: false,
        isLoggedIn: false,
        checkedOutAt: serverTimestamp(),
        checkoutReason: "replaced_by_new_booking",
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
          guestEmail: null,
          guestId: null,
          assignedAt: null,
          checkoutAt: null,
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      console.log("Previous guest checked out successfully");

      // Refresh available rooms after checkout
      await fetchAvailableRooms();
    } catch (error) {
      console.error("Error checking out previous guest:", error);
    }
  };

  // Helper: cross-platform alert
  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
      onOk?.();
    } else {
      Alert.alert(title, message, [{ text: "OK", onPress: onOk }]);
    }
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", style: "destructive", onPress: onConfirm },
      ]);
    }
  };

  const createNewBooking = async (adminUid: string, currentUser: any) => {
    try {
      const roomToBook = selectedRoom || nextAvailableRoom;
      if (!roomToBook) {
        showAlert("Error", "No room selected");
        return;
      }

      const roomRef = getUserRoomRef(roomToBook.id);
      const roomNumber = roomToBook.roomNumber;

      // Create guest data
      const guestData: any = {
        adminId: adminUid,
        adminEmail: currentUser.email,
        guestMobile: mobile,
        guestName: guestName.trim(),
        roomNumber: roomNumber,
        isActive: true,
        isLoggedIn: false,
        createdAt: serverTimestamp(),
        checkinAt: Timestamp.fromDate(checkinDate!),
        checkoutAt: Timestamp.fromDate(checkoutDate!),
        mealPlan: selectedMeals,
      };

      // Add optional fields only if they have values
      if (email.trim()) {
        guestData.guestEmail = email.trim();
      }
      if (aadharNumber.trim()) {
        guestData.aadharNumber = aadharNumber.trim();
      }

      const guestRef = await addDoc(collection(db, "guests"), guestData);

      await runTransaction(db, async (transaction) => {
        const roomSnap = await transaction.get(roomRef);
        if (!roomSnap.exists()) throw "Room missing";
        if (roomSnap.data().status !== "available") throw "Room already occupied";

        const roomUpdateData: any = {
          status: "occupied",
          guestName: guestName.trim(),
          guestMobile: mobile,
          assignedAt: Timestamp.fromDate(checkinDate!),
          checkoutAt: Timestamp.fromDate(checkoutDate!),
          guestId: guestRef.id,
          adminEmail: currentUser.email,
          mealPlan: selectedMeals,
        };

        // Add optional fields only if they have values
        if (email.trim()) {
          roomUpdateData.guestEmail = email.trim();
        }
        if (aadharNumber.trim()) {
          roomUpdateData.guestAadhar = aadharNumber.trim();
        }

        transaction.update(roomRef, roomUpdateData);
      });

      setAssignedRoom(roomNumber);

      // Build guest info message with formatted room number
      let guestInfo = `Guest: ${guestName}\nMobile: ${mobile}`;
      if (email.trim()) guestInfo += `\nEmail: ${email}`;
      if (aadharNumber.trim()) guestInfo += `\nAadhar: ${aadharNumber}`;
      guestInfo += `\nRoom: ${formatRoomNumber(roomNumber)}\nMeal: ${prettyMealText(selectedMeals)}`;

      showAlert("✅ Guest Added Successfully!", guestInfo, () => {
        setGuestName("");
        setMobile("");
        setEmail("");
        setAadharNumber("");
        setCheckinDate(new Date());
        setCheckoutDate(null);
        setSelectedMeals([]);
        setAssignedRoom(null);

        // Refresh available rooms after successful booking
        fetchAvailableRooms();

        router.replace("/(tabs)/rooms");
      });
    } catch (err) {
      console.error("Error creating booking:", err);
      showAlert("Error", "Failed to create booking");

      // Refresh available rooms in case of error
      await fetchAvailableRooms();
    }
  };

  const assignRoom = async () => {
    if (!guestName.trim()) {
      showAlert("Invalid Name", "Guest name is required");
      return;
    }
    if (!/^[0-9]{10}$/.test(mobile)) {
      showAlert("Invalid Mobile", "Mobile number must be exactly 10 digits");
      return;
    }
    if (!checkinDate || !checkoutDate) {
      showAlert("Invalid Dates", "Please select both check-in and check-out dates");
      return;
    }
    if (checkoutDate <= checkinDate) {
      showAlert("Invalid Dates", "Checkout must be after check-in time");
      return;
    }

    // Check if rooms are available before proceeding
    const roomToBook = selectedRoom || nextAvailableRoom;
    if (!roomToBook) {
      showAlert(
        "No Rooms Available",
        "No available rooms at the moment. Please check back later or setup rooms first."
      );
      return;
    }

    setLoading(true);
    try {
      const uid = getCurrentUserId();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        showAlert("Error", "You must be logged in as admin");
        setLoading(false);
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

        showConfirm(
          "⚠️ Duplicate Booking Found",
          `Guest with mobile ${mobile} already has an active booking in Room ${formatRoomNumber(existingGuest.roomNumber)}.\n\nDo you want to check out the previous guest and assign a new room?`,
          async () => {
            try {
              await checkoutPreviousGuest(
                uid,
                existingGuestSnap.docs[0].id,
                existingGuest.roomNumber
              );
              await createNewBooking(uid, currentUser);
            } finally {
              setLoading(false);
            }
          }
        );

        setLoading(false);
        return;
      }

      await createNewBooking(uid, currentUser);
    } catch (err) {
      console.error("Error adding guest:", err);
      showAlert("Error", "Failed to add guest");
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

  const randomizeRoom = () => {
    if (availableRooms.length === 0) return;

    const preferredPool = availableRooms.filter(r => {
      const num = Number(r.roomNumber);
      return num >= 1 && num <= 10;
    });

    const selectionPool = preferredPool.length > 0 ? preferredPool : availableRooms;
    const randomIndex = Math.floor(Math.random() * selectionPool.length);
    setSelectedRoom(selectionPool[randomIndex]);
  };

  // ✅ ANDROID: show Date picker then Time picker
  const openAndroidDateTimePicker = ({
    initial,
    minimumDate,
    onPicked,
    onDone,
  }: {
    initial: Date;
    minimumDate?: Date;
    onPicked: (d: Date) => void;
    onDone?: () => void;
  }) => {
    DateTimePickerAndroid.open({
      value: initial,
      mode: "date",
      minimumDate,
      onChange: (event, date) => {
        if (event.type !== "set" || !date) {
          onDone?.();
          return;
        }

        const pickedDate = new Date(date);

        DateTimePickerAndroid.open({
          value: pickedDate,
          mode: "time",
          onChange: (event2, time) => {
            onDone?.();
            if (event2.type !== "set" || !time) return;

            const finalDate = new Date(pickedDate);
            finalDate.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onPicked(finalDate);
          },
        });
      },
    });
  };

  // Web native input style
  const webNativeDateInputStyle: any = {
    flex: 1,
    minWidth: 0,
    height: 52,
    border: "none",
    outline: "none",
    background: "transparent",
    padding: "16px 12px",
    fontSize: 15,
    color: theme.textMain,
    fontWeight: 500,
    cursor: "pointer",
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bgMain }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.bgMain} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.container, { backgroundColor: theme.bgMain }]}
      >
        {/* Global Navbar */}
        <View style={[styles.navbar, { backgroundColor: theme.bgNav, borderBottomColor: theme.glassBorder }]}>
          <View style={styles.navbarLeft}>
            <Pressable
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace("/(tabs)/rooms");
                }
              }}
              style={[styles.backButton, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
            >
              <Ionicons name="arrow-back" size={20} color={theme.textMain} />
            </Pressable>
            <View style={styles.logoContainer}>
              <Ionicons name="business" size={24} color={theme.primary} />
              <Text style={[styles.logoText, { color: theme.textMain }]}>Roomio</Text>
            </View>
          </View>
          <View style={styles.navbarRight}>
            <View style={styles.breadcrumb}>
              <Text style={[styles.breadcrumbItem, { color: theme.textMuted }]}>Dashboard</Text>
              <Ionicons name="chevron-forward" size={12} color={theme.textMuted} />
              <Text style={[styles.breadcrumbItem, styles.breadcrumbActive, { color: theme.primary }]}>Add Guest</Text>
            </View>
            {/* Theme Toggle */}
            <Pressable
              onPress={() => setMode(isDark ? 'light' : 'dark')}
              style={[styles.themeToggle, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
            >
              <Ionicons
                name={isDark ? "sunny-outline" : "moon-outline"}
                size={20}
                color={theme.primary}
              />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.pageHeader}>
            <Text style={[styles.pageTitle, { color: theme.textMain }]}>Check-in Guest</Text>
            <Text style={[styles.pageSubtitle, { color: theme.textMuted }]}>
              Verify identity and complete room assignment for arriving guests.
            </Text>
          </View>

          <View style={[styles.mainLayout, { flexDirection: isWide ? "row" : "column" }]}>
            {/* Left Column */}
            <View style={styles.formColumn}>
              {/* Guest Details */}
              <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                <View style={styles.cardHeaderSmall}>
                  <Ionicons name="person" size={18} color={theme.primary} />
                  <Text style={[styles.cardTitleSmall, { color: theme.textMain }]}>Guest Details</Text>
                </View>

                <View style={styles.formSection}>
                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: theme.textMuted }]}>Full Name *</Text>
                    <TextInput
                      placeholder="e.g. Alexander Mitchell"
                      placeholderTextColor={theme.placeholder}
                      style={[
                        styles.formInput,
                        {
                          backgroundColor: theme.glass,
                          borderColor: isFocused.name ? theme.primary : theme.glassBorder,
                          color: theme.textMain,
                        },
                      ]}
                      value={guestName}
                      onChangeText={setGuestName}
                      onFocus={() => setIsFocused(prev => ({ ...prev, name: true }))}
                      onBlur={() => setIsFocused(prev => ({ ...prev, name: false }))}
                    />
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={[styles.label, { color: theme.textMuted }]}>Phone Number *</Text>
                      <View style={[
                        styles.iconInputWrapper,
                        {
                          backgroundColor: theme.glass,
                          borderColor: isFocused.mobile ? theme.primary : theme.glassBorder,
                        }
                      ]}>
                        <Ionicons name="call-outline" size={18} color={theme.textMuted} style={styles.inputIcon} />
                        <TextInput
                          placeholder="9876543210"
                          placeholderTextColor={theme.placeholder}
                          style={[styles.iconInput, { color: theme.textMain }]}
                          value={mobile}
                          onChangeText={setMobile}
                          keyboardType="phone-pad"
                          maxLength={10}
                          onFocus={() => setIsFocused(prev => ({ ...prev, mobile: true }))}
                          onBlur={() => setIsFocused(prev => ({ ...prev, mobile: false }))}
                        />
                      </View>
                    </View>

                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={[styles.label, { color: theme.textMuted }]}>Email (Optional)</Text>
                      <View style={[
                        styles.iconInputWrapper,
                        {
                          backgroundColor: theme.glass,
                          borderColor: isFocused.email ? theme.primary : theme.glassBorder,
                        }
                      ]}>
                        <Ionicons name="mail-outline" size={18} color={theme.textMuted} style={styles.inputIcon} />
                        <TextInput
                          placeholder="guest@email.com"
                          placeholderTextColor={theme.placeholder}
                          style={[styles.iconInput, { color: theme.textMain }]}
                          value={email}
                          onChangeText={setEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          onFocus={() => setIsFocused(prev => ({ ...prev, email: true }))}
                          onBlur={() => setIsFocused(prev => ({ ...prev, email: false }))}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Aadhar Number - Optional */}
                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: theme.textMuted }]}>Aadhar Number (Optional)</Text>
                    <View style={[
                      styles.iconInputWrapper,
                      {
                        backgroundColor: theme.glass,
                        borderColor: isFocused.aadhar ? theme.primary : theme.glassBorder,
                      }
                    ]}>
                      <Ionicons name="card-outline" size={18} color={theme.textMuted} style={styles.inputIcon} />
                      <TextInput
                        placeholder="1234 5678 9012"
                        placeholderTextColor={theme.placeholder}
                        style={[styles.iconInput, { color: theme.textMain }]}
                        value={aadharNumber}
                        onChangeText={setAadharNumber}
                        keyboardType="number-pad"
                        maxLength={14}
                        onFocus={() => setIsFocused(prev => ({ ...prev, aadhar: true }))}
                        onBlur={() => setIsFocused(prev => ({ ...prev, aadhar: false }))}
                      />
                    </View>
                  </View>
                </View>
              </View>

              {/* Meal Plan Selection */}
              <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                <View style={styles.cardHeaderSmall}>
                  <Ionicons name="restaurant" size={18} color={theme.primary} />
                  <Text style={[styles.cardTitleSmall, { color: theme.textMain }]}>Meal Plan Selection</Text>
                </View>

                <View style={styles.mealGrid}>
                  {["breakfast", "lunch", "dinner"].map((meal: any) => {
                    const isSelected = selectedMeals.includes(meal);
                    const emoji = meal === "breakfast" ? "🍳" : meal === "lunch" ? "🍱" : "🍽️";
                    return (
                      <Pressable
                        key={meal}
                        onPress={() => toggleMeal(meal)}
                        style={[
                          styles.mealPill,
                          {
                            backgroundColor: theme.glass,
                            borderColor: isSelected ? theme.primary : theme.glassBorder,
                          },
                          isSelected && styles.mealPillActive,
                        ]}
                      >
                        <Text style={styles.mealEmoji}>{emoji}</Text>
                        <Text
                          style={[
                            styles.mealPillText,
                            { color: isSelected ? theme.primary : theme.textMuted },
                          ]}
                        >
                          {meal.charAt(0).toUpperCase() + meal.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Stay Details */}
              <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                <View style={styles.cardHeaderSmall}>
                  <Ionicons name="calendar" size={18} color={theme.primary} />
                  <Text style={[styles.cardTitleSmall, { color: theme.textMain }]}>Stay Details</Text>
                </View>

                <View style={styles.dateRow}>
                  {/* Check-in */}
                  <View style={[styles.dateColumn, { flex: 1 }]}>
                    <Text style={[styles.label, { color: theme.textMuted }]}>Check-in *</Text>
                    {Platform.OS === "web" ? (
                      <View style={[
                        styles.datePickerWeb,
                        {
                          backgroundColor: theme.glass,
                          borderColor: isFocused.checkin ? theme.primary : theme.glassBorder,
                        }
                      ]}>
                        <Ionicons name="calendar-outline" size={18} color={theme.textMuted} style={styles.dateIcon} />
                        <input
                          type="datetime-local"
                          value={webCheckinValue}
                          min={webMinValue}
                          step={60}
                          onChange={(e: any) => {
                            const d = parseDateTimeLocal(e.target.value);
                            if (d) {
                              setCheckinDate(d);
                              if (checkoutDate && d >= checkoutDate) {
                                const next = new Date(d);
                                next.setDate(next.getDate() + 1);
                                setCheckoutDate(next);
                              }
                            }
                          }}
                          onFocus={() => setIsFocused(prev => ({ ...prev, checkin: true }))}
                          onBlur={() => setIsFocused(prev => ({ ...prev, checkin: false }))}
                          style={{
                            ...webNativeDateInputStyle,
                            color: theme.textMain,
                          }}
                        />
                      </View>
                    ) : (
                      <Pressable
                        style={[
                          styles.datePickerNative,
                          {
                            backgroundColor: theme.glass,
                            borderColor: isFocused.checkin ? theme.primary : theme.glassBorder,
                          }
                        ]}
                        onPress={() => {
                          if (Platform.OS === "android") {
                            openAndroidDateTimePicker({
                              initial: checkinDate ?? new Date(),
                              minimumDate: new Date(),
                              onPicked: (d) => {
                                setCheckinDate(d);
                                if (checkoutDate && d >= checkoutDate) {
                                  const next = new Date(d);
                                  next.setDate(next.getDate() + 1);
                                  setCheckoutDate(next);
                                }
                              },
                            });
                          } else {
                            setIosTempCheckin(checkinDate ?? new Date());
                            setShowCheckinPicker(true);
                          }
                          setIsFocused(prev => ({ ...prev, checkin: true }));
                        }}
                      >
                        <Ionicons name="calendar-outline" size={18} color={theme.textMuted} style={styles.dateIcon} />
                        <Text style={[styles.dateText, { color: theme.textMain }]} numberOfLines={1}>
                          {formatDateDisplay(checkinDate)}
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Check-out */}
                  <View style={[styles.dateColumn, { flex: 1 }]}>
                    <Text style={[styles.label, { color: theme.textMuted }]}>Check-out *</Text>
                    {Platform.OS === "web" ? (
                      <View style={[
                        styles.datePickerWeb,
                        {
                          backgroundColor: theme.glass,
                          borderColor: isFocused.checkout ? theme.primary : theme.glassBorder,
                        }
                      ]}>
                        <Ionicons name="calendar-outline" size={18} color={theme.textMuted} style={styles.dateIcon} />
                        <input
                          type="datetime-local"
                          value={webCheckoutValue}
                          min={webCheckinValue || webMinValue}
                          step={60}
                          onChange={(e: any) => {
                            const d = parseDateTimeLocal(e.target.value);
                            if (d) setCheckoutDate(d);
                          }}
                          onFocus={() => setIsFocused(prev => ({ ...prev, checkout: true }))}
                          onBlur={() => setIsFocused(prev => ({ ...prev, checkout: false }))}
                          style={{
                            ...webNativeDateInputStyle,
                            color: theme.textMain,
                          }}
                        />
                      </View>
                    ) : (
                      <Pressable
                        style={[
                          styles.datePickerNative,
                          {
                            backgroundColor: theme.glass,
                            borderColor: isFocused.checkout ? theme.primary : theme.glassBorder,
                          }
                        ]}
                        onPress={() => {
                          if (Platform.OS === "android") {
                            openAndroidDateTimePicker({
                              initial: checkoutDate ?? new Date(),
                              minimumDate: checkinDate ?? new Date(),
                              onPicked: (d) => setCheckoutDate(d),
                            });
                          } else {
                            setIosTempCheckout(checkoutDate ?? new Date());
                            setShowCheckoutPicker(true);
                          }
                          setIsFocused(prev => ({ ...prev, checkout: true }));
                        }}
                      >
                        <Ionicons name="calendar-outline" size={18} color={theme.textMuted} style={styles.dateIcon} />
                        <Text style={[styles.dateText, { color: theme.textMain }]} numberOfLines={1}>
                          {formatDateDisplay(checkoutDate)}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* Right Column / Sidebar */}
            <View style={styles.sidebarColumn}>
              <View style={[styles.sidebarCard, { backgroundColor: theme.bgCard, borderColor: theme.primary }]}>
                <View style={styles.sidebarHeader}>
                  <Text style={[styles.sidebarTitle, { color: theme.textMain }]}>BOOKING SUMMARY</Text>
                  <Text style={[styles.sidebarId, { color: theme.textMuted }]}>ID: NEW-BOOKING</Text>
                </View>

                <View style={styles.summaryItem}>
                  <View style={[styles.summaryLabelBox, { flex: 1 }]}>
                    <View style={styles.summaryTitleRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>ROOM ASSIGNMENT</Text>
                      {availableRooms.length > 1 && (
                        <Pressable onPress={randomizeRoom} style={styles.randomizeMiniBtn}>
                          <Ionicons name="shuffle" size={14} color={theme.primary} />
                          <Text style={[styles.randomizeMiniText, { color: theme.primary }]}>Randomize</Text>
                        </Pressable>
                      )}
                    </View>
                    <Pressable
                      onPress={() => availableRooms.length > 0 && setShowRoomPicker(true)}
                      style={[
                        styles.roomSelectorTrigger,
                        { borderColor: selectedRoom ? theme.primary : theme.glassBorder, backgroundColor: theme.glass }
                      ]}
                      disabled={loadingRooms || availableRooms.length === 0}
                    >
                      <View style={styles.roomSelectorInfo}>
                        <Ionicons name="apps-outline" size={18} color={theme.primary} />
                        <Text style={[styles.summaryValue, { color: theme.textMain, marginLeft: 8 }]}>
                          {loadingRooms ? (
                            <ActivityIndicator size="small" color={theme.primary} />
                          ) : selectedRoom ? (
                            formatRoomNumber(selectedRoom.roomNumber)
                          ) : (
                            "N/A"
                          )}
                        </Text>
                      </View>
                      {!loadingRooms && availableRooms.length > 0 && (
                        <View style={styles.roomSelectorAction}>
                          <Text style={[styles.roomSelectorActionText, { color: theme.primary }]}>Change</Text>
                          <Ionicons name="chevron-down" size={16} color={theme.primary} />
                        </View>
                      )}
                    </Pressable>
                    {!loadingRooms && availableRooms.length > 0 && (
                      <Text style={[styles.roomModeHelper, { color: theme.textMuted }]}>
                        {selectedRoom?.roomNumber <= 10 ? "✨ Auto-assigned (Range 1-10)" : "👤 Manually selected"}
                      </Text>
                    )}
                    {(!loadingRooms && availableRooms.length === 0) && (
                      <Text style={[styles.noRoomsWarning, { color: theme.danger }]}>No Rooms Available</Text>
                    )}
                  </View>
                  <View style={styles.summaryLabelBox}>
                    <Text style={[styles.summaryLabel, { color: theme.textMuted, textAlign: 'right' }]}>STAY</Text>
                    <Text style={[styles.summaryValue, { color: theme.textMain, textAlign: 'right', marginTop: 8 }]}>
                      {checkinDate && checkoutDate
                        ? Math.ceil((checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 3600 * 24))
                        : 1}
                      <Text style={[styles.summarySub, { color: theme.textMuted }]}> Nights</Text>
                    </Text>
                  </View>
                </View>

                <View style={[styles.summaryDivider, { backgroundColor: theme.glassBorder }]} />

                <View style={styles.guestInfoSummary}>
                  <Text style={[styles.guestInfoLabel, { color: theme.textMuted }]}>Guest</Text>
                  <Text style={[styles.guestInfoValue, { color: theme.textMain }]} numberOfLines={1}>
                    {guestName || "Not entered"}
                  </Text>
                  <Text style={[styles.guestInfoValueSmall, { color: theme.textMuted }]} numberOfLines={1}>
                    {mobile || "No phone"}
                  </Text>
                  {email ? (
                    <Text style={[styles.guestInfoValueSmall, { color: theme.textMuted, marginTop: 4 }]} numberOfLines={1}>
                      {email}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.mealSummary}>
                  <Text style={[styles.guestInfoLabel, { color: theme.textMuted }]}>Meal Plan</Text>
                  <Text style={[styles.guestInfoValue, { color: theme.textMain }]}>
                    {prettyMealText(selectedMeals) || "None selected"}
                  </Text>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.completeBtn,
                    {
                      backgroundColor: (selectedRoom || nextAvailableRoom) ? theme.primary : theme.textMuted,
                      opacity: (!(selectedRoom || nextAvailableRoom) || loadingRooms) ? 0.5 : 1
                    },
                    pressed && (selectedRoom || nextAvailableRoom) && styles.completeBtnPressed,
                  ]}
                  onPress={assignRoom}
                  disabled={loading || !(selectedRoom || nextAvailableRoom) || loadingRooms}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="key" size={20} color="#fff" />
                      <Text style={styles.completeBtnText}>
                        {loadingRooms ? "CHECKING ROOMS..." :
                          (selectedRoom || nextAvailableRoom) ? "COMPLETE CHECK-IN" : "NO ROOMS AVAILABLE"}
                      </Text>
                    </>
                  )}
                </Pressable>

                {(selectedRoom || nextAvailableRoom) && (
                  <Text style={[styles.roomAvailabilityText, { color: theme.success }]}>
                    ✓ Room {formatRoomNumber((selectedRoom || nextAvailableRoom).roomNumber)} is available
                  </Text>
                )}

                <Text style={[styles.termsText, { color: theme.textMuted }]}>
                  By clicking complete, you confirm guest verification and room readiness.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* ✅ iOS CHECK-IN Modal */}
        {Platform.OS === "ios" && (
          <Modal
            visible={showCheckinPicker}
            transparent
            animationType="slide"
            onRequestClose={() => {
              setShowCheckinPicker(false);
              setIsFocused((prev) => ({ ...prev, checkin: false }));
            }}
          >
            <Pressable
              style={[styles.modalBackdrop, { backgroundColor: theme.modalBackdrop }]}
              onPress={() => {
                setShowCheckinPicker(false);
                setIsFocused((prev) => ({ ...prev, checkin: false }));
              }}
            />
            <View style={[styles.modalSheet, { backgroundColor: theme.bgCard }]}>
              <View style={styles.modalHeader}>
                <Pressable
                  onPress={() => {
                    setShowCheckinPicker(false);
                    setIsFocused((prev) => ({ ...prev, checkin: false }));
                  }}
                >
                  <Text style={[styles.modalAction, { color: theme.textMuted }]}>Cancel</Text>
                </Pressable>

                <Text style={[styles.modalTitle, { color: theme.textMain }]}>Select Check-in</Text>

                <Pressable
                  onPress={() => {
                    setShowCheckinPicker(false);
                    setIsFocused((prev) => ({ ...prev, checkin: false }));
                    setCheckinDate(iosTempCheckin);
                    if (checkoutDate && iosTempCheckin >= checkoutDate) {
                      const newCheckout = new Date(iosTempCheckin);
                      newCheckout.setDate(newCheckout.getDate() + 1);
                      setCheckoutDate(newCheckout);
                    }
                  }}
                >
                  <Text style={[styles.modalAction, styles.modalActionPrimary, { color: theme.primary }]}>
                    Done
                  </Text>
                </Pressable>
              </View>

              <DateTimePicker
                value={iosTempCheckin}
                mode="datetime"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, date) => {
                  if (date) setIosTempCheckin(date);
                }}
              />
            </View>
          </Modal>
        )}

        {/* ✅ iOS CHECK-OUT Modal */}
        {Platform.OS === "ios" && (
          <Modal
            visible={showCheckoutPicker}
            transparent
            animationType="slide"
            onRequestClose={() => {
              setShowCheckoutPicker(false);
              setIsFocused((prev) => ({ ...prev, checkout: false }));
            }}
          >
            <Pressable
              style={[styles.modalBackdrop, { backgroundColor: theme.modalBackdrop }]}
              onPress={() => {
                setShowCheckoutPicker(false);
                setIsFocused((prev) => ({ ...prev, checkout: false }));
              }}
            />
            <View style={[styles.modalSheet, { backgroundColor: theme.bgCard }]}>
              <View style={styles.modalHeader}>
                <Pressable
                  onPress={() => {
                    setShowCheckoutPicker(false);
                    setIsFocused((prev) => ({ ...prev, checkout: false }));
                  }}
                >
                  <Text style={[styles.modalAction, { color: theme.textMuted }]}>Cancel</Text>
                </Pressable>

                <Text style={[styles.modalTitle, { color: theme.textMain }]}>Select Check-out</Text>

                <Pressable
                  onPress={() => {
                    setShowCheckoutPicker(false);
                    setIsFocused((prev) => ({ ...prev, checkout: false }));
                    setCheckoutDate(iosTempCheckout);
                  }}
                >
                  <Text style={[styles.modalAction, styles.modalActionPrimary, { color: theme.primary }]}>
                    Done
                  </Text>
                </Pressable>
              </View>

              <DateTimePicker
                value={iosTempCheckout}
                mode="datetime"
                display="spinner"
                minimumDate={checkinDate ?? new Date()}
                onChange={(_, date) => {
                  if (date) setIosTempCheckout(date);
                }}
              />
            </View>
          </Modal>
        )}

        {/* Room Selection Modal */}
        <Modal
          visible={showRoomPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRoomPicker(false)}
        >
          <View style={[styles.modalBackdrop, { backgroundColor: theme.modalBackdrop }]}>
            <Pressable style={styles.modalBackdrop} onPress={() => setShowRoomPicker(false)} />
            <View style={[styles.roomPickerCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.textMain }]}>Select Available Room</Text>
                <Pressable onPress={() => setShowRoomPicker(false)}>
                  <Ionicons name="close" size={24} color={theme.textMuted} />
                </Pressable>
              </View>
              <ScrollView style={styles.roomList} showsVerticalScrollIndicator={false}>
                <View style={styles.roomGrid}>
                  {availableRooms.map((room) => (
                    <Pressable
                      key={room.id}
                      style={[
                        styles.roomItem,
                        {
                          backgroundColor: theme.glass,
                          borderColor: selectedRoom?.id === room.id ? theme.primary : theme.glassBorder
                        },
                        selectedRoom?.id === room.id && styles.roomItemActive
                      ]}
                      onPress={() => {
                        setSelectedRoom(room);
                        setShowRoomPicker(false);
                      }}
                    >
                      <Text style={[
                        styles.roomItemText,
                        { color: selectedRoom?.id === room.id ? theme.primary : theme.textMain }
                      ]}>
                        {formatRoomNumber(room.roomNumber)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView >
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  navbar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  navbarLeft: { flexDirection: 'row', alignItems: 'center' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoText: { fontSize: 20, fontWeight: '800' },
  navbarRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6, display: 'none' },
  backButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginRight: 12 },
  breadcrumbItem: { fontSize: 13, fontWeight: '500' },
  breadcrumbActive: { fontWeight: '600' },
  themeToggle: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  pageHeader: { paddingHorizontal: 20, paddingTop: 32, marginBottom: 32 },
  pageTitle: { fontSize: 32, fontWeight: '800', marginBottom: 8 },
  pageSubtitle: { fontSize: 16, lineHeight: 24 },

  mainLayout: { paddingHorizontal: 20, gap: 24 },
  formColumn: { flex: 2, gap: 24 },
  sidebarColumn: { flex: 1, gap: 24 },

  card: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  cardTitleSmall: { fontSize: 16, fontWeight: '700' },

  formSection: { gap: 20 },
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  formInput: {
    height: 52,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 15,
    borderWidth: 1,
  },
  inputRow: { flexDirection: 'row', gap: 16 },
  iconInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  inputIcon: { marginLeft: 16 },
  iconInput: {
    flex: 1,
    height: 52,
    paddingHorizontal: 12,
    fontSize: 15,
  },

  mealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  mealPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    borderWidth: 1,
    gap: 8,
  },
  mealPillActive: {
    borderWidth: 2,
  },
  mealEmoji: { fontSize: 16 },
  mealPillText: { fontSize: 14, fontWeight: '600' },

  dateRow: { flexDirection: 'row', gap: 16 },
  dateColumn: { gap: 8 },
  datePickerWeb: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    height: 52,
  },
  datePickerNative: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    height: 52,
  },
  dateIcon: { marginLeft: 12 },
  dateText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingHorizontal: 12,
  },

  sidebarCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  sidebarHeader: { marginBottom: 24 },
  sidebarTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  sidebarId: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryLabelBox: { gap: 4 },
  summaryLabel: { fontSize: 11, fontWeight: '800' },
  summaryValue: { fontSize: 24, fontWeight: '900' },
  summarySub: { fontSize: 13, fontWeight: '600' },
  summaryDivider: { height: 1, marginVertical: 16 },

  guestInfoSummary: { marginBottom: 16 },
  guestInfoLabel: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  guestInfoValue: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  guestInfoValueSmall: { fontSize: 14, fontWeight: '600' },
  mealSummary: { marginBottom: 24 },

  completeBtn: {
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  completeBtnPressed: { transform: [{ scale: 0.98 }] },
  completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  roomAvailabilityText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12
  },
  termsText: { fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 16 },

  modalBackdrop: { flex: 1 },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalAction: { fontSize: 16, fontWeight: '700' },
  modalActionPrimary: { fontWeight: '900' },

  roomSelectorTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    marginTop: 8,
  },
  roomSelectorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomSelectorAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomSelectorActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  randomizeMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  randomizeMiniText: {
    fontSize: 11,
    fontWeight: '800',
  },
  roomModeHelper: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
    fontStyle: 'italic',
  },
  noRoomsWarning: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  roomPickerCard: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  roomList: {
    marginTop: 20,
  },
  roomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  roomItem: {
    width: '30%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  roomItemActive: {
    borderWidth: 2,
  },
  roomItemText: {
    fontSize: 18,
    fontWeight: '800',
  },
});
