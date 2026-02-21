import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Pressable,
  useWindowDimensions,
  Alert,
  Animated,
  useColorScheme,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import { getAuth } from "firebase/auth";
import { useRouter } from "expo-router";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

interface TimeRange {
  label: string;
  key: "week" | "month" | "year";
  days: number;
}

interface AnalyticsData {
  // Revenue
  totalRevenue: number;
  revenueChange: number;

  // Rooms
  activeRooms: number;
  availableRooms: number;
  occupancyRate: number;
  totalRooms: number;

  // Service Requests
  serviceRequests: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  };
  completionRate: number;

  // Food Orders
  foodOrders: {
    total: number;
    pending: number;
    accepted: number;
    completed: number;
    cancelled: number;
  };

  // Performance
  avgResponseTime: number;
  avgPreparationTime: number;

  // Chart Data
  dailyRevenue: Array<{ day: string; revenue: number }>;
  dailyOrders: Array<{ day: string; count: number }>;
  peakHours: Array<{ hour: string; orders: number }>;
  topItems: Array<{ name: string; count: number; revenue: number }>;
  topServices: Array<{ name: string; count: number; revenue: number }>;

  // Guest Stats
  totalGuests: number;
  checkedInGuests: number;
  avgStayDuration: number;

  // Summary
  totalOrders: number;
  totalServiceRequests: number;
  pendingCount: number;
}

interface RoomExportData {
  roomNumber: number;
  guestName: string;
  guestMobile: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  roomRate: number;
  roomCharges: number;
  foodOrders: number;
  foodTotal: number;
  serviceRequests: number;
  serviceTotal: number;
  totalCharges: number;
  status: string;
}

const TIME_RANGES: TimeRange[] = [
  { label: "7 Days", key: "week", days: 7 },
  { label: "30 Days", key: "month", days: 30 },
  { label: "12 Months", key: "year", days: 365 },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];

export default function AnalyticsDashboard() {
  const auth = getAuth();
  const user = auth.currentUser;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const systemColorScheme = useColorScheme();

  const isSmall = width < 380;
  const isMedium = width >= 380 && width < 600;
  const isLarge = width >= 600;
  const isWide = width >= 900;

  // ✅ Theme state (dark/light)
  const [isDark, setIsDark] = useState(systemColorScheme === "dark");

  const [selectedRange, setSelectedRange] = useState<"week" | "month" | "year">("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalRevenue: 0,
    revenueChange: 0,
    activeRooms: 0,
    availableRooms: 0,
    occupancyRate: 0,
    totalRooms: 0,
    serviceRequests: {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
    },
    completionRate: 0,
    foodOrders: {
      total: 0,
      pending: 0,
      accepted: 0,
      completed: 0,
      cancelled: 0,
    },
    avgResponseTime: 0,
    avgPreparationTime: 0,
    dailyRevenue: [],
    dailyOrders: [],
    peakHours: [],
    topItems: [],
    topServices: [],
    totalGuests: 0,
    checkedInGuests: 0,
    avgStayDuration: 0,
    totalOrders: 0,
    totalServiceRequests: 0,
    pendingCount: 0,
  });

  // ✅ CSV Export State
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState<Date | null>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // Default to last 30 days
    return date;
  });
  const [exportEndDate, setExportEndDate] = useState<Date | null>(new Date());
  const [exporting, setExporting] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [iosTempStart, setIosTempStart] = useState<Date>(new Date());
  const [iosTempEnd, setIosTempEnd] = useState<Date>(new Date());
  const [exportData, setExportData] = useState<RoomExportData[]>([]);

  // ✅ Dynamic theme object
  const theme = isDark
    ? {
      bgMain: "#010409",
      bgCard: "rgba(13, 17, 23, 0.6)",
      bgNav: "rgba(1, 4, 9, 0.8)",
      textMain: "#f0f6fc",
      textMuted: "#8b949e",
      glass: "rgba(255, 255, 255, 0.03)",
      glassBorder: "rgba(255, 255, 255, 0.1)",
      shadow: "rgba(0, 0, 0, 0.6)",
      primary: "#2563eb",
      primaryHover: "#1d4ed8",
      primaryGlow: "rgba(37, 99, 235, 0.35)",
      accent: "#38bdf8",
      success: "#22c55e",
      warning: "#f59e0b",
      danger: "#ef4444",
    }
    : {
      bgMain: "#f8fafc",
      bgCard: "#ffffff",
      bgNav: "rgba(248, 250, 252, 0.9)",
      textMain: "#0f172a",
      textMuted: "#64748b",
      glass: "rgba(37, 99, 235, 0.04)",
      glassBorder: "rgba(37, 99, 235, 0.12)",
      shadow: "rgba(37, 99, 235, 0.15)",
      primary: "#2563eb",
      primaryHover: "#1d4ed8",
      primaryGlow: "rgba(37, 99, 235, 0.25)",
      accent: "#0ea5e9",
      success: "#16a34a",
      warning: "#f59e0b",
      danger: "#dc2626",
    };

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!user) {
      router.replace("/admin-login");
      return;
    }
    loadAnalytics(user.uid, selectedRange);
  }, [user, selectedRange]);

  // Date helpers
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const formatDateTimeLocal = (d: Date) => {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
      d.getHours()
    )}:${pad2(d.getMinutes())}`;
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
  const formatDateDisplay = (date: Date | null) => {
    if (!date) return "Select date";
    return date.toLocaleDateString();
  };

  // Android date picker
  const openAndroidDatePicker = ({
    initial,
    minimumDate,
    maximumDate,
    onPicked,
  }: {
    initial: Date;
    minimumDate?: Date;
    maximumDate?: Date;
    onPicked: (d: Date) => void;
  }) => {
    DateTimePickerAndroid.open({
      value: initial,
      mode: "date",
      minimumDate,
      maximumDate,
      onChange: (event, date) => {
        if (event.type === "set" && date) {
          onPicked(date);
        }
      },
    });
  };

  // Web input style
  const webNativeDateInputStyle: any = {
    flex: 1,
    minWidth: 0,
    height: 48,
    border: "none",
    outline: "none",
    background: "transparent",
    padding: "12px 12px",
    fontSize: 15,
    color: theme.textMain,
    fontWeight: 600,
    cursor: "pointer",
  };

  // Format INR
  const formatINR = (amount: number) => {
    const safe = Number.isFinite(amount) ? amount : 0;
    return `₹${safe.toLocaleString("en-IN")}`;
  };

  // Convert any value to number
  const toNum = (v: any): number => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/[^0-9.]/g, "");
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  // Normalize items array
  const normalizeItems = (items: any): any[] => {
    if (!items) return [];
    if (Array.isArray(items)) return items;
    if (typeof items === "object") return Object.values(items);
    return [];
  };

  // Calculate order total
  const getOrderTotal = (o: any) => {
    const directTotal =
      toNum(o.total) ||
      toNum(o.subtotal) ||
      toNum(o.amount) ||
      toNum(o.totalPrice) ||
      toNum(o.totalAmount) ||
      toNum(o.grandTotal) ||
      toNum(o.finalTotal) ||
      toNum(o.finalAmount) ||
      toNum(o.payable) ||
      toNum(o.price);
    if (directTotal > 0) return directTotal;
    const items = normalizeItems(o.items);
    if (items.length) {
      return items.reduce((sum, it) => {
        const line = toNum(it?.lineTotal) || toNum(it?.total) || toNum(it?.amount);
        if (line > 0) return sum + line;
        const qty = toNum(it?.qty) || toNum(it?.quantity) || 1;
        const price = toNum(it?.price) || toNum(it?.unitPrice) || toNum(it?.rate) || 0;
        return sum + qty * price;
      }, 0);
    }
    const qty = toNum(o.qty) || toNum(o.quantity) || 1;
    const price = toNum(o.price) || toNum(o.unitPrice) || 0;
    return qty * price;
  };

  const loadAnalytics = async (uid: string, range: "week" | "month" | "year") => {
    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      const rangeConfig = TIME_RANGES.find((r) => r.key === range)!;
      const startDate = new Date(now.getTime() - rangeConfig.days * 24 * 60 * 60 * 1000);

      console.log(`📊 Loading analytics for ${rangeConfig.days} days`);

      // 1️⃣ Load Rooms Data
      const roomsRef = collection(db, "users", uid, "rooms");
      const roomsSnap = await getDocs(roomsRef);
      const allRooms = roomsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const activeRooms = allRooms.filter((r: any) => r.status === "occupied").length;
      const availableRooms = allRooms.filter((r: any) => r.status === "available").length;
      const totalRooms = allRooms.length;
      const occupancyRate = totalRooms > 0 ? (activeRooms / totalRooms) * 100 : 0;

      // 2️⃣ Load Service Requests
      const serviceRequestsRef = collection(db, "serviceRequests");
      const serviceRequestsQuery = query(
        serviceRequestsRef,
        where("adminId", "==", uid)
      );
      const serviceRequestsSnap = await getDocs(serviceRequestsQuery);

      let serviceTotal = 0;
      let servicePending = 0;
      let serviceInProgress = 0;
      let serviceCompleted = 0;
      let serviceCancelled = 0;
      let totalResponseTime = 0;
      let responseTimeCount = 0;

      const serviceRequestsInRange: any[] = [];
      const serviceTypeCount: { [key: string]: { count: number; revenue: number } } = {};

      serviceRequestsSnap.docs.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate?.() || new Date(0);

        // Count all for totals
        serviceTotal++;

        // Status counts
        const status = data.status || "pending";
        if (status === "pending") servicePending++;
        else if (status === "in-progress") serviceInProgress++;
        else if (status === "completed") serviceCompleted++;
        else if (status === "cancelled") serviceCancelled++;

        // Filter by date range for trends
        if (createdAt >= startDate && createdAt <= now) {
          serviceRequestsInRange.push(data);

          // Track by type
          const type = data.type || "Other";
          const charges = data.charges || 0;

          if (!serviceTypeCount[type]) {
            serviceTypeCount[type] = { count: 0, revenue: 0 };
          }
          serviceTypeCount[type].count++;
          serviceTypeCount[type].revenue += charges;

          // Calculate response time (time between creation and acceptance)
          if (data.acceptedAt && data.createdAt) {
            const created = data.createdAt.toDate();
            const accepted = data.acceptedAt.toDate();
            const diffMinutes = (accepted.getTime() - created.getTime()) / (1000 * 60);
            totalResponseTime += diffMinutes;
            responseTimeCount++;
          }
        }
      });

      // 3️⃣ Load Food Orders
      const foodOrdersRef = collection(db, "foodOrders");
      const foodOrdersQuery = query(
        foodOrdersRef,
        where("adminId", "==", uid)
      );
      const foodOrdersSnap = await getDocs(foodOrdersQuery);

      let orderTotal = 0;
      let orderPending = 0;
      let orderAccepted = 0;
      let orderCompleted = 0;
      let orderCancelled = 0;
      let totalRevenue = 0;
      let totalPreparationTime = 0;
      let preparationTimeCount = 0;

      const dailyRevenueMap: { [key: string]: number } = {};
      const dailyOrdersMap: { [key: string]: number } = {};
      const hourlyOrdersMap: { [key: string]: number } = {};
      const itemCountMap: { [key: string]: { count: number; revenue: number } } = {};

      foodOrdersSnap.docs.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate?.() || new Date(0);
        const amount = data.totalAmount || data.totalPrice || data.price || 0;

        // Count all orders
        orderTotal++;
        totalRevenue += amount;

        // Status counts
        const status = data.status || "pending";
        if (status === "pending") orderPending++;
        else if (status === "accepted" || status === "in-progress") orderAccepted++;
        else if (status === "completed") orderCompleted++;
        else if (status === "cancelled") orderCancelled++;

        // Filter by date range for trends
        if (createdAt >= startDate && createdAt <= now) {
          // Daily revenue
          const dayKey = DAYS[createdAt.getDay()];
          dailyRevenueMap[dayKey] = (dailyRevenueMap[dayKey] || 0) + amount;

          // Daily orders count
          dailyOrdersMap[dayKey] = (dailyOrdersMap[dayKey] || 0) + 1;

          // Hourly distribution
          const hour = createdAt.getHours();
          let hourKey = "00:00";
          if (hour < 4) hourKey = "00:00";
          else if (hour < 8) hourKey = "04:00";
          else if (hour < 12) hourKey = "08:00";
          else if (hour < 16) hourKey = "12:00";
          else if (hour < 20) hourKey = "16:00";
          else hourKey = "20:00";

          hourlyOrdersMap[hourKey] = (hourlyOrdersMap[hourKey] || 0) + 1;

          // Track items
          const items = data.items || data.orderDetails || [];
          if (Array.isArray(items)) {
            items.forEach((item: any) => {
              const itemName = item.name || item.item || "Unknown Item";
              const qty = item.quantity || item.qty || 1;
              const itemPrice = item.price || 0;

              if (!itemCountMap[itemName]) {
                itemCountMap[itemName] = { count: 0, revenue: 0 };
              }
              itemCountMap[itemName].count += qty;
              itemCountMap[itemName].revenue += qty * itemPrice;
            });
          } else if (data.item) {
            const itemName = data.item;
            const qty = data.quantity || data.qty || 1;
            const price = data.price || 0;

            if (!itemCountMap[itemName]) {
              itemCountMap[itemName] = { count: 0, revenue: 0 };
            }
            itemCountMap[itemName].count += qty;
            itemCountMap[itemName].revenue += qty * price;
          }

          // Calculate preparation time
          if (data.acceptedAt && data.completedAt) {
            const accepted = data.acceptedAt.toDate();
            const completed = data.completedAt.toDate();
            const diffMinutes = (completed.getTime() - accepted.getTime()) / (1000 * 60);
            totalPreparationTime += diffMinutes;
            preparationTimeCount++;
          }
        }
      });

      // 4️⃣ Load Guests Data
      const guestsRef = collection(db, "guests");
      const guestsQuery = query(
        guestsRef,
        where("adminId", "==", uid)
      );
      const guestsSnap = await getDocs(guestsQuery);

      let totalGuests = 0;
      let activeGuests = 0;
      let totalStayDuration = 0;
      let stayCount = 0;

      guestsSnap.docs.forEach((doc) => {
        const data = doc.data();
        totalGuests++;

        if (data.isActive === true) {
          activeGuests++;
        }

        // Calculate stay duration for completed stays
        if (data.createdAt && data.checkedOutAt) {
          const checkIn = data.createdAt.toDate();
          const checkOut = data.checkedOutAt.toDate();
          const diffHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
          totalStayDuration += diffHours;
          stayCount++;
        }
      });

      // 5️⃣ Process Chart Data
      const dailyRevenue = DAYS.map(day => ({
        day,
        revenue: dailyRevenueMap[day] || 0
      }));

      const dailyOrders = DAYS.map(day => ({
        day,
        count: dailyOrdersMap[day] || 0
      }));

      const peakHours = HOURS.map(hour => ({
        hour,
        orders: hourlyOrdersMap[hour] || 0
      }));

      // 6️⃣ Get Top Items
      const topItems = Object.entries(itemCountMap)
        .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // 7️⃣ Get Top Services
      const topServices = Object.entries(serviceTypeCount)
        .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // 8️⃣ Calculate Averages
      const avgResponseTime = responseTimeCount > 0
        ? Math.round(totalResponseTime / responseTimeCount)
        : 0;

      const avgPreparationTime = preparationTimeCount > 0
        ? Math.round(totalPreparationTime / preparationTimeCount)
        : 12; // Default if no data

      const avgStayDuration = stayCount > 0
        ? Math.round((totalStayDuration / stayCount) * 10) / 10
        : 0;

      // 9️⃣ Calculate Revenue Change (compare with previous period)
      const prevStartDate = new Date(startDate.getTime() - rangeConfig.days * 24 * 60 * 60 * 1000);
      let prevRevenue = 0;

      foodOrdersSnap.docs.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate?.() || new Date(0);
        const amount = data.totalAmount || data.totalPrice || data.price || 0;

        if (createdAt >= prevStartDate && createdAt < startDate) {
          prevRevenue += amount;
        }
      });

      const revenueChange = prevRevenue > 0
        ? ((totalRevenue - prevRevenue) / prevRevenue) * 100
        : 0;

      // 🔟 Completion Rate
      const completionRate = serviceTotal > 0
        ? (serviceCompleted / serviceTotal) * 100
        : 0;

      setAnalytics({
        totalRevenue: Math.round(totalRevenue),
        revenueChange: Math.round(revenueChange * 10) / 10,
        activeRooms,
        availableRooms,
        occupancyRate: Math.round(occupancyRate * 10) / 10,
        totalRooms,
        serviceRequests: {
          total: serviceTotal,
          pending: servicePending,
          inProgress: serviceInProgress,
          completed: serviceCompleted,
          cancelled: serviceCancelled,
        },
        completionRate: Math.round(completionRate * 10) / 10,
        foodOrders: {
          total: orderTotal,
          pending: orderPending,
          accepted: orderAccepted,
          completed: orderCompleted,
          cancelled: orderCancelled,
        },
        avgResponseTime,
        avgPreparationTime,
        dailyRevenue,
        dailyOrders,
        peakHours,
        topItems: topItems.length > 0 ? topItems : [{ name: "No Data", count: 0, revenue: 0 }],
        topServices: topServices.length > 0 ? topServices : [{ name: "No Data", count: 0, revenue: 0 }],
        totalGuests,
        checkedInGuests: activeGuests,
        avgStayDuration,
        totalOrders: orderTotal,
        totalServiceRequests: serviceTotal,
        pendingCount: orderPending + servicePending,
      });

    } catch (e: any) {
      console.error("Analytics error:", e);
      setError(e.message || "Failed to load analytics data");
      Alert.alert("Error", "Failed to load analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ EXPORT ROOMS DATA TO CSV
  const exportRoomsToCSV = async () => {
    if (!user) return;
    if (!exportStartDate || !exportEndDate) {
      Alert.alert("Error", "Please select both start and end dates");
      return;
    }
    if (exportEndDate < exportStartDate) {
      Alert.alert("Error", "End date must be after start date");
      return;
    }

    setExporting(true);
    try {
      const uid = user.uid;
      const startTimestamp = Timestamp.fromDate(exportStartDate);
      const endTimestamp = Timestamp.fromDate(exportEndDate);

      // 1️⃣ Load all rooms
      const roomsRef = collection(db, "users", uid, "rooms");
      const roomsSnap = await getDocs(roomsRef);
      const allRooms = roomsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 2️⃣ Load food orders for date range
      const foodOrdersRef = collection(db, "foodOrders");
      const foodOrdersQuery = query(
        foodOrdersRef,
        where("adminId", "==", uid),
        where("createdAt", ">=", startTimestamp),
        where("createdAt", "<=", endTimestamp)
      );
      const foodOrdersSnap = await getDocs(foodOrdersQuery);
      const foodOrders = foodOrdersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 3️⃣ Load service requests for date range
      const serviceRequestsRef = collection(db, "serviceRequests");
      const serviceRequestsQuery = query(
        serviceRequestsRef,
        where("adminId", "==", uid),
        where("createdAt", ">=", startTimestamp),
        where("createdAt", "<=", endTimestamp)
      );
      const serviceRequestsSnap = await getDocs(serviceRequestsQuery);
      const serviceRequests = serviceRequestsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 4️⃣ Prepare export data for each room
      const exportData: RoomExportData[] = [];

      for (const room of allRooms) {
        // Filter orders for this room
        const roomFoodOrders = foodOrders.filter((o: any) => String(o.roomNumber) === String(room.roomNumber));
        const roomServiceRequests = serviceRequests.filter((r: any) => String(r.roomNumber) === String(room.roomNumber));

        // Calculate food total
        const foodTotal = roomFoodOrders.reduce((sum, o: any) => sum + getOrderTotal(o), 0);

        // Calculate service total
        const serviceTotal = roomServiceRequests.reduce((sum, r: any) => sum + (r.charges || 0), 0);

        // Calculate nights and room charges
        let nights = 0;
        let roomCharges = 0;
        if (room.assignedAt && room.checkoutAt) {
          const checkIn = room.assignedAt.toDate();
          const checkOut = room.checkoutAt.toDate();
          const diffMs = checkOut.getTime() - checkIn.getTime();
          nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          roomCharges = (room.roomRate || 1500) * nights;
        }

        exportData.push({
          roomNumber: room.roomNumber,
          guestName: room.guestName || "-",
          guestMobile: room.guestMobile || "-",
          checkInDate: room.assignedAt ? room.assignedAt.toDate().toLocaleDateString() : "-",
          checkOutDate: room.checkoutAt ? room.checkoutAt.toDate().toLocaleDateString() : "-",
          nights,
          roomRate: room.roomRate || 1500,
          roomCharges,
          foodOrders: roomFoodOrders.length,
          foodTotal,
          serviceRequests: roomServiceRequests.length,
          serviceTotal,
          totalCharges: roomCharges + foodTotal + serviceTotal,
          status: room.status || "available",
        });
      }

      setExportData(exportData);

      // Generate CSV content
      const csvContent = generateCSV(exportData, exportStartDate, exportEndDate);

      // Save CSV file
      const fileName = `room_export_${exportStartDate.toISOString().split('T')[0]}_to_${exportEndDate.toISOString().split('T')[0]}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: `Export Rooms ${exportStartDate.toLocaleDateString()} - ${exportEndDate.toLocaleDateString()}`,
          UTI: 'public.comma-separated-values-text'
        });
      } else {
        Alert.alert(
          "File Saved",
          `CSV file saved to:\n${fileUri}`,
          [{ text: "OK" }]
        );
      }

      setExportModalOpen(false);

    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Error", "Failed to export data. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  // ✅ GENERATE CSV CONTENT
  const generateCSV = (data: RoomExportData[], startDate: Date, endDate: Date): string => {
    const headers = [
      'Room Number',
      'Guest Name',
      'Guest Mobile',
      'Check-In Date',
      'Check-Out Date',
      'Nights',
      'Room Rate (₹)',
      'Room Charges (₹)',
      'Food Orders Count',
      'Food Total (₹)',
      'Service Requests Count',
      'Service Total (₹)',
      'Total Charges (₹)',
      'Status'
    ];

    const rows = data.map(item => [
      item.roomNumber,
      `"${item.guestName}"`, // Wrap in quotes to handle commas in names
      item.guestMobile,
      item.checkInDate,
      item.checkOutDate,
      item.nights,
      item.roomRate,
      item.roomCharges.toFixed(2),
      item.foodOrders,
      item.foodTotal.toFixed(2),
      item.serviceRequests,
      item.serviceTotal.toFixed(2),
      item.totalCharges.toFixed(2),
      item.status
    ]);

    // Calculate totals
    const totalRooms = data.length;
    const totalRoomCharges = data.reduce((sum, item) => sum + item.roomCharges, 0);
    const totalFoodCharges = data.reduce((sum, item) => sum + item.foodTotal, 0);
    const totalServiceCharges = data.reduce((sum, item) => sum + item.serviceTotal, 0);
    const grandTotal = data.reduce((sum, item) => sum + item.totalCharges, 0);

    const summaryRows = [
      [],
      ['SUMMARY'],
      ['Date Range:', `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`],
      ['Total Rooms:', totalRooms],
      ['Total Room Charges (₹):', totalRoomCharges.toFixed(2)],
      ['Total Food Charges (₹):', totalFoodCharges.toFixed(2)],
      ['Total Service Charges (₹):', totalServiceCharges.toFixed(2)],
      ['GRAND TOTAL (₹):', grandTotal.toFixed(2)],
      [],
      ['Generated on:', new Date().toLocaleString()],
      ['Generated by: Roomio Hotel Management System']
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      ...summaryRows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
  };

  // Responsive values
  const spacing = isSmall ? 10 : isMedium ? 12 : 16;
  const gap = isSmall ? 8 : 12;
  const smallFontSize = isSmall ? 10 : 11;
  const labelFontSize = isSmall ? 11 : 12;
  const valueFontSize = isSmall ? 20 : isMedium ? 22 : 24;
  const titleFontSize = isSmall ? 18 : isMedium ? 20 : 22;
  const revenueValueSize = isSmall ? 22 : isMedium ? 25 : 28;
  const metricCardWidth = isLarge ? "24%" : isSmall ? "100%" : "48%";
  const chartHeight = isSmall ? 130 : 180;
  const peakChartHeight = isSmall ? 90 : 130;

  const MetricCard = ({ icon, value, label, color, suffix = "" }: any) => (
    <View style={[styles.metricCard, {
      width: metricCardWidth,
      marginBottom: isSmall ? gap : 0,
      backgroundColor: theme.bgCard,
      borderColor: theme.glassBorder,
    }]}>
      <View style={[styles.metricIconWrap, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={isSmall ? 14 : 16} color={color} />
      </View>
      <Text style={[styles.metricValue, { fontSize: valueFontSize, color: theme.textMain }]}>
        {typeof value === 'number' ? value.toLocaleString() : value}{suffix}
      </Text>
      <Text style={[styles.metricLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>{label}</Text>
    </View>
  );

  const maxRevenue = Math.max(...analytics.dailyRevenue.map((d) => d.revenue), 1);
  const maxOrders = Math.max(...analytics.dailyOrders.map((d) => d.count), 1);
  const maxPeak = Math.max(...analytics.peakHours.map((h) => h.orders), 1);

  // Web values for export modal
  const webMinNow = formatDateTimeLocal(new Date(2000, 0, 1));
  const webMaxNow = formatDateTimeLocal(new Date());
  const webStartValue = exportStartDate ? formatDateTimeLocal(exportStartDate) : "";
  const webEndValue = exportEndDate ? formatDateTimeLocal(exportEndDate) : "";

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bgMain }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="bar-chart" size={48} color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textMain }]}>Loading Analytics...</Text>
          <Text style={[styles.loadingSubtext, { color: theme.textMuted }]}>Fetching your business data</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bgMain }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.danger} />
          <Text style={[styles.errorText, { color: theme.danger }]}>Failed to Load</Text>
          <Text style={[styles.errorSubtext, { color: theme.textMuted }]}>{error}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            onPress={() => user && loadAnalytics(user.uid, selectedRange)}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bgMain }]}>
      {/* ✅ EXPORT MODAL */}
      <Modal visible={exportModalOpen} animationType="slide" transparent onRequestClose={() => setExportModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.glassBorder }]}>
              <View style={styles.modalHeaderLeft}>
                <View style={[styles.modalIcon, { backgroundColor: `${theme.primary}15` }]}>
                  <Ionicons name="download-outline" size={18} color={theme.primary} />
                </View>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.textMain }]}>Export Rooms Data</Text>
                  <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>Select date range for export</Text>
                </View>
              </View>
              <Pressable
                onPress={() => setExportModalOpen(false)}
                style={({ pressed }) => [
                  styles.modalCloseBtn,
                  { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="close" size={18} color={theme.textMuted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              {/* Start Date */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.textMain }]}>Start Date</Text>
                {Platform.OS === "web" ? (
                  <View style={[styles.inputWrapper, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                    <Ionicons name="calendar-outline" size={18} color={theme.textMuted} style={{ marginLeft: 12 }} />
                    {/* @ts-ignore */}
                    <input
                      type="date"
                      value={webStartValue.split('T')[0]}
                      min="2000-01-01"
                      max={webEndValue.split('T')[0] || undefined}
                      onChange={(e: any) => {
                        if (e.target.value) {
                          setExportStartDate(new Date(e.target.value));
                        }
                      }}
                      style={{
                        ...webNativeDateInputStyle,
                        color: theme.textMain,
                      }}
                    />
                  </View>
                ) : (
                  <Pressable
                    style={[styles.inputWrapper, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
                    onPress={() => {
                      if (Platform.OS === "android") {
                        openAndroidDatePicker({
                          initial: exportStartDate || new Date(),
                          maximumDate: exportEndDate || undefined,
                          onPicked: (d) => setExportStartDate(d),
                        });
                        return;
                      }
                      setIosTempStart(exportStartDate || new Date());
                      setShowStartPicker(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={18} color={theme.textMuted} style={{ marginLeft: 12 }} />
                    <Text style={[styles.dateValueText, { color: theme.textMain }]} numberOfLines={1}>
                      {formatDateDisplay(exportStartDate)}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* End Date */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.textMain }]}>End Date</Text>
                {Platform.OS === "web" ? (
                  <View style={[styles.inputWrapper, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                    <Ionicons name="calendar-outline" size={18} color={theme.textMuted} style={{ marginLeft: 12 }} />
                    {/* @ts-ignore */}
                    <input
                      type="date"
                      value={webEndValue.split('T')[0]}
                      min={webStartValue.split('T')[0] || "2000-01-01"}
                      max={webMaxNow.split('T')[0]}
                      onChange={(e: any) => {
                        if (e.target.value) {
                          setExportEndDate(new Date(e.target.value));
                        }
                      }}
                      style={{
                        ...webNativeDateInputStyle,
                        color: theme.textMain,
                      }}
                    />
                  </View>
                ) : (
                  <Pressable
                    style={[styles.inputWrapper, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
                    onPress={() => {
                      if (Platform.OS === "android") {
                        openAndroidDatePicker({
                          initial: exportEndDate || new Date(),
                          minimumDate: exportStartDate || undefined,
                          onPicked: (d) => setExportEndDate(d),
                        });
                        return;
                      }
                      setIosTempEnd(exportEndDate || new Date());
                      setShowEndPicker(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={18} color={theme.textMuted} style={{ marginLeft: 12 }} />
                    <Text style={[styles.dateValueText, { color: theme.textMain }]} numberOfLines={1}>
                      {formatDateDisplay(exportEndDate)}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Export Stats Preview */}
              {exportData.length > 0 && (
                <View style={[styles.exportPreview, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                  <Text style={[styles.exportPreviewTitle, { color: theme.primary }]}>Export Preview</Text>
                  <View style={styles.exportPreviewRow}>
                    <Text style={[styles.exportPreviewLabel, { color: theme.textMuted }]}>Rooms:</Text>
                    <Text style={[styles.exportPreviewValue, { color: theme.textMain }]}>{exportData.length}</Text>
                  </View>
                  <View style={styles.exportPreviewRow}>
                    <Text style={[styles.exportPreviewLabel, { color: theme.textMuted }]}>Total Charges:</Text>
                    <Text style={[styles.exportPreviewValue, { color: theme.success }]}>
                      {formatINR(exportData.reduce((sum, item) => sum + item.totalCharges, 0))}
                    </Text>
                  </View>
                </View>
              )}

              <Pressable
                onPress={exportRoomsToCSV}
                disabled={exporting}
                style={({ pressed }) => [
                  styles.exportBtn,
                  { backgroundColor: theme.primary },
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  exporting && { opacity: 0.7 },
                ]}
              >
                {exporting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={18} color="#fff" />
                    <Text style={styles.exportBtnText}>Export to CSV</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>

            {/* iOS pickers */}
            {Platform.OS === "ios" && (
              <Modal visible={showStartPicker} transparent animationType="slide">
                <View style={styles.pickerOverlay}>
                  <Pressable style={styles.pickerBackdrop} onPress={() => setShowStartPicker(false)} />
                  <View style={[styles.pickerSheet, { backgroundColor: theme.bgCard }]}>
                    <View style={[styles.pickerHeader, { borderBottomColor: theme.glassBorder }]}>
                      <Pressable onPress={() => setShowStartPicker(false)}>
                        <Text style={[styles.pickerAction, { color: theme.textMuted }]}>Cancel</Text>
                      </Pressable>
                      <Text style={[styles.pickerTitle, { color: theme.textMain }]}>Select Start Date</Text>
                      <Pressable
                        onPress={() => {
                          setShowStartPicker(false);
                          setExportStartDate(iosTempStart);
                        }}
                      >
                        <Text style={[styles.pickerAction, styles.pickerActionPrimary, { color: theme.primary }]}>Done</Text>
                      </Pressable>
                    </View>
                    <DateTimePicker
                      value={iosTempStart}
                      mode="date"
                      display="spinner"
                      maximumDate={exportEndDate || undefined}
                      onChange={(_, d) => d && setIosTempStart(d)}
                    />
                  </View>
                </View>
              </Modal>
            )}

            {Platform.OS === "ios" && (
              <Modal visible={showEndPicker} transparent animationType="slide">
                <View style={styles.pickerOverlay}>
                  <Pressable style={styles.pickerBackdrop} onPress={() => setShowEndPicker(false)} />
                  <View style={[styles.pickerSheet, { backgroundColor: theme.bgCard }]}>
                    <View style={[styles.pickerHeader, { borderBottomColor: theme.glassBorder }]}>
                      <Pressable onPress={() => setShowEndPicker(false)}>
                        <Text style={[styles.pickerAction, { color: theme.textMuted }]}>Cancel</Text>
                      </Pressable>
                      <Text style={[styles.pickerTitle, { color: theme.textMain }]}>Select End Date</Text>
                      <Pressable
                        onPress={() => {
                          setShowEndPicker(false);
                          setExportEndDate(iosTempEnd);
                        }}
                      >
                        <Text style={[styles.pickerAction, styles.pickerActionPrimary, { color: theme.primary }]}>Done</Text>
                      </Pressable>
                    </View>
                    <DateTimePicker
                      value={iosTempEnd}
                      mode="date"
                      display="spinner"
                      minimumDate={exportStartDate || undefined}
                      onChange={(_, d) => d && setIosTempEnd(d)}
                    />
                  </View>
                </View>
              </Modal>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Animated.ScrollView
        style={[styles.container, { opacity: fadeAnim }]}
        contentContainerStyle={[styles.content, { padding: spacing }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Background Decor */}
        <View style={styles.backgroundDecor}>
          <View style={[styles.bgCircle1, { backgroundColor: theme.primaryGlow }]} />
          <View style={[styles.bgCircle2, { backgroundColor: theme.primaryGlow }]} />
          <View style={[styles.bgCircle3, { backgroundColor: theme.primaryGlow }]} />
        </View>

        {/* Header */}
        <View style={[styles.header, { marginBottom: spacing * 2 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { fontSize: smallFontSize, color: theme.textMuted }]}>
              Analytics Dashboard
            </Text>
            <Text style={[styles.title, { fontSize: titleFontSize, color: theme.textMain }]}>
              Performance Overview
            </Text>
          </View>

          <View style={styles.headerRight}>
            {/* Export Button */}
            <Pressable
              onPress={() => setExportModalOpen(true)}
              style={({ pressed }) => [
                styles.exportIconBtn,
                { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons name="download-outline" size={20} color={theme.success} />
            </Pressable>

            {/* Theme Toggle */}
            <Pressable
              onPress={() => setIsDark(!isDark)}
              style={({ pressed }) => [
                styles.themeToggle,
                { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons
                name={isDark ? "sunny-outline" : "moon-outline"}
                size={20}
                color={theme.primary}
              />
            </Pressable>

            <View style={[styles.badge, { backgroundColor: `${theme.primary}18` }]}>
              <Ionicons name="trending-up" size={isSmall ? 12 : 14} color={theme.primary} />
              {!isSmall && <Text style={[styles.badgeText, { color: theme.primary }]}>REAL-TIME</Text>}
            </View>
          </View>
        </View>

        {/* Time Range Selector */}
        <View style={[styles.timeRangeContainer, {
          marginBottom: gap * 2,
          backgroundColor: theme.bgCard,
          borderColor: theme.glassBorder,
        }]}>
          {TIME_RANGES.map((range) => (
            <Pressable
              key={range.key}
              style={[
                styles.timeRangeButton,
                selectedRange === range.key && styles.timeRangeButtonActive,
                { paddingVertical: isSmall ? 6 : 8, paddingHorizontal: isSmall ? 6 : 10 },
              ]}
              onPress={() => setSelectedRange(range.key)}
            >
              <Text
                style={[
                  styles.timeRangeText,
                  { fontSize: smallFontSize, color: theme.textMuted },
                  selectedRange === range.key && styles.timeRangeTextActive,
                ]}
              >
                {range.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Revenue Card */}
        <Animated.View
          style={[
            styles.card,
            {
              padding: spacing,
              marginBottom: gap,
              backgroundColor: theme.bgCard,
              borderColor: theme.glassBorder,
              transform: [{ scale: scaleAnim }],
            }
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                Total Revenue
              </Text>
              <Text style={[styles.revenueValue, { fontSize: revenueValueSize, color: theme.textMain }]}>
                ₹{analytics.totalRevenue.toLocaleString()}
              </Text>
            </View>
            <View style={[styles.changeIndicator, {
              backgroundColor: analytics.revenueChange >= 0 ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)'
            }]}>
              <Ionicons
                name={analytics.revenueChange >= 0 ? "trending-up" : "trending-down"}
                size={isSmall ? 12 : 14}
                color={analytics.revenueChange >= 0 ? theme.success : theme.danger}
              />
              <Text style={[styles.changeText, {
                fontSize: smallFontSize,
                color: analytics.revenueChange >= 0 ? theme.success : theme.danger
              }]}>
                {analytics.revenueChange > 0 ? '+' : ''}{analytics.revenueChange}%
              </Text>
            </View>
          </View>

          {/* Daily Revenue Chart */}
          <View style={{ height: chartHeight, justifyContent: "flex-end" }}>
            <View style={[styles.chart, { height: chartHeight - 20 }]}>
              {analytics.dailyRevenue.map((data, idx) => (
                <View key={idx} style={styles.chartBarWrapper}>
                  <View
                    style={[
                      styles.chartBar,
                      {
                        height: (data.revenue / maxRevenue) * (chartHeight - 30),
                        backgroundColor: idx === analytics.dailyRevenue.length - 1 ? theme.primary : `${theme.primary}80`,
                      },
                    ]}
                  />
                  <Text style={[styles.chartLabel, { fontSize: smallFontSize - 1, color: theme.textMuted }]}>
                    {data.day}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>

        {/* Key Metrics Grid */}
        <View style={[styles.metricsGrid, { marginBottom: gap, gap }]}>
          <MetricCard
            icon="bed-outline"
            value={analytics.activeRooms}
            label="Active Rooms"
            color={theme.primary}
          />
          <MetricCard
            icon="bed"
            value={analytics.availableRooms}
            label="Available"
            color={theme.success}
          />
          <MetricCard
            icon="people-outline"
            value={analytics.checkedInGuests}
            label="Checked In"
            color="#8B5CF6"
          />
          <MetricCard
            icon="restaurant-outline"
            value={analytics.foodOrders.total}
            label="Total Orders"
            color={theme.warning}
          />
        </View>

        {/* Daily Orders Chart */}
        <View style={[styles.card, {
          padding: spacing,
          marginBottom: gap,
          backgroundColor: theme.bgCard,
          borderColor: theme.glassBorder,
        }]}>
          <Text style={[styles.cardLabel, { fontSize: smallFontSize, marginBottom: spacing, color: theme.textMuted }]}>
            Daily Orders
          </Text>
          <View style={{ height: chartHeight - 20, justifyContent: "flex-end" }}>
            <View style={[styles.chart, { height: chartHeight - 40 }]}>
              {analytics.dailyOrders.map((data, idx) => (
                <View key={idx} style={styles.chartBarWrapper}>
                  <View
                    style={[
                      styles.chartBar,
                      {
                        height: (data.count / maxOrders) * (chartHeight - 50),
                        backgroundColor: theme.warning,
                      },
                    ]}
                  />
                  <Text style={[styles.chartLabel, { fontSize: smallFontSize - 1, color: theme.textMuted }]}>
                    {data.day}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Order Status */}
        <View style={[styles.rowGrid, {
          flexDirection: isSmall ? "column" : "row",
          gap,
          marginBottom: gap
        }]}>
          <View style={[styles.card, {
            flex: 1,
            padding: spacing,
            backgroundColor: theme.bgCard,
            borderColor: theme.glassBorder,
          }]}>
            <Text style={[styles.cardLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
              Food Orders
            </Text>
            <View style={[styles.statusList, { marginTop: spacing }]}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: theme.warning }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                  Pending
                </Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7, color: theme.textMain }]}>
                  {analytics.foodOrders.pending}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                  Active
                </Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7, color: theme.textMain }]}>
                  {analytics.foodOrders.accepted}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: theme.success }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                  Completed
                </Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7, color: theme.textMain }]}>
                  {analytics.foodOrders.completed}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.card, {
            flex: 1,
            padding: spacing,
            backgroundColor: theme.bgCard,
            borderColor: theme.glassBorder,
          }]}>
            <Text style={[styles.cardLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
              Service Requests
            </Text>
            <View style={[styles.statusList, { marginTop: spacing }]}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: theme.warning }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                  Pending
                </Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7, color: theme.textMain }]}>
                  {analytics.serviceRequests.pending}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                  In Progress
                </Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7, color: theme.textMain }]}>
                  {analytics.serviceRequests.inProgress}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: theme.success }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                  Completed
                </Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7, color: theme.textMain }]}>
                  {analytics.serviceRequests.completed}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Peak Hours */}
        <View style={[styles.card, {
          padding: spacing,
          marginBottom: gap,
          backgroundColor: theme.bgCard,
          borderColor: theme.glassBorder,
        }]}>
          <Text style={[styles.cardLabel, { fontSize: smallFontSize, marginBottom: spacing, color: theme.textMuted }]}>
            Peak Order Times
          </Text>
          <View style={[styles.peakChart, { height: peakChartHeight }]}>
            {analytics.peakHours.map((hour, idx) => (
              <View key={idx} style={[styles.peakBarWrapper, { gap: isSmall ? 3 : 4 }]}>
                <View
                  style={[
                    styles.peakBar,
                    {
                      height: (hour.orders / maxPeak) * (peakChartHeight - 20),
                      backgroundColor: idx === 2 ? theme.primary : `${theme.primary}66`,
                    },
                  ]}
                />
                <Text style={[styles.peakLabel, { fontSize: smallFontSize - 1, color: theme.textMuted }]}>
                  {hour.hour}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Top Items & Performance */}
        <View style={[styles.rowGrid, {
          flexDirection: isSmall ? "column" : "row",
          gap,
          marginBottom: gap
        }]}>
          <View style={[styles.card, {
            flex: 1,
            padding: spacing,
            backgroundColor: theme.bgCard,
            borderColor: theme.glassBorder,
          }]}>
            <Text style={[styles.cardLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
              Top Items
            </Text>
            <View style={[styles.topList, { marginTop: spacing }]}>
              {analytics.topItems.slice(0, 3).map((item, idx) => (
                <View key={idx} style={styles.topItemRow}>
                  <View style={[styles.topItemRank, { backgroundColor: `${theme.primary}15` }]}>
                    <Text style={[styles.topItemRankText, { fontSize: smallFontSize, color: theme.primary }]}>
                      #{idx + 1}
                    </Text>
                  </View>
                  <View style={styles.topItemInfo}>
                    <Text style={[styles.topItemName, { fontSize: labelFontSize, color: theme.textMain }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.topItemMeta, { fontSize: smallFontSize - 1, color: theme.textMuted }]}>
                      {item.count} orders • ₹{item.revenue.toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.card, {
            flex: 1,
            padding: spacing,
            backgroundColor: theme.bgCard,
            borderColor: theme.glassBorder,
          }]}>
            <Text style={[styles.cardLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
              Performance
            </Text>
            <View style={[styles.performanceList, { marginTop: spacing }]}>
              <View style={styles.performanceRow}>
                <View style={[styles.performanceIcon, { backgroundColor: `${theme.primary}15` }]}>
                  <Ionicons name="timer" size={16} color={theme.primary} />
                </View>
                <View style={styles.performanceInfo}>
                  <Text style={[styles.performanceLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                    Response Time
                  </Text>
                  <Text style={[styles.performanceValue, { fontSize: valueFontSize * 0.6, color: theme.textMain }]}>
                    {analytics.avgResponseTime}m
                  </Text>
                </View>
              </View>
              <View style={styles.performanceRow}>
                <View style={[styles.performanceIcon, { backgroundColor: `${theme.success}15` }]}>
                  <Ionicons name="restaurant" size={16} color={theme.success} />
                </View>
                <View style={styles.performanceInfo}>
                  <Text style={[styles.performanceLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                    Prep Time
                  </Text>
                  <Text style={[styles.performanceValue, { fontSize: valueFontSize * 0.6, color: theme.textMain }]}>
                    {analytics.avgPreparationTime}m
                  </Text>
                </View>
              </View>
              <View style={styles.performanceRow}>
                <View style={[styles.performanceIcon, { backgroundColor: '#8B5CF615' }]}>
                  <Ionicons name="people" size={16} color="#8B5CF6" />
                </View>
                <View style={styles.performanceInfo}>
                  <Text style={[styles.performanceLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                    Avg Stay
                  </Text>
                  <Text style={[styles.performanceValue, { fontSize: valueFontSize * 0.6, color: theme.textMain }]}>
                    {analytics.avgStayDuration}h
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Completion Rate & Occupancy */}
        <View style={[styles.card, {
          padding: spacing,
          marginBottom: gap,
          backgroundColor: theme.bgCard,
          borderColor: theme.glassBorder,
        }]}>
          <View style={{ flexDirection: isSmall ? "column" : "row", justifyContent: "space-between", gap: spacing }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                Service Completion
              </Text>
              <View style={[styles.progressSection, { marginTop: spacing / 2 }]}>
                <View style={styles.progressHeader}>
                  <Text style={[styles.progressPercentage, { fontSize: valueFontSize, color: theme.primary }]}>
                    {analytics.completionRate}%
                  </Text>
                  <Text style={[styles.progressStats, { fontSize: smallFontSize, color: theme.textMuted }]}>
                    {analytics.serviceRequests.completed} / {analytics.serviceRequests.total}
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: theme.glass }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${analytics.completionRate}%`,
                        backgroundColor: theme.primary
                      }
                    ]}
                  />
                </View>
              </View>
            </View>

            <View style={[styles.divider, {
              width: isSmall ? "100%" : 1,
              height: isSmall ? 1 : "auto",
              backgroundColor: theme.glassBorder,
            }]} />

            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                Room Occupancy
              </Text>
              <View style={[styles.progressSection, { marginTop: spacing / 2 }]}>
                <View style={styles.progressHeader}>
                  <Text style={[styles.progressPercentage, { fontSize: valueFontSize, color: theme.success }]}>
                    {analytics.occupancyRate}%
                  </Text>
                  <Text style={[styles.progressStats, { fontSize: smallFontSize, color: theme.textMuted }]}>
                    {analytics.activeRooms} / {analytics.totalRooms}
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: theme.glass }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${analytics.occupancyRate}%`,
                        backgroundColor: theme.success
                      }
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Summary Stats */}
        <View style={[styles.card, {
          padding: spacing,
          backgroundColor: theme.bgCard,
          borderColor: theme.glassBorder,
        }]}>
          <Text style={[styles.cardLabel, { fontSize: smallFontSize, marginBottom: spacing, color: theme.textMuted }]}>
            Summary
          </Text>
          <View style={[styles.summaryGrid, { gap }]}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                Total Orders
              </Text>
              <Text style={[styles.summaryValue, { fontSize: valueFontSize * 0.7, color: theme.textMain }]}>
                {analytics.totalOrders}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                Service Requests
              </Text>
              <Text style={[styles.summaryValue, { fontSize: valueFontSize * 0.7, color: theme.textMain }]}>
                {analytics.totalServiceRequests}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                Pending
              </Text>
              <Text style={[styles.summaryValue, { fontSize: valueFontSize * 0.7, color: theme.warning }]}>
                {analytics.pendingCount}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { fontSize: smallFontSize, color: theme.textMuted }]}>
                Total Guests
              </Text>
              <Text style={[styles.summaryValue, { fontSize: valueFontSize * 0.7, color: theme.textMain }]}>
                {analytics.totalGuests}
              </Text>
            </View>
          </View>
        </View>

      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  content: {},

  backgroundDecor: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 },
  bgCircle1: {
    position: "absolute",
    top: -140,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.6,
  },
  bgCircle2: {
    position: "absolute",
    top: 200,
    left: -140,
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.4,
  },
  bgCircle3: {
    position: "absolute",
    bottom: -60,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.3,
  },

  // Loading & Error
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "700",
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "700",
  },
  errorSubtext: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  greeting: { fontWeight: "600", letterSpacing: 0.5 },
  title: { fontWeight: "700", marginTop: 2 },

  exportIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  themeToggle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
  },
  badgeText: { fontWeight: "700", fontSize: 9, letterSpacing: 0.8 },

  timeRangeContainer: {
    flexDirection: "row",
    gap: 8,
    padding: 4,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1.5,
  },
  timeRangeButton: { flex: 1, borderRadius: 8, alignItems: "center" },
  timeRangeButtonActive: { backgroundColor: "#2563EB" },
  timeRangeText: { fontWeight: "600" },
  timeRangeTextActive: { color: "#FFFFFF" },

  card: {
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1.5,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  cardLabel: {
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  revenueValue: { fontWeight: "800" },
  changeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 3,
  },
  changeText: { fontWeight: "700" },

  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around"
  },
  chartBarWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end"
  },
  chartBar: {
    width: "55%",
    borderRadius: 6
  },
  chartLabel: {
    fontWeight: "600",
    marginTop: 4
  },

  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  metricCard: {
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1.5,
  },
  metricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6
  },
  metricValue: {
    fontWeight: "800",
    marginBottom: 2
  },
  metricLabel: {
    fontWeight: "600"
  },

  rowGrid: {
    alignItems: "stretch"
  },

  // Status Lists
  statusList: {
    gap: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusLabel: {
    flex: 1,
    fontWeight: "600",
  },
  statusValue: {
    fontWeight: "800",
  },

  // Top Items
  topList: {
    gap: 12,
  },
  topItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  topItemRank: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  topItemRankText: {
    fontWeight: "900",
  },
  topItemInfo: {
    flex: 1,
  },
  topItemName: {
    fontWeight: "700",
  },
  topItemMeta: {
    marginTop: 2,
  },

  // Performance
  performanceList: {
    gap: 16,
  },
  performanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  performanceIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  performanceInfo: {
    flex: 1,
  },
  performanceLabel: {
    fontWeight: "600",
  },
  performanceValue: {
    fontWeight: "800",
    marginTop: 2,
  },

  // Peak Hours
  peakChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around"
  },
  peakBarWrapper: {
    alignItems: "center",
    flex: 1
  },
  peakBar: {
    width: "55%",
    borderRadius: 4
  },
  peakLabel: {
    fontWeight: "600",
    marginTop: 3
  },

  // Progress
  progressSection: {
    width: "100%",
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 8,
  },
  progressPercentage: {
    fontWeight: "900",
  },
  progressStats: {
    fontWeight: "600",
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },

  // Divider
  divider: {
    backgroundColor: "#E5E7EB",
  },

  // Summary
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  summaryItem: {
    flex: 1,
    minWidth: "45%",
  },
  summaryLabel: {
    fontWeight: "600",
    marginBottom: 4,
  },
  summaryValue: {
    fontWeight: "800",
  },

  // Export Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    padding: 16,
    justifyContent: Platform.OS === "web" ? "center" : "flex-end",
    alignItems: Platform.OS === "web" ? "center" : "stretch",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    maxHeight: "85%",
    width: Platform.OS === "web" ? "100%" : undefined,
    maxWidth: Platform.OS === "web" ? 540 : undefined,
  },
  modalHeader: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  modalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  modalIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  modalSubtitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 8 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    height: 48,
  },
  dateValueText: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    fontWeight: "700",
    paddingHorizontal: 12,
  },
  exportPreview: {
    marginTop: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  exportPreviewTitle: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 10,
  },
  exportPreviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  exportPreviewLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  exportPreviewValue: {
    fontSize: 13,
    fontWeight: "800",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 8,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  exportBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  // iOS picker sheet
  pickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17, 24, 39, 0.35)",
  },
  pickerSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 18,
    paddingTop: 10,
  },
  pickerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111827",
  },
  pickerAction: {
    fontSize: 14,
    fontWeight: "900",
    color: "#6B7280",
  },
  pickerActionPrimary: {
    color: "#2563EB",
  },
});