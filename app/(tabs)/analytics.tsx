import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Pressable,
  useWindowDimensions,
  Alert,
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

  const isSmall = width < 380;
  const isMedium = width >= 380 && width < 600;
  const isLarge = width >= 600;

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

  useEffect(() => {
    if (!user) {
      router.replace("/admin-login");
      return;
    }
    loadAnalytics(user.uid, selectedRange);
  }, [user, selectedRange]);

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
    <View style={[styles.metricCard, { width: metricCardWidth, marginBottom: isSmall ? gap : 0 }]}>
      <View style={[styles.metricIconWrap, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={isSmall ? 14 : 16} color={color} />
      </View>
      <Text style={[styles.metricValue, { fontSize: valueFontSize }]}>
        {typeof value === 'number' ? value.toLocaleString() : value}{suffix}
      </Text>
      <Text style={[styles.metricLabel, { fontSize: smallFontSize }]}>{label}</Text>
    </View>
  );

  const maxRevenue = Math.max(...analytics.dailyRevenue.map((d) => d.revenue), 1);
  const maxOrders = Math.max(...analytics.dailyOrders.map((d) => d.count), 1);
  const maxPeak = Math.max(...analytics.peakHours.map((h) => h.orders), 1);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Ionicons name="bar-chart" size={48} color="#2563EB" />
          <Text style={styles.loadingText}>Loading Analytics...</Text>
          <Text style={styles.loadingSubtext}>Fetching your business data</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#DC2626" />
          <Text style={styles.errorText}>Failed to Load</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => user && loadAnalytics(user.uid, selectedRange)}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { padding: spacing }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Background Decor */}
        <View style={styles.backgroundDecor}>
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />
          <View style={styles.bgCircle3} />
        </View>

        {/* Header */}
        <View style={[styles.header, { marginBottom: spacing * 2 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { fontSize: smallFontSize }]}>Analytics Dashboard</Text>
            <Text style={[styles.title, { fontSize: titleFontSize }]}>Performance Overview</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="trending-up" size={isSmall ? 12 : 14} color="#2563EB" />
            {!isSmall && <Text style={styles.badgeText}>REAL-TIME</Text>}
          </View>
        </View>

        {/* Time Range Selector */}
        <View style={[styles.timeRangeContainer, { marginBottom: gap * 2 }]}>
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
                  selectedRange === range.key && styles.timeRangeTextActive,
                  { fontSize: smallFontSize },
                ]}
              >
                {range.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Revenue Card */}
        <View style={[styles.card, { padding: spacing, marginBottom: gap }]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { fontSize: smallFontSize }]}>Total Revenue</Text>
              <Text style={[styles.revenueValue, { fontSize: revenueValueSize }]}>
                ₹{analytics.totalRevenue.toLocaleString()}
              </Text>
            </View>
            <View style={[styles.changeIndicator, { 
              backgroundColor: analytics.revenueChange >= 0 ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)'
            }]}>
              <Ionicons 
                name={analytics.revenueChange >= 0 ? "trending-up" : "trending-down"} 
                size={isSmall ? 12 : 14} 
                color={analytics.revenueChange >= 0 ? "#16A34A" : "#DC2626"} 
              />
              <Text style={[styles.changeText, { 
                fontSize: smallFontSize,
                color: analytics.revenueChange >= 0 ? "#16A34A" : "#DC2626"
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
                        backgroundColor: idx === analytics.dailyRevenue.length - 1 ? "#2563EB" : "rgba(37, 99, 235, 0.5)",
                      },
                    ]}
                  />
                  <Text style={[styles.chartLabel, { fontSize: smallFontSize - 1 }]}>{data.day}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Key Metrics Grid */}
        <View style={[styles.metricsGrid, { marginBottom: gap, gap }]}>
          <MetricCard 
            icon="bed-outline" 
            value={analytics.activeRooms} 
            label="Active Rooms" 
            color="#2563EB" 
          />
          <MetricCard 
            icon="bed" 
            value={analytics.availableRooms} 
            label="Available" 
            color="#16A34A" 
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
            color="#F59E0B" 
          />
        </View>

        {/* Daily Orders Chart */}
        <View style={[styles.card, { padding: spacing, marginBottom: gap }]}>
          <Text style={[styles.cardLabel, { fontSize: smallFontSize, marginBottom: spacing }]}>
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
                        backgroundColor: "#F59E0B",
                      },
                    ]}
                  />
                  <Text style={[styles.chartLabel, { fontSize: smallFontSize - 1 }]}>{data.day}</Text>
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
          <View style={[styles.card, { flex: 1, padding: spacing }]}>
            <Text style={[styles.cardLabel, { fontSize: smallFontSize }]}>Food Orders</Text>
            <View style={[styles.statusList, { marginTop: spacing }]}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: "#F59E0B" }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize }]}>Pending</Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7 }]}>
                  {analytics.foodOrders.pending}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: "#2563EB" }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize }]}>Active</Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7 }]}>
                  {analytics.foodOrders.accepted}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: "#16A34A" }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize }]}>Completed</Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7 }]}>
                  {analytics.foodOrders.completed}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.card, { flex: 1, padding: spacing }]}>
            <Text style={[styles.cardLabel, { fontSize: smallFontSize }]}>Service Requests</Text>
            <View style={[styles.statusList, { marginTop: spacing }]}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: "#F59E0B" }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize }]}>Pending</Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7 }]}>
                  {analytics.serviceRequests.pending}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: "#2563EB" }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize }]}>In Progress</Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7 }]}>
                  {analytics.serviceRequests.inProgress}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: "#16A34A" }]} />
                <Text style={[styles.statusLabel, { fontSize: smallFontSize }]}>Completed</Text>
                <Text style={[styles.statusValue, { fontSize: valueFontSize * 0.7 }]}>
                  {analytics.serviceRequests.completed}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Peak Hours */}
        <View style={[styles.card, { padding: spacing, marginBottom: gap }]}>
          <Text style={[styles.cardLabel, { fontSize: smallFontSize, marginBottom: spacing }]}>
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
                      backgroundColor: idx === 2 ? "#2563EB" : "rgba(37, 99, 235, 0.4)",
                    },
                  ]}
                />
                <Text style={[styles.peakLabel, { fontSize: smallFontSize - 1 }]}>{hour.hour}</Text>
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
          <View style={[styles.card, { flex: 1, padding: spacing }]}>
            <Text style={[styles.cardLabel, { fontSize: smallFontSize }]}>Top Items</Text>
            <View style={[styles.topList, { marginTop: spacing }]}>
              {analytics.topItems.slice(0, 3).map((item, idx) => (
                <View key={idx} style={styles.topItemRow}>
                  <View style={styles.topItemRank}>
                    <Text style={[styles.topItemRankText, { fontSize: smallFontSize }]}>#{idx + 1}</Text>
                  </View>
                  <View style={styles.topItemInfo}>
                    <Text style={[styles.topItemName, { fontSize: labelFontSize }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.topItemMeta, { fontSize: smallFontSize - 1 }]}>
                      {item.count} orders • ₹{item.revenue.toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.card, { flex: 1, padding: spacing }]}>
            <Text style={[styles.cardLabel, { fontSize: smallFontSize }]}>Performance</Text>
            <View style={[styles.performanceList, { marginTop: spacing }]}>
              <View style={styles.performanceRow}>
                <View style={styles.performanceIcon}>
                  <Ionicons name="timer" size={16} color="#2563EB" />
                </View>
                <View style={styles.performanceInfo}>
                  <Text style={[styles.performanceLabel, { fontSize: smallFontSize }]}>Response Time</Text>
                  <Text style={[styles.performanceValue, { fontSize: valueFontSize * 0.6 }]}>
                    {analytics.avgResponseTime}m
                  </Text>
                </View>
              </View>
              <View style={styles.performanceRow}>
                <View style={styles.performanceIcon}>
                  <Ionicons name="restaurant" size={16} color="#16A34A" />
                </View>
                <View style={styles.performanceInfo}>
                  <Text style={[styles.performanceLabel, { fontSize: smallFontSize }]}>Prep Time</Text>
                  <Text style={[styles.performanceValue, { fontSize: valueFontSize * 0.6 }]}>
                    {analytics.avgPreparationTime}m
                  </Text>
                </View>
              </View>
              <View style={styles.performanceRow}>
                <View style={styles.performanceIcon}>
                  <Ionicons name="people" size={16} color="#8B5CF6" />
                </View>
                <View style={styles.performanceInfo}>
                  <Text style={[styles.performanceLabel, { fontSize: smallFontSize }]}>Avg Stay</Text>
                  <Text style={[styles.performanceValue, { fontSize: valueFontSize * 0.6 }]}>
                    {analytics.avgStayDuration}h
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Completion Rate & Occupancy */}
        <View style={[styles.card, { padding: spacing, marginBottom: gap }]}>
          <View style={{ flexDirection: isSmall ? "column" : "row", justifyContent: "space-between", gap: spacing }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { fontSize: smallFontSize }]}>Service Completion</Text>
              <View style={[styles.progressSection, { marginTop: spacing / 2 }]}>
                <View style={styles.progressHeader}>
                  <Text style={[styles.progressPercentage, { fontSize: valueFontSize }]}>
                    {analytics.completionRate}%
                  </Text>
                  <Text style={[styles.progressStats, { fontSize: smallFontSize }]}>
                    {analytics.serviceRequests.completed} / {analytics.serviceRequests.total}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${analytics.completionRate}%` }
                    ]} 
                  />
                </View>
              </View>
            </View>
            
            <View style={[styles.divider, { 
              width: isSmall ? "100%" : 1, 
              height: isSmall ? 1 : "auto" 
            }]} />
            
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { fontSize: smallFontSize }]}>Room Occupancy</Text>
              <View style={[styles.progressSection, { marginTop: spacing / 2 }]}>
                <View style={styles.progressHeader}>
                  <Text style={[styles.progressPercentage, { fontSize: valueFontSize }]}>
                    {analytics.occupancyRate}%
                  </Text>
                  <Text style={[styles.progressStats, { fontSize: smallFontSize }]}>
                    {analytics.activeRooms} / {analytics.totalRooms}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { 
                        width: `${analytics.occupancyRate}%`,
                        backgroundColor: "#16A34A" 
                      }
                    ]} 
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Summary Stats */}
        <View style={[styles.card, { padding: spacing }]}>
          <Text style={[styles.cardLabel, { fontSize: smallFontSize, marginBottom: spacing }]}>
            Summary
          </Text>
          <View style={[styles.summaryGrid, { gap }]}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { fontSize: smallFontSize }]}>Total Orders</Text>
              <Text style={[styles.summaryValue, { fontSize: valueFontSize * 0.7 }]}>
                {analytics.totalOrders}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { fontSize: smallFontSize }]}>Service Requests</Text>
              <Text style={[styles.summaryValue, { fontSize: valueFontSize * 0.7 }]}>
                {analytics.totalServiceRequests}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { fontSize: smallFontSize }]}>Pending</Text>
              <Text style={[styles.summaryValue, { fontSize: valueFontSize * 0.7, color: "#F59E0B" }]}>
                {analytics.pendingCount}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { fontSize: smallFontSize }]}>Total Guests</Text>
              <Text style={[styles.summaryValue, { fontSize: valueFontSize * 0.7 }]}>
                {analytics.totalGuests}
              </Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: {},

  backgroundDecor: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  bgCircle1: {
    position: "absolute",
    top: -100,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
  },
  bgCircle2: {
    position: "absolute",
    top: 140,
    left: -100,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(37, 99, 235, 0.05)",
  },
  bgCircle3: {
    position: "absolute",
    bottom: 20,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
  },

  // Loading & Error
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: "#6B7280",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F9FAFB",
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "700",
    color: "#DC2626",
  },
  errorSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#2563EB",
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
  greeting: { color: "#6B7280", fontWeight: "600", letterSpacing: 0.5 },
  title: { fontWeight: "700", color: "#111827", marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
  },
  badgeText: { color: "#2563EB", fontWeight: "700", fontSize: 9, letterSpacing: 0.8 },

  timeRangeContainer: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#FFFFFF",
    padding: 4,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  timeRangeButton: { flex: 1, borderRadius: 8, alignItems: "center" },
  timeRangeButtonActive: { backgroundColor: "#2563EB" },
  timeRangeText: { fontWeight: "600", color: "#6B7280" },
  timeRangeTextActive: { color: "#FFFFFF" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },

  cardHeader: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    marginBottom: 12 
  },
  cardLabel: { 
    fontWeight: "600", 
    color: "#6B7280", 
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  revenueValue: { fontWeight: "800", color: "#111827" },
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
    color: "#9CA3AF", 
    fontWeight: "600", 
    marginTop: 4 
  },

  metricsGrid: { 
    flexDirection: "row", 
    flexWrap: "wrap" 
  },
  metricCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
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
    color: "#111827", 
    marginBottom: 2 
  },
  metricLabel: { 
    color: "#6B7280", 
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
    color: "#6B7280",
    fontWeight: "600",
  },
  statusValue: {
    fontWeight: "800",
    color: "#111827",
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
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  topItemRankText: {
    fontWeight: "900",
    color: "#2563EB",
  },
  topItemInfo: {
    flex: 1,
  },
  topItemName: {
    fontWeight: "700",
    color: "#111827",
  },
  topItemMeta: {
    color: "#6B7280",
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
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  performanceInfo: {
    flex: 1,
  },
  performanceLabel: {
    color: "#6B7280",
    fontWeight: "600",
  },
  performanceValue: {
    fontWeight: "800",
    color: "#111827",
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
    color: "#9CA3AF", 
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
    color: "#2563EB",
  },
  progressStats: {
    color: "#6B7280",
    fontWeight: "600",
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2563EB",
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
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 4,
  },
  summaryValue: {
    fontWeight: "800",
    color: "#111827",
  },
});