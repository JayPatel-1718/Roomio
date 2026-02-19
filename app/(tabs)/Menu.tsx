import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
    Pressable,
    Modal,
    TextInput,
    Alert,
    Switch,
    ActivityIndicator,
    useWindowDimensions,
    useColorScheme,
    Platform,
    Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState, useRef } from "react";
import { getAuth } from "firebase/auth";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import * as ImagePicker from 'expo-image-picker';
import { generateAIMenuText, parseMenuFromAI } from "../../lib/aiService";

type Category = "breakfast" | "lunch" | "dinner" | "beverages" | "desserts" | "snacks";

type MenuItem = {
    id: string;
    category: Category;
    name: string;
    description?: string;
    price?: number | null;
    isAvailable?: boolean;
    createdAt?: any;
    updatedAt?: any;
};

type ConfirmState = {
    open: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: "destructive" | "primary";
    onConfirm?: () => void | Promise<void>;
};

const CATEGORIES: Array<{
    key: Category;
    title: string;
    subtitle: string;
    icon: string;
    accent: string;
}> = [
        {
            key: "breakfast",
            title: "Breakfast",
            subtitle: "Morning dishes & beverages",
            icon: "🍳",
            accent: "#2563EB",
        },
        {
            key: "lunch",
            title: "Lunch",
            subtitle: "Main course & combos",
            icon: "🍱",
            accent: "#16A34A",
        },
        {
            key: "dinner",
            title: "Dinner",
            subtitle: "Evening meals & specials",
            icon: "🍽️",
            accent: "#7C3AED",
        },
        {
            key: "beverages",
            title: "Beverages",
            subtitle: "Drinks, Shakes & Juices",
            icon: "🥤",
            accent: "#06B6D4",
        },
        {
            key: "desserts",
            title: "Desserts",
            subtitle: "Sweets & Treats",
            icon: "🍨",
            accent: "#EC4899",
        },
        {
            key: "snacks",
            title: "Snacks",
            subtitle: "Light bites & sides",
            icon: "🍟",
            accent: "#F59E0B",
        },
    ];

export default function MenuScreen() {
    const auth = getAuth();
    const user = auth.currentUser;
    const { width } = useWindowDimensions();
    const systemColorScheme = useColorScheme();

    const isWide = width >= 900;
    const [isDark, setIsDark] = useState(systemColorScheme === "dark");

    const [items, setItems] = useState<MenuItem[]>([]);
    const [expandedCategory, setExpandedCategory] = useState<Category | null>("breakfast");

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rewriting, setRewriting] = useState(false);
    const [rewriteCount, setRewriteCount] = useState(0);

    const [editId, setEditId] = useState<string | null>(null);
    const [formCategory, setFormCategory] = useState<Category>("breakfast");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [priceText, setPriceText] = useState("");
    const [isAvailable, setIsAvailable] = useState(true);

    // AI Import states
    const [aiImportModalOpen, setAiImportModalOpen] = useState(false);
    const [aiParsing, setAiParsing] = useState(false);
    const [parsedItems, setParsedItems] = useState<any[]>([]);

    // AI Rewrite states
    const [showAIRewriteModal, setShowAIRewriteModal] = useState(false);
    const [userTitleHints, setUserTitleHints] = useState("");
    const [userDescriptionHints, setUserDescriptionHints] = useState("");
    const [aiError, setAiError] = useState<string | null>(null);

    const [aiHistory, setAiHistory] = useState<Array<{ title: string, description: string }>>([]);
    const [currentAiIndex, setCurrentAiIndex] = useState(-1);
    const [originalText, setOriginalText] = useState({ title: "", description: "" });

    const hasAIGeneratedRef = useRef(false);
    const aiRewriteAttemptRef = useRef(0);

    // ✅ Confirm modal (for web delete fix)
    const [confirm, setConfirm] = useState<ConfirmState>({
        open: false,
        title: "",
        message: "",
        confirmText: "Confirm",
        variant: "primary",
    });
    const [confirmBusy, setConfirmBusy] = useState(false);

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

    // ✅ Dynamic theme
    const theme = isDark
        ? {
            bgMain: "#010409",
            bgCard: "rgba(13, 17, 23, 0.6)",
            textMain: "#f0f6fc",
            textMuted: "#8b949e",
            glass: "rgba(255, 255, 255, 0.03)",
            glassBorder: "rgba(255, 255, 255, 0.1)",
            primary: "#2563eb",
            success: "#22c55e",
            danger: "#ef4444",
            warning: "#f59e0b",
        }
        : {
            bgMain: "#f8fafc",
            bgCard: "#ffffff",
            textMain: "#0f172a",
            textMuted: "#64748b",
            glass: "rgba(37, 99, 235, 0.04)",
            glassBorder: "rgba(37, 99, 235, 0.12)",
            primary: "#2563eb",
            success: "#16a34a",
            danger: "#dc2626",
            warning: "#f59e0b",
        };

    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
        }).start();
    }, []);

    // ✅ FIXED: Camera scan handler
    const handleCameraScan = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert("Permission Denied", "Camera access is needed to scan the menu.");
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            base64: true,
            quality: 0.7,
        });

        if (!result.canceled && result.assets[0].base64) {
            startAIParsing(result.assets[0].base64, 'image');
        }
    };

    // ✅ FIXED: Gallery upload handler
    const handleGalleryUpload = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            base64: true,
            quality: 0.7,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });

        if (!result.canceled && result.assets[0].base64) {
            startAIParsing(result.assets[0].base64, 'image');
        }
    };

    // ✅ FIXED: Start AI parsing
    const startAIParsing = async (source: string, type: 'image' | 'text') => {
        setAiParsing(true);
        setAiImportModalOpen(true);
        setParsedItems([]);

        try {
            console.log("🤖 Starting AI menu parsing...");
            console.log("Source length:", source?.length || 0);

            const data = await parseMenuFromAI(source, type);
            console.log("✅ AI parsed items:", data);

            if (data && data.length > 0) {
                setParsedItems(data);
                Alert.alert(
                    "✅ Menu Scanned Successfully",
                    `Found ${data.length} items on your menu. Please review them before saving.`,
                    [{ text: "Review Items" }]
                );
            } else {
                setAiImportModalOpen(false);
                Alert.alert(
                    "No Items Found",
                    "AI couldn't detect any menu items. Please try:\n\n• Taking a clearer photo\n• Ensuring good lighting\n• Making sure the menu text is readable\n• Taking a closer shot of the menu",
                    [{ text: "OK" }]
                );
            }
        } catch (error) {
            console.error("AI parsing error:", error);
            setAiImportModalOpen(false);

            Alert.alert(
                "AI Parsing Failed",
                "Could not read the menu. Please try:\n\n• Taking a clearer photo\n• Better lighting\n• Making sure the text is sharp\n• Taking multiple photos of different sections",
                [{ text: "OK" }]
            );
        } finally {
            setAiParsing(false);
        }
    };

    // ✅ Save parsed items
    const saveParsedItems = async () => {
        if (!user || parsedItems.length === 0) return;
        setSaving(true);
        try {
            const uid = user.uid;
            const ref = collection(db, "users", uid, "menuItems");

            for (const item of parsedItems) {
                await addDoc(ref, {
                    ...item,
                    isAvailable: true,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            }

            setAiImportModalOpen(false);
            setParsedItems([]);
            Alert.alert("✨ Menu Synced", `Successfully added ${parsedItems.length} items to your menu!`);
        } catch (error) {
            console.error("Save parsed items failed:", error);
            Alert.alert("Error", "Failed to save menu items.");
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (!user) return;

        const uid = user.uid;
        const ref = collection(db, "users", uid, "menuItems");

        const unsub = onSnapshot(ref, (snap) => {
            const list = snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as any),
            })) as MenuItem[];

            list.sort((a: any, b: any) => {
                const at = a?.createdAt?.toMillis?.() ?? 0;
                const bt = b?.createdAt?.toMillis?.() ?? 0;
                return bt - at;
            });

            setItems(list);
        });

        return () => unsub();
    }, [user]);

    const itemsByCategory = useMemo(() => {
        const map: Record<Category, MenuItem[]> = {
            breakfast: [],
            lunch: [],
            dinner: [],
            beverages: [],
            desserts: [],
            snacks: [],
        };
        for (const it of items) {
            if (map[it.category]) {
                map[it.category].push(it);
            }
        }
        return map;
    }, [items]);

    const openAddDish = (category?: Category) => {
        setEditId(null);
        setFormCategory(category ?? "breakfast");
        setName("");
        setDescription("");
        setPriceText("");
        setIsAvailable(true);
        setAiError(null);
        setAiHistory([]);
        setCurrentAiIndex(-1);
        setOriginalText({ title: "", description: "" });
        hasAIGeneratedRef.current = false;
        aiRewriteAttemptRef.current = 0;
        setRewriteCount(0);
        setModalOpen(true);
    };

    const openEditDish = (dish: MenuItem) => {
        setEditId(dish.id);
        setFormCategory(dish.category);
        setName(dish.name ?? "");
        setDescription(dish.description ?? "");
        setPriceText(
            typeof dish.price === "number" && Number.isFinite(dish.price)
                ? String(dish.price)
                : ""
        );
        setIsAvailable(dish.isAvailable !== false);
        setAiError(null);
        setAiHistory([]);
        setCurrentAiIndex(-1);
        setOriginalText({ title: dish.name ?? "", description: dish.description ?? "" });
        hasAIGeneratedRef.current = false;
        aiRewriteAttemptRef.current = 0;
        setRewriteCount(0);
        setModalOpen(true);
    };

    const closeModal = () => {
        if (saving || rewriting) return;
        setModalOpen(false);
        setAiError(null);
    };

    const closeAIRewriteModal = () => {
        setShowAIRewriteModal(false);
        setUserTitleHints("");
        setUserDescriptionHints("");
    };

    const handleAIRewrite = () => {
        if (!name.trim()) {
            Alert.alert("Error", "Please enter a dish name first");
            return;
        }
        setShowAIRewriteModal(true);
    };

    const storeOriginalText = () => {
        if (aiHistory.length === 0 && !hasAIGeneratedRef.current) {
            setOriginalText({
                title: name,
                description: description
            });
        }
    };

    const performAIRewrite = async (userPreferences?: any, isFreshRewrite = false) => {
        if (!name.trim()) return;

        setRewriting(true);
        setAiError(null);

        storeOriginalText();

        try {
            aiRewriteAttemptRef.current++;

            if (isFreshRewrite && aiHistory.length > 0) {
                setAiHistory([]);
                setCurrentAiIndex(-1);
                hasAIGeneratedRef.current = false;
            }

            const result = await generateAIMenuText(
                name,
                formCategory,
                userPreferences
            );

            const newAiEntry = {
                title: result.title,
                description: result.description
            };

            const updatedHistory = [...aiHistory, newAiEntry];
            setAiHistory(updatedHistory);
            setCurrentAiIndex(updatedHistory.length - 1);

            setName(result.title);
            setDescription(result.description);
            hasAIGeneratedRef.current = true;
            setRewriteCount(prev => prev + 1);

            Alert.alert(
                "✨ AI Rewrite Complete",
                `Dish has been enhanced with AI. (Rewrite #${aiRewriteAttemptRef.current})`,
                [{ text: "OK" }]
            );

        } catch (error) {
            console.error('AI rewrite failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'AI service is temporarily unavailable. Using local templates instead.';
            setAiError(errorMessage);

            const localResult = generateLocalFallback(name, formCategory, userPreferences, aiRewriteAttemptRef.current);

            const newAiEntry = {
                title: localResult.title,
                description: localResult.description
            };

            const updatedHistory = [...aiHistory, newAiEntry];
            setAiHistory(updatedHistory);
            setCurrentAiIndex(updatedHistory.length - 1);

            setName(localResult.title);
            setDescription(localResult.description);
            hasAIGeneratedRef.current = true;
            setRewriteCount(prev => prev + 1);

            Alert.alert(
                "AI Service Note",
                "Using local templates. Your dish has been enhanced with premium names and descriptions.",
                [{ text: "OK" }]
            );
        } finally {
            setRewriting(false);
            if (userPreferences) {
                setShowAIRewriteModal(false);
            }
        }
    };

    const handleFreshRewrite = async () => {
        if (!name.trim()) {
            Alert.alert("Error", "Please enter a dish name first");
            return;
        }

        if (aiHistory.length > 0) {
            setAiHistory([]);
            setCurrentAiIndex(-1);
            hasAIGeneratedRef.current = false;
        }

        await performAIRewrite(null, true);
    };

    const handleCustomAIRewrite = async () => {
        if (!name.trim()) {
            Alert.alert("Error", "Please enter a dish name first");
            return;
        }

        const userPreferences = {
            titleElements: userTitleHints.trim(),
            descriptionElements: userDescriptionHints.trim()
        };

        await performAIRewrite(userPreferences);
    };

    const handleQuickAIRewrite = async () => {
        if (!name.trim()) {
            Alert.alert("Error", "Please enter a dish name first");
            return;
        }

        await performAIRewrite();
    };

    const navigateAIHistory = (direction: number) => {
        if (aiHistory.length === 0) return;

        let newIndex = currentAiIndex + direction;
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= aiHistory.length) newIndex = aiHistory.length - 1;

        const historyItem = aiHistory[newIndex];
        setName(historyItem.title);
        setDescription(historyItem.description);
        setCurrentAiIndex(newIndex);
    };

    const handleRemoveAI = () => {
        if (aiHistory.length > 0 || hasAIGeneratedRef.current) {
            if (originalText.title) {
                setName(originalText.title);
            }
            if (originalText.description) {
                setDescription(originalText.description);
            }

            setAiHistory([]);
            setCurrentAiIndex(-1);
            hasAIGeneratedRef.current = false;
            aiRewriteAttemptRef.current = 0;
            setRewriteCount(0);

            Alert.alert(
                "AI Removed",
                "Restored original dish name and description.",
                [{ text: "OK" }]
            );
        }
    };

    const generateLocalFallback = (dishName: string, category: Category, userPreferences?: any, rewriteNumber = 0) => {
        const namePrefixes = [
            ["Artisan", "Signature", "Premium", "Gourmet"],
            ["Traditional", "Classic", "Authentic", "Heritage"],
            ["Chef's Special", "Executive", "Deluxe", "Royal"],
            ["Organic", "Fresh", "Natural", "Farm-to-Table"]
        ];

        const descTemplates = [
            `Delicious ${dishName.toLowerCase()} crafted with care and premium ingredients.`,
            `Our signature ${dishName.toLowerCase()} prepared using traditional methods.`,
            `Experience the authentic taste of ${dishName.toLowerCase()} with our special recipe.`,
            `Freshly prepared ${dishName.toLowerCase()} made with the finest ingredients available.`
        ];

        const prefixSet = namePrefixes[rewriteNumber % namePrefixes.length];
        const descTemplate = descTemplates[rewriteNumber % descTemplates.length];

        const randomPrefix = prefixSet[Math.floor(Math.random() * prefixSet.length)];

        let title = `${randomPrefix} ${dishName}`;
        let description = descTemplate;

        if (userPreferences) {
            if (userPreferences.titleElements) {
                const hints = userPreferences.titleElements.split(',').map((h: string) => h.trim()).filter((h: string) => h);
                if (hints.length > 0) {
                    const randomHint = hints[Math.floor(Math.random() * hints.length)];
                    title = `${randomHint} ${dishName}`;
                }
            }
            if (userPreferences.descriptionElements) {
                const descHints = userPreferences.descriptionElements.split(',').map((h: string) => h.trim()).filter((h: string) => h);
                if (descHints.length > 0) {
                    const randomDescHint = descHints[Math.floor(Math.random() * descHints.length)];
                    description = `${dishName} prepared ${randomDescHint}. Made with premium ingredients.`;
                }
            }
        }

        if (rewriteNumber > 0) {
            description = description.replace('.', ' (Freshly rewritten).');
        }

        return { title, description };
    };

    const saveDish = async () => {
        if (!user) {
            Alert.alert("Login required", "Please login again.");
            return;
        }

        const trimmedName = name.trim();
        if (!trimmedName) {
            Alert.alert("Invalid", "Dish name is required.");
            return;
        }

        let price: number | null = null;
        if (priceText.trim()) {
            const n = Number(priceText);
            if (!Number.isFinite(n) || n < 0) {
                Alert.alert("Invalid", "Price must be a valid number.");
                return;
            }
            price = n;
        }

        setSaving(true);
        try {
            const uid = user.uid;

            if (editId) {
                const ref = doc(db, "users", uid, "menuItems", editId);
                await updateDoc(ref, {
                    category: formCategory,
                    name: trimmedName,
                    description: description.trim() || "",
                    price: price,
                    isAvailable: !!isAvailable,
                    updatedAt: serverTimestamp(),
                });
            } else {
                const ref = collection(db, "users", uid, "menuItems");
                await addDoc(ref, {
                    category: formCategory,
                    name: trimmedName,
                    description: description.trim() || "",
                    price: price,
                    isAvailable: !!isAvailable,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            }

            setModalOpen(false);
            setAiError(null);
            setAiHistory([]);
            setCurrentAiIndex(-1);
            hasAIGeneratedRef.current = false;
            aiRewriteAttemptRef.current = 0;
            setRewriteCount(0);
        } catch (e) {
            console.error("Save dish failed:", e);
            Alert.alert("Error", "Failed to save dish. Check internet / permissions.");
        } finally {
            setSaving(false);
        }
    };

    const toggleAvailability = async (dish: MenuItem) => {
        if (!user) return;
        try {
            const uid = user.uid;
            await updateDoc(doc(db, "users", uid, "menuItems", dish.id), {
                isAvailable: !(dish.isAvailable !== false),
                updatedAt: serverTimestamp(),
            });
        } catch (e) {
            console.error("Toggle availability failed:", e);
            Alert.alert("Error", "Failed to update availability.");
        }
    };

    // ✅ FIXED: Delete dish with web confirm modal
    const deleteDish = async (dish: MenuItem) => {
        if (!user) return;

        askConfirm({
            title: "Delete Dish",
            message: `Delete "${dish.name}"? This action cannot be undone.`,
            confirmText: "Delete",
            variant: "destructive",
            onConfirm: async () => {
                try {
                    const uid = user.uid;
                    await deleteDoc(doc(db, "users", uid, "menuItems", dish.id));
                    Alert.alert("✅ Deleted", `"${dish.name}" has been removed.`);
                } catch (e) {
                    console.error("Delete dish failed:", e);
                    Alert.alert("Error", "Failed to delete dish.");
                }
            },
        });
    };

    const renderCategory = (cat: (typeof CATEGORIES)[number]) => {
        const list = itemsByCategory[cat.key];
        const expanded = expandedCategory === cat.key;

        return (
            <View key={cat.key} style={[styles.categoryWrap, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                <Pressable
                    onPress={() => setExpandedCategory(expanded ? null : cat.key)}
                    style={({ pressed }) => [
                        styles.categoryCard,
                        { borderLeftColor: cat.accent },
                        pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
                    ]}
                >
                    <View style={[styles.emojiWrap, { backgroundColor: `${cat.accent}15` }]}>
                        <Text style={styles.emoji}>{cat.icon}</Text>
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.categoryTitle, { color: theme.textMain }]}>{cat.title}</Text>
                        <Text style={[styles.categorySub, { color: theme.textMuted }]} numberOfLines={1}>
                            {cat.subtitle}
                        </Text>
                    </View>

                    <View style={styles.categoryRight}>
                        <View style={[styles.countPill, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                            <Text style={[styles.countText, { color: cat.accent }]}>
                                {list.length}
                            </Text>
                        </View>
                        <Ionicons
                            name={expanded ? "chevron-up" : "chevron-down"}
                            size={18}
                            color={theme.textMuted}
                        />
                    </View>
                </Pressable>

                {expanded ? (
                    <View style={[styles.expandedArea, { backgroundColor: theme.glass }]}>
                        <View style={styles.expandedHeader}>
                            <Text style={[styles.expandedTitle, { color: theme.textMuted }]}>Dishes</Text>

                            <Pressable
                                onPress={() => openAddDish(cat.key)}
                                style={({ pressed }) => [
                                    styles.addSmallBtn,
                                    { backgroundColor: cat.accent },
                                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                                ]}
                            >
                                <Ionicons name="add" size={16} color="#fff" />
                                <Text style={styles.addSmallText}>Add Dish</Text>
                            </Pressable>
                        </View>

                        {list.length === 0 ? (
                            <View style={styles.emptyDishBox}>
                                <Ionicons name="fast-food-outline" size={20} color={theme.textMuted} />
                                <Text style={[styles.emptyDishText, { color: theme.textMuted }]}>
                                    No {cat.title.toLowerCase()} dishes yet.
                                </Text>
                            </View>
                        ) : (
                            list.map((dish) => {
                                const available = dish.isAvailable !== false;
                                return (
                                    <View key={dish.id} style={[styles.dishCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                                        <View style={styles.dishTop}>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={[styles.dishName, { color: theme.textMain }]} numberOfLines={1}>
                                                    {dish.name}
                                                </Text>
                                                {dish.description ? (
                                                    <Text style={[styles.dishDesc, { color: theme.textMuted }]} numberOfLines={2}>
                                                        {dish.description}
                                                    </Text>
                                                ) : null}
                                            </View>

                                            <View style={styles.dishPriceWrap}>
                                                <Text style={[styles.dishPrice, { color: cat.accent }]}>
                                                    {typeof dish.price === "number" ? `₹${dish.price}` : "—"}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.dishBottom}>
                                            <Pressable
                                                onPress={() => toggleAvailability(dish)}
                                                style={({ pressed }) => [
                                                    styles.availPill,
                                                    {
                                                        backgroundColor: available
                                                            ? "rgba(22, 163, 74, 0.10)"
                                                            : "rgba(220, 38, 38, 0.10)",
                                                        borderColor: available
                                                            ? "rgba(22, 163, 74, 0.25)"
                                                            : "rgba(220, 38, 38, 0.25)",
                                                    },
                                                    pressed && { opacity: 0.9 },
                                                ]}
                                            >
                                                <View
                                                    style={[
                                                        styles.availDot,
                                                        { backgroundColor: available ? theme.success : theme.danger },
                                                    ]}
                                                />
                                                <Text
                                                    style={[
                                                        styles.availText,
                                                        { color: available ? theme.success : theme.danger },
                                                    ]}
                                                >
                                                    {available ? "Available" : "Unavailable"}
                                                </Text>
                                            </Pressable>

                                            <View style={styles.actionsRow}>
                                                <Pressable
                                                    onPress={() => openEditDish(dish)}
                                                    style={({ pressed }) => [
                                                        styles.iconActionBtn,
                                                        { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                                                        pressed && { opacity: 0.85 },
                                                    ]}
                                                    hitSlop={10}
                                                >
                                                    <Ionicons name="create-outline" size={18} color={theme.primary} />
                                                </Pressable>

                                                <Pressable
                                                    onPress={() => deleteDish(dish)}
                                                    style={({ pressed }) => [
                                                        styles.iconActionBtn,
                                                        { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                                                        pressed && { opacity: 0.85 },
                                                    ]}
                                                    hitSlop={10}
                                                >
                                                    <Ionicons name="trash-outline" size={18} color={theme.danger} />
                                                </Pressable>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}

                        <Pressable
                            onPress={() => openAddDish(cat.key)}
                            style={({ pressed }) => [
                                styles.addBigBtn,
                                { backgroundColor: cat.accent },
                                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
                            ]}
                        >
                            <Ionicons name="add-circle-outline" size={18} color="#fff" />
                            <Text style={styles.addBigText}>More Dishes</Text>
                        </Pressable>
                    </View>
                ) : null}
            </View>
        );
    };

    if (!user) {
        return (
            <SafeAreaView style={[styles.safe, { backgroundColor: theme.bgMain }]}>
                <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
                    <Ionicons name="lock-closed-outline" size={26} color={theme.textMuted} />
                    <Text style={{ marginTop: 10, color: theme.textMuted, fontWeight: "800" }}>
                        Please login to manage Menu
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.bgMain }]}>
            {/* ✅ CONFIRM MODAL (Web delete fix) */}
            <Modal visible={confirm.open} transparent animationType="fade" onRequestClose={closeConfirm}>
                <View style={styles.confirmOverlay}>
                    <View style={[styles.confirmCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                        <View style={styles.confirmHeader}>
                            <View style={[styles.confirmIcon, confirm.variant === "destructive" && styles.confirmIconDanger]}>
                                <Ionicons
                                    name={confirm.variant === "destructive" ? "warning-outline" : "help-circle-outline"}
                                    size={20}
                                    color={confirm.variant === "destructive" ? theme.danger : theme.primary}
                                />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={[styles.confirmTitle, { color: theme.textMain }]} numberOfLines={2}>
                                    {confirm.title}
                                </Text>
                            </View>
                        </View>

                        <Text style={[styles.confirmMessage, { color: theme.textMuted }]}>{confirm.message}</Text>

                        <View style={styles.confirmActions}>
                            <Pressable
                                onPress={closeConfirm}
                                disabled={confirmBusy}
                                style={({ pressed }) => [
                                    styles.confirmBtn,
                                    styles.confirmBtnGhost,
                                    { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                                    pressed && !confirmBusy && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                                ]}
                            >
                                <Text style={[styles.confirmBtnGhostText, { color: theme.textMuted }]}>Cancel</Text>
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
                                    { backgroundColor: confirm.variant === "destructive" ? theme.danger : theme.primary },
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

            {/* Add/Edit Modal */}
            <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={closeModal}>
                <View style={styles.modalOverlay}>
                    <View style={[
                        styles.modalCard,
                        { backgroundColor: theme.bgCard, borderColor: theme.glassBorder },
                        isWide && { maxWidth: 700, alignSelf: 'center', width: '100%' }
                    ]}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={[styles.modalIcon, { backgroundColor: `${theme.primary}15` }]}>
                                    <Ionicons name="restaurant-outline" size={18} color={theme.primary} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={[styles.modalTitle, { color: theme.textMain }]} numberOfLines={1}>
                                        {editId ? "Edit Dish" : "Add Dish"}
                                        {rewriteCount > 0 && ` (AI Rewritten ${rewriteCount}×)`}
                                    </Text>
                                    <Text style={[styles.modalSubtitle, { color: theme.textMuted }]} numberOfLines={1}>
                                        {aiError ? "Using local AI templates" : "Category + Name required"}
                                    </Text>
                                </View>
                            </View>

                            <Pressable
                                onPress={closeModal}
                                style={({ pressed }) => [
                                    styles.modalCloseBtn,
                                    { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                                    pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                                ]}
                                disabled={saving || rewriting}
                            >
                                <Ionicons name="close" size={18} color={theme.textMuted} />
                            </Pressable>
                        </View>

                        <ScrollView
                            style={styles.modalBody}
                            contentContainerStyle={{ paddingBottom: 16 }}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            <Text style={[styles.label, { color: theme.textMain }]}>Category</Text>
                            <View style={styles.chipsRow}>
                                {CATEGORIES.map((c) => {
                                    const active = formCategory === c.key;
                                    return (
                                        <Pressable
                                            key={c.key}
                                            onPress={() => setFormCategory(c.key)}
                                            style={({ pressed }) => [
                                                styles.chip,
                                                { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                                                active && { backgroundColor: `${c.accent}15`, borderColor: `${c.accent}40` },
                                                pressed && { opacity: 0.9 },
                                            ]}
                                        >
                                            <Text style={[styles.chipText, { color: theme.textMuted }, active && { color: c.accent }]}>
                                                {c.title}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <Text style={[styles.label, { color: theme.textMain }]}>Dish Name *</Text>
                            <View style={[styles.inputWrap, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                                <View style={styles.inputIcon}>
                                    <Ionicons name="fast-food-outline" size={18} color={theme.primary} />
                                </View>
                                <TextInput
                                    value={name}
                                    onChangeText={(text) => {
                                        setName(text);
                                        if (aiHistory.length > 0 || hasAIGeneratedRef.current) {
                                            setAiHistory([]);
                                            setCurrentAiIndex(-1);
                                            hasAIGeneratedRef.current = false;
                                        }
                                    }}
                                    placeholder="e.g., Poha, Idli, Thali"
                                    placeholderTextColor={theme.textMuted}
                                    style={[styles.input, { color: theme.textMain }]}
                                    autoCorrect={false}
                                />
                            </View>

                            <Text style={[styles.label, { color: theme.textMain }]}>Price (₹) (Optional)</Text>
                            <View style={[styles.inputWrap, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                                <View style={styles.inputIcon}>
                                    <Ionicons name="cash-outline" size={18} color={theme.success} />
                                </View>
                                <TextInput
                                    value={priceText}
                                    onChangeText={setPriceText}
                                    placeholder="0.00"
                                    placeholderTextColor={theme.textMuted}
                                    style={[styles.input, { color: theme.textMain }]}
                                    keyboardType="numeric"
                                />
                            </View>

                            <View style={styles.labelRow}>
                                <Text style={[styles.label, { color: theme.textMain }]}>Description</Text>

                                {aiHistory.length > 0 && (
                                    <View style={[styles.historyNav, { backgroundColor: theme.glass }]}>
                                        <Pressable
                                            onPress={() => navigateAIHistory(-1)}
                                            style={[styles.histBtn, currentAiIndex <= 0 && styles.histBtnDisabled]}
                                            disabled={currentAiIndex <= 0}
                                        >
                                            <Ionicons name="chevron-back" size={12} color={currentAiIndex <= 0 ? theme.textMuted : theme.textMain} />
                                        </Pressable>
                                        <Text style={[styles.histText, { color: theme.textMain }]}>{currentAiIndex + 1}/{aiHistory.length}</Text>
                                        <Pressable
                                            onPress={() => navigateAIHistory(1)}
                                            style={[styles.histBtn, currentAiIndex >= aiHistory.length - 1 && styles.histBtnDisabled]}
                                            disabled={currentAiIndex >= aiHistory.length - 1}
                                        >
                                            <Ionicons name="chevron-forward" size={12} color={currentAiIndex >= aiHistory.length - 1 ? theme.textMuted : theme.textMain} />
                                        </Pressable>
                                    </View>
                                )}

                                <Pressable
                                    onPress={handleAIRewrite}
                                    style={({ pressed }) => [
                                        styles.aiBtnSmall,
                                        pressed && { opacity: 0.8 },
                                        rewriting && { opacity: 0.6 }
                                    ]}
                                    disabled={rewriting}
                                >
                                    {rewriting ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <>
                                            <Ionicons name="sparkles" size={12} color="#fff" />
                                            <Text style={styles.aiBtnText}>AI Rewrite</Text>
                                        </>
                                    )}
                                </Pressable>
                            </View>

                            <View style={[styles.inputWrap, styles.textAreaWrap, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                                <TextInput
                                    value={description}
                                    onChangeText={(text) => {
                                        setDescription(text);
                                    }}
                                    placeholder="Ingredients, preparation method..."
                                    placeholderTextColor={theme.textMuted}
                                    style={[styles.textArea, { color: theme.textMain }]}
                                    multiline
                                    textAlignVertical="top"
                                />
                            </View>

                            <View style={[styles.switchRow, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                                <View>
                                    <Text style={[styles.switchLabel, { color: theme.textMain }]}>Available</Text>
                                    <Text style={[styles.switchSub, { color: theme.textMuted }]}>Show this item in guest menu</Text>
                                </View>
                                <Switch
                                    value={isAvailable}
                                    onValueChange={setIsAvailable}
                                    trackColor={{ false: theme.glassBorder, true: `${theme.primary}60` }}
                                    thumbColor={isAvailable ? theme.primary : "#F3F4F6"}
                                />
                            </View>

                            {aiError && (
                                <View style={styles.errorBox}>
                                    <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
                                    <Text style={[styles.errorText, { color: theme.danger }]}>
                                        {aiError}
                                    </Text>
                                </View>
                            )}

                            <View style={{ height: 20 }} />
                        </ScrollView>

                        <View style={[styles.modalFooter, { borderTopColor: theme.glassBorder }]}>
                            <Pressable
                                onPress={closeModal}
                                style={({ pressed }) => [
                                    styles.btnCancel,
                                    { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                                    pressed && { backgroundColor: theme.glass },
                                ]}
                                disabled={saving || rewriting}
                            >
                                <Text style={[styles.btnCancelText, { color: theme.textMuted }]}>Cancel</Text>
                            </Pressable>

                            <Pressable
                                onPress={saveDish}
                                style={({ pressed }) => [
                                    styles.btnSave,
                                    { backgroundColor: theme.primary },
                                    pressed && { opacity: 0.9 },
                                    saving && { opacity: 0.7 },
                                ]}
                                disabled={saving || rewriting}
                            >
                                {saving ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.btnSaveText}>
                                        {editId ? "Save Changes" : "Create Dish"}
                                    </Text>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* AI Rewrite Options Modal */}
            <Modal visible={showAIRewriteModal} animationType="fade" transparent onRequestClose={closeAIRewriteModal}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, styles.aiModalCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                        <View style={styles.modalHeader}>
                            <View style={styles.headerLeft}>
                                <View style={styles.aiIconBadge}>
                                    <Ionicons name="sparkles" size={16} color="#7C3AED" />
                                </View>
                                <Text style={[styles.modalTitle, { color: theme.textMain }]}>AI Magic Rewrite</Text>
                            </View>
                            <Pressable onPress={closeAIRewriteModal} style={[styles.closeBtn, { backgroundColor: theme.glass }]}>
                                <Ionicons name="close" size={20} color={theme.textMuted} />
                            </Pressable>
                        </View>

                        <ScrollView style={styles.modalBody}>
                            <Text style={[styles.label, { marginTop: 0, color: theme.textMain }]}>How should we enhance "{name}"?</Text>

                            <View style={styles.aiOptionCard}>
                                <Pressable style={styles.aiOptionBtn} onPress={handleQuickAIRewrite}>
                                    <View style={styles.aiOptionIcon}>
                                        <Ionicons name="flash" size={20} color="#F59E0B" />
                                    </View>
                                    <View style={styles.aiOptionContent}>
                                        <Text style={styles.aiOptionTitle}>Quick Enhance</Text>
                                        <Text style={styles.aiOptionDesc}>Instantly make it sound generic but premium</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
                                </Pressable>
                            </View>

                            <View style={styles.divider}>
                                <Text style={styles.dividerText}>OR CUSTOMIZE</Text>
                            </View>

                            <Text style={[styles.subLabel, { color: theme.textMain }]}>Title Keywords (Optional)</Text>
                            <TextInput
                                style={[styles.aiInput, { backgroundColor: theme.glass, borderColor: theme.glassBorder, color: theme.textMain }]}
                                placeholder="e.g., Spicy, Homemade, Crispy"
                                placeholderTextColor={theme.textMuted}
                                value={userTitleHints}
                                onChangeText={setUserTitleHints}
                            />

                            <Text style={[styles.subLabel, { color: theme.textMain }]}>Description Details (Optional)</Text>
                            <TextInput
                                style={[styles.aiInput, { backgroundColor: theme.glass, borderColor: theme.glassBorder, color: theme.textMain }]}
                                placeholder="e.g., served with chutney, made in ghee"
                                placeholderTextColor={theme.textMuted}
                                value={userDescriptionHints}
                                onChangeText={setUserDescriptionHints}
                            />

                            <Pressable
                                style={({ pressed }) => [
                                    styles.generateBtn,
                                    pressed && { opacity: 0.9 },
                                    (!userTitleHints && !userDescriptionHints) && { backgroundColor: theme.glassBorder }
                                ]}
                                onPress={handleCustomAIRewrite}
                                disabled={!userTitleHints && !userDescriptionHints}
                            >
                                <Ionicons name="sparkles" size={18} color={(!userTitleHints && !userDescriptionHints) ? theme.textMuted : "#fff"} />
                                <Text style={[
                                    styles.generateBtnText,
                                    (!userTitleHints && !userDescriptionHints) && { color: theme.textMuted }
                                ]}>Generate Custom</Text>
                            </Pressable>

                            <View style={[styles.quickActions, { borderTopColor: theme.glassBorder }]}>
                                <Pressable style={styles.textBtn} onPress={handleFreshRewrite}>
                                    <Ionicons name="refresh" size={14} color={theme.textMain} />
                                    <Text style={[styles.textBtnColor, { color: theme.textMain }]}>Fresh Rewrite (Reset)</Text>
                                </Pressable>

                                {(aiHistory.length > 0 || hasAIGeneratedRef.current) && (
                                    <Pressable style={styles.textBtn} onPress={() => {
                                        handleRemoveAI();
                                        closeAIRewriteModal();
                                    }}>
                                        <Ionicons name="trash-outline" size={14} color={theme.danger} />
                                        <Text style={[styles.textBtnColor, { color: theme.danger }]}>Revert to Original</Text>
                                    </Pressable>
                                )}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* AI Menu Import Modal */}
            <Modal visible={aiImportModalOpen} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { height: '80%', backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={[styles.modalIcon, { backgroundColor: '#7C3AED15' }]}>
                                    <Ionicons name="sparkles" size={18} color="#7C3AED" />
                                </View>
                                <View>
                                    <Text style={[styles.modalTitle, { color: theme.textMain }]}>AI Menu Sync</Text>
                                    <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>Review detected dishes</Text>
                                </View>
                            </View>
                            {!aiParsing && (
                                <Pressable onPress={() => setAiImportModalOpen(false)} style={[styles.modalCloseBtn, { backgroundColor: theme.glass }]}>
                                    <Ionicons name="close" size={18} color={theme.textMuted} />
                                </Pressable>
                            )}
                        </View>

                        <View style={{ flex: 1, padding: 20 }}>
                            {aiParsing ? (
                                <View style={styles.parsingContainer}>
                                    <ActivityIndicator size="large" color="#7C3AED" />
                                    <Text style={[styles.parsingTitle, { color: theme.textMain }]}>AI is reading your menu...</Text>
                                    <Text style={[styles.parsingDesc, { color: theme.textMuted }]}>This will only take a moment. We're categorizing your dishes and generating descriptions.</Text>
                                </View>
                            ) : (
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    {parsedItems.map((item, index) => (
                                        <View key={index} style={[styles.parsedItemCard, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                                            <View style={styles.parsedItemHeader}>
                                                <Text style={[styles.parsedItemName, { color: theme.textMain }]}>{item.name}</Text>
                                                <Text style={styles.parsedItemPrice}>₹{item.price || '--'}</Text>
                                            </View>
                                            <Text style={[styles.parsedItemDesc, { color: theme.textMuted }]}>{item.description}</Text>
                                            <View style={styles.parsedBadgeRow}>
                                                <View style={[styles.parsedBadge, { backgroundColor: '#2563EB15' }]}>
                                                    <Text style={[styles.parsedBadgeText, { color: '#2563EB' }]}>{item.category}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    ))}
                                    <View style={{ height: 20 }} />
                                </ScrollView>
                            )}
                        </View>

                        {!aiParsing && parsedItems.length > 0 && (
                            <View style={[styles.modalFooter, { borderTopColor: theme.glassBorder }]}>
                                <Pressable
                                    onPress={() => setAiImportModalOpen(false)}
                                    style={[styles.btnCancel, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
                                >
                                    <Text style={[styles.btnCancelText, { color: theme.textMuted }]}>Discard</Text>
                                </Pressable>
                                <Pressable
                                    onPress={saveParsedItems}
                                    style={[styles.btnSave, { backgroundColor: '#7C3AED' }]}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Text style={styles.btnSaveText}>Save All {parsedItems.length} Items</Text>
                                    )}
                                </Pressable>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
                <View style={[styles.header, { backgroundColor: theme.bgCard }]}>
                    <View style={styles.headerTop}>
                        <View>
                            <Text style={[styles.headerTitle, { color: theme.textMain }]}>Food Menu</Text>
                            <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>Manage restaurant items</Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <Pressable
                                onPress={() => setIsDark(!isDark)}
                                style={({ pressed }) => [
                                    styles.themeToggle,
                                    { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                                    pressed && { opacity: 0.9 }
                                ]}
                            >
                                <Ionicons
                                    name={isDark ? "sunny-outline" : "moon-outline"}
                                    size={20}
                                    color={theme.primary}
                                />
                            </Pressable>

                            <Pressable
                                onPress={handleCameraScan}
                                style={({ pressed }) => [
                                    styles.scanBtn,
                                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
                                ]}
                            >
                                <Ionicons name="camera" size={18} color="#fff" />
                                <Text style={styles.scanBtnText}>Scan Menu</Text>
                            </Pressable>
                        </View>
                    </View>

                    <View style={[styles.importOptions, { backgroundColor: theme.glass }]}>
                        <Pressable
                            onPress={handleGalleryUpload}
                            style={({ pressed }) => [
                                styles.importOption,
                                pressed && { backgroundColor: theme.glass }
                            ]}
                        >
                            <Ionicons name="images-outline" size={16} color={theme.textMain} />
                            <Text style={[styles.importOptionText, { color: theme.textMain }]}>Upload Photo</Text>
                        </Pressable>
                        <View style={[styles.vDivider, { backgroundColor: theme.glassBorder }]} />
                        <Pressable
                            onPress={() => Alert.alert("PDF Support", "Coming soon! For best results, please take a clear photo of your menu.")}
                            style={({ pressed }) => [
                                styles.importOption,
                                pressed && { backgroundColor: theme.glass }
                            ]}
                        >
                            <Ionicons name="document-text-outline" size={16} color={theme.textMain} />
                            <Text style={[styles.importOptionText, { color: theme.textMain }]}>PDF Menu</Text>
                        </Pressable>
                    </View>
                </View>

                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {CATEGORIES.map((cat) => renderCategory(cat))}
                </ScrollView>
            </Animated.View>

            {saving && (
                <View style={styles.loadingOverlay}>
                    <View style={[styles.loadingBox, { backgroundColor: theme.bgCard }]}>
                        <ActivityIndicator size="large" color={theme.primary} />
                        <Text style={[styles.loadingText, { color: theme.textMain }]}>Saving...</Text>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
    },
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 40,
        paddingBottom: 20,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: "900",
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 15,
        marginTop: 4,
        fontWeight: '600',
    },
    themeToggle: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
    },
    scanBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#7C3AED',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        gap: 6,
        shadowColor: "#7C3AED",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 4,
    },
    scanBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '800',
    },
    importOptions: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        padding: 4,
        borderWidth: 1.5,
    },
    importOption: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        gap: 6,
        borderRadius: 10,
    },
    importOptionText: {
        fontSize: 13,
        fontWeight: '700',
    },
    vDivider: {
        width: 1.5,
        height: 16,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 100,
    },
    categoryWrap: {
        marginBottom: 16,
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1.5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    categoryCard: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderLeftWidth: 4,
    },
    emojiWrap: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 14,
    },
    emoji: {
        fontSize: 22,
    },
    categoryTitle: {
        fontSize: 17,
        fontWeight: "800",
        marginBottom: 2,
    },
    categorySub: {
        fontSize: 13,
        fontWeight: '600',
    },
    categoryRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    countPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1.5,
    },
    countText: {
        fontSize: 12,
        fontWeight: "900",
    },
    expandedArea: {
        borderTopWidth: 1.5,
        paddingBottom: 10,
    },
    expandedHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    expandedTitle: {
        fontSize: 14,
        fontWeight: "900",
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    addSmallBtn: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        gap: 4,
    },
    addSmallText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "800",
    },
    emptyDishBox: {
        alignItems: "center",
        paddingVertical: 24,
    },
    emptyDishText: {
        fontSize: 14,
        marginTop: 6,
        fontWeight: '700',
    },
    dishCard: {
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1.5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 2,
    },
    dishTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 10,
    },
    dishName: {
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 4,
    },
    dishDesc: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '600',
    },
    dishPriceWrap: {
        marginLeft: 12,
    },
    dishPrice: {
        fontSize: 15,
        fontWeight: "900",
    },
    dishBottom: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    availPill: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1.5,
        gap: 6,
    },
    availDot: {
        width: 6,
        height: 6,
        borderRadius: 4,
    },
    availText: {
        fontSize: 11,
        fontWeight: "800",
    },
    actionsRow: {
        flexDirection: "row",
        gap: 12,
    },
    iconActionBtn: {
        padding: 6,
        borderRadius: 10,
        borderWidth: 1.5,
    },
    addBigBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginHorizontal: 16,
        marginTop: 6,
        paddingVertical: 12,
        borderRadius: 14,
        gap: 6,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 4,
    },
    addBigText: {
        color: "#fff",
        fontWeight: "800",
        fontSize: 14,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
    },
    modalCard: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        height: "90%",
        width: "100%",
        borderWidth: 1.5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 20,
        display: "flex",
        flexDirection: "column",
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
        borderBottomWidth: 1.5,
    },
    modalHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    modalIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: "900",
    },
    modalSubtitle: {
        fontSize: 12,
        fontWeight: '700',
    },
    modalCloseBtn: {
        padding: 6,
        borderRadius: 999,
        borderWidth: 1.5,
    },
    modalBody: {
        flex: 1,
        padding: 20,
    },
    label: {
        fontSize: 13,
        fontWeight: "900",
        marginBottom: 8,
        marginTop: 4,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    chipsRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 20,
        flexWrap: 'wrap',
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1.5,
    },
    chipText: {
        fontSize: 13,
        fontWeight: "700",
    },
    inputWrap: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1.5,
        borderRadius: 14,
        paddingHorizontal: 12,
        marginBottom: 20,
        height: 50,
    },
    inputIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        height: "100%",
        fontSize: 15,
        fontWeight: "600",
    },
    labelRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    aiBtnSmall: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#7C3AED",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        gap: 4,
    },
    aiBtnText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "900",
    },
    textAreaWrap: {
        height: 120,
        alignItems: "flex-start",
        paddingVertical: 12,
    },
    textArea: {
        flex: 1,
        height: "100%",
        fontSize: 15,
        lineHeight: 22,
        fontWeight: '600',
    },
    switchRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        borderRadius: 14,
        borderWidth: 1.5,
        marginBottom: 20,
    },
    switchLabel: {
        fontSize: 15,
        fontWeight: "700",
    },
    switchSub: {
        fontSize: 12,
        marginTop: 2,
        fontWeight: '600',
    },
    errorBox: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FEF2F2",
        padding: 12,
        borderRadius: 10,
        gap: 8,
        marginBottom: 20,
    },
    errorText: {
        fontSize: 13,
        flex: 1,
        fontWeight: '700',
    },
    modalFooter: {
        flexDirection: "row",
        padding: 20,
        borderTopWidth: 1.5,
        gap: 12,
    },
    btnCancel: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1.5,
        alignItems: "center",
        justifyContent: "center",
    },
    btnCancelText: {
        fontSize: 15,
        fontWeight: "800",
    },
    btnSave: {
        flex: 2,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    btnSaveText: {
        fontSize: 15,
        fontWeight: "900",
        color: "#fff",
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999,
    },
    loadingBox: {
        padding: 24,
        borderRadius: 20,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 15,
        fontWeight: "800",
    },
    aiModalCard: {
        height: "auto",
        maxHeight: "85%",
    },
    aiIconBadge: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: "#F3E8FF",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 10,
    },
    headerLeft: {
        flexDirection: "row",
        alignItems: "center",
    },
    closeBtn: {
        padding: 8,
        borderRadius: 999,
    },
    aiOptionCard: {
        marginBottom: 24,
    },
    aiOptionBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFBEB",
        padding: 16,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: "#FCD34D",
    },
    aiOptionIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "#FEF3C7",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    aiOptionContent: {
        flex: 1,
    },
    aiOptionTitle: {
        fontSize: 16,
        fontWeight: "800",
        color: "#92400E",
    },
    aiOptionDesc: {
        fontSize: 12,
        color: "#B45309",
        marginTop: 2,
        fontWeight: '600',
    },
    divider: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
    },
    dividerText: {
        flex: 1,
        textAlign: "center",
        fontSize: 12,
        fontWeight: "900",
        color: "#9CA3AF",
        letterSpacing: 1,
    },
    subLabel: {
        fontSize: 13,
        fontWeight: "700",
        marginBottom: 8,
    },
    aiInput: {
        borderWidth: 1.5,
        borderRadius: 14,
        padding: 12,
        fontSize: 14,
        marginBottom: 16,
        fontWeight: '600',
    },
    generateBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#7C3AED",
        paddingVertical: 14,
        borderRadius: 14,
        gap: 8,
        marginTop: 8,
        marginBottom: 20,
    },
    generateBtnText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "900",
    },
    quickActions: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingTop: 16,
        borderTopWidth: 1.5,
    },
    textBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        padding: 8,
    },
    textBtnColor: {
        fontSize: 13,
        fontWeight: "800",
    },
    historyNav: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 12,
        padding: 2,
        marginRight: 8,
    },
    histBtn: {
        padding: 4,
        paddingHorizontal: 6,
    },
    histBtnDisabled: {
        opacity: 0.5,
    },
    histText: {
        fontSize: 10,
        fontWeight: "800",
        minWidth: 24,
        textAlign: "center",
    },
    parsingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    parsingTitle: {
        fontSize: 20,
        fontWeight: '900',
        marginTop: 20,
        textAlign: 'center',
    },
    parsingDesc: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 10,
        lineHeight: 20,
        fontWeight: '600',
    },
    parsedItemCard: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1.5,
    },
    parsedItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    parsedItemName: {
        fontSize: 16,
        fontWeight: '900',
        flex: 1,
    },
    parsedItemPrice: {
        fontSize: 15,
        fontWeight: '900',
        color: '#059669',
        marginLeft: 8,
    },
    parsedItemDesc: {
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 10,
        fontWeight: '600',
    },
    parsedBadgeRow: {
        flexDirection: 'row',
        gap: 8,
    },
    parsedBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    parsedBadgeText: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    confirmOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        padding: 16,
        justifyContent: "center",
        alignItems: "center",
    },
    confirmCard: {
        width: "100%",
        maxWidth: 520,
        borderRadius: 20,
        borderWidth: 1.5,
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
    },
    confirmMessage: {
        fontSize: 13,
        fontWeight: "600",
        lineHeight: 18,
        marginBottom: 14,
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
        borderWidth: 1.5,
    },
    confirmBtnGhostText: {
        fontWeight: "900",
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
});