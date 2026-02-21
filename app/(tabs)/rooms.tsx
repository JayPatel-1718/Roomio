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
  addDoc,
} from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { getAuth } from "firebase/auth";
import { useRouter } from "expo-router";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

type Meal = "breakfast" | "lunch" | "dinner";
type Room = {
  id: string;
  roomNumber: number;
  floorNumber?: number;
  status: "occupied" | "available";
  guestName?: string;
  guestMobile?: string;
  checkoutAt?: Timestamp;
  guestId?: string;
  mealPlan?: Meal[];
  assignedAt?: Timestamp;
  roomRate?: number; // Custom room rate per night
};
type FoodOrder = {
  id: string;
  roomNumber?: number | string;
  guestName?: string;
  guestMobile?: string;
  guestId?: string;
  items?:
  | Array<{
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
  }>
  | Record<string, any>;
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
type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  variant: "destructive" | "primary";
  onConfirm?: () => void | Promise<void>;
};
type BillData = {
  roomNumber: number;
  guestName: string;
  guestMobile: string;
  checkIn: Date | null;
  checkOut: Date | null;
  nights: number;
  roomRate: number;
  roomTotal: number;
  foodOrders: Array<{ name: string; amount: number; qty?: number }>;
  foodTotal: number;
  serviceRequests: Array<{ name: string; amount: number }>;
  serviceTotal: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  generatedAt: Date;
  invoiceNumber?: string;
};

// Floor helpers
const padRoom = (n: number) => (n < 100 ? String(n).padStart(3, "0") : String(n));
const getFloorFromRoom = (r: Room) => {
  if (typeof r.floorNumber === "number") return r.floorNumber;
  return r.roomNumber >= 100 ? Math.floor(r.roomNumber / 100) : 0;
};
const floorLabel = (floor: number) => (floor === 0 ? "Ground Floor" : `Floor ${floor}`);

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
  // Floor expand state
  const [openFloors, setOpenFloors] = useState<Record<number, boolean>>({});
  // ✅ Add check-in + check-out pickers
  const [editCheckinDate, setEditCheckinDate] = useState<Date | null>(new Date());
  const [checkoutDate, setCheckoutDate] = useState<Date | null>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0);
    return tomorrow;
  });
  // ✅ Room rate input
  const [roomRate, setRoomRate] = useState<string>("1500");
  // iOS picker modals inside Edit Room modal
  const [showEditCheckinPicker, setShowEditCheckinPicker] = useState(false);
  const [showEditCheckoutPicker, setShowEditCheckoutPicker] = useState(false);
  const [iosTempEditCheckin, setIosTempEditCheckin] = useState<Date>(new Date());
  const [iosTempEditCheckout, setIosTempEditCheckout] = useState<Date>(new Date());
  const [initializing, setInitializing] = useState(false);
  // ✅ Web confirm modal
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    variant: "primary",
  });
  const [confirmBusy, setConfirmBusy] = useState(false);
  // ✅ BILL GENERATION STATE
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [generatingBill, setGeneratingBill] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [pendingCheckoutRoom, setPendingCheckoutRoom] = useState<{ id: string; roomNumber: number } | null>(null);
  // ✅ Room rate input in bill modal
  const [billRoomRate, setBillRoomRate] = useState<string>("1500");

  const occupiedRoomsRef = useRef<Room[]>([]);
  useEffect(() => {
    occupiedRoomsRef.current = occupiedRooms;
  }, [occupiedRooms]);

  // ---------- Date helpers ----------
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
    if (!date) return "Select date & time";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  // ✅ Android: show Date picker then Time picker
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
    color: "#111827",
    fontWeight: 600,
    cursor: "pointer",
  };
  // Improve web datetime indicator
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const style = document.createElement("style");
    style.textContent = `
input[type="datetime-local"] {
color-scheme: light;
accent-color: #2563EB;
}
input[type="datetime-local"]::-webkit-calendar-picker-indicator {
cursor: pointer;
opacity: 0.8;
}
input[type="datetime-local"]::-webkit-calendar-picker-indicator:hover {
opacity: 1;
}
`;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  // ✅ Web-safe confirm
  const askConfirm = (cfg: Omit<ConfirmState, "open">) => {
    if (Platform.OS !== "web") {
      Alert.alert(cfg.title, cfg.message, [
        { text: "Cancel", style: "cancel" },
        {
          text: cfg.confirmText,
          style: cfg.variant === "destructive" ? "destructive" : "default",
          onPress: cfg.onConfirm,
        },
      ]);
      return;
    }
    setConfirm({ open: true, ...cfg });
  };
  const closeConfirm = () => {
    setConfirm((c) => ({ ...c, open: false }));
    setConfirmBusy(false);
  };

  useEffect(() => {
    if (!user) {
      Alert.alert("Please login first", "You need to be logged in to view rooms");
      router.replace("/admin-login");
      return;
    }
    const uid = user.uid;
    setLoading(true);
    // 1️⃣ Rooms listener
    const roomsRef = collection(db, "users", uid, "rooms");
    const unsubRooms = onSnapshot(
      roomsRef,
      (snap) => {
        const occupied: Room[] = [];
        const available: Room[] = [];
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const room: Room = { id: docSnap.id, ...(data as any) };
          if (room.status === "occupied") occupied.push(room);
          else available.push(room);
        });
        occupied.sort((a, b) => a.roomNumber - b.roomNumber);
        available.sort((a, b) => a.roomNumber - b.roomNumber);
        setOccupiedRooms(occupied);
        setAvailableRooms(available);
        occupiedRoomsRef.current = occupied;
        // Auto open first floor
        const allRooms = [...occupied, ...available];
        const floors = Array.from(new Set(allRooms.map((r) => getFloorFromRoom(r)))).sort((a, b) => a - b);
        if (floors.length && Object.keys(openFloors).length === 0) {
          setOpenFloors({ [floors[0]]: true });
        }
      },
      (err) => {
        console.error("Rooms listener error:", err);
        Alert.alert("Error", "Failed to load rooms: " + err.message);
      }
    );
    // 2️⃣ Food Orders listener
    const foodOrdersRef = collection(db, "foodOrders");
    const foodOrdersQuery = query(foodOrdersRef, where("adminId", "==", uid));
    const unsubFoodOrders = onSnapshot(
      foodOrdersQuery,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as FoodOrder[];
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
          `Cannot read food orders: ${err.message}
Check permissions for /foodOrders.`
        );
      }
    );
    // 3️⃣ Service Requests listener
    const serviceRequestsRef = collection(db, "serviceRequests");
    const serviceRequestsQuery = query(serviceRequestsRef, where("adminId", "==", uid));
    const unsubServiceRequests = onSnapshot(
      serviceRequestsQuery,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ServiceRequest[];
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
          `Cannot read service requests: ${err.message}
Check permissions for /serviceRequests.`
        );
        setLoading(false);
      }
    );
    return () => {
      unsubRooms();
      unsubFoodOrders();
      unsubServiceRequests();
    };
  }, [user, router]);

  // Clear selection when order/request removed
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

  // Get food orders for a specific room - ONLY for CURRENT guest assignment window
  const getCurrentGuestFoodOrders = (
    roomNumber: number,
    _currentGuestId?: string,
    roomAssignedAt?: Timestamp
  ) => {
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
  const foodCountForRoom = (roomNumber: number, guestId?: string, roomAssignedAt?: Timestamp) =>
    getCurrentGuestFoodOrders(roomNumber, guestId, roomAssignedAt).length;
  const serviceCountForRoom = (roomNumber: number, roomAssignedAt?: Timestamp) =>
    getServiceRequestsForRoom(roomNumber, roomAssignedAt).length;
  const serviceChargesForRoom = (roomNumber: number, roomAssignedAt?: Timestamp) => {
    const requests = getServiceRequestsForRoom(roomNumber, roomAssignedAt);
    return requests.reduce((sum, r) => sum + (r.charges || 0), 0);
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

  // Get order items with quantities
  const getOrderItems = (o: FoodOrder): Array<{ name: string; qty: number; amount: number }> => {
    const items: Array<{ name: string; qty: number; amount: number }> = [];
    const normalizedItems = normalizeItems((o as any).items);

    if (normalizedItems.length) {
      normalizedItems.forEach((it) => {
        const qty = toNum(it?.qty) || toNum(it?.quantity) || 1;
        const price = toNum(it?.price) || toNum(it?.unitPrice) || toNum(it?.rate) || 0;
        const line = toNum(it?.lineTotal) || toNum(it?.total) || toNum(it?.amount) || qty * price;
        items.push({
          name: orderLineTitle(it),
          qty,
          amount: line,
        });
      });
    } else if ((o as any).item) {
      const qty = toNum((o as any).qty) || toNum((o as any).quantity) || 1;
      items.push({
        name: (o as any).item,
        qty,
        amount: getOrderTotal(o),
      });
    }
    return items;
  };

  const totalForRoom = (roomNumber: number, guestId?: string, roomAssignedAt?: Timestamp) => {
    const orders = getCurrentGuestFoodOrders(roomNumber, guestId, roomAssignedAt);
    return orders.reduce((sum, o) => sum + getOrderTotal(o), 0);
  };

  const totalChargesForRoom = (roomNumber: number, guestId?: string, roomAssignedAt?: Timestamp, customRoomRate?: number) => {
    const foodTotal = totalForRoom(roomNumber, guestId, roomAssignedAt);
    const serviceTotal = serviceChargesForRoom(roomNumber, roomAssignedAt);

    // Calculate room total if room exists
    const room = occupiedRooms.find(r => r.roomNumber === roomNumber);
    let roomTotal = 0;
    if (room && room.assignedAt && room.checkoutAt) {
      const checkIn = room.assignedAt.toDate();
      const checkOut = room.checkoutAt.toDate();
      const diffMs = checkOut.getTime() - checkIn.getTime();
      const nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      const rate = customRoomRate || room.roomRate || 1500;
      roomTotal = rate * nights;
    }

    return foodTotal + serviceTotal + roomTotal;
  };

  // ✅ GENERATE BILL DATA
  const generateBillData = (room: Room, customRate?: number): BillData => {
    const guestId = room.guestId || null;
    const roomAssignedAt = room.assignedAt;
    const foodOrdersList = getCurrentGuestFoodOrders(room.roomNumber, guestId, roomAssignedAt);
    const serviceRequestsList = getServiceRequestsForRoom(room.roomNumber, roomAssignedAt);

    // Get detailed food orders with items
    const foodOrderItems: Array<{ name: string; amount: number; qty?: number }> = [];
    foodOrdersList.forEach((order) => {
      const items = getOrderItems(order);
      items.forEach((item) => {
        foodOrderItems.push({
          name: item.name,
          amount: item.amount,
          qty: item.qty,
        });
      });
    });

    const foodTotal = foodOrdersList.reduce((sum, o) => sum + getOrderTotal(o), 0);
    const serviceTotal = serviceRequestsList.reduce((sum, r) => sum + (r.charges || 0), 0);

    // Calculate nights
    let nights = 1;
    if (room.assignedAt && room.checkoutAt) {
      const checkIn = room.assignedAt.toDate();
      const checkOut = room.checkoutAt.toDate();
      const diffMs = checkOut.getTime() - checkIn.getTime();
      nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Use custom rate if provided, otherwise room rate or default
    const rate = customRate || room.roomRate || 1500;
    const roomTotal = rate * nights;

    const subtotal = roomTotal + foodTotal + serviceTotal;
    const taxRate = 0.18; // 18% GST
    const taxAmount = subtotal * taxRate;
    const grandTotal = subtotal + taxAmount;

    // Generate invoice number
    const invoiceNumber = `INV-${room.roomNumber}-${new Date().getFullYear()}${pad2(new Date().getMonth() + 1)}${pad2(new Date().getDate())}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    return {
      roomNumber: room.roomNumber,
      guestName: room.guestName || "Unknown",
      guestMobile: room.guestMobile || "-",
      checkIn: room.assignedAt?.toDate() || null,
      checkOut: room.checkoutAt?.toDate() || null,
      nights,
      roomRate: rate,
      roomTotal,
      foodOrders: foodOrderItems,
      foodTotal,
      serviceRequests: serviceRequestsList.map((r) => ({
        name: r.type || "Service Request",
        amount: r.charges || 0,
      })),
      serviceTotal,
      subtotal,
      taxRate,
      taxAmount,
      grandTotal,
      generatedAt: new Date(),
      invoiceNumber,
    };
  };

  // ✅ OPEN BILL PREVIEW
  const openBillPreview = (roomId: string, roomNumber: number) => {
    const room = occupiedRooms.find((r) => r.id === roomId);
    if (!room) return;
    setGeneratingBill(true);
    // Set initial room rate from room data or default
    setBillRoomRate(room.roomRate?.toString() || "1500");
    const bill = generateBillData(room, room.roomRate || 1500);
    setBillData(bill);
    setPendingCheckoutRoom({ id: roomId, roomNumber });
    setBillModalOpen(true);
    setGeneratingBill(false);
  };

  // ✅ UPDATE BILL WITH NEW ROOM RATE
  const updateBillWithRate = (rateStr: string) => {
    setBillRoomRate(rateStr);
    const rate = parseFloat(rateStr);
    if (!isNaN(rate) && rate > 0 && pendingCheckoutRoom) {
      const room = occupiedRooms.find((r) => r.id === pendingCheckoutRoom.id);
      if (room) {
        const updatedBill = generateBillData(room, rate);
        setBillData(updatedBill);
      }
    }
  };

  // ✅ CLOSE BILL MODAL
  const closeBillModal = () => {
    setBillModalOpen(false);
    setBillData(null);
    setPendingCheckoutRoom(null);
    setBillRoomRate("1500");
  };

  // ✅ GENERATE PDF INVOICE
  const generatePDFInvoice = async () => {
    if (!billData) return;

    setGeneratingPDF(true);
    try {
      // Create HTML template for invoice
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invoice ${billData.invoiceNumber}</title>
          <style>
            body {
              font-family: 'Helvetica', 'Arial', sans-serif;
              margin: 0;
              padding: 20px;
              color: #333;
            }
            .invoice-container {
              max-width: 800px;
              margin: 0 auto;
              background: #fff;
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              padding: 30px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #2563eb;
            }
            .hotel-name {
              font-size: 28px;
              font-weight: 700;
              color: #2563eb;
            }
            .invoice-title {
              font-size: 24px;
              font-weight: 700;
              color: #111827;
            }
            .invoice-number {
              color: #6b7280;
              font-size: 14px;
              margin-top: 5px;
            }
            .guest-info {
              background: #f9fafb;
              padding: 20px;
              border-radius: 10px;
              margin-bottom: 25px;
            }
            .guest-info h3 {
              margin: 0 0 15px 0;
              color: #374151;
              font-size: 16px;
              font-weight: 600;
            }
            .info-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 15px;
            }
            .info-item {
              display: flex;
              flex-direction: column;
            }
            .info-label {
              font-size: 12px;
              color: #6b7280;
              margin-bottom: 4px;
            }
            .info-value {
              font-size: 16px;
              font-weight: 600;
              color: #111827;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 25px;
            }
            th {
              text-align: left;
              padding: 12px 8px;
              background: #f3f4f6;
              color: #374151;
              font-weight: 600;
              font-size: 14px;
            }
            td {
              padding: 10px 8px;
              border-bottom: 1px solid #e5e7eb;
              color: #4b5563;
            }
            .amount-col {
              text-align: right;
            }
            .summary {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 2px solid #e5e7eb;
            }
            .summary-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              font-size: 16px;
            }
            .summary-label {
              color: #6b7280;
            }
            .grand-total {
              font-size: 20px;
              font-weight: 700;
              color: #111827;
              margin-top: 15px;
              padding-top: 15px;
              border-top: 2px solid #2563eb;
            }
            .grand-total .summary-label {
              color: #111827;
              font-weight: 600;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              color: #9ca3af;
              font-size: 12px;
            }
            .badge {
              display: inline-block;
              padding: 4px 8px;
              background: #dbeafe;
              color: #2563eb;
              border-radius: 4px;
              font-size: 12px;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="invoice-container">
            <div class="header">
              <div>
                <div class="hotel-name">Roomio</div>
                <div class="invoice-number">Invoice #${billData.invoiceNumber}</div>
              </div>
              <div>
                <div class="invoice-title">TAX INVOICE</div>
                <div class="invoice-number">Date: ${billData.generatedAt.toLocaleDateString()}</div>
              </div>
            </div>

            <div class="guest-info">
              <h3>Guest Information</h3>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">Guest Name</span>
                  <span class="info-value">${billData.guestName}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Mobile</span>
                  <span class="info-value">${billData.guestMobile}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Room Number</span>
                  <span class="info-value">${billData.roomNumber}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Check-in / Check-out</span>
                  <span class="info-value">${billData.checkIn?.toLocaleDateString() || '-'} to ${billData.checkOut?.toLocaleDateString() || '-'}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Nights</span>
                  <span class="info-value">${billData.nights}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Room Rate</span>
                  <span class="info-value">₹${billData.roomRate}/night</span>
                </div>
              </div>
            </div>

            <h3 style="margin-bottom: 15px; color: #374151;">Room Charges</h3>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="amount-col">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Room ${billData.roomNumber} (${billData.nights} night${billData.nights > 1 ? 's' : ''})</td>
                  <td class="amount-col">${formatINR(billData.roomTotal)}</td>
                </tr>
              </tbody>
            </table>

            ${billData.foodOrders.length > 0 ? `
              <h3 style="margin-bottom: 15px; color: #374151;">Food Orders</h3>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th class="amount-col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${billData.foodOrders.map(item => `
                    <tr>
                      <td>${item.name}</td>
                      <td>${item.qty || 1}</td>
                      <td class="amount-col">${formatINR(item.amount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}

            ${billData.serviceRequests.length > 0 ? `
              <h3 style="margin-bottom: 15px; color: #374151;">Service Requests</h3>
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th class="amount-col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${billData.serviceRequests.map(item => `
                    <tr>
                      <td>${item.name}</td>
                      <td class="amount-col">${formatINR(item.amount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}

            <div class="summary">
              <div class="summary-row">
                <span class="summary-label">Room Charges:</span>
                <span>${formatINR(billData.roomTotal)}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Food Total:</span>
                <span>${formatINR(billData.foodTotal)}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Service Total:</span>
                <span>${formatINR(billData.serviceTotal)}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Subtotal:</span>
                <span>${formatINR(billData.subtotal)}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">GST (${(billData.taxRate * 100).toFixed(0)}%):</span>
                <span>${formatINR(billData.taxAmount)}</span>
              </div>
              <div class="summary-row grand-total">
                <span class="summary-label">GRAND TOTAL:</span>
                <span>${formatINR(billData.grandTotal)}</span>
              </div>
            </div>

            <div class="footer">
              <p>This is a computer generated invoice - valid without signature</p>
              <p>Thank you for choosing Roomio!</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Generate PDF
      const { uri } = await Print.printToFileAsync({ html: htmlContent });

      // Share the PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Invoice ${billData.invoiceNumber}`,
          UTI: 'com.adobe.pdf'
        });
      } else {
        // If sharing not available, save to downloads
        const fileName = `Invoice_${billData.invoiceNumber}.pdf`;
        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.copyAsync({
          from: uri,
          to: fileUri
        });
        Alert.alert(
          "PDF Saved",
          `Invoice saved to:\n${fileUri}`,
          [{ text: "OK" }]
        );
      }

    } catch (error) {
      console.error("PDF generation error:", error);
      Alert.alert("Error", "Failed to generate PDF invoice. Please try again.");
    } finally {
      setGeneratingPDF(false);
    }
  };

  // ✅ PROCEED TO CHECKOUT (from bill modal)
  const proceedToCheckout = () => {
    if (!pendingCheckoutRoom || !billData) return;
    closeBillModal();
    checkoutRoomConfirmed(pendingCheckoutRoom.id, pendingCheckoutRoom.roomNumber, parseFloat(billRoomRate) || 1500);
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
    return occupiedRooms.filter((r) => String(r.roomNumber).includes(searchQuery));
  }, [occupiedRooms, searchQuery]);
  const filteredAvailableRooms = useMemo(() => {
    if (!searchQuery) return availableRooms;
    return availableRooms.filter((r) => String(r.roomNumber).includes(searchQuery));
  }, [availableRooms, searchQuery]);

  // Floor grouping
  const floors = useMemo(() => {
    const map = new Map<number, { occupied: Room[]; available: Room[] }>();
    // Initialize with all rooms
    filteredOccupiedRooms.forEach((room) => {
      const floor = getFloorFromRoom(room);
      if (!map.has(floor)) map.set(floor, { occupied: [], available: [] });
      map.get(floor)!.occupied.push(room);
    });
    filteredAvailableRooms.forEach((room) => {
      const floor = getFloorFromRoom(room);
      if (!map.has(floor)) map.set(floor, { occupied: [], available: [] });
      map.get(floor)!.available.push(room);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [filteredOccupiedRooms, filteredAvailableRooms]);

  // Handle Edit Room (Initialize)
  const openEditModal = (room: Room) => {
    setEditingRoom(room);
    setGuestName("");
    setGuestMobile("");
    setRoomRate(room.roomRate?.toString() || "1500");
    const now = new Date();
    setEditCheckinDate(now);
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
    setRoomRate("1500");
    setEditCheckinDate(new Date());
    setCheckoutDate(null);
    setShowEditCheckinPicker(false);
    setShowEditCheckoutPicker(false);
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
    if (!editCheckinDate || !checkoutDate) {
      Alert.alert("Invalid Dates", "Please select both check-in and check-out date & time");
      return;
    }
    if (checkoutDate <= editCheckinDate) {
      Alert.alert("Invalid Dates", "Checkout must be after check-in time");
      return;
    }
    if (checkoutDate <= new Date()) {
      Alert.alert("Invalid Checkout", "Checkout must be in the future");
      return;
    }

    const rate = parseFloat(roomRate);
    if (isNaN(rate) || rate <= 0) {
      Alert.alert("Invalid Rate", "Please enter a valid room rate per night");
      return;
    }

    setInitializing(true);
    try {
      const uid = user.uid;
      const currentUserEmail = user.email;
      // 1. Create Guest Record
      const guestData: any = {
        adminId: uid,
        adminEmail: currentUserEmail,
        guestMobile: guestMobile,
        guestName: guestName.trim(),
        roomNumber: editingRoom.roomNumber,
        isActive: true,
        isLoggedIn: false,
        createdAt: serverTimestamp(),
        checkinAt: Timestamp.fromDate(editCheckinDate),
        checkoutAt: Timestamp.fromDate(checkoutDate),
        mealPlan: [],
      };
      const guestRef = await addDoc(collection(db, "guests"), guestData);
      // 2. Update Room
      const roomRef = doc(db, "users", uid, "rooms", editingRoom.id);
      await updateDoc(roomRef, {
        status: "occupied",
        guestName: guestName.trim(),
        guestMobile: guestMobile,
        assignedAt: Timestamp.fromDate(editCheckinDate),
        checkoutAt: Timestamp.fromDate(checkoutDate),
        guestId: guestRef.id,
        adminEmail: currentUserEmail,
        roomRate: rate,
        updatedAt: serverTimestamp(),
      });
      Alert.alert("✅ Success", `Room ${editingRoom.roomNumber} initialized for ${guestName}`);
      closeEditModal();
    } catch (error: any) {
      console.error("Error initializing room:", error);
      Alert.alert("❌ Error", "Failed to initialize room: " + error.message);
    } finally {
      setInitializing(false);
    }
  };

  // ✅ DELETE ALL FOOD ORDERS
  const deleteAllFoodOrders = async () => {
    if (!user) return;
    if (filteredFoodOrders.length === 0) {
      Alert.alert("No Orders", "There are no food orders to delete.");
      return;
    }
    askConfirm({
      title: "Delete All Food Orders",
      message: `Are you sure you want to delete ALL ${filteredFoodOrders.length} food orders${logsRoomNumber ? ` for Room ${logsRoomNumber}` : ""
        }?
This action CANNOT be undone.`,
      confirmText: deleting ? "Deleting..." : "Delete All",
      variant: "destructive",
      onConfirm: async () => {
        setDeleting(true);
        try {
          const batch = writeBatch(db);
          const uid = user.uid;
          let ordersQuery;
          if (logsRoomNumber) {
            ordersQuery = query(
              collection(db, "foodOrders"),
              where("adminId", "==", uid),
              where("roomNumber", "==", logsRoomNumber)
            );
          } else {
            ordersQuery = query(collection(db, "foodOrders"), where("adminId", "==", uid));
          }
          const ordersSnapshot = await getDocs(ordersQuery);
          ordersSnapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
          await batch.commit();
          Alert.alert("✅ Success", `Deleted ${ordersSnapshot.size} food orders successfully.`);
          if (selectedOrderId) {
            const stillExists = foodOrders.some((o) => o.id === selectedOrderId);
            if (!stillExists) setSelectedOrderId(null);
          }
        } catch (e: any) {
          console.error("Delete all food orders error:", e);
          Alert.alert("❌ Error", "Failed to delete food orders: " + e.message);
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  // ✅ DELETE ALL SERVICE REQUESTS
  const deleteAllServiceRequests = async () => {
    if (!user) return;
    if (filteredServiceRequests.length === 0) {
      Alert.alert("No Requests", "There are no service requests to delete.");
      return;
    }
    askConfirm({
      title: "Delete All Service Requests",
      message: `Are you sure you want to delete ALL ${filteredServiceRequests.length} service requests${logsRoomNumber ? ` for Room ${logsRoomNumber}` : ""
        }?
This action CANNOT be undone.`,
      confirmText: deleting ? "Deleting..." : "Delete All",
      variant: "destructive",
      onConfirm: async () => {
        setDeleting(true);
        try {
          const batch = writeBatch(db);
          const uid = user.uid;
          let requestsQuery;
          if (logsRoomNumber) {
            requestsQuery = query(
              collection(db, "serviceRequests"),
              where("adminId", "==", uid),
              where("roomNumber", "==", logsRoomNumber)
            );
          } else {
            requestsQuery = query(collection(db, "serviceRequests"), where("adminId", "==", uid));
          }
          const requestsSnapshot = await getDocs(requestsQuery);
          requestsSnapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
          await batch.commit();
          Alert.alert("✅ Success", `Deleted ${requestsSnapshot.size} service requests successfully.`);
          if (selectedRequestId) {
            const stillExists = serviceRequests.some((r) => r.id === selectedRequestId);
            if (!stillExists) setSelectedRequestId(null);
          }
        } catch (e: any) {
          console.error("Delete all service requests error:", e);
          Alert.alert("❌ Error", "Failed to delete service requests: " + e.message);
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  // ✅ DELETE SINGLE FOOD ORDER
  const deleteFoodOrder = async (orderId: string) => {
    if (!user) return;
    askConfirm({
      title: "Delete Food Order",
      message: "Are you sure you want to delete this food order?\nThis action CANNOT be undone.",
      confirmText: "Delete",
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "foodOrders", orderId));
          Alert.alert("✅ Deleted", "Food order deleted successfully.");
          if (selectedOrderId === orderId) setSelectedOrderId(null);
        } catch (e: any) {
          console.error("Delete food order error:", e);
          Alert.alert("❌ Error", "Failed to delete food order: " + e.message);
        }
      },
    });
  };

  // ✅ DELETE SINGLE SERVICE REQUEST
  const deleteServiceRequest = async (requestId: string) => {
    if (!user) return;
    askConfirm({
      title: "Delete Service Request",
      message: "Are you sure you want to delete this service request?\nThis action CANNOT be undone.",
      confirmText: "Delete",
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "serviceRequests", requestId));
          Alert.alert("✅ Deleted", "Service request deleted successfully.");
          if (selectedRequestId === requestId) setSelectedRequestId(null);
        } catch (e: any) {
          console.error("Delete service request error:", e);
          Alert.alert("❌ Error", "Failed to delete service request: " + e.message);
        }
      },
    });
  };

  // ✅ CHECKOUT ROOM - CONFIRMED (after bill preview)
  const checkoutRoomConfirmed = async (roomId: string, roomNumber: number, finalRoomRate: number) => {
    if (!user) return;
    const uid = user.uid;
    const room = occupiedRooms.find((r) => r.id === roomId);
    const guestId = room?.guestId || null;
    const roomAssignedAt = room?.assignedAt;

    // Calculate all totals with the final room rate
    const foodTotal = totalForRoom(roomNumber, guestId, roomAssignedAt);
    const serviceTotal = serviceChargesForRoom(roomNumber, roomAssignedAt);

    // Calculate room total with custom rate
    let roomTotal = 0;
    if (room && room.assignedAt && room.checkoutAt) {
      const checkIn = room.assignedAt.toDate();
      const checkOut = room.checkoutAt.toDate();
      const diffMs = checkOut.getTime() - checkIn.getTime();
      const nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      roomTotal = finalRoomRate * nights;
    }

    const totalCharges = foodTotal + serviceTotal + roomTotal;

    askConfirm({
      title: "Confirm Checkout",
      message: `Checkout Room ${roomNumber}?\nGuest: ${room?.guestName || "Unknown"}\nRoom Charges: ₹${roomTotal.toFixed(2)}\nFood: ₹${foodTotal.toFixed(2)}\nServices: ₹${serviceTotal.toFixed(2)}\nTOTAL: ₹${totalCharges.toFixed(2)}\n\nThis will DELETE all food orders and service requests for this room.`,
      confirmText: "Checkout & Delete",
      variant: "destructive",
      onConfirm: async () => {
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
          // DELETE ALL food orders for this room
          const foodOrdersQuery = query(
            collection(db, "foodOrders"),
            where("adminId", "==", uid),
            where("roomNumber", "==", roomNumber)
          );
          const foodOrdersSnapshot = await getDocs(foodOrdersQuery);
          foodOrdersSnapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
          // DELETE ALL service requests for this room
          const serviceRequestsQuery = query(
            collection(db, "serviceRequests"),
            where("adminId", "==", uid),
            where("roomNumber", "==", roomNumber)
          );
          const serviceRequestsSnapshot = await getDocs(serviceRequestsQuery);
          serviceRequestsSnapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
          // DELETE from orders collection
          const ordersQuery = query(
            collection(db, "orders"),
            where("adminId", "==", uid),
            where("roomNumber", "==", roomNumber)
          );
          const ordersSnapshot = await getDocs(ordersQuery);
          ordersSnapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
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
            `Room ${roomNumber} checked out.\nTotal Charges: ₹${totalCharges.toFixed(2)}`
          );
        } catch (e: any) {
          console.error("Checkout failed:", e);
          Alert.alert("❌ Error", "Failed to checkout room.\n" + e.message);
        }
      },
    });
  };

  // ✅ OLD CHECKOUT FUNCTION (now opens bill preview first)
  const checkoutRoom = (roomId: string, roomNumber: number) => {
    openBillPreview(roomId, roomNumber);
  };

  // Remaining time until checkout
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
      return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "Just now";
    }
  };

  // Format date and time
  const formatDateTime = (timestamp: any) => {
    try {
      const dt: Date | null = timestamp?.toDate?.() ?? null;
      if (!dt) return "-";
      return dt.toLocaleDateString() + " " + dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "-";
    }
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

  // Order/service status helpers
  const getServiceStatusColor = (status?: string) => {
    const s = (status || "pending").toLowerCase();
    if (s === "completed") return "#16A34A";
    if (s === "in-progress") return "#2563EB";
    if (s === "cancelled") return "#6B7280";
    if (s === "accepted") return "#7C3AED";
    return "#F59E0B";
  };
  const getServiceStatusText = (status?: string) => {
    const s = (status || "pending").toLowerCase();
    if (s === "completed") return "COMPLETED";
    if (s === "in-progress") return "IN PROGRESS";
    if (s === "cancelled") return "CANCELLED";
    if (s === "accepted") return "ACCEPTED";
    return "PENDING";
  };
  const getOrderStatusColor = (status?: string) => {
    const s = (status || "pending").toLowerCase();
    if (s === "completed") return "#16A34A";
    if (s === "in-progress") return "#2563EB";
    if (s === "cancelled") return "#6B7280";
    if (s === "accepted") return "#7C3AED";
    if (s === "ready") return "#059669";
    return "#F59E0B";
  };
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
  const clearSelection = () => {
    setSelectedOrderId(null);
    setSelectedRequestId(null);
  };
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return foodOrders.find((o) => o.id === selectedOrderId) ?? null;
  }, [foodOrders, selectedOrderId]);
  const selectedRequest = useMemo(() => {
    if (!selectedRequestId) return null;
    return serviceRequests.find((r) => r.id === selectedRequestId) ?? null;
  }, [serviceRequests, selectedRequestId]);
  const totalForFiltered = useMemo(() => {
    if (logsType === "food") {
      return filteredFoodOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);
    } else {
      return filteredServiceRequests.reduce((sum, r) => sum + (r.charges || 0), 0);
    }
  }, [filteredFoodOrders, filteredServiceRequests, logsType]);
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

  // Web values for edit modal
  const webMinNow = formatDateTimeLocal(new Date());
  const webEditCheckinValue = editCheckinDate ? formatDateTimeLocal(editCheckinDate) : "";
  const webEditCheckoutValue = checkoutDate ? formatDateTimeLocal(checkoutDate) : "";

  return (
    <SafeAreaView style={styles.safe}>
      {/* CONFIRM MODAL */}
      <Modal visible={confirm.open} transparent animationType="fade" onRequestClose={closeConfirm}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmHeader}>
              <View
                style={[styles.confirmIcon, confirm.variant === "destructive" && styles.confirmIconDanger]}
              >
                <Ionicons
                  name={confirm.variant === "destructive" ? "warning-outline" : "help-circle-outline"}
                  size={20}
                  color={confirm.variant === "destructive" ? "#DC2626" : "#2563EB"}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.confirmTitle} numberOfLines={2}>
                  {confirm.title}
                </Text>
              </View>
            </View>
            <Text style={styles.confirmMessage}>{confirm.message}</Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={closeConfirm}
                disabled={confirmBusy}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  styles.confirmBtnGhost,
                  pressed && !confirmBusy && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Text style={styles.confirmBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!confirm.onConfirm) return closeConfirm();
                  setConfirmBusy(true);
                  try {
                    await confirm.onConfirm();
                  } finally {
                    setConfirmBusy(false);
                    closeConfirm();
                  }
                }}
                disabled={confirmBusy}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  confirm.variant === "destructive" ? styles.confirmBtnDanger : styles.confirmBtnPrimary,
                  pressed && !confirmBusy && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                {confirmBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>{confirm.confirmText}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ BILL PREVIEW MODAL WITH PDF EXPORT */}
      <Modal visible={billModalOpen} animationType="slide" transparent onRequestClose={closeBillModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={[styles.modalIcon, { backgroundColor: "rgba(37, 99, 235, 0.1)" }]}>
                  <Ionicons name="receipt-outline" size={18} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Guest Bill</Text>
                  <Text style={styles.modalSubtitle}>Room {billData?.roomNumber} • {billData?.invoiceNumber}</Text>
                </View>
              </View>
              <View style={styles.modalHeaderRight}>
                {/* PDF Export Button */}
                <Pressable
                  onPress={generatePDFInvoice}
                  disabled={generatingPDF}
                  style={({ pressed }) => [
                    styles.pdfBtn,
                    pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                    generatingPDF && styles.pdfBtnDisabled,
                  ]}
                >
                  {generatingPDF ? (
                    <ActivityIndicator size="small" color="#2563EB" />
                  ) : (
                    <>
                      <Ionicons name="document-text-outline" size={18} color="#2563EB" />
                      <Text style={styles.pdfBtnText}>PDF</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={closeBillModal}
                  style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                >
                  <Ionicons name="close" size={18} color="#6B7280" />
                </Pressable>
              </View>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              {generatingBill ? (
                <View style={styles.billLoading}>
                  <ActivityIndicator size="large" color="#2563EB" />
                  <Text style={styles.billLoadingText}>Generating Bill...</Text>
                </View>
              ) : billData ? (
                <>
                  {/* Guest Info */}
                  <View style={styles.billSection}>
                    <Text style={styles.billSectionTitle}>Guest Information</Text>
                    <View style={styles.billInfoRow}>
                      <Text style={styles.billInfoLabel}>Name:</Text>
                      <Text style={styles.billInfoValue}>{billData.guestName}</Text>
                    </View>
                    <View style={styles.billInfoRow}>
                      <Text style={styles.billInfoLabel}>Mobile:</Text>
                      <Text style={styles.billInfoValue}>{billData.guestMobile}</Text>
                    </View>
                    <View style={styles.billInfoRow}>
                      <Text style={styles.billInfoLabel}>Check-in:</Text>
                      <Text style={styles.billInfoValue}>
                        {billData.checkIn?.toLocaleDateString() || "-"}
                      </Text>
                    </View>
                    <View style={styles.billInfoRow}>
                      <Text style={styles.billInfoLabel}>Check-out:</Text>
                      <Text style={styles.billInfoValue}>
                        {billData.checkOut?.toLocaleDateString() || "-"}
                      </Text>
                    </View>
                    <View style={styles.billInfoRow}>
                      <Text style={styles.billInfoLabel}>Nights:</Text>
                      <Text style={styles.billInfoValue}>{billData.nights}</Text>
                    </View>
                  </View>

                  {/* Room Rate Input */}
                  <View style={styles.billSection}>
                    <Text style={styles.billSectionTitle}>Room Rate (per night)</Text>
                    <View style={styles.billRateInputContainer}>
                      <Text style={styles.billRateCurrency}>₹</Text>
                      <TextInput
                        style={styles.billRateInput}
                        value={billRoomRate}
                        onChangeText={updateBillWithRate}
                        keyboardType="numeric"
                        placeholder="Enter rate"
                        placeholderTextColor="#9CA3AF"
                      />
                    </View>
                  </View>

                  {/* Room Charges */}
                  <View style={styles.billSection}>
                    <Text style={styles.billSectionTitle}>Room Charges</Text>
                    <View style={styles.billItemRow}>
                      <Text style={styles.billItemName}>Room {billData.roomNumber} ({billData.nights} night{billData.nights > 1 ? 's' : ''}) @ ₹{billData.roomRate}/night</Text>
                      <Text style={styles.billItemAmount}>{formatINR(billData.roomTotal)}</Text>
                    </View>
                  </View>

                  {/* Food Orders */}
                  <View style={styles.billSection}>
                    <Text style={styles.billSectionTitle}>Food Orders</Text>
                    {billData.foodOrders.length > 0 ? (
                      billData.foodOrders.map((item, idx) => (
                        <View key={idx} style={styles.billItemRow}>
                          <Text style={styles.billItemName}>
                            {item.name}
                            {item.qty ? ` (x${item.qty})` : ''}
                          </Text>
                          <Text style={styles.billItemAmount}>{formatINR(item.amount)}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.billNoItems}>No food orders</Text>
                    )}
                    <View style={styles.billSubtotalRow}>
                      <Text style={styles.billSubtotalLabel}>Food Total:</Text>
                      <Text style={styles.billSubtotalAmount}>{formatINR(billData.foodTotal)}</Text>
                    </View>
                  </View>

                  {/* Service Requests */}
                  <View style={styles.billSection}>
                    <Text style={styles.billSectionTitle}>Service Requests</Text>
                    {billData.serviceRequests.length > 0 ? (
                      billData.serviceRequests.map((item, idx) => (
                        <View key={idx} style={styles.billItemRow}>
                          <Text style={styles.billItemName}>{item.name}</Text>
                          <Text style={styles.billItemAmount}>{formatINR(item.amount)}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.billNoItems}>No service requests</Text>
                    )}
                    <View style={styles.billSubtotalRow}>
                      <Text style={styles.billSubtotalLabel}>Service Total:</Text>
                      <Text style={styles.billSubtotalAmount}>{formatINR(billData.serviceTotal)}</Text>
                    </View>
                  </View>

                  {/* Bill Summary */}
                  <View style={styles.billSummary}>
                    <View style={styles.billSummaryRow}>
                      <Text style={styles.billSummaryLabel}>Room Charges:</Text>
                      <Text style={styles.billSummaryAmount}>{formatINR(billData.roomTotal)}</Text>
                    </View>
                    <View style={styles.billSummaryRow}>
                      <Text style={styles.billSummaryLabel}>Food Total:</Text>
                      <Text style={styles.billSummaryAmount}>{formatINR(billData.foodTotal)}</Text>
                    </View>
                    <View style={styles.billSummaryRow}>
                      <Text style={styles.billSummaryLabel}>Service Total:</Text>
                      <Text style={styles.billSummaryAmount}>{formatINR(billData.serviceTotal)}</Text>
                    </View>
                    <View style={styles.billSummaryRow}>
                      <Text style={styles.billSummaryLabel}>Subtotal:</Text>
                      <Text style={styles.billSummaryAmount}>{formatINR(billData.subtotal)}</Text>
                    </View>
                    <View style={styles.billSummaryRow}>
                      <Text style={styles.billSummaryLabel}>GST ({(billData.taxRate * 100).toFixed(0)}%):</Text>
                      <Text style={styles.billSummaryAmount}>{formatINR(billData.taxAmount)}</Text>
                    </View>
                    <View style={[styles.billSummaryRow, styles.billGrandTotalRow]}>
                      <Text style={styles.billGrandTotalLabel}>GRAND TOTAL:</Text>
                      <Text style={styles.billGrandTotalAmount}>{formatINR(billData.grandTotal)}</Text>
                    </View>
                  </View>

                  <Text style={styles.billFooter}>
                    Generated: {billData.generatedAt.toLocaleString()}
                  </Text>

                  <Pressable
                    onPress={proceedToCheckout}
                    style={({ pressed }) => [
                      styles.billProceedBtn,
                      pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.billProceedText}>Proceed to Checkout</Text>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* LOGS MODAL */}
      <Modal visible={logsOpen} animationType="slide" transparent onRequestClose={() => setLogsOpen(false)}>
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
                      : `Room ${logsRoomNumber} • ${logsType === "food" ? "Orders" : "Requests"}: ${logsType === "food" ? filteredFoodOrders.length : filteredServiceRequests.length
                      } • Total: ${formatINR(totalForFiltered)}`}
                  </Text>
                </View>
              </View>
              <View style={styles.modalHeaderRight}>
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
                    <Ionicons
                      name="trash-bin"
                      size={16}
                      color={deleting || filteredFoodOrders.length === 0 ? "#9CA3AF" : "#DC2626"}
                    />
                    <Text
                      style={[
                        styles.deleteAllText,
                        (deleting || filteredFoodOrders.length === 0) && styles.deleteAllTextDisabled,
                      ]}
                    >
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
                    <Ionicons
                      name="trash-bin"
                      size={16}
                      color={deleting || filteredServiceRequests.length === 0 ? "#9CA3AF" : "#DC2626"}
                    />
                    <Text
                      style={[
                        styles.deleteAllText,
                        (deleting || filteredServiceRequests.length === 0) && styles.deleteAllTextDisabled,
                      ]}
                    >
                      {deleting ? "Deleting..." : "Delete All"}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setLogsOpen(false)}
                  style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
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
                style={({ pressed }) => [styles.filterPill, pressed && { opacity: 0.9 }]}
                hitSlop={8}
              >
                <Text style={styles.filterPillText}>All Rooms</Text>
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
                  <Text style={[styles.tabButtonText, logsType === "food" && styles.tabButtonTextActive]}>
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
                  <Text style={[styles.tabButtonText, logsType === "services" && styles.tabButtonTextActive]}>
                    Services
                  </Text>
                </Pressable>
              </View>
              {(selectedOrderId || selectedRequestId) && (
                <Pressable
                  onPress={clearSelection}
                  style={({ pressed }) => [styles.filterPill, pressed && { opacity: 0.9 }]}
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
                    <Text style={styles.detailRoomPillText}>Room {selectedOrder.roomNumber ?? "-"}</Text>
                  </View>
                  <View style={[styles.detailStatusPill, { backgroundColor: "rgba(37, 99, 235, 0.10)" }]}>
                    <Text style={[styles.detailStatusText, { color: getOrderStatusColor(selectedOrder.status) }]}>
                      {getOrderStatusText(selectedOrder.status)}
                    </Text>
                  </View>
                </View>
                <View style={styles.detailActionRow}>
                  <Text style={styles.detailTitle}>Total: {formatINR(getOrderTotal(selectedOrder))}</Text>
                  <Pressable
                    onPress={() => deleteFoodOrder(selectedOrder.id)}
                    style={({ pressed }) => [styles.detailDeleteBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                  >
                    <Ionicons name="trash-bin" size={14} color="#DC2626" />
                    <Text style={styles.detailDeleteText}>Delete</Text>
                  </Pressable>
                </View>
                <Text style={styles.detailLine}>
                  Guest: {selectedOrder.guestName ?? "-"}
                  {selectedOrder.guestMobile ? ` • ${selectedOrder.guestMobile}` : ""}
                </Text>
                <Text style={styles.detailTime}>Time: {formatOrderTime(selectedOrder.createdAt)}</Text>
                <Text style={styles.detailMeta}>Source: {selectedOrder.source ?? "—"}</Text>
                <View style={{ marginTop: 10 }}>
                  {normalizeItems((selectedOrder as any).items).length ? (
                    normalizeItems((selectedOrder as any).items).map((it: any, idx: number) => {
                      const qty = toNum(it?.qty) || toNum(it?.quantity) || 1;
                      const price = toNum(it?.price) || toNum(it?.unitPrice) || toNum(it?.rate) || 0;
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
                        {toNum((selectedOrder as any).qty) || toNum((selectedOrder as any).quantity) || 1} ×{" "}
                        {(selectedOrder as any).item}
                      </Text>
                      <Text style={styles.itemRight}>{formatINR(getOrderTotal(selectedOrder))}</Text>
                    </View>
                  ) : (
                    <Text style={styles.noItemsText}>No item details found for this order.</Text>
                  )}
                </View>
                {selectedOrder.status &&
                  !["completed", "cancelled"].includes((selectedOrder.status || "").toLowerCase()) && (
                    <Pressable
                      onPress={() => completeOrder(selectedOrder.id)}
                      style={({ pressed }) => [styles.completeBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
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
                    <Text style={styles.detailRoomPillText}>Room {selectedRequest.roomNumber ?? "-"}</Text>
                  </View>
                  <View style={[styles.detailStatusPill, { backgroundColor: "rgba(37, 99, 235, 0.10)" }]}>
                    <Text style={[styles.detailStatusText, { color: getServiceStatusColor(selectedRequest.status) }]}>
                      {getServiceStatusText(selectedRequest.status)}
                    </Text>
                  </View>
                </View>
                <View style={styles.detailActionRow}>
                  <Text style={styles.detailTitle}>
                    {selectedRequest.type || "Service Request"}
                    {selectedRequest.isFreeRequest && (
                      <Text style={{ color: "#16A34A", fontSize: 12, fontWeight: "900" }}> (FREE)</Text>
                    )}
                  </Text>
                  <Pressable
                    onPress={() => deleteServiceRequest(selectedRequest.id)}
                    style={({ pressed }) => [styles.detailDeleteBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                  >
                    <Ionicons name="trash-bin" size={14} color="#DC2626" />
                    <Text style={styles.detailDeleteText}>Delete</Text>
                  </Pressable>
                </View>
                <Text style={styles.detailLine}>
                  Guest: {selectedRequest.guestName ?? "-"}
                  {selectedRequest.guestMobile ? ` • ${selectedRequest.guestMobile}` : ""}
                </Text>
                <Text style={styles.detailTime}>Time: {formatOrderTime(selectedRequest.createdAt)}</Text>
                <View style={styles.chargeRow}>
                  <Text style={styles.chargeLabel}>Charges:</Text>
                  <Text style={styles.chargeAmount}>
                    {formatINR(selectedRequest.charges || 0)}
                    {selectedRequest.currency && ` ${selectedRequest.currency}`}
                  </Text>
                </View>
                {selectedRequest.notes && (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesLabel}>Notes:</Text>
                    <Text style={styles.notesText}>{selectedRequest.notes}</Text>
                  </View>
                )}
                {selectedRequest.status &&
                  !["completed", "cancelled"].includes((selectedRequest.status || "").toLowerCase()) && (
                    <Pressable
                      onPress={() => completeServiceRequest(selectedRequest.id)}
                      style={({ pressed }) => [styles.completeBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                    >
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={styles.completeText}>Mark as Completed</Text>
                    </Pressable>
                  )}
              </View>
            ) : null}
            {/* List of Orders/Requests */}
            <ScrollView style={styles.modalList} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              {logsType === "food" ? (
                filteredFoodOrders.length === 0 ? (
                  <View style={styles.modalEmpty}>
                    <Ionicons name="fast-food-outline" size={24} color="#9CA3AF" />
                    <Text style={styles.modalEmptyText}>
                      No food orders{logsRoomNumber != null ? ` for Room ${logsRoomNumber}` : ""}
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
                          <Text style={styles.requestRoomPillText}>Room {o.roomNumber ?? "-"}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.requestTopRow}>
                            <Text style={styles.requestTitle} numberOfLines={1}>
                              {getOrderSummaryText(o)}
                            </Text>
                            <Text style={[styles.requestStatus, { color: getOrderStatusColor(o.status) }]}>
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
                          style={({ pressed }) => [styles.requestDeleteBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                        >
                          <Ionicons name="trash-bin" size={16} color="#DC2626" />
                        </Pressable>
                        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                      </View>
                    </Pressable>
                  ))
                )
              ) : filteredServiceRequests.length === 0 ? (
                <View style={styles.modalEmpty}>
                  <Ionicons name="construct-outline" size={24} color="#9CA3AF" />
                  <Text style={styles.modalEmptyText}>
                    No service requests{logsRoomNumber != null ? ` for Room ${logsRoomNumber}` : ""}
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
                        <Text style={styles.requestRoomPillText}>Room {r.roomNumber ?? "-"}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.requestTopRow}>
                          <Text style={styles.requestTitle} numberOfLines={1}>
                            {r.type || "Service Request"}
                            {r.isFreeRequest && (
                              <Text style={{ color: "#16A34A", fontSize: 10, fontWeight: "900" }}> (FREE)</Text>
                            )}
                          </Text>
                          <Text style={[styles.requestStatus, { color: getServiceStatusColor(r.status) }]}>
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
                        style={({ pressed }) => [styles.requestDeleteBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                      >
                        <Ionicons name="trash-bin" size={16} color="#DC2626" />
                      </Pressable>
                      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* EDIT ROOM MODAL */}
      <Modal visible={editModalOpen} animationType="slide" transparent onRequestClose={closeEditModal}>
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
                style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
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

              {/* Room Rate Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Room Rate (per night)</Text>
                <View style={styles.inputWrapper}>
                  <Text style={[styles.currencySymbol, { marginLeft: 12 }]}>₹</Text>
                  <TextInput
                    placeholder="1500"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    style={styles.input}
                    value={roomRate}
                    onChangeText={setRoomRate}
                  />
                </View>
              </View>

              {/* Check-in Date & Time */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Check-in Date & Time</Text>
                {Platform.OS === "web" ? (
                  <View style={[styles.inputWrapper, { cursor: "pointer" } as any]}>
                    <Ionicons name="calendar-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                    {/* @ts-ignore */}
                    <input
                      type="datetime-local"
                      value={webEditCheckinValue}
                      min={webMinNow}
                      step={60}
                      onChange={(e: any) => {
                        const d = parseDateTimeLocal(e.target.value);
                        if (d) {
                          setEditCheckinDate(d);
                          if (checkoutDate && d >= checkoutDate) {
                            const next = new Date(d);
                            next.setDate(next.getDate() + 1);
                            setCheckoutDate(next);
                          }
                        }
                      }}
                      style={webNativeDateInputStyle}
                    />
                  </View>
                ) : (
                  <Pressable
                    style={styles.inputWrapper}
                    onPress={() => {
                      if (Platform.OS === "android") {
                        openAndroidDateTimePicker({
                          initial: editCheckinDate ?? new Date(),
                          minimumDate: new Date(),
                          onPicked: (d) => {
                            setEditCheckinDate(d);
                            if (checkoutDate && d >= checkoutDate) {
                              const next = new Date(d);
                              next.setDate(next.getDate() + 1);
                              setCheckoutDate(next);
                            }
                          },
                        });
                        return;
                      }
                      // iOS
                      setIosTempEditCheckin(editCheckinDate ?? new Date());
                      setShowEditCheckinPicker(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                    <Text style={styles.dateValueText} numberOfLines={1}>
                      {formatDateDisplay(editCheckinDate)}
                    </Text>
                  </Pressable>
                )}
              </View>
              {/* Check-out Date & Time */}
              <View style={styles.inputGroup}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.label}>Check-out Date & Time</Text>
                  {Platform.OS === "web" && (
                    <Pressable
                      onPress={() => {
                        const nextDay = new Date();
                        nextDay.setDate(nextDay.getDate() + 1);
                        nextDay.setHours(11, 0, 0, 0);
                        setCheckoutDate(nextDay);
                      }}
                      style={{
                        backgroundColor: "rgba(37,99,235,0.08)",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#2563EB" }}>
                        Set Tomorrow 11AM
                      </Text>
                    </Pressable>
                  )}
                </View>
                {Platform.OS === "web" ? (
                  <View style={[styles.inputWrapper, { cursor: "pointer" } as any]}>
                    <Ionicons name="calendar-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                    {/* @ts-ignore */}
                    <input
                      type="datetime-local"
                      value={webEditCheckoutValue}
                      min={webEditCheckinValue || webMinNow}
                      step={60}
                      onChange={(e: any) => {
                        const d = parseDateTimeLocal(e.target.value);
                        if (d) setCheckoutDate(d);
                      }}
                      style={webNativeDateInputStyle}
                    />
                  </View>
                ) : (
                  <Pressable
                    style={styles.inputWrapper}
                    onPress={() => {
                      if (Platform.OS === "android") {
                        openAndroidDateTimePicker({
                          initial: checkoutDate ?? new Date(),
                          minimumDate: editCheckinDate ?? new Date(),
                          onPicked: (d) => setCheckoutDate(d),
                        });
                        return;
                      }
                      // iOS
                      setIosTempEditCheckout(checkoutDate ?? new Date());
                      setShowEditCheckoutPicker(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#9CA3AF" style={{ marginLeft: 12 }} />
                    <Text style={styles.dateValueText} numberOfLines={1}>
                      {formatDateDisplay(checkoutDate)}
                    </Text>
                  </Pressable>
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
            {/* iOS bottom-sheet pickers (inside edit modal) */}
            {Platform.OS === "ios" && (
              <Modal
                visible={showEditCheckinPicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowEditCheckinPicker(false)}
              >
                <View style={styles.pickerOverlay}>
                  <Pressable
                    style={styles.pickerBackdrop}
                    onPress={() => setShowEditCheckinPicker(false)}
                  />
                  <View style={styles.pickerSheet}>
                    <View style={styles.pickerHeader}>
                      <Pressable onPress={() => setShowEditCheckinPicker(false)}>
                        <Text style={styles.pickerAction}>Cancel</Text>
                      </Pressable>
                      <Text style={styles.pickerTitle}>Select Check-in</Text>
                      <Pressable
                        onPress={() => {
                          setShowEditCheckinPicker(false);
                          setEditCheckinDate(iosTempEditCheckin);
                          if (checkoutDate && iosTempEditCheckin >= checkoutDate) {
                            const next = new Date(iosTempEditCheckin);
                            next.setDate(next.getDate() + 1);
                            setCheckoutDate(next);
                          }
                        }}
                      >
                        <Text style={[styles.pickerAction, styles.pickerActionPrimary]}>Done</Text>
                      </Pressable>
                    </View>
                    <DateTimePicker
                      value={iosTempEditCheckin}
                      mode="datetime"
                      display="spinner"
                      minimumDate={new Date()}
                      onChange={(_, d) => d && setIosTempEditCheckin(d)}
                    />
                  </View>
                </View>
              </Modal>
            )}
            {Platform.OS === "ios" && (
              <Modal
                visible={showEditCheckoutPicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowEditCheckoutPicker(false)}
              >
                <View style={styles.pickerOverlay}>
                  <Pressable
                    style={styles.pickerBackdrop}
                    onPress={() => setShowEditCheckoutPicker(false)}
                  />
                  <View style={styles.pickerSheet}>
                    <View style={styles.pickerHeader}>
                      <Pressable onPress={() => setShowEditCheckoutPicker(false)}>
                        <Text style={styles.pickerAction}>Cancel</Text>
                      </Pressable>
                      <Text style={styles.pickerTitle}>Select Check-out</Text>
                      <Pressable
                        onPress={() => {
                          setShowEditCheckoutPicker(false);
                          setCheckoutDate(iosTempEditCheckout);
                        }}
                      >
                        <Text style={[styles.pickerAction, styles.pickerActionPrimary]}>Done</Text>
                      </Pressable>
                    </View>
                    <DateTimePicker
                      value={iosTempEditCheckout}
                      mode="datetime"
                      display="spinner"
                      minimumDate={editCheckinDate ?? new Date()}
                      onChange={(_, d) => d && setIosTempEditCheckout(d)}
                    />
                  </View>
                </View>
              </Modal>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MAIN SCREEN */}
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
        {/* Global Logs Buttons */}
        <View style={styles.globalLogsContainer}>
          <Pressable
            onPress={() => openLogs(null, "food")}
            style={({ pressed }) => [styles.globalLogsBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
          >
            <Ionicons name="restaurant-outline" size={18} color="#2563EB" />
            <Text style={styles.globalLogsText}>All Food Orders ({foodOrders.length})</Text>
            {foodOrders.length > 0 && (
              <View style={styles.globalLogsBadge}>
                <Text style={styles.globalLogsBadgeText}>{foodOrders.length}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => openLogs(null, "services")}
            style={({ pressed }) => [styles.globalLogsBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
          >
            <Ionicons name="construct-outline" size={18} color="#F59E0B" />
            <Text style={styles.globalLogsText}>All Service Requests ({serviceRequests.length})</Text>
            {serviceRequests.length > 0 && (
              <View style={[styles.globalLogsBadge, { backgroundColor: "#F59E0B" }]}>
                <Text style={styles.globalLogsBadgeText}>{serviceRequests.length}</Text>
              </View>
            )}
          </Pressable>
        </View>
        {/* FLOOR-WISE DISPLAY */}
        {floors.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bed-outline" size={24} color="#9CA3AF" />
            <Text style={styles.emptyText}>No rooms found</Text>
          </View>
        ) : (
          floors.map(([floor, { occupied, available }]) => {
            const isOpen = openFloors[floor] ?? false;
            const totalRooms = occupied.length + available.length;
            return (
              <View key={floor} style={styles.floorCard}>
                <Pressable
                  onPress={() => setOpenFloors((p) => ({ ...p, [floor]: !isOpen }))}
                  style={({ pressed }) => [styles.floorHeader, pressed && { opacity: 0.95 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.floorTitle}>{floorLabel(floor)}</Text>
                    <Text style={styles.floorSub}>
                      Total: {totalRooms} • Occupied: {occupied.length} • Available: {available.length}
                    </Text>
                  </View>
                  <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color="#6B7280" />
                </Pressable>
                {isOpen && (
                  <View style={styles.floorBody}>
                    {/* Occupied Rooms */}
                    {occupied.length > 0 && (
                      <>
                        <Text style={styles.sectionTitle}>Occupied</Text>
                        {occupied.map((room) => {
                          const roomFoodCount = foodCountForRoom(
                            room.roomNumber,
                            room.guestId,
                            room.assignedAt
                          );
                          const roomFoodTotal = totalForRoom(
                            room.roomNumber,
                            room.guestId,
                            room.assignedAt
                          );
                          const roomServiceCount = serviceCountForRoom(room.roomNumber, room.assignedAt);
                          const roomServiceTotal = serviceChargesForRoom(room.roomNumber, room.assignedAt);

                          // Calculate room total
                          let roomTotal = 0;
                          if (room.assignedAt && room.checkoutAt) {
                            const checkIn = room.assignedAt.toDate();
                            const checkOut = room.checkoutAt.toDate();
                            const diffMs = checkOut.getTime() - checkIn.getTime();
                            const nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                            roomTotal = (room.roomRate || 1500) * nights;
                          }

                          const roomTotalCharges = roomFoodTotal + roomServiceTotal + roomTotal;

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
                                    Room Charges: ₹{roomTotal.toFixed(2)} ({room.roomRate || 1500}/night)
                                  </Text>
                                </View>
                                <View style={styles.infoRow}>
                                  <Ionicons name="restaurant-outline" size={14} color="#6B7280" />
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
                                  <Text
                                    style={[styles.infoText, { fontWeight: "900", color: "#2563EB" }]}
                                  >
                                    Total Charges: ₹{roomTotalCharges.toFixed(2)}
                                  </Text>
                                </View>
                                {room.checkoutAt && (
                                  <View style={styles.infoRow}>
                                    <Ionicons name="timer" size={14} color="#2563EB" />
                                    <Text
                                      style={[styles.infoText, { color: "#2563EB", fontWeight: "700" }]}
                                    >
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
                                <Ionicons name="receipt-outline" size={16} color="#fff" />
                                <Text style={styles.checkoutText}>
                                  View Bill & Checkout (₹{roomTotalCharges.toFixed(2)})
                                </Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </>
                    )}
                    {/* Available Rooms */}
                    {available.length > 0 && (
                      <>
                        {occupied.length > 0 && <View style={{ height: 12 }} />}
                        <Text style={styles.sectionTitle}>Available</Text>
                        <View style={styles.availableRoomsGrid}>
                          {available.map((room) => (
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
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
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
  globalLogsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  globalLogsBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  globalLogsText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  globalLogsBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: "#F9FAFB",
  },
  globalLogsBadgeText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 10,
  },
  floorCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
  },
  floorHeader: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  floorTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  floorSub: { marginTop: 3, fontSize: 12, fontWeight: "700", color: "#6B7280" },
  floorBody: { padding: 14 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#6B7280",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
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
  emptyState: {
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyText: { color: "#9CA3AF", marginTop: 6, fontWeight: "700" },
  occupiedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
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
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    shadowColor: "#2563EB",
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
  // Modal base
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
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.2)",
  },
  pdfBtnDisabled: {
    opacity: 0.5,
  },
  pdfBtnText: {
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 12,
  },
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
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  detailStatusText: { fontWeight: "900", fontSize: 12 },
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
  // EDIT MODAL FIELDS
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
  currencySymbol: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginRight: 4,
  },
  dateValueText: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    fontWeight: "700",
    paddingHorizontal: 12,
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
  // Confirm modal
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
  },
  confirmHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  confirmIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmIconDanger: {
    backgroundColor: "rgba(220, 38, 38, 0.10)",
  },
  confirmTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111827",
  },
  confirmMessage: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginBottom: 14,
    whiteSpace: "pre-wrap" as any,
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  confirmBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnGhost: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  confirmBtnGhostText: {
    fontWeight: "900",
    color: "#374151",
  },
  confirmBtnPrimary: {
    backgroundColor: "#2563EB",
  },
  confirmBtnDanger: {
    backgroundColor: "#DC2626",
  },
  confirmBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  // ✅ BILL MODAL STYLES
  billLoading: {
    paddingVertical: 40,
    alignItems: "center",
  },
  billLoadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  billSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  billSectionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  billInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  billInfoLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  billInfoValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "700",
  },
  billRateInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    height: 48,
  },
  billRateCurrency: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginRight: 8,
  },
  billRateInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    fontWeight: "600",
    padding: 0,
  },
  billItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  billItemName: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
    flex: 1,
  },
  billItemAmount: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "700",
  },
  billNoItems: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "600",
    fontStyle: "italic",
    paddingVertical: 6,
  },
  billSubtotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  billSubtotalLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "700",
  },
  billSubtotalAmount: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "800",
  },
  billSummary: {
    backgroundColor: "rgba(37, 99, 235, 0.06)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  billSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  billSummaryLabel: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "700",
  },
  billSummaryAmount: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "800",
  },
  billGrandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(37, 99, 235, 0.2)",
    paddingTop: 10,
    marginTop: 4,
  },
  billGrandTotalLabel: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "900",
  },
  billGrandTotalAmount: {
    fontSize: 18,
    color: "#2563EB",
    fontWeight: "900",
  },
  billFooter: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  },
  billProceedBtn: {
    backgroundColor: "#16A34A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  billProceedText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
});