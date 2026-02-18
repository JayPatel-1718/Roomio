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
import * as DocumentPicker from 'expo-document-picker';
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

function titleForCategory(category: Category) {
    const found = CATEGORIES.find((c) => c.key === category);
    return found?.title ?? category;
}

export default function MenuScreen() {
    const auth = getAuth();
    const user = auth.currentUser;

    const [items, setItems] = useState<MenuItem[]>([]);
    const [expandedCategory, setExpandedCategory] = useState<Category | null>(
        "breakfast"
    );

    // Modal state (Add/Edit)
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

    const handleGalleryUpload = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            base64: true,
            quality: 0.7,
        });

        if (!result.canceled && result.assets[0].base64) {
            startAIParsing(result.assets[0].base64, 'image');
        }
    };

    const startAIParsing = async (source: string, type: 'image' | 'text') => {
        setAiParsing(true);
        setAiImportModalOpen(true);
        setParsedItems([]);
        try {
            const data = await parseMenuFromAI(source, type);
            setParsedItems(data);
        } catch (error) {
            Alert.alert("AI Error", "Could not parse menu. Please try a clearer photo.");
            setAiImportModalOpen(false);
        } finally {
            setAiParsing(false);
        }
    };

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

    // AI Rewrite states
    const [showAIRewriteModal, setShowAIRewriteModal] = useState(false);
    const [userTitleHints, setUserTitleHints] = useState("");
    const [userDescriptionHints, setUserDescriptionHints] = useState("");
    const [aiError, setAiError] = useState<string | null>(null);

    // Track AI history for the current dish
    const [aiHistory, setAiHistory] = useState<Array<{ title: string, description: string }>>([]);
    const [currentAiIndex, setCurrentAiIndex] = useState(-1);
    const [originalText, setOriginalText] = useState({ title: "", description: "" });

    // Refs for tracking
    const hasAIGeneratedRef = useRef(false);
    const aiRewriteAttemptRef = useRef(0);

    useEffect(() => {
        if (!user) return;

        const uid = user.uid;
        const ref = collection(db, "users", uid, "menuItems");

        const unsub = onSnapshot(ref, (snap) => {
            const list = snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as any),
            })) as MenuItem[];

            // newest first (client-side)
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

    // Store original text before AI generation
    const storeOriginalText = () => {
        if (aiHistory.length === 0 && !hasAIGeneratedRef.current) {
            setOriginalText({
                title: name,
                description: description
            });
        }
    };

    // Perform AI rewrite with fresh generation
    const performAIRewrite = async (userPreferences?: any, isFreshRewrite = false) => {
        if (!name.trim()) return;

        setRewriting(true);
        setAiError(null);

        // Store original text if first time
        storeOriginalText();

        try {
            aiRewriteAttemptRef.current++;

            // Clear previous AI content for fresh rewrite
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

            // Add to AI history
            const newAiEntry = {
                title: result.title,
                description: result.description
            };

            const updatedHistory = [...aiHistory, newAiEntry];
            setAiHistory(updatedHistory);
            setCurrentAiIndex(updatedHistory.length - 1);

            // Update fields with AI result
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

            // Enhanced fallback with variation based on rewrite count
            const localResult = generateLocalFallback(name, formCategory, userPreferences, aiRewriteAttemptRef.current);

            // Add to AI history even for fallbacks
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

    // Fresh rewrite - removes previous AI and generates completely new
    const handleFreshRewrite = async () => {
        if (!name.trim()) {
            Alert.alert("Error", "Please enter a dish name first");
            return;
        }

        // Clear all AI history for fresh start
        if (aiHistory.length > 0) {
            setAiHistory([]);
            setCurrentAiIndex(-1);
            hasAIGeneratedRef.current = false;
        }

        // Perform fresh rewrite without user preferences
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

    // Navigate AI history
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

    // Remove AI and restore original
    const handleRemoveAI = () => {
        if (aiHistory.length > 0 || hasAIGeneratedRef.current) {
            // Restore original text if available, otherwise clear
            if (originalText.title) {
                setName(originalText.title);
            }
            if (originalText.description) {
                setDescription(originalText.description);
            }

            // Clear AI tracking
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

    // Generate local fallback with variations
    const generateLocalFallback = (dishName: string, category: Category, userPreferences?: any, rewriteNumber = 0) => {
        const categoryKey = category.toLowerCase();

        // Different name prefixes based on rewrite number to ensure variation
        const namePrefixes = [
            ["Artisan", "Signature", "Premium", "Gourmet"],
            ["Traditional", "Classic", "Authentic", "Heritage"],
            ["Chef's Special", "Executive", "Deluxe", "Royal"],
            ["Organic", "Fresh", "Natural", "Farm-to-Table"]
        ];

        // Different description templates based on rewrite number
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

        // Apply user preferences if provided
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

        // Add rewrite indicator for fresh rewrites
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
            // Reset AI tracking after save
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

    const deleteDish = async (dish: MenuItem) => {
        if (!user) return;

        Alert.alert("Delete Dish", `Delete "${dish.name}"?`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        const uid = user.uid;
                        await deleteDoc(doc(db, "users", uid, "menuItems", dish.id));
                    } catch (e) {
                        console.error("Delete dish failed:", e);
                        Alert.alert("Error", "Failed to delete dish.");
                    }
                },
            },
        ]);
    };

    const renderCategory = (cat: (typeof CATEGORIES)[number]) => {
        const list = itemsByCategory[cat.key];
        const expanded = expandedCategory === cat.key;

        return (
            <View key={cat.key} style={styles.categoryWrap}>
                {/* Category Card */}
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
                        <Text style={styles.categoryTitle}>{cat.title}</Text>
                        <Text style={styles.categorySub} numberOfLines={1}>
                            {cat.subtitle}
                        </Text>
                    </View>

                    <View style={styles.categoryRight}>
                        <View style={styles.countPill}>
                            <Text style={[styles.countText, { color: cat.accent }]}>
                                {list.length}
                            </Text>
                        </View>
                        <Ionicons
                            name={expanded ? "chevron-up" : "chevron-down"}
                            size={18}
                            color="#9CA3AF"
                        />
                    </View>
                </Pressable>

                {/* Expanded area */}
                {expanded ? (
                    <View style={styles.expandedArea}>
                        <View style={styles.expandedHeader}>
                            <Text style={styles.expandedTitle}>Dishes</Text>

                            <Pressable
                                onPress={() => openAddDish(cat.key)}
                                style={({ pressed }) => [
                                    styles.addSmallBtn,
                                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                                ]}
                            >
                                <Ionicons name="add" size={16} color="#fff" />
                                <Text style={styles.addSmallText}>Add Dish</Text>
                            </Pressable>
                        </View>

                        {list.length === 0 ? (
                            <View style={styles.emptyDishBox}>
                                <Ionicons name="fast-food-outline" size={20} color="#9CA3AF" />
                                <Text style={styles.emptyDishText}>
                                    No {cat.title.toLowerCase()} dishes yet.
                                </Text>
                            </View>
                        ) : (
                            list.map((dish) => {
                                const available = dish.isAvailable !== false;
                                return (
                                    <View key={dish.id} style={styles.dishCard}>
                                        <View style={styles.dishTop}>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={styles.dishName} numberOfLines={1}>
                                                    {dish.name}
                                                </Text>
                                                {dish.description ? (
                                                    <Text style={styles.dishDesc} numberOfLines={2}>
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
                                                        { backgroundColor: available ? "#16A34A" : "#DC2626" },
                                                    ]}
                                                />
                                                <Text
                                                    style={[
                                                        styles.availText,
                                                        { color: available ? "#16A34A" : "#DC2626" },
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
                                                        pressed && { opacity: 0.85 },
                                                    ]}
                                                    hitSlop={10}
                                                >
                                                    <Ionicons name="create-outline" size={18} color="#2563EB" />
                                                </Pressable>

                                                <Pressable
                                                    onPress={() => deleteDish(dish)}
                                                    style={({ pressed }) => [
                                                        styles.iconActionBtn,
                                                        pressed && { opacity: 0.85 },
                                                    ]}
                                                    hitSlop={10}
                                                >
                                                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                                                </Pressable>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}

                        {/* Big button at bottom of expanded list */}
                        <Pressable
                            onPress={() => openAddDish(cat.key)}
                            style={({ pressed }) => [
                                styles.addBigBtn,
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
            <SafeAreaView style={styles.safe}>
                <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
                    <Ionicons name="lock-closed-outline" size={26} color="#9CA3AF" />
                    <Text style={{ marginTop: 10, color: "#6B7280", fontWeight: "800" }}>
                        Please login to manage Menu
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            {/* Add/Edit Modal */}
            <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={closeModal}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={styles.modalIcon}>
                                    <Ionicons name="restaurant-outline" size={18} color="#2563EB" />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.modalTitle} numberOfLines={1}>
                                        {editId ? "Edit Dish" : "Add Dish"}
                                        {rewriteCount > 0 && ` (AI Rewritten ${rewriteCount}×)`}
                                    </Text>
                                    <Text style={styles.modalSubtitle} numberOfLines={1}>
                                        {aiError ? "Using local AI templates" : "Category + Name required"}
                                    </Text>
                                </View>
                            </View>

                            <Pressable
                                onPress={closeModal}
                                style={({ pressed }) => [
                                    styles.modalCloseBtn,
                                    pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                                ]}
                                disabled={saving || rewriting}
                            >
                                <Ionicons name="close" size={18} color="#6B7280" />
                            </Pressable>
                        </View>

                        <ScrollView
                            style={styles.modalBody}
                            contentContainerStyle={{ paddingBottom: 16 }}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            {/* Category chips */}
                            <Text style={styles.label}>Category</Text>
                            <View style={styles.chipsRow}>
                                {CATEGORIES.map((c) => {
                                    const active = formCategory === c.key;
                                    return (
                                        <Pressable
                                            key={c.key}
                                            onPress={() => setFormCategory(c.key)}
                                            style={({ pressed }) => [
                                                styles.chip,
                                                active && { backgroundColor: `${c.accent}15`, borderColor: `${c.accent}40` },
                                                pressed && { opacity: 0.9 },
                                            ]}
                                        >
                                            <Text style={[styles.chipText, active && { color: c.accent }]}>
                                                {c.title}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            {/* Name */}
                            <Text style={styles.label}>Dish Name *</Text>
                            <View style={styles.inputWrap}>
                                <View style={styles.inputIcon}>
                                    <Ionicons name="fast-food-outline" size={18} color="#2563EB" />
                                </View>
                                <TextInput
                                    value={name}
                                    onChangeText={(text) => {
                                        setName(text);
                                        // Clear AI tracking if user manually edits
                                        if (aiHistory.length > 0 || hasAIGeneratedRef.current) {
                                            setAiHistory([]);
                                            setCurrentAiIndex(-1);
                                            hasAIGeneratedRef.current = false;
                                        }
                                    }}
                                    placeholder="e.g., Poha, Idli, Thali"
                                    placeholderTextColor="#9CA3AF"
                                    style={styles.input}
                                    autoCorrect={false}
                                />
                            </View>

                            {/* Price */}
                            <Text style={styles.label}>Price (₹) (Optional)</Text>
                            <View style={styles.inputWrap}>
                                <View style={styles.inputIcon}>
                                    <Ionicons name="cash-outline" size={18} color="#16A34A" />
                                </View>
                                <TextInput
                                    value={priceText}
                                    onChangeText={setPriceText}
                                    placeholder="0.00"
                                    placeholderTextColor="#9CA3AF"
                                    style={styles.input}
                                    keyboardType="numeric"
                                />
                            </View>

                            {/* Description + AI Button */}
                            <View style={styles.labelRow}>
                                <Text style={styles.label}>Description</Text>

                                {/* AI History navigation */}
                                {aiHistory.length > 0 && (
                                    <View style={styles.historyNav}>
                                        <Pressable
                                            onPress={() => navigateAIHistory(-1)}
                                            style={[styles.histBtn, currentAiIndex <= 0 && styles.histBtnDisabled]}
                                            disabled={currentAiIndex <= 0}
                                        >
                                            <Ionicons name="chevron-back" size={12} color={currentAiIndex <= 0 ? "#D1D5DB" : "#4B5563"} />
                                        </Pressable>
                                        <Text style={styles.histText}>{currentAiIndex + 1}/{aiHistory.length}</Text>
                                        <Pressable
                                            onPress={() => navigateAIHistory(1)}
                                            style={[styles.histBtn, currentAiIndex >= aiHistory.length - 1 && styles.histBtnDisabled]}
                                            disabled={currentAiIndex >= aiHistory.length - 1}
                                        >
                                            <Ionicons name="chevron-forward" size={12} color={currentAiIndex >= aiHistory.length - 1 ? "#D1D5DB" : "#4B5563"} />
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

                            <View style={[styles.inputWrap, styles.textAreaWrap]}>
                                <TextInput
                                    value={description}
                                    onChangeText={(text) => {
                                        setDescription(text);
                                    }}
                                    placeholder="Ingredients, preparation method..."
                                    placeholderTextColor="#9CA3AF"
                                    style={styles.textArea}
                                    multiline
                                    textAlignVertical="top"
                                />
                            </View>

                            {/* Availability */}
                            <View style={styles.switchRow}>
                                <View>
                                    <Text style={styles.switchLabel}>Available</Text>
                                    <Text style={styles.switchSub}>Show this item in guest menu</Text>
                                </View>
                                <Switch
                                    value={isAvailable}
                                    onValueChange={setIsAvailable}
                                    trackColor={{ false: "#E5E7EB", true: "#BFDBFE" }}
                                    thumbColor={isAvailable ? "#2563EB" : "#F3F4F6"}
                                />
                            </View>

                            {aiError && (
                                <View style={styles.errorBox}>
                                    <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
                                    <Text style={styles.errorText}>
                                        {aiError}
                                    </Text>
                                </View>
                            )}

                            <View style={{ height: 20 }} />
                        </ScrollView>

                        <View style={styles.modalFooter}>
                            <Pressable
                                onPress={closeModal}
                                style={({ pressed }) => [
                                    styles.btnCancel,
                                    pressed && { backgroundColor: "#F3F4F6" },
                                ]}
                                disabled={saving || rewriting}
                            >
                                <Text style={styles.btnCancelText}>Cancel</Text>
                            </Pressable>

                            <Pressable
                                onPress={saveDish}
                                style={({ pressed }) => [
                                    styles.btnSave,
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
                    <View style={[styles.modalCard, styles.aiModalCard]}>
                        <View style={styles.modalHeader}>
                            <View style={styles.headerLeft}>
                                <View style={styles.aiIconBadge}>
                                    <Ionicons name="sparkles" size={16} color="#7C3AED" />
                                </View>
                                <Text style={styles.modalTitle}>AI Magic Rewrite</Text>
                            </View>
                            <Pressable onPress={closeAIRewriteModal} style={styles.closeBtn}>
                                <Ionicons name="close" size={20} color="#6B7280" />
                            </Pressable>
                        </View>

                        <ScrollView style={styles.modalBody}>
                            <Text style={[styles.label, { marginTop: 0 }]}>How should we enhance "{name}"?</Text>

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

                            <Text style={styles.subLabel}>Title Keywords (Optional)</Text>
                            <TextInput
                                style={styles.aiInput}
                                placeholder="e.g., Spicy, Homemade, Crispy"
                                placeholderTextColor="#9CA3AF"
                                value={userTitleHints}
                                onChangeText={setUserTitleHints}
                            />

                            <Text style={styles.subLabel}>Description Details (Optional)</Text>
                            <TextInput
                                style={styles.aiInput}
                                placeholder="e.g., served with chutney, made in ghee"
                                placeholderTextColor="#9CA3AF"
                                value={userDescriptionHints}
                                onChangeText={setUserDescriptionHints}
                            />

                            <Pressable
                                style={({ pressed }) => [
                                    styles.generateBtn,
                                    pressed && { opacity: 0.9 },
                                    (!userTitleHints && !userDescriptionHints) && { backgroundColor: "#E5E7EB" }
                                ]}
                                onPress={handleCustomAIRewrite}
                                disabled={!userTitleHints && !userDescriptionHints}
                            >
                                <Ionicons name="sparkles" size={18} color={(!userTitleHints && !userDescriptionHints) ? "#9CA3AF" : "#fff"} />
                                <Text style={[
                                    styles.generateBtnText,
                                    (!userTitleHints && !userDescriptionHints) && { color: "#9CA3AF" }
                                ]}>Generate Custom</Text>
                            </Pressable>

                            <View style={styles.quickActions}>
                                <Pressable style={styles.textBtn} onPress={handleFreshRewrite}>
                                    <Ionicons name="refresh" size={14} color="#4B5563" />
                                    <Text style={styles.textBtnColor}>Fresh Rewrite (Reset)</Text>
                                </Pressable>

                                {(aiHistory.length > 0 || hasAIGeneratedRef.current) && (
                                    <Pressable style={styles.textBtn} onPress={() => {
                                        handleRemoveAI();
                                        closeAIRewriteModal();
                                    }}>
                                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                                        <Text style={[styles.textBtnColor, { color: "#EF4444" }]}>Revert to Original</Text>
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
                    <View style={[styles.modalCard, { height: '80%' }]}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={[styles.modalIcon, { backgroundColor: '#7C3AED15' }]}>
                                    <Ionicons name="sparkles" size={18} color="#7C3AED" />
                                </View>
                                <View>
                                    <Text style={styles.modalTitle}>AI Menu Sync</Text>
                                    <Text style={styles.modalSubtitle}>Review detected dishes</Text>
                                </View>
                            </View>
                            {!aiParsing && (
                                <Pressable onPress={() => setAiImportModalOpen(false)} style={styles.modalCloseBtn}>
                                    <Ionicons name="close" size={18} color="#6B7280" />
                                </Pressable>
                            )}
                        </View>

                        <View style={{ flex: 1, padding: 20 }}>
                            {aiParsing ? (
                                <View style={styles.parsingContainer}>
                                    <ActivityIndicator size="large" color="#7C3AED" />
                                    <Text style={styles.parsingTitle}>AI is reading your menu...</Text>
                                    <Text style={styles.parsingDesc}>This will only take a moment. We're categorizing your dishes and generating descriptions.</Text>
                                </View>
                            ) : (
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    {parsedItems.map((item, index) => (
                                        <View key={index} style={styles.parsedItemCard}>
                                            <View style={styles.parsedItemHeader}>
                                                <Text style={styles.parsedItemName}>{item.name}</Text>
                                                <Text style={styles.parsedItemPrice}>₹{item.price || '--'}</Text>
                                            </View>
                                            <Text style={styles.parsedItemDesc}>{item.description}</Text>
                                            <View style={styles.parsedBadgeRow}>
                                                <View style={[styles.parsedBadge, { backgroundColor: '#2563EB15' }]}>
                                                    <Text style={[styles.parsedBadgeText, { color: '#2563EB' }]}>{item.category}</Text>
                                                </View>
                                                {item.subCategory && (
                                                    <View style={[styles.parsedBadge, { backgroundColor: '#10B98115' }]}>
                                                        <Text style={[styles.parsedBadgeText, { color: '#10B981' }]}>{item.subCategory}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    ))}
                                    <View style={{ height: 20 }} />
                                </ScrollView>
                            )}
                        </View>

                        {!aiParsing && parsedItems.length > 0 && (
                            <View style={styles.modalFooter}>
                                <Pressable
                                    onPress={() => setAiImportModalOpen(false)}
                                    style={styles.btnCancel}
                                >
                                    <Text style={styles.btnCancelText}>Discard</Text>
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

            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.headerTitle}>Food Menu</Text>
                        <Text style={styles.headerSubtitle}>Manage restaurant items</Text>
                    </View>
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

                <View style={styles.importOptions}>
                    <Pressable
                        onPress={handleGalleryUpload}
                        style={({ pressed }) => [
                            styles.importOption,
                            pressed && { backgroundColor: '#F3F4F6' }
                        ]}
                    >
                        <Ionicons name="images-outline" size={16} color="#4B5563" />
                        <Text style={styles.importOptionText}>Upload Photo</Text>
                    </Pressable>
                    <View style={styles.vDivider} />
                    <Pressable
                        onPress={() => Alert.alert("PDF Support", "Coming soon! For best results, please take a clear photo of your menu.")}
                        style={({ pressed }) => [
                            styles.importOption,
                            pressed && { backgroundColor: '#F3F4F6' }
                        ]}
                    >
                        <Ionicons name="document-text-outline" size={16} color="#4B5563" />
                        <Text style={styles.importOptionText}>PDF Menu</Text>
                    </Pressable>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {CATEGORIES.map((cat) => renderCategory(cat))}
            </ScrollView>

            {/* Overlay Loading (Saving) */}
            {saving && (
                <View style={styles.loadingOverlay}>
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={styles.loadingText}>Saving...</Text>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: "#F3F4F6", // light gray bg
    },
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 40,
        paddingBottom: 20,
        backgroundColor: "#fff",
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: "800",
        color: "#111827",
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 15,
        color: "#6B7280",
        marginTop: 4,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 100,
    },

    /* Category */
    categoryWrap: {
        marginBottom: 16,
        backgroundColor: "#fff",
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        // shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    categoryCard: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        backgroundColor: "#fff",
        borderLeftWidth: 4,
    },
    emojiWrap: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 14,
    },
    emoji: {
        fontSize: 22,
    },
    categoryTitle: {
        fontSize: 17,
        fontWeight: "700",
        color: "#1F2937",
        marginBottom: 2,
    },
    categorySub: {
        fontSize: 13,
        color: "#6B7280",
    },
    categoryRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    countPill: {
        backgroundColor: "#F9FAFB",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "#F3F4F6",
    },
    countText: {
        fontSize: 12,
        fontWeight: "700",
    },

    /* Expanded Area */
    expandedArea: {
        backgroundColor: "#FAFAFA",
        borderTopWidth: 1,
        borderTopColor: "#F3F4F6",
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
        fontWeight: "700",
        color: "#4B5563",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    addSmallBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#2563EB",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        gap: 4,
    },
    addSmallText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "600",
    },

    /* Empty State */
    emptyDishBox: {
        alignItems: "center",
        paddingVertical: 24,
    },
    emptyDishText: {
        color: "#9CA3AF",
        fontSize: 14,
        marginTop: 6,
    },

    /* Dish Card */
    dishCard: {
        marginHorizontal: 16,
        marginBottom: 10,
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
        elevation: 1,
    },
    dishTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 10,
    },
    dishName: {
        fontSize: 16,
        fontWeight: "700",
        color: "#1F2937",
        marginBottom: 4,
    },
    dishDesc: {
        fontSize: 13,
        color: "#6B7280",
        lineHeight: 18,
    },
    dishPriceWrap: {
        marginLeft: 12,
    },
    dishPrice: {
        fontSize: 15,
        fontWeight: "700",
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
        borderWidth: 1,
        gap: 6,
    },
    availDot: {
        width: 6,
        height: 6,
        borderRadius: 4,
    },
    availText: {
        fontSize: 11,
        fontWeight: "600",
    },
    actionsRow: {
        flexDirection: "row",
        gap: 12,
    },
    iconActionBtn: {
        padding: 6,
        backgroundColor: "#F9FAFB",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },

    addBigBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#2563EB",
        marginHorizontal: 16,
        marginTop: 6,
        paddingVertical: 10,
        borderRadius: 10,
        gap: 6,
        // shadow
        shadowColor: "#2563EB",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 3,
    },
    addBigText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 14,
    },

    /* Modal */
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "flex-end", // slide up sheet style
    },
    modalCard: {
        backgroundColor: "#fff",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: "90%",
        width: "100%",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
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
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
    },
    modalHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    modalIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: "#EFF6FF",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 10,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#111827",
    },
    modalSubtitle: {
        fontSize: 12,
        color: "#6B7280",
    },
    modalCloseBtn: {
        padding: 6,
        backgroundColor: "#F3F4F6",
        borderRadius: 20,
    },
    modalBody: {
        flex: 1,
        padding: 20,
    },
    label: {
        fontSize: 13,
        fontWeight: "700",
        color: "#374151",
        marginBottom: 8,
        marginTop: 4,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    chipsRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 20,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: "#F9FAFB",
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    chipText: {
        fontSize: 13,
        fontWeight: "600",
        color: "#4B5563",
    },
    inputWrap: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F9FAFB",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        borderRadius: 12,
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
        color: "#1F2937",
        fontSize: 15,
        fontWeight: "500",
    },
    /* Description+AI row */
    labelRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    aiBtnSmall: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#7C3AED", // purple
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        gap: 4,
    },
    aiBtnText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "700",
    },
    textAreaWrap: {
        height: 120,
        alignItems: "flex-start",
        paddingVertical: 12,
    },
    textArea: {
        flex: 1,
        height: "100%",
        color: "#1F2937",
        fontSize: 15,
        lineHeight: 22,
    },
    switchRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#F9FAFB",
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        marginBottom: 20,
    },
    switchLabel: {
        fontSize: 15,
        fontWeight: "600",
        color: "#1F2937",
    },
    switchSub: {
        fontSize: 12,
        color: "#6B7280",
        marginTop: 2,
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
        color: "#B91C1C",
        fontSize: 13,
        flex: 1,
    },
    modalFooter: {
        flexDirection: "row",
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: "#F3F4F6",
        gap: 12,
    },
    btnCancel: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        alignItems: "center",
        justifyContent: "center",
    },
    btnCancelText: {
        fontSize: 15,
        fontWeight: "600",
        color: "#4B5563",
    },
    btnSave: {
        flex: 2,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: "#2563EB", // blue
        alignItems: "center",
        justifyContent: "center",
        // shadow
        shadowColor: "#2563EB",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    btnSaveText: {
        fontSize: 15,
        fontWeight: "700",
        color: "#fff",
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(255,255,255,0.8)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999,
    },
    loadingBox: {
        padding: 24,
        backgroundColor: "#fff",
        borderRadius: 16,
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
        fontWeight: "600",
        color: "#4B5563",
    },

    // AI Modal specific
    aiModalCard: {
        height: "auto",
        maxHeight: "85%",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: "#fff",
    },
    aiIconBadge: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: "#F3E8FF", // light purple
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
        borderRadius: 20,
        backgroundColor: "#F3F4F6",
    },
    aiOptionCard: {
        marginBottom: 24,
    },
    aiOptionBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFBEB", // amber-50
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#FCD34D", // amber-300
    },
    aiOptionIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "#FEF3C7", // amber-100
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    aiOptionContent: {
        flex: 1,
    },
    aiOptionTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#92400E", // amber-800
    },
    aiOptionDesc: {
        fontSize: 12,
        color: "#B45309", // amber-700
        marginTop: 2,
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
        fontWeight: "700",
        color: "#9CA3AF",
        letterSpacing: 1,
    },
    subLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: "#4B5563",
        marginBottom: 8,
    },
    aiInput: {
        backgroundColor: "#F9FAFB",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        borderRadius: 12,
        padding: 12,
        fontSize: 14,
        marginBottom: 16,
        color: "#1F2937",
    },
    generateBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#7C3AED", // purple-600
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
        marginTop: 8,
        marginBottom: 20,
    },
    generateBtnText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "700",
    },
    quickActions: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: "#F3F4F6",
    },
    textBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        padding: 8,
    },
    textBtnColor: {
        fontSize: 13,
        fontWeight: "600",
        color: "#4B5563",
    },

    // History nav
    historyNav: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F3F4F6",
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
        fontWeight: "600",
        color: "#4B5563",
        minWidth: 24,
        textAlign: "center",
    },

    /* AI Import Styles */
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    scanBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#7C3AED',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
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
        fontWeight: '700',
    },
    importOptions: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 4,
    },
    importOption: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        gap: 6,
        borderRadius: 8,
    },
    importOptionText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#4B5563',
    },
    vDivider: {
        width: 1,
        height: 16,
        backgroundColor: '#D1D5DB',
    },
    parsingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    parsingTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
        marginTop: 20,
        textAlign: 'center',
    },
    parsingDesc: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 10,
        lineHeight: 20,
    },
    parsedItemCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    parsedItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    parsedItemName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        flex: 1,
    },
    parsedItemPrice: {
        fontSize: 15,
        fontWeight: '700',
        color: '#059669',
        marginLeft: 8,
    },
    parsedItemDesc: {
        fontSize: 13,
        color: '#6B7280',
        lineHeight: 18,
        marginBottom: 10,
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
        fontWeight: '700',
        textTransform: 'uppercase',
    },
});
