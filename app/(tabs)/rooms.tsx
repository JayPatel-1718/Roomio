import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  SafeAreaView,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  Timestamp,
  query,
  where,
  getDocs,
  serverTimestamp,
  writeBatch,
  deleteDoc,
  orderBy,
  runTransaction,
  addDoc,
} from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { getAuth } from "firebase/auth";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

type Meal = "breakfast" | "lunch" | "dinner";

type Room = {
  id: string;
  roomNumber: number;
  status: "occupied" | "available";
  guestName?: string;
  guestMobile?: string;
  checkoutAt?: Timestamp;
  guestId?: string;
  mealPlan?: Meal[];
  assignedAt?: Timestamp;
};

type FoodOrder = {
  id: string;
  roomNumber?: number | string;
  guestName?: string;
  guestMobile?: string;
  guestId?: string;
  items?: Array<{
    name?: string;
    item?: string;
    title?: string;
    qty?: number;
    quantity?: number;
    price?: number;
    unitPrice?: number;
    rate?: number;
    lineTotal?: number;
    total?: number;
    amount?: number;
  }> | Record<string, any>;
  item?: string;
  qty?: number;
  quantity?: number;
  price?: any;
  subtotal?: any;
  total?: any;
  amount?: any;
  totalPrice?: any;
  totalAmount?: any;
  grandTotal?: any;
  finalTotal?: any;
  finalAmount?: any;
  payable?: any;
  status?: string;
  createdAt?: any;
  source?: string;
  adminId?: string;
  // Tracking status fields
  estimatedTime?: number;
  acceptedAt?: Timestamp;
  completedAt?: Timestamp;
  readyAt?: Timestamp;
  sourceOrderId?: string;
};

type ServiceRequest = {
  id: string;
  adminId?: string;
  type?: string;
  roomNumber?: number | string;
  guestName?: string;
  guestMobile?: string;
  status?: string;
  charges?: number;
  currency?: string;
  isFreeRequest?: boolean;
  requestNumber?: number;
  estimatedTime?: number;
  acceptedAt?: Timestamp;
  completedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  source?: string;
  notes?: string;
  dishName?: string;
  orderDetails?: any[];
  totalAmount?: number;
  foodOrderId?: string;
  sourceOrderId?: string;
};

export default function RoomsScreen() {
  const auth = getAuth();
  const user = auth.currentUser;
  const router = useRouter();

  const [occupiedRooms, setOccupiedRooms] = useState<Room[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [foodOrders, setFoodOrders] = useState<FoodOrder[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsRoomNumber, setLogsRoomNumber] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [logsType, setLogsType] = useState<"food" | "services">("food");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Search and Edit Room State
  const [searchQuery, setSearchQuery] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestMobile, setGuestMobile] = useState("");
  const [checkoutDate, setCheckoutDate] = useState<Date | null>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0);
    return tomorrow;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [initializing, setInitializing] = useState(false);

  // Track occupied rooms for filtering
  const occupiedRoomsRef = useRef<Room[]>([]);
  useEffect(() => {
    occupiedRoomsRef.current = occupiedRooms;
  }, [occupiedRooms]);

  useEffect(() => {
    if (!user) {
      Alert.alert("Please login first", "You need to be logged in to view rooms");
      router.replace("/admin-login");
      return;
    }

    const uid = user.uid;
    setLoading(true);

    console.log("🔍 Setting up listeners for user:", uid);

    // 1️⃣ Listen to rooms (user subcollection)
    const roomsRef = collection(db, "users", uid, "rooms");
    const unsubRooms = onSnapshot(
      roomsRef,
      (snap) => {
        console.log("🏨 Rooms snapshot:", snap.size, "rooms");
        const occupied: Room[] = [];
        const available: Room[] = [];

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const room: Room = { id: docSnap.id, ...data };
          if (room.status === "occupied") {
            occupied.push(room);
          } else {
            available.push(room);
          }
        });

        occupied.sort((a, b) => a.roomNumber - b.roomNumber);
        available.sort((a, b) => a.roomNumber - b.roomNumber);

        setOccupiedRooms(occupied);
        setAvailableRooms(available);
        occupiedRoomsRef.current = occupied;
      },
      (err) => {
        console.error("Rooms listener error:", err);
        Alert.alert("Error", "Failed to load rooms: " + err.message);
      }
    );

    // 2️⃣ Listen to foodOrders from ROOT collection
    const foodOrdersRef = collection(db, "foodOrders");
    const foodOrdersQuery = query(
      foodOrdersRef,
      where("adminId", "==", uid)
    );

    const unsubFoodOrders = onSnapshot(
      foodOrdersQuery,
      (snap) => {
        console.log("🍕 Food orders snapshot:", snap.size, "orders");
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as FoodOrder[];

        // Sort manually by createdAt in memory
        items.sort((a: any, b: any) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

        setFoodOrders(items);
      },
      (err) => {
        console.error("Food orders listener error:", err);
        Alert.alert(
          "Food Orders Error",
          `Cannot read food orders: ${err.message}\n\nCheck if you have permission to read /foodOrders collection.`
        );
      }
    );

    // 3️⃣ Listen to serviceRequests WITHOUT orderBy
    const serviceRequestsRef = collection(db, "serviceRequests");
    const serviceRequestsQuery = query(
      serviceRequestsRef,
      where("adminId", "==", uid)
    );

    const unsubServiceRequests = onSnapshot(
      serviceRequestsQuery,
      (snap) => {
        console.log("🔧 Service requests snapshot:", snap.size, "requests");
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ServiceRequest[];

        // Sort manually by createdAt
        items.sort((a: any, b: any) => {
          const aTime = a.createdAt?.toMillis?.() || a.updatedAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || b.updatedAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

        setServiceRequests(items);
        setLoading(false);
      },
      (err) => {
        console.error("Service requests listener error:", err);
        Alert.alert(
          "Service Requests Error",
          `Cannot read service requests: ${err.message}\n\nCheck if you have permission to read /serviceRequests collection.`
        );
        setLoading(false);
      }
    );

    return () => {
      console.log("🧹 Cleaning up listeners");
      unsubRooms();
      unsubFoodOrders();
      unsubServiceRequests();
    };
  }, [user, router]);

  // Clear selection when order/request is removed
  useEffect(() => {
    if (!selectedOrderId) return;
    const stillExists = foodOrders.some((o) => o.id === selectedOrderId);
    if (!stillExists) setSelectedOrderId(null);
  }, [foodOrders, selectedOrderId]);

  useEffect(() => {
    if (!selectedRequestId) return;
    const stillExists = serviceRequests.some((r) => r.id === selectedRequestId);
    if (!stillExists) setSelectedRequestId(null);
  }, [serviceRequests, selectedRequestId]);

  // Get food orders for a specific room - ONLY for CURRENT guest
  const getCurrentGuestFoodOrders = (roomNumber: number, currentGuestId?: string, roomAssignedAt?: Timestamp) => {
    return foodOrders.filter((o) => {
      if (String(o.roomNumber ?? "") !== String(roomNumber)) return false;

      if (roomAssignedAt && o.createdAt) {
        const orderTime = o.createdAt?.toMillis?.() || 0;
        const roomAssignedTime = roomAssignedAt.toMillis();
        if (orderTime < roomAssignedTime) return false;
      }

      return true;
    });
  };

  // Get service requests for a specific room - ONLY for CURRENT guest
  const getServiceRequestsForRoom = (roomNumber: number, roomAssignedAt?: Timestamp) => {
    return serviceRequests.filter((r) => {
      if (String(r.roomNumber ?? "") !== String(roomNumber)) return false;

      if (roomAssignedAt && r.createdAt) {
        const requestTime = r.createdAt?.toMillis?.() || 0;
        const roomAssignedTime = roomAssignedAt.toMillis();
        if (requestTime < roomAssignedTime) return false;
      }

      return true;
    });
  };

  // Count food orders for a room
  const foodCountForRoom = (roomNumber: number, guestId?: string, roomAssignedAt?: Timestamp) => {
    return getCurrentGuestFoodOrders(roomNumber, guestId, roomAssignedAt).length;
  };

  // Calculate total for food orders in a room
  const totalForRoom = (roomNumber: number, guestId?: string, roomAssignedAt?: Timestamp) => {
    const orders = getCurrentGuestFoodOrders(roomNumber, guestId, roomAssignedAt);
    return orders.reduce((sum, o) => sum + getOrderTotal(o), 0);
  };

  // Calculate service charges for a room
  const serviceChargesForRoom = (roomNumber: number, roomAssignedAt?: Timestamp) => {
    const requests = getServiceRequestsForRoom(roomNumber, roomAssignedAt);
    return requests.reduce((sum, r) => sum + (r.charges || 0), 0);
  };

  // Total charges for a room (food + services)
  const totalChargesForRoom = (roomNumber: number, guestId?: string, roomAssignedAt?: Timestamp) => {
    const foodTotal = totalForRoom(roomNumber, guestId, roomAssignedAt);
    const serviceTotal = serviceChargesForRoom(roomNumber, roomAssignedAt);
    return foodTotal + serviceTotal;
  };

  // Count service requests for a room
  const serviceCountForRoom = (roomNumber: number, roomAssignedAt?: Timestamp) => {
    return getServiceRequestsForRoom(roomNumber, roomAssignedAt).length;
  };

  // Filter food orders for logs modal
  const filteredFoodOrders = useMemo(() => {
    if (logsRoomNumber == null) return foodOrders;
    return foodOrders.filter((o) => String(o.roomNumber ?? "") === String(logsRoomNumber));
  }, [foodOrders, logsRoomNumber]);

  // Filter service requests for logs modal
  const filteredServiceRequests = useMemo(() => {
    if (logsRoomNumber == null) return serviceRequests;
    return serviceRequests.filter((r) => String(r.roomNumber ?? "") === String(logsRoomNumber));
  }, [serviceRequests, logsRoomNumber]);

  // Filtered Rooms including Search
  const filteredOccupiedRooms = useMemo(() => {
    if (!searchQuery) return occupiedRooms;
    return occupiedRooms.filter((r) =>
      String(r.roomNumber).includes(searchQuery)
    );
  }, [occupiedRooms, searchQuery]);

  const filteredAvailableRooms = useMemo(() => {
    if (!searchQuery) return availableRooms;
    return availableRooms.filter((r) =>
      String(r.roomNumber).includes(searchQuery)
    );
  }, [availableRooms, searchQuery]);

  // Handle Edit Room (Initialize)
  const openEditModal = (room: Room) => {
    setEditingRoom(room);
    setGuestName("");
    setGuestMobile("");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0);
    setCheckoutDate(tomorrow);
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingRoom(null);
    setGuestName("");
    setGuestMobile("");
    setCheckoutDate(null);
  };

  const saveRoomDetails = async () => {
    if (!editingRoom || !user) return;

    if (!guestName.trim()) {
      Alert.alert("Invalid Name", "Guest name is required");
      return;
    }

    if (!/^[0-9]{10}$/.test(guestMobile)) {
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

    setInitializing(true);
    try {
      const uid = user.uid;
      const currentUserEmail = user.email;

      // 1. Create Guest Record
      const guestData = {
        adminId: uid,
        adminEmail: currentUserEmail,
        guestMobile: guestMobile,
        guestName: guestName.trim(),
        roomNumber: editingRoom.roomNumber,
        isActive: true,
        isLoggedIn: false,
        createdAt: serverTimestamp(),
        checkoutAt: Timestamp.fromDate(checkoutDate),
        mealPlan: [], // Default empty
      };

      const guestRef = await addDoc(collection(db, "guests"), guestData);

      // 2. Update Room (Transactional to be safe, though simple update here is likely fine)
      const roomRef = doc(db, "users", uid, "rooms", editingRoom.id);

      await updateDoc(roomRef, {
        status: "occupied",
        guestName: guestName.trim(),
        guestMobile: guestMobile,
        assignedAt: serverTimestamp(),
        checkoutAt: Timestamp.fromDate(checkoutDate),
        guestId: guestRef.id,
        adminEmail: currentUserEmail,
        updatedAt: serverTimestamp(),
      });

      // 3. Update Guest with Room Number (Redundant but good for consistency if guest creation didn't have it)
      // (Already added in guestData)

      Alert.alert("✅ Success", `Room ${editingRoom.roomNumber} initialized for ${guestName}`);
      closeEditModal();

    } catch (error: any) {
      console.error("Error initializing room:", error);
      Alert.alert("❌ Error", "Failed to initialize room: " + error.message);
    } finally {
      setInitializing(false);
    }
  };

  // Date handlers
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const formatDateTimeLocal = (d: Date) => {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

  // ✅ DELETE ALL FOOD ORDERS
  const deleteAllFoodOrders = async () => {
    if (!user) return;
    if (filteredFoodOrders.length === 0) {
      Alert.alert("No Orders", "There are no food orders to delete.");
      return;
    }

    Alert.alert(
      "Delete All Food Orders",
      `Are you sure you want to delete ALL ${filteredFoodOrders.length} food orders${logsRoomNumber ? ` for Room ${logsRoomNumber}` : ""}?\n\nThis action CANNOT be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const batch = writeBatch(db);
              const uid = user.uid;

              // Create query based on room filter
              let ordersQuery;
              if (logsRoomNumber) {
                ordersQuery = query(
                  collection(db, "foodOrders"),
                  where("adminId", "==", uid),
                  where("roomNumber", "==", logsRoomNumber)
                );
              } else {
                ordersQuery = query(
                  collection(db, "foodOrders"),
                  where("adminId", "==", uid)
                );
              }

              const ordersSnapshot = await getDocs(ordersQuery);
              ordersSnapshot.docs.forEach((docSnap) => {
                batch.delete(docSnap.ref);
              });

              await batch.commit();
              Alert.alert(
                "✅ Success",
                `Deleted ${ordersSnapshot.size} food orders successfully.`
              );

              // Clear selection if current selected order was deleted
              if (selectedOrderId) {
                const stillExists = foodOrders.some(o => o.id === selectedOrderId);
                if (!stillExists) setSelectedOrderId(null);
              }
            } catch (e: any) {
              console.error("Delete all food orders error:", e);
              Alert.alert("❌ Error", "Failed to delete food orders: " + e.message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  // ✅ DELETE ALL SERVICE REQUESTS
  const deleteAllServiceRequests = async () => {
    if (!user) return;
    if (filteredServiceRequests.length === 0) {
      Alert.alert("No Requests", "There are no service requests to delete.");
      return;
    }

    Alert.alert(
      "Delete All Service Requests",
      `Are you sure you want to delete ALL ${filteredServiceRequests.length} service requests${logsRoomNumber ? ` for Room ${logsRoomNumber}` : ""}?\n\nThis action CANNOT be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const batch = writeBatch(db);
              const uid = user.uid;

              // Create query based on room filter
              let requestsQuery;
              if (logsRoomNumber) {
                requestsQuery = query(
                  collection(db, "serviceRequests"),
                  where("adminId", "==", uid),
                  where("roomNumber", "==", logsRoomNumber)
                );
              } else {
                requestsQuery = query(
                  collection(db, "serviceRequests"),
                  where("adminId", "==", uid)
                );
              }

              const requestsSnapshot = await getDocs(requestsQuery);
              requestsSnapshot.docs.forEach((docSnap) => {
                batch.delete(docSnap.ref);
              });

              await batch.commit();
              Alert.alert(
                "✅ Success",
                `Deleted ${requestsSnapshot.size} service requests successfully.`
              );

              // Clear selection if current selected request was deleted
              if (selectedRequestId) {
                const stillExists = serviceRequests.some(r => r.id === selectedRequestId);
                if (!stillExists) setSelectedRequestId(null);
              }
            } catch (e: any) {
              console.error("Delete all service requests error:", e);
              Alert.alert("❌ Error", "Failed to delete service requests: " + e.message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  // ✅ DELETE SINGLE FOOD ORDER
  const deleteFoodOrder = async (orderId: string) => {
    if (!user) return;

    Alert.alert(
      "Delete Food Order",
      "Are you sure you want to delete this food order?\n\nThis action CANNOT be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "foodOrders", orderId));
              Alert.alert("✅ Deleted", "Food order deleted successfully.");

              if (selectedOrderId === orderId) {
                setSelectedOrderId(null);
              }
            } catch (e: any) {
              console.error("Delete food order error:", e);
              Alert.alert("❌ Error", "Failed to delete food order: " + e.message);
            }
          },
        },
      ]
    );
  };

  // ✅ DELETE SINGLE SERVICE REQUEST
  const deleteServiceRequest = async (requestId: string) => {
    if (!user) return;

    Alert.alert(
      "Delete Service Request",
      "Are you sure you want to delete this service request?\n\nThis action CANNOT be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "serviceRequests", requestId));
              Alert.alert("✅ Deleted", "Service request deleted successfully.");

              if (selectedRequestId === requestId) {
                setSelectedRequestId(null);
              }
            } catch (e: any) {
              console.error("Delete service request error:", e);
              Alert.alert("❌ Error", "Failed to delete service request: " + e.message);
            }
          },
        },
      ]
    );
  };

  // ✅ CHECKOUT ROOM - DELETE ALL ORDERS
  const checkoutRoom = async (roomId: string, roomNumber: number) => {
    if (!user) return;
    const uid = user.uid;

    const room = occupiedRooms.find((r) => r.id === roomId);
    const guestId = room?.guestId || null;
    const roomAssignedAt = room?.assignedAt;

    const foodTotal = totalForRoom(roomNumber, guestId, roomAssignedAt);
    const serviceTotal = serviceChargesForRoom(roomNumber, roomAssignedAt);
    const totalCharges = foodTotal + serviceTotal;

    Alert.alert(
      "Confirm Checkout",
      `Checkout Room ${roomNumber}?\n\nGuest: ${room?.guestName || "Unknown"}\nTotal Charges: ₹${totalCharges.toFixed(2)}\n\nThis will DELETE all food orders and service requests for this room.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Checkout & Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const batch = writeBatch(db);

              // Update room to available
              batch.update(doc(db, "users", uid, "rooms", roomId), {
                status: "available",
                guestName: null,
                guestMobile: null,
                assignedAt: null,
                checkoutAt: null,
                guestId: null,
                updatedAt: serverTimestamp(),
              });

              // ✅ DELETE ALL food orders for this room
              const foodOrdersQuery = query(
                collection(db, "foodOrders"),
                where("adminId", "==", uid),
                where("roomNumber", "==", roomNumber)
              );
              const foodOrdersSnapshot = await getDocs(foodOrdersQuery);
              foodOrdersSnapshot.docs.forEach((docSnap) => {
                batch.delete(docSnap.ref);
              });

              // ✅ DELETE ALL service requests for this room
              const serviceRequestsQuery = query(
                collection(db, "serviceRequests"),
                where("adminId", "==", uid),
                where("roomNumber", "==", roomNumber)
              );
              const serviceRequestsSnapshot = await getDocs(serviceRequestsQuery);
              serviceRequestsSnapshot.docs.forEach((docSnap) => {
                batch.delete(docSnap.ref);
              });

              // ✅ DELETE from orders collection
              const ordersQuery = query(
                collection(db, "orders"),
                where("adminId", "==", uid),
                where("roomNumber", "==", roomNumber)
              );
              const ordersSnapshot = await getDocs(ordersQuery);
              ordersSnapshot.docs.forEach((docSnap) => {
                batch.delete(docSnap.ref);
              });

              // Update guest status
              if (guestId) {
                batch.update(doc(db, "guests", guestId), {
                  isActive: false,
                  checkedOutAt: serverTimestamp(),
                  checkoutReason: "manual",
                });
              } else {
                const guestQuery = query(
                  collection(db, "guests"),
                  where("adminId", "==", uid),
                  where("roomNumber", "==", roomNumber),
                  where("isActive", "==", true)
                );
                const guestSnap = await getDocs(guestQuery);
                guestSnap.docs.forEach((d) => {
                  batch.update(d.ref, {
                    isActive: false,
                    checkedOutAt: serverTimestamp(),
                    checkoutReason: "manual",
                  });
                });
              }

              await batch.commit();
              Alert.alert(
                "✅ Success",
                `Room ${roomNumber} checked out.\nDeleted ${foodOrdersSnapshot.size} orders and ${serviceRequestsSnapshot.size} service requests.\nTotal charges: ₹${totalCharges.toFixed(2)}`
              );
            } catch (e: any) {
              console.error("Checkout failed:", e);
              Alert.alert("❌ Error", "Failed to checkout room.\n\n" + e.message);
            }
          },
        },
      ]
    );
  };

  // Get remaining time until checkout
  const getRemainingTime = (checkoutAt?: Timestamp) => {
    if (!checkoutAt) return null;
    const now = Date.now();
    const diff = checkoutAt.toMillis() - now;
    if (diff <= 0) return "Expired";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h left`;
  };

  // Format meal plan text
  const prettyMealText = (meals?: Meal[]) => {
    if (!meals || meals.length === 0) return "-";
    const map: Record<Meal, string> = {
      breakfast: "Breakfast",
      lunch: "Lunch",
      dinner: "Dinner",
    };
    return meals.map((m) => map[m]).join(", ");
  };

  // Format order time
  const formatOrderTime = (createdAt: any) => {
    try {
      const dt: Date | null = createdAt?.toDate?.() ?? null;
      if (!dt) return "Just now";
      return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "Just now";
    }
  };

  // Format date and time
  const formatDateTime = (timestamp: any) => {
    try {
      const dt: Date | null = timestamp?.toDate?.() ?? null;
      if (!dt) return "-";
      return dt.toLocaleDateString() + " " + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "-";
    }
  };

  // Format INR currency
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

  // Get order line title
  const orderLineTitle = (i: any) => i?.name || i?.item || i?.title || "Item";

  // Calculate order total
  const getOrderTotal = (o: FoodOrder) => {
    const directTotal =
      toNum((o as any).total) ||
      toNum((o as any).subtotal) ||
      toNum((o as any).amount) ||
      toNum((o as any).totalPrice) ||
      toNum((o as any).totalAmount) ||
      toNum((o as any).grandTotal) ||
      toNum((o as any).finalTotal) ||
      toNum((o as any).finalAmount) ||
      toNum((o as any).payable) ||
      toNum((o as any).price);

    if (directTotal > 0) return directTotal;

    const items = normalizeItems((o as any).items);
    if (items.length) {
      return items.reduce((sum, it) => {
        const line = toNum(it?.lineTotal) || toNum(it?.total) || toNum(it?.amount);
        if (line > 0) return sum + line;

        const qty = toNum(it?.qty) || toNum(it?.quantity) || 1;
        const price = toNum(it?.price) || toNum(it?.unitPrice) || toNum(it?.rate) || 0;
        return sum + qty * price;
      }, 0);
    }

    const qty = toNum((o as any).qty) || toNum((o as any).quantity) || 1;
    const price = toNum((o as any).price) || toNum((o as any).unitPrice) || 0;
    return qty * price;
  };

  // Get order summary text
  const getOrderSummaryText = (o: FoodOrder) => {
    const items = normalizeItems((o as any).items);
    if (items.length) {
      const count = items.reduce((sum, it) => {
        const q = toNum(it?.qty) || toNum(it?.quantity) || 1;
        return sum + q;
      }, 0);
      return `${count} item${count === 1 ? "" : "s"}`;
    }
    if ((o as any).item) return `${toNum((o as any).qty) || 1} item`;
    return "Food Order";
  };

  // Get service status color
  const getServiceStatusColor = (status?: string) => {
    const s = (status || "pending").toLowerCase();
    if (s === "completed") return "#16A34A";
    if (s === "in-progress") return "#2563EB";
    if (s === "cancelled") return "#6B7280";
    if (s === "accepted") return "#7C3AED";
    return "#F59E0B";
  };

  // Get service status text
  const getServiceStatusText = (status?: string) => {
    const s = (status || "pending").toLowerCase();
    if (s === "completed") return "COMPLETED";
    if (s === "in-progress") return "IN PROGRESS";
    if (s === "cancelled") return "CANCELLED";
    if (s === "accepted") return "ACCEPTED";
    return "PENDING";
  };

  // Get order status color
  const getOrderStatusColor = (status?: string) => {
    const s = (status || "pending").toLowerCase();
    if (s === "completed") return "#16A34A";
    if (s === "in-progress") return "#2563EB";
    if (s === "cancelled") return "#6B7280";
    if (s === "accepted") return "#7C3AED";
    if (s === "ready") return "#059669";
    return "#F59E0B";
  };

  // Get order status text
  const getOrderStatusText = (status?: string) => {
    const s = (status || "pending").toLowerCase();
    if (s === "completed") return "COMPLETED";
    if (s === "in-progress") return "IN PROGRESS";
    if (s === "cancelled") return "CANCELLED";
    if (s === "accepted") return "ACCEPTED";
    if (s === "ready") return "READY";
    return "PENDING";
  };

  // Open logs modal
  const openLogs = (roomNumber: number | null, type: "food" | "services" = "food") => {
    setLogsRoomNumber(roomNumber);
    setSelectedOrderId(null);
    setSelectedRequestId(null);
    setLogsType(type);
    setLogsOpen(true);
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedOrderId(null);
    setSelectedRequestId(null);
  };

  // Get selected order details
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return foodOrders.find((o) => o.id === selectedOrderId) ?? null;
  }, [foodOrders, selectedOrderId]);

  // Get selected request details
  const selectedRequest = useMemo(() => {
    if (!selectedRequestId) return null;
    return serviceRequests.find((r) => r.id === selectedRequestId) ?? null;
  }, [serviceRequests, selectedRequestId]);

  // Calculate total for filtered items
  const totalForFiltered = useMemo(() => {
    if (logsType === "food") {
      return filteredFoodOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);
    } else {
      return filteredServiceRequests.reduce((sum, r) => sum + (r.charges || 0), 0);
    }
  }, [filteredFoodOrders, filteredServiceRequests, logsType]);

  // Complete an order
  const completeOrder = async (orderId: string) => {
    if (!user) return;

    try {
      await updateDoc(doc(db, "foodOrders", orderId), {
        status: "completed",
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      Alert.alert("✅ Order Completed", "The food order has been marked as completed.");
    } catch (e: any) {
      console.error("Complete order error:", e);
      Alert.alert("❌ Error", "Failed to complete order: " + e.message);
    }
  };

  // Complete a service request
  const completeServiceRequest = async (requestId: string) => {
    if (!user) return;

    try {
      await updateDoc(doc(db, "serviceRequests", requestId), {
        status: "completed",
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      Alert.alert("✅ Service Completed", "The service request has been marked as completed.");
    } catch (e: any) {
      console.error("Complete service error:", e);
      Alert.alert("❌ Error", "Failed to complete service: " + e.message);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Ionicons name="bed" size={48} color="#2563EB" />
          <Text style={styles.loadingText}>Loading Rooms...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* LOGS MODAL */}
      <Modal
        visible={logsOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setLogsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalIcon}>
                  <Ionicons
                    name={logsType === "food" ? "restaurant-outline" : "construct-outline"}
                    size={18}
                    color="#2563EB"
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {logsType === "food" ? "Food Order Logs" : "Service Requests Logs"}
                  </Text>
                  <Text style={styles.modalSubtitle} numberOfLines={1}>
                    {logsRoomNumber == null
                      ? `${logsType === "food" ? "Orders" : "Requests"}: ${logsType === "food" ? filteredFoodOrders.length : filteredServiceRequests.length
                      } • Total: ${formatINR(totalForFiltered)}`
                      : `Room ${logsRoomNumber} • ${logsType === "food" ? "Orders" : "Requests"
                      }: ${logsType === "food" ? filteredFoodOrders.length : filteredServiceRequests.length
                      } • Total: ${formatINR(totalForFiltered)}`}
                  </Text>
                </View>
              </View>

              <View style={styles.modalHeaderRight}>
                {/* DELETE ALL BUTTON */}
                {logsType === "food" ? (
                  <Pressable
                    onPress={deleteAllFoodOrders}
                    disabled={deleting || filteredFoodOrders.length === 0}
                    style={({ pressed }) => [
                      styles.deleteAllBtn,
                      (deleting || filteredFoodOrders.length === 0) && styles.deleteAllBtnDisabled,
                      pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Ionicons name="trash-bin" size={16} color={deleting || filteredFoodOrders.length === 0 ? "#9CA3AF" : "#DC2626"} />
                    <Text style={[styles.deleteAllText, (deleting || filteredFoodOrders.length === 0) && styles.deleteAllTextDisabled]}>
                      {deleting ? "Deleting..." : "Delete All"}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={deleteAllServiceRequests}
                    disabled={deleting || filteredServiceRequests.length === 0}
                    style={({ pressed }) => [
                      styles.deleteAllBtn,
                      (deleting || filteredServiceRequests.length === 0) && styles.deleteAllBtnDisabled,
                      pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Ionicons name="trash-bin" size={16} color={deleting || filteredServiceRequests.length === 0 ? "#9CA3AF" : "#DC2626"} />
                    <Text style={[styles.deleteAllText, (deleting || filteredServiceRequests.length === 0) && styles.deleteAllTextDisabled]}>
                      {deleting ? "Deleting..." : "Delete All"}
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => setLogsOpen(false)}
                  style={({ pressed }) => [
                    styles.modalCloseBtn,
                    pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Ionicons name="close" size={18} color="#6B7280" />
                </Pressable>
              </View>
            </View>

            <View style={styles.modalFilterRow}>
              <Pressable
                onPress={() => {
                  setLogsRoomNumber(null);
                  clearSelection();
                }}
                style={({ pressed }) => [
                  styles.filterPill,
                  logsRoomNumber == null && styles.filterPillActive,
                  pressed && { opacity: 0.9 },
                ]}
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    logsRoomNumber == null && styles.filterPillTextActive,
                  ]}
                >
                  All Rooms
                </Text>
              </Pressable>

              <View style={styles.tabContainer}>
                <Pressable
                  onPress={() => setLogsType("food")}
                  style={({ pressed }) => [
                    styles.tabButton,
                    logsType === "food" && styles.tabButtonActive,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabButtonText,
                      logsType === "food" && styles.tabButtonTextActive,
                    ]}
                  >
                    Food Orders
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setLogsType("services")}
                  style={({ pressed }) => [
                    styles.tabButton,
                    logsType === "services" && styles.tabButtonActive,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabButtonText,
                      logsType === "services" && styles.tabButtonTextActive,
                    ]}
                  >
                    Services
                  </Text>
                </Pressable>
              </View>

              {(selectedOrderId || selectedRequestId) && (
                <Pressable
                  onPress={clearSelection}
                  style={({ pressed }) => [
                    styles.filterPill,
                    pressed && { opacity: 0.9 },
                  ]}
                  hitSlop={8}
                >
                  <Text style={styles.filterPillText}>Clear Selection</Text>
                </Pressable>
              )}
            </View>

            {/* Selected Order/Request Details */}
            {selectedOrder ? (
              <View style={styles.detailCard}>
                <View style={styles.detailTopRow}>
                  <View style={styles.detailRoomPill}>
                    <Text style={styles.detailRoomPillText}>
                      Room {selectedOrder.roomNumber ?? "-"}
                    </Text>
                  </View>

                  <View style={[styles.detailStatusPill, {
                    backgroundColor: `rgba(${getOrderStatusColor(selectedOrder.status)
                      .replace("#", "")
                      .match(/.{2}/g)
                      ?.map((x) => parseInt(x, 16))
                      .join(", ")}, 0.12)`,
                  }]}>
                    <Text style={[styles.detailStatusText, {
                      color: getOrderStatusColor(selectedOrder.status),
                    }]}>
                      {getOrderStatusText(selectedOrder.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailActionRow}>
                  <Text style={styles.detailTitle}>
                    Total: {formatINR(getOrderTotal(selectedOrder))}
                  </Text>
                  <Pressable
                    onPress={() => deleteFoodOrder(selectedOrder.id)}
                    style={({ pressed }) => [
                      styles.detailDeleteBtn,
                      pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Ionicons name="trash-bin" size={14} color="#DC2626" />
                    <Text style={styles.detailDeleteText}>Delete</Text>
                  </Pressable>
                </View>

                <Text style={styles.detailLine}>
                  Guest: {selectedOrder.guestName ?? "-"}
                  {selectedOrder.guestMobile ? ` • ${selectedOrder.guestMobile}` : ""}
                </Text>

                <Text style={styles.detailTime}>
                  Time: {formatOrderTime(selectedOrder.createdAt)}
                </Text>

                <Text style={styles.detailMeta}>
                  Source: {selectedOrder.source ?? "—"}
                </Text>

                {selectedOrder.estimatedTime && (
                  <Text style={styles.detailMeta}>
                    Est. Time: {selectedOrder.estimatedTime} minutes
                  </Text>
                )}

                {selectedOrder.acceptedAt && (
                  <Text style={styles.detailMeta}>
                    Accepted: {formatDateTime(selectedOrder.acceptedAt)}
                  </Text>
                )}

                <View style={{ marginTop: 10 }}>
                  {normalizeItems((selectedOrder as any).items).length ? (
                    normalizeItems((selectedOrder as any).items).map((it: any, idx: number) => {
                      const qty = toNum(it?.qty) || toNum(it?.quantity) || 1;
                      const price =
                        toNum(it?.price) ||
                        toNum(it?.unitPrice) ||
                        toNum(it?.rate) ||
                        0;
                      const line =
                        toNum(it?.lineTotal) || toNum(it?.total) || toNum(it?.amount) || qty * price;

                      return (
                        <View key={idx} style={styles.itemRow}>
                          <Text style={styles.itemLeft} numberOfLines={1}>
                            {qty} × {orderLineTitle(it)}
                          </Text>
                          <Text style={styles.itemRight}>{formatINR(line)}</Text>
                        </View>
                      );
                    })
                  ) : (selectedOrder as any).item ? (
                    <View style={styles.itemRow}>
                      <Text style={styles.itemLeft} numberOfLines={1}>
                        {toNum((selectedOrder as any).qty) ||
                          toNum((selectedOrder as any).quantity) ||
                          1}{" "}
                        × {(selectedOrder as any).item}
                      </Text>
                      <Text style={styles.itemRight}>
                        {formatINR(getOrderTotal(selectedOrder))}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.noItemsText}>
                      No item details found for this order.
                    </Text>
                  )}
                </View>

                {selectedOrder.status && !["completed", "cancelled"].includes(selectedOrder.status.toLowerCase()) && (
                  <Pressable
                    onPress={() => completeOrder(selectedOrder.id)}
                    style={({ pressed }) => [
                      styles.completeBtn,
                      pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.completeText}>Mark as Completed</Text>
                  </Pressable>
                )}
              </View>
            ) : selectedRequest ? (
              <View style={styles.detailCard}>
                <View style={styles.detailTopRow}>
                  <View style={styles.detailRoomPill}>
                    <Text style={styles.detailRoomPillText}>
                      Room {selectedRequest.roomNumber ?? "-"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.detailStatusPill,
                      {
                        backgroundColor: `rgba(${getServiceStatusColor(selectedRequest.status)
                          .replace("#", "")
                          .match(/.{2}/g)
                          ?.map((x) => parseInt(x, 16))
                          .join(", ")}, 0.12)`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.detailStatusText,
                        { color: getServiceStatusColor(selectedRequest.status) },
                      ]}
                    >
                      {getServiceStatusText(selectedRequest.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailActionRow}>
                  <Text style={styles.detailTitle}>
                    {selectedRequest.type || "Service Request"}
                    {selectedRequest.isFreeRequest && (
                      <Text
                        style={{
                          color: "#16A34A",
                          fontSize: 12,
                          fontWeight: "900",
                          marginLeft: 8,
                        }}
                      >
                        (FREE)
                      </Text>
                    )}
                  </Text>
                  <Pressable
                    onPress={() => deleteServiceRequest(selectedRequest.id)}
                    style={({ pressed }) => [
                      styles.detailDeleteBtn,
                      pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Ionicons name="trash-bin" size={14} color="#DC2626" />
                    <Text style={styles.detailDeleteText}>Delete</Text>
                  </Pressable>
                </View>

                <Text style={styles.detailLine}>
                  Guest: {selectedRequest.guestName ?? "-"}
                  {selectedRequest.guestMobile ? ` • ${selectedRequest.guestMobile}` : ""}
                </Text>

                <Text style={styles.detailTime}>
                  Time: {formatOrderTime(selectedRequest.createdAt)}
                </Text>

                <View style={styles.chargeRow}>
                  <Text style={styles.chargeLabel}>Charges:</Text>
                  <Text style={styles.chargeAmount}>
                    {formatINR(selectedRequest.charges || 0)}
                    {selectedRequest.currency && ` ${selectedRequest.currency}`}
                  </Text>
                </View>

                {selectedRequest.requestNumber && (
                  <Text style={styles.detailMeta}>
                    Request #{selectedRequest.requestNumber}
                  </Text>
                )}

                {selectedRequest.estimatedTime && (
                  <Text style={styles.detailMeta}>
                    Estimated Time: {selectedRequest.estimatedTime} minutes
                  </Text>
                )}

                {selectedRequest.acceptedAt && (
                  <Text style={styles.detailMeta}>
                    Accepted: {formatDateTime(selectedRequest.acceptedAt)}
                  </Text>
                )}

                {selectedRequest.dishName && (
                  <Text style={styles.detailMeta}>
                    Dish: {selectedRequest.dishName}
                  </Text>
                )}

                {selectedRequest.notes && (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesLabel}>Notes:</Text>
                    <Text style={styles.notesText}>{selectedRequest.notes}</Text>
                  </View>
                )}

                {selectedRequest.status && !["completed", "cancelled"].includes(selectedRequest.status.toLowerCase()) && (
                  <Pressable
                    onPress={() => completeServiceRequest(selectedRequest.id)}
                    style={({ pressed }) => [
                      styles.completeBtn,
                      pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.completeText}>Mark as Completed</Text>
                  </Pressable>
                )}
              </View>
            ) : null}

            {/* List of Orders/Requests */}
            <ScrollView
              style={styles.modalList}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {logsType === "food" ? (
                filteredFoodOrders.length === 0 ? (
                  <View style={styles.modalEmpty}>
                    <Ionicons name="fast-food-outline" size={24} color="#9CA3AF" />
                    <Text style={styles.modalEmptyText}>
                      No food orders
                      {logsRoomNumber != null ? ` for Room ${logsRoomNumber}` : ""}
                    </Text>
                  </View>
                ) : (
                  filteredFoodOrders.map((o) => (
                    <Pressable
                      key={o.id}
                      onPress={() => {
                        setSelectedOrderId(o.id);
                        setSelectedRequestId(null);
                      }}
                      style={({ pressed }) => [
                        styles.requestRow,
                        selectedOrderId === o.id && styles.requestRowActive,
                        pressed && { opacity: 0.95, transform: [{ scale: 0.995 }] },
                      ]}
                    >
                      <View style={styles.requestLeft}>
                        <View style={styles.requestRoomPill}>
                          <Text style={styles.requestRoomPillText}>
                            Room {o.roomNumber ?? "-"}
                          </Text>
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.requestTopRow}>
                            <Text style={styles.requestTitle} numberOfLines={1}>
                              {getOrderSummaryText(o)}
                            </Text>
                            <Text
                              style={[
                                styles.requestStatus,
                                { color: getOrderStatusColor(o.status) },
                              ]}
                            >
                              {getOrderStatusText(o.status)}
                            </Text>
                          </View>
                          <Text style={styles.requestSub} numberOfLines={1}>
                            Total: {formatINR(getOrderTotal(o))}
                          </Text>
                          <Text style={styles.requestTime} numberOfLines={1}>
                            {formatOrderTime(o.createdAt)}
                            {o.estimatedTime ? ` • ${o.estimatedTime} min` : ""}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.requestRightActions}>
                        <Pressable
                          onPress={() => deleteFoodOrder(o.id)}
                          style={({ pressed }) => [
                            styles.requestDeleteBtn,
                            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                          ]}
                        >
                          <Ionicons name="trash-bin" size={16} color="#DC2626" />
                        </Pressable>
                        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                      </View>
                    </Pressable>
                  ))
                )
              ) : (
                filteredServiceRequests.length === 0 ? (
                  <View style={styles.modalEmpty}>
                    <Ionicons name="construct-outline" size={24} color="#9CA3AF" />
                    <Text style={styles.modalEmptyText}>
                      No service requests
                      {logsRoomNumber != null ? ` for Room ${logsRoomNumber}` : ""}
                    </Text>
                  </View>
                ) : (
                  filteredServiceRequests.map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => {
                        setSelectedRequestId(r.id);
                        setSelectedOrderId(null);
                      }}
                      style={({ pressed }) => [
                        styles.requestRow,
                        selectedRequestId === r.id && styles.requestRowActive,
                        pressed && { opacity: 0.95, transform: [{ scale: 0.995 }] },
                      ]}
                    >
                      <View style={styles.requestLeft}>
                        <View style={styles.requestRoomPill}>
                          <Text style={styles.requestRoomPillText}>
                            Room {r.roomNumber ?? "-"}
                          </Text>
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.requestTopRow}>
                            <Text style={styles.requestTitle} numberOfLines={1}>
                              {r.type || "Service Request"}
                              {r.isFreeRequest && (
                                <Text
                                  style={{
                                    color: "#16A34A",
                                    fontSize: 10,
                                    fontWeight: "900",
                                    marginLeft: 4,
                                  }}
                                >
                                  (FREE)
                                </Text>
                              )}
                            </Text>
                            <Text
                              style={[
                                styles.requestStatus,
                                { color: getServiceStatusColor(r.status) },
                              ]}
                            >
                              {getServiceStatusText(r.status)}
                            </Text>
                          </View>
                          <Text style={styles.requestSub} numberOfLines={1}>
                            Charges: {formatINR(r.charges || 0)} • {r.guestName || "Guest"}
                          </Text>
                          <Text style={styles.requestTime} numberOfLines={1}>
                            {formatOrderTime(r.createdAt)}
                            {r.estimatedTime ? ` • ${r.estimatedTime} min` : ""}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.requestRightActions}>
                        <Pressable
                          onPress={() => deleteServiceRequest(r.id)}
                          style={({ pressed }) => [
                            styles.requestDeleteBtn,
                            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                          ]}
                        >
                          <Ionicons name="trash-bin" size={16} color="#DC2626" />
                        </Pressable>
                        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                      </View>
                    </Pressable>
                  ))
                )
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* EDIT ROOM MODAL */}
      <Modal
        visible={editModalOpen}
        animationType="slide"
        transparent
        onRequestClose={closeEditModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={[styles.modalIcon, { backgroundColor: "rgba(22, 163, 74, 0.1)" }]}>
                  <Ionicons name="log-in-outline" size={18} color="#16A34A" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Initialize Room {editingRoom?.roomNumber}</Text>
                  <Text style={styles.modalSubtitle}>Enter guest details to check-in</Text>
                </View>
              </View>
              <Pressable
                onPress={closeEditModal}
                style={({ pressed }) => [
                  styles.modalCloseBtn,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Guest Name</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
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
                  <Ionicons name="call-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                  <TextInput
                    placeholder="10-digit mobile number"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={10}
                    style={styles.input}
                    value={guestMobile}
                    onChangeText={(text) => {
                      if (/^\d*$/.test(text)) setGuestMobile(text);
                    }}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.label}>Checkout Date & Time</Text>
                  {Platform.OS === "web" && (
                    <Pressable
                      onPress={() => {
                        const nextDay = new Date();
                        nextDay.setDate(nextDay.getDate() + 1);
                        nextDay.setHours(11, 0, 0, 0);
                        setCheckoutDate(nextDay);
                      }}
                      style={{ backgroundColor: "rgba(37,99,235,0.08)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#2563EB" }}>Set Tomorrow 11AM</Text>
                    </Pressable>
                  )}
                </View>
                {Platform.OS === "web" ? (
                  <View style={[styles.inputWrapper, { cursor: "pointer" } as any]}>
                    <Ionicons name="calendar-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                    <TextInput
                      style={[styles.input, { outlineStyle: "none" } as any]}
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
                  </View>
                ) : (
                  <>
                    <Pressable
                      style={styles.inputWrapper}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                      <Text style={[styles.input, { paddingTop: 14 }]}>
                        {checkoutDate ? checkoutDate.toLocaleString() : "Select Date & Time"}
                      </Text>
                    </Pressable>
                    {showDatePicker && (
                      <DateTimePicker
                        value={checkoutDate ?? new Date()}
                        mode="datetime"
                        minimumDate={new Date()}
                        onChange={(_, date) => {
                          setShowDatePicker(false);
                          if (date) setCheckoutDate(date);
                        }}
                      />
                    )}
                  </>
                )}
              </View>

              <Pressable
                onPress={saveRoomDetails}
                disabled={initializing}
                style={({ pressed }) => [
                  styles.saveBtn,
                  initializing && styles.saveBtnDisabled,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                {initializing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.saveBtnText}>Initialize Room</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.backgroundDecor}>
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />
          <View style={styles.bgCircle3} />
        </View>

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting} numberOfLines={1}>
              Hotel Rooms
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              Room Management
            </Text>
          </View>

          <View style={styles.headerRight}>
            <View style={styles.roleBadge}>
              <Ionicons name="business-outline" size={14} color="#2563EB" />
              <Text style={styles.role}>ROOMS</Text>
            </View>
          </View>
        </View>

        {/* SEARCH BAR */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            placeholder="Search rooms (e.g. 102)"
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            keyboardType="number-pad"
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </Pressable>
          ) : null}
        </View>

        {/* OCCUPIED ROOMS */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLeft}>
            <View style={[styles.sectionIcon, { backgroundColor: "#DC2626" }]}>
              <Ionicons name="bed" size={18} color="#fff" />
            </View>
            <Text style={styles.sectionTitle}>Occupied Rooms</Text>
          </View>

          <View style={styles.sectionRight}>
            <View style={styles.sectionCount}>
              <Text style={styles.sectionCountText}>{filteredOccupiedRooms.length}</Text>
            </View>

            <View style={styles.logsButtonsContainer}>
              <Pressable
                onPress={() => openLogs(null, "food")}
                style={({ pressed }) => [
                  styles.logsIconBtn,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
                hitSlop={10}
              >
                <Ionicons name="restaurant-outline" size={18} color="#2563EB" />
                {foodOrders.length > 0 ? (
                  <View style={styles.logsIconBadge}>
                    <Text style={styles.logsIconBadgeText}>{foodOrders.length}</Text>
                  </View>
                ) : null}
              </Pressable>

              <Pressable
                onPress={() => openLogs(null, "services")}
                style={({ pressed }) => [
                  styles.logsIconBtn,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
                hitSlop={10}
              >
                <Ionicons name="construct-outline" size={18} color="#F59E0B" />
                {serviceRequests.length > 0 ? (
                  <View style={[styles.logsIconBadge, { backgroundColor: "#F59E0B" }]}>
                    <Text style={styles.logsIconBadgeText}>{serviceRequests.length}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>
        </View>

        {filteredOccupiedRooms.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="bed-outline" size={24} color="#9CA3AF" />
            <Text style={styles.emptyText}>No occupied rooms found</Text>
          </View>
        )}

        {filteredOccupiedRooms.map((room) => {
          const roomFoodCount = foodCountForRoom(room.roomNumber, room.guestId, room.assignedAt);
          const roomFoodTotal = totalForRoom(room.roomNumber, room.guestId, room.assignedAt);
          const roomServiceCount = serviceCountForRoom(room.roomNumber, room.assignedAt);
          const roomServiceTotal = serviceChargesForRoom(room.roomNumber, room.assignedAt);
          const roomTotalCharges = totalChargesForRoom(room.roomNumber, room.guestId, room.assignedAt);

          return (
            <View key={room.id} style={styles.occupiedCard}>
              <View style={styles.cardHeader}>
                <View style={styles.roomHeaderLeft}>
                  <Ionicons name="bed" size={18} color="#DC2626" />
                  <Text style={styles.roomNumber} numberOfLines={1}>
                    Room {room.roomNumber}
                  </Text>

                  <View style={styles.roomLogsButtons}>
                    <Pressable
                      onPress={() => openLogs(room.roomNumber, "food")}
                      style={({ pressed }) => [
                        styles.roomLogsInlineBtn,
                        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                      ]}
                      hitSlop={10}
                    >
                      <Ionicons name="restaurant-outline" size={16} color="#2563EB" />
                      {roomFoodCount > 0 ? (
                        <View style={styles.roomLogsBadge}>
                          <Text style={styles.roomLogsBadgeText}>{roomFoodCount}</Text>
                        </View>
                      ) : null}
                    </Pressable>

                    <Pressable
                      onPress={() => openLogs(room.roomNumber, "services")}
                      style={({ pressed }) => [
                        styles.roomLogsInlineBtn,
                        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                      ]}
                      hitSlop={10}
                    >
                      <Ionicons name="construct-outline" size={16} color="#F59E0B" />
                      {roomServiceCount > 0 ? (
                        <View style={[styles.roomLogsBadge, { backgroundColor: "#F59E0B" }]}>
                          <Text style={styles.roomLogsBadgeText}>{roomServiceCount}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  </View>
                </View>

                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>OCCUPIED</Text>
                </View>
              </View>

              <View style={styles.guestInfo}>
                <View style={styles.infoRow}>
                  <Ionicons name="person" size={14} color="#6B7280" />
                  <Text style={styles.infoText}>{room.guestName || "No guest name"}</Text>
                </View>

                {room.guestMobile && (
                  <View style={styles.infoRow}>
                    <Ionicons name="call" size={14} color="#6B7280" />
                    <Text style={styles.infoText}>{room.guestMobile}</Text>
                  </View>
                )}

                <View style={styles.infoRow}>
                  <Ionicons name="restaurant-outline" size={14} color="#6B7280" />
                  <Text style={styles.infoText}>
                    Meal Plan: {prettyMealText(room.mealPlan)}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="cash-outline" size={14} color="#6B7280" />
                  <Text style={styles.infoText}>
                    Food Orders: {roomFoodCount} (₹{roomFoodTotal.toFixed(2)})
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="construct-outline" size={14} color="#6B7280" />
                  <Text style={styles.infoText}>
                    Services: {roomServiceCount} (₹{roomServiceTotal.toFixed(2)})
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="card-outline" size={14} color="#2563EB" />
                  <Text style={[styles.infoText, { fontWeight: "900", color: "#2563EB" }]}>
                    Total Charges: ₹{roomTotalCharges.toFixed(2)}
                  </Text>
                </View>

                {room.checkoutAt && (
                  <View style={styles.infoRow}>
                    <Ionicons name="timer" size={14} color="#2563EB" />
                    <Text style={[styles.infoText, { color: "#2563EB", fontWeight: "700" }]}>
                      Checkout: {getRemainingTime(room.checkoutAt)}
                    </Text>
                  </View>
                )}

                {room.assignedAt && (
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={14} color="#6B7280" />
                    <Text style={styles.infoText}>
                      Checked-in: {formatDateTime(room.assignedAt)}
                    </Text>
                  </View>
                )}

                {(roomFoodCount > 0 || roomServiceCount > 0) && (
                  <View style={styles.pendingStrip}>
                    <Ionicons name="receipt-outline" size={16} color="#2563EB" />
                    <Text style={styles.pendingStripText}>
                      Food: {roomFoodCount} orders • Services: {roomServiceCount} requests
                    </Text>
                  </View>
                )}
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.checkoutBtn,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
                onPress={() => checkoutRoom(room.id, room.roomNumber)}
              >
                <Ionicons name="log-out" size={16} color="#fff" />
                <Text style={styles.checkoutText}>
                  Checkout & Delete All Orders (₹{roomTotalCharges.toFixed(2)})
                </Text>
              </Pressable>
            </View>
          );
        })}

        {/* AVAILABLE ROOMS */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLeft}>
            <View style={[styles.sectionIcon, { backgroundColor: "#16A34A" }]}>
              <Ionicons name="bed-outline" size={18} color="#fff" />
            </View>
            <Text style={styles.sectionTitle}>Available Rooms</Text>
          </View>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{filteredAvailableRooms.length}</Text>
          </View>
        </View>

        {availableRooms.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="bed-outline" size={24} color="#9CA3AF" />
            <Text style={styles.emptyText}>No available rooms</Text>
          </View>
        )}

        {filteredAvailableRooms.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="bed-outline" size={24} color="#9CA3AF" />
            <Text style={styles.emptyText}>No available rooms found</Text>
          </View>
        )}

        <View style={styles.availableRoomsGrid}>
          {filteredAvailableRooms.map((room) => (
            <Pressable
              key={room.id}
              style={({ pressed }) => [
                styles.availableCard,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => openEditModal(room)}
            >
              <View style={styles.availableIcon}>
                <Ionicons name="bed-outline" size={18} color="#16A34A" />
              </View>
              <Text style={styles.availableRoomNumber}>Room {room.roomNumber}</Text>
              <View style={styles.availableBadge}>
                <Text style={styles.availableStatusText}>AVAILABLE</Text>
              </View>

            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView >
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16 },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },

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

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 12,
  },
  headerLeft: { flex: 1, minWidth: 0 },
  headerRight: { flexShrink: 0 },
  greeting: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#111827" },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  role: {
    fontSize: 11,
    color: "#2563EB",
    fontWeight: "700",
    letterSpacing: 1.2,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 12,
    gap: 10,
  },
  sectionLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  sectionCount: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionCountText: { color: "#2563EB", fontWeight: "800" },

  logsButtonsContainer: { flexDirection: "row", gap: 8 },
  logsIconBtn: {
    width: 40,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  logsIconBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: "#F9FAFB",
  },
  logsIconBadgeText: { color: "#FFFFFF", fontWeight: "900", fontSize: 10 },

  emptyState: {
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyText: { color: "#9CA3AF", marginTop: 6, fontWeight: "600" },

  occupiedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
    marginBottom: 12,
    gap: 12,
  },
  roomHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  roomNumber: { fontSize: 16, fontWeight: "700", color: "#111827", flexShrink: 1 },

  roomLogsButtons: { flexDirection: "row", gap: 6, marginLeft: 4 },
  roomLogsInlineBtn: {
    width: 34,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  roomLogsBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  roomLogsBadgeText: { color: "#FFFFFF", fontWeight: "900", fontSize: 9 },

  statusBadge: {
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    flexShrink: 0,
  },
  statusText: {
    color: "#DC2626",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },

  guestInfo: { marginBottom: 12 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    minHeight: 20,
  },
  infoText: {
    fontSize: 14,
    color: "#374151",
    marginLeft: 8,
    flexShrink: 1,
  },

  pendingStrip: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.18)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  pendingStripText: {
    color: "#2563EB",
    fontWeight: "800",
    fontSize: 12,
    flexShrink: 1,
  },

  checkoutBtn: {
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  checkoutText: { color: "#FFFFFF", fontWeight: "700" },

  availableRoomsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  availableCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  availableIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  availableRoomNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  availableBadge: {
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  availableStatusText: {
    color: "#16A34A",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },

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
    maxWidth: Platform.OS === "web" ? 500 : undefined,
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
  modalHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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

  deleteAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.2)",
  },
  deleteAllBtnDisabled: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  deleteAllText: {
    color: "#DC2626",
    fontWeight: "700",
    fontSize: 12,
  },
  deleteAllTextDisabled: {
    color: "#9CA3AF",
  },

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

  modalFilterRow: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  filterPillActive: {
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    borderColor: "rgba(37, 99, 235, 0.22)",
  },
  filterPillText: { fontSize: 12, fontWeight: "800", color: "#6B7280" },
  filterPillTextActive: { color: "#2563EB" },

  tabContainer: { flexDirection: "row", gap: 8, marginLeft: "auto", marginRight: 10 },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tabButtonActive: {
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    borderColor: "rgba(37, 99, 235, 0.22)",
  },
  tabButtonText: { fontSize: 12, fontWeight: "800", color: "#6B7280" },
  tabButtonTextActive: { color: "#2563EB" },

  detailCard: {
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.18)",
    backgroundColor: "rgba(37, 99, 235, 0.06)",
  },
  detailTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  detailRoomPill: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  detailRoomPillText: { fontWeight: "900", color: "#111827", fontSize: 12 },
  detailStatusPill: {
    backgroundColor: "rgba(107, 114, 128, 0.12)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  detailStatusText: { fontWeight: "900", color: "#6B7280", fontSize: 12 },
  detailTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  detailDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    borderRadius: 8,
  },
  detailDeleteText: {
    color: "#DC2626",
    fontWeight: "700",
    fontSize: 12,
  },
  detailLine: { marginTop: 6, fontSize: 13, color: "#374151", fontWeight: "700" },
  detailTime: { marginTop: 8, fontSize: 12, color: "#2563EB", fontWeight: "900" },
  detailMeta: { marginTop: 4, fontSize: 12, color: "#6B7280", fontWeight: "700" },

  chargeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  chargeLabel: { fontSize: 14, fontWeight: "800", color: "#111827" },
  chargeAmount: { fontSize: 16, fontWeight: "900", color: "#2563EB" },

  notesBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  notesLabel: { fontSize: 12, fontWeight: "900", color: "#F59E0B", marginBottom: 4 },
  notesText: { fontSize: 13, color: "#6B7280", fontWeight: "700" },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 6,
  },
  itemLeft: { flex: 1, color: "#111827", fontWeight: "800", fontSize: 12 },
  itemRight: { color: "#2563EB", fontWeight: "900", fontSize: 12 },
  noItemsText: { marginTop: 6, color: "#6B7280", fontWeight: "700", fontSize: 12 },

  completeBtn: {
    marginTop: 12,
    backgroundColor: "#16A34A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  completeText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },

  modalList: { paddingHorizontal: 14, paddingTop: 6 },
  modalEmpty: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  modalEmptyText: { marginTop: 8, color: "#9CA3AF", fontWeight: "700" },

  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
  },
  requestRowActive: {
    borderColor: "rgba(37, 99, 235, 0.35)",
    backgroundColor: "rgba(37, 99, 235, 0.04)",
  },
  requestLeft: { flexDirection: "row", gap: 10, alignItems: "center", flex: 1 },
  requestRoomPill: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  requestRoomPillText: { color: "#111827", fontWeight: "900", fontSize: 12 },
  requestTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  requestTitle: { color: "#111827", fontWeight: "900", fontSize: 13 },
  requestStatus: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  requestSub: { color: "#6B7280", fontSize: 12, marginTop: 3, fontWeight: "700" },
  requestTime: { color: "#2563EB", fontSize: 11, marginTop: 4, fontWeight: "900" },
  requestRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  requestDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  // SEARCH BAR STYLES
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    padding: 0,
  },

  // EDIT MODAL STYLES
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
  input: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    paddingHorizontal: 12,
    height: "100%",
  },
  saveBtn: {
    backgroundColor: "#16A34A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 8,
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});