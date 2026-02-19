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
    setDoc,
    getDoc,
} from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { generateAIMenuText, parseMenuFromAI, getCategoryMeta, STANDARD_CATEGORIES } from "../../lib/aiService";

// ─── TYPES ──────────────────────────────────────────────────────────────────────
type MenuItem = {
    id: string;
    category: string;
    name: string;
    description?: string;
    price?: number | null;
    isAvailable?: boolean;
    isVeg?: boolean | null;
    createdAt?: any;
    updatedAt?: any;
};

type CategoryDef = {
    key: string;
    title: string;
    subtitle: string;
    icon: string;
    accent: string;
};

type ConfirmState = {
    open: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: "destructive" | "primary";
    onConfirm?: () => void | Promise<void>;
};

// ─── DEFAULT CATEGORIES ─────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES: CategoryDef[] = [
    { key: "breakfast", title: "Breakfast", subtitle: "Morning dishes & beverages", icon: "🍳", accent: "#2563EB" },
    { key: "lunch", title: "Lunch", subtitle: "Main course & combos", icon: "🍱", accent: "#16A34A" },
    { key: "dinner", title: "Dinner", subtitle: "Evening meals & specials", icon: "🍽️", accent: "#7C3AED" },
    { key: "beverages", title: "Beverages", subtitle: "Drinks, Shakes & Juices", icon: "🥤", accent: "#06B6D4" },
    { key: "desserts", title: "Desserts", subtitle: "Sweets & Treats", icon: "🍨", accent: "#EC4899" },
    { key: "snacks", title: "Snacks", subtitle: "Light bites & sides", icon: "🍟", accent: "#F59E0B" },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────────
const buildCategoryFromKey = (key: string): CategoryDef => {
    const meta = getCategoryMeta(key);
    return {
        key: meta.key,
        title: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        subtitle: meta.subtitle,
        icon: meta.icon,
        accent: meta.accent,
    };
};

const readFileAsBase64 = async (uri: string): Promise<string> => {
    const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
    });
    return base64;
};

// Convert PDF to text using a simple extraction approach
// Since native PDF parsing is complex, we'll use Gemini's vision on PDF pages
// For PDFs we extract as base64 and send directly
const processPDF = async (uri: string): Promise<{ type: 'text' | 'base64', content: string }> => {
    try {
        // Read PDF as base64
        const base64 = await readFileAsBase64(uri);
        return { type: 'base64', content: base64 };
    } catch (e) {
        throw new Error('Failed to read PDF file');
    }
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────────
export default function MenuScreen() {
    const auth = getAuth();
    const user = auth.currentUser;
    const { width } = useWindowDimensions();
    const systemColorScheme = useColorScheme();

    const isWide = width >= 900;
    const [isDark, setIsDark] = useState(systemColorScheme === "dark");

    const [items, setItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);
    const [expandedCategory, setExpandedCategory] = useState<string | null>("breakfast");

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rewriting, setRewriting] = useState(false);
    const [rewriteCount, setRewriteCount] = useState(0);

    const [editId, setEditId] = useState<string | null>(null);
    const [formCategory, setFormCategory] = useState<string>("breakfast");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [priceText, setPriceText] = useState("");
    const [isAvailable, setIsAvailable] = useState(true);

    // AI Import states
    const [aiImportModalOpen, setAiImportModalOpen] = useState(false);
    const [aiParsing, setAiParsing] = useState(false);
    const [parsedItems, setParsedItems] = useState<any[]>([]);
    const [parseProgress, setParseProgress] = useState("");
    const [selectedParsedItems, setSelectedParsedItems] = useState<Set<number>>(new Set());

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

    // Confirm modal
    const [confirm, setConfirm] = useState<ConfirmState>({
        open: false, title: "", message: "", confirmText: "Confirm", variant: "primary",
    });
    const [confirmBusy, setConfirmBusy] = useState(false);

    const askConfirm = (cfg: Omit<ConfirmState, "open">) => {
        if (Platform.OS !== "web") {
            Alert.alert(cfg.title, cfg.message, [
                { text: "Cancel", style: "cancel" },
                { text: cfg.confirmText, style: cfg.variant === "destructive" ? "destructive" : "default", onPress: cfg.onConfirm },
            ]);
            return;
        }
        setConfirm({ open: true, ...cfg });
    };

    const closeConfirm = () => { setConfirm(c => ({ ...c, open: false })); setConfirmBusy(false); };

    // Theme
    const theme = isDark ? {
        bgMain: "#010409", bgCard: "rgba(13, 17, 23, 0.95)", textMain: "#f0f6fc",
        textMuted: "#8b949e", glass: "rgba(255,255,255,0.04)", glassBorder: "rgba(255,255,255,0.1)",
        primary: "#2563eb", success: "#22c55e", danger: "#ef4444", warning: "#f59e0b",
    } : {
        bgMain: "#f8fafc", bgCard: "#ffffff", textMain: "#0f172a",
        textMuted: "#64748b", glass: "rgba(37,99,235,0.04)", glassBorder: "rgba(37,99,235,0.12)",
        primary: "#2563eb", success: "#16a34a", danger: "#dc2626", warning: "#f59e0b",
    };

    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }, []);

    // ─── LOAD ITEMS FROM FIREBASE ─────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const uid = user.uid;
        const ref = collection(db, "users", uid, "menuItems");
        const unsub = onSnapshot(ref, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as MenuItem[];
            list.sort((a: any, b: any) => (b?.createdAt?.toMillis?.() ?? 0) - (a?.createdAt?.toMillis?.() ?? 0));
            setItems(list);

            // Build dynamic category list from existing items
            const existingKeys = new Set(list.map(i => i.category).filter(Boolean));
            setCategories(prev => {
                const currentKeys = new Set(prev.map(c => c.key));
                const newCats = [...prev];
                for (const key of existingKeys) {
                    if (!currentKeys.has(key)) {
                        newCats.push(buildCategoryFromKey(key));
                    }
                }
                return newCats;
            });
        });
        return () => unsub();
    }, [user]);

    const itemsByCategory = useMemo(() => {
        const map: Record<string, MenuItem[]> = {};
        for (const cat of categories) map[cat.key] = [];
        for (const it of items) {
            if (!map[it.category]) map[it.category] = [];
            map[it.category].push(it);
        }
        return map;
    }, [items, categories]);

    // ─── ENSURE CATEGORY EXISTS ───────────────────────────────────────────────
    const ensureCategoryExists = (key: string) => {
        setCategories(prev => {
            if (prev.find(c => c.key === key)) return prev;
            return [...prev, buildCategoryFromKey(key)];
        });
    };

    // ─── CAMERA SCAN ──────────────────────────────────────────────────────────
    const handleCameraScan = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission Denied", "Camera access is needed to scan the menu.");
                return;
            }
            const result = await ImagePicker.launchCameraAsync({
                base64: true,
                quality: 0.9,
                allowsEditing: false,
            });
            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                const base64 = asset.base64 || await readFileAsBase64(asset.uri);
                startAIParsing(base64, 'image');
            }
        } catch (e: any) {
            Alert.alert("Error", `Camera error: ${e.message}`);
        }
    };

    // ─── GALLERY UPLOAD ───────────────────────────────────────────────────────
    const handleGalleryUpload = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                base64: true,
                quality: 0.9,
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: false,
            });
            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                const base64 = asset.base64 || await readFileAsBase64(asset.uri);
                startAIParsing(base64, 'image');
            }
        } catch (e: any) {
            Alert.alert("Error", `Gallery error: ${e.message}`);
        }
    };

    // ─── PDF UPLOAD ───────────────────────────────────────────────────────────
    const handlePDFUpload = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'text/plain', 'image/*'],
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets?.[0]) return;

            const asset = result.assets[0];
            console.log('📄 Selected file:', asset.name, 'type:', asset.mimeType, 'uri:', asset.uri);

            setAiImportModalOpen(true);
            setAiParsing(true);
            setParsedItems([]);
            setSelectedParsedItems(new Set());

            // Handle different file types
            if (asset.mimeType?.startsWith('image/')) {
                // Image file selected via document picker
                const base64 = await readFileAsBase64(asset.uri);
                startAIParsing(base64, 'image');
                return;
            }

            if (asset.mimeType === 'text/plain') {
                // Plain text menu
                const text = await FileSystem.readAsStringAsync(asset.uri);
                startAIParsing(text, 'text');
                return;
            }

            // PDF handling
            if (asset.mimeType === 'application/pdf' || asset.name?.endsWith('.pdf')) {
                setParseProgress("Reading PDF file...");
                try {
                    // Read PDF as base64 and send to Gemini vision
                    const base64 = await readFileAsBase64(asset.uri);
                    setParseProgress("Analyzing PDF with AI...");

                    // Gemini can handle PDF as base64 with application/pdf mime type
                    await startAIParsingWithMime(base64, 'application/pdf');
                } catch (pdfError: any) {
                    console.error('PDF error:', pdfError);
                    // Fallback: try reading as text
                    try {
                        setParseProgress("Trying text extraction...");
                        const text = await FileSystem.readAsStringAsync(asset.uri, {
                            encoding: FileSystem.EncodingType.UTF8,
                        });
                        if (text && text.length > 10) {
                            startAIParsing(text, 'text');
                        } else {
                            throw new Error('Could not extract text from PDF');
                        }
                    } catch {
                        setAiParsing(false);
                        setAiImportModalOpen(false);
                        Alert.alert(
                            "PDF Processing",
                            "For best results with PDFs:\n\n• Take a clear photo of each menu page\n• Use the 'Scan Menu' camera button\n• Or upload a screenshot of the PDF\n\nAlternatively, save the PDF as a text file and upload that.",
                            [{ text: "OK" }]
                        );
                    }
                }
                return;
            }

            // Unknown type — try as text
            try {
                const text = await FileSystem.readAsStringAsync(asset.uri);
                startAIParsing(text, 'text');
            } catch {
                setAiParsing(false);
                setAiImportModalOpen(false);
                Alert.alert("Unsupported File", "Please upload a PDF, image, or text file containing your menu.");
            }
        } catch (e: any) {
            setAiParsing(false);
            setAiImportModalOpen(false);
            if (!e.message?.includes('cancel')) {
                Alert.alert("Error", `File picker error: ${e.message}`);
            }
        }
    };

    // ─── START AI PARSING (image/text) ────────────────────────────────────────
    const startAIParsing = async (source: string, type: 'image' | 'text') => {
        setAiParsing(true);
        setAiImportModalOpen(true);
        setParsedItems([]);
        setSelectedParsedItems(new Set());
        setParseProgress(type === 'image' ? "Reading menu image..." : "Reading menu text...");

        try {
            setParseProgress("AI is analyzing your menu...");
            const data = await parseMenuFromAI(source, type);
            setParseProgress("");

            if (data && data.length > 0) {
                setParsedItems(data);
                // Select all by default
                setSelectedParsedItems(new Set(data.map((_: any, i: number) => i)));
            } else {
                setAiImportModalOpen(false);
                Alert.alert(
                    "No Items Detected",
                    "AI couldn't find menu items. Please try:\n\n• A clearer photo with good lighting\n• Make sure menu text is sharp and readable\n• Try a closer shot\n• Ensure the image isn't blurry",
                    [{ text: "OK" }]
                );
            }
        } catch (error: any) {
            console.error("AI parsing error:", error);
            setAiImportModalOpen(false);
            Alert.alert(
                "Parsing Failed",
                `Could not read the menu: ${error.message}\n\nTips:\n• Use a clearer photo\n• Better lighting helps\n• Make text sharp and readable`,
                [{ text: "OK" }]
            );
        } finally {
            setAiParsing(false);
            setParseProgress("");
        }
    };

    // ─── START AI PARSING WITH MIME TYPE (for PDF) ────────────────────────────
    const startAIParsingWithMime = async (base64: string, mimeType: string) => {
        // For PDFs, use Gemini's multimodal capability
        // We'll treat it as image/jpeg for vision analysis after converting
        // Since Gemini 1.5 supports PDF inline data
        setParseProgress("AI is analyzing your PDF...");
        try {
            const data = await parseMenuFromAI(base64, 'image');
            setParseProgress("");
            if (data && data.length > 0) {
                setParsedItems(data);
                setSelectedParsedItems(new Set(data.map((_: any, i: number) => i)));
            } else {
                setAiImportModalOpen(false);
                Alert.alert("No Items Found", "Try uploading a photo of the menu instead.", [{ text: "OK" }]);
            }
        } catch (e: any) {
            setAiParsing(false);
            setAiImportModalOpen(false);
            Alert.alert("PDF Analysis Failed", `${e.message}\n\nTip: Take a photo of the menu for best results.`, [{ text: "OK" }]);
        } finally {
            setAiParsing(false);
            setParseProgress("");
        }
    };

    // ─── TOGGLE PARSED ITEM SELECTION ────────────────────────────────────────
    const toggleParsedItemSelection = (index: number) => {
        setSelectedParsedItems(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedParsedItems.size === parsedItems.length) {
            setSelectedParsedItems(new Set());
        } else {
            setSelectedParsedItems(new Set(parsedItems.map((_: any, i: number) => i)));
        }
    };

    // ─── SAVE PARSED ITEMS ────────────────────────────────────────────────────
    const saveParsedItems = async () => {
        if (!user || parsedItems.length === 0) return;
        const itemsToSave = parsedItems.filter((_: any, i: number) => selectedParsedItems.has(i));
        if (itemsToSave.length === 0) {
            Alert.alert("No Items Selected", "Please select at least one item to save.");
            return;
        }

        setSaving(true);
        try {
            const uid = user.uid;
            const ref = collection(db, "users", uid, "menuItems");

            // Auto-create new categories for items
            const newCategoryKeys = new Set<string>();
            for (const item of itemsToSave) {
                if (!STANDARD_CATEGORIES.includes(item.category)) {
                    newCategoryKeys.add(item.category);
                }
            }

            // Add dynamic categories
            for (const key of newCategoryKeys) {
                ensureCategoryExists(key);
            }

            // Save all items
            const promises = itemsToSave.map((item: any) =>
                addDoc(ref, {
                    category: item.category,
                    name: item.name,
                    description: item.description || "",
                    price: item.price ?? null,
                    isAvailable: true,
                    isVeg: item.isVeg ?? null,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                })
            );
            await Promise.all(promises);

            const newCatCount = newCategoryKeys.size;
            setAiImportModalOpen(false);
            setParsedItems([]);
            setSelectedParsedItems(new Set());
            Alert.alert(
                "✨ Menu Synced!",
                `Added ${itemsToSave.length} items to your menu.${newCatCount > 0 ? `\n\n🆕 Created ${newCatCount} new category${newCatCount > 1 ? 'ies' : 'y'}: ${[...newCategoryKeys].join(', ')}` : ''}`,
                [{ text: "Great!" }]
            );
        } catch (error: any) {
            console.error("Save failed:", error);
            Alert.alert("Error", `Failed to save: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ─── MODAL HELPERS ────────────────────────────────────────────────────────
    const openAddDish = (category?: string) => {
        setEditId(null);
        setFormCategory(category ?? "breakfast");
        setName(""); setDescription(""); setPriceText(""); setIsAvailable(true);
        setAiError(null); setAiHistory([]); setCurrentAiIndex(-1);
        setOriginalText({ title: "", description: "" });
        hasAIGeneratedRef.current = false; aiRewriteAttemptRef.current = 0; setRewriteCount(0);
        setModalOpen(true);
    };

    const openEditDish = (dish: MenuItem) => {
        setEditId(dish.id);
        setFormCategory(dish.category);
        setName(dish.name ?? "");
        setDescription(dish.description ?? "");
        setPriceText(typeof dish.price === "number" && Number.isFinite(dish.price) ? String(dish.price) : "");
        setIsAvailable(dish.isAvailable !== false);
        setAiError(null); setAiHistory([]); setCurrentAiIndex(-1);
        setOriginalText({ title: dish.name ?? "", description: dish.description ?? "" });
        hasAIGeneratedRef.current = false; aiRewriteAttemptRef.current = 0; setRewriteCount(0);
        setModalOpen(true);
    };

    const closeModal = () => { if (saving || rewriting) return; setModalOpen(false); setAiError(null); };
    const closeAIRewriteModal = () => { setShowAIRewriteModal(false); setUserTitleHints(""); setUserDescriptionHints(""); };

    // ─── AI REWRITE ───────────────────────────────────────────────────────────
    const handleAIRewrite = () => {
        if (!name.trim()) { Alert.alert("Error", "Please enter a dish name first"); return; }
        setShowAIRewriteModal(true);
    };

    const performAIRewrite = async (userPreferences?: any, isFreshRewrite = false) => {
        if (!name.trim()) return;
        setRewriting(true); setAiError(null);

        if (!hasAIGeneratedRef.current) {
            setOriginalText({ title: name, description });
        }

        try {
            aiRewriteAttemptRef.current++;
            const result = await generateAIMenuText(name, formCategory, userPreferences);
            const newEntry = { title: result.title, description: result.description };
            const updated = isFreshRewrite ? [newEntry] : [...aiHistory, newEntry];
            setAiHistory(updated);
            setCurrentAiIndex(updated.length - 1);
            setName(result.title);
            setDescription(result.description);
            hasAIGeneratedRef.current = true;
            setRewriteCount(p => p + 1);
        } catch (error: any) {
            console.error('AI rewrite failed:', error);
            setAiError(error.message || 'AI service unavailable');
        } finally {
            setRewriting(false);
            if (userPreferences) closeAIRewriteModal();
        }
    };

    const handleQuickAIRewrite = async () => {
        if (!name.trim()) { Alert.alert("Error", "Please enter a dish name first"); return; }
        closeAIRewriteModal();
        await performAIRewrite();
    };

    const handleCustomAIRewrite = async () => {
        await performAIRewrite({ titleElements: userTitleHints.trim(), descriptionElements: userDescriptionHints.trim() });
    };

    const handleFreshRewrite = async () => {
        closeAIRewriteModal();
        setAiHistory([]); setCurrentAiIndex(-1); hasAIGeneratedRef.current = false;
        await performAIRewrite(null, true);
    };

    const navigateAIHistory = (dir: number) => {
        const newIdx = Math.max(0, Math.min(aiHistory.length - 1, currentAiIndex + dir));
        setName(aiHistory[newIdx].title);
        setDescription(aiHistory[newIdx].description);
        setCurrentAiIndex(newIdx);
    };

    const handleRemoveAI = () => {
        if (originalText.title) setName(originalText.title);
        if (originalText.description) setDescription(originalText.description);
        setAiHistory([]); setCurrentAiIndex(-1);
        hasAIGeneratedRef.current = false; aiRewriteAttemptRef.current = 0; setRewriteCount(0);
    };

    // ─── SAVE DISH ────────────────────────────────────────────────────────────
    const saveDish = async () => {
        if (!user) { Alert.alert("Login required", "Please login again."); return; }
        const trimmedName = name.trim();
        if (!trimmedName) { Alert.alert("Invalid", "Dish name is required."); return; }
        let price: number | null = null;
        if (priceText.trim()) {
            const n = Number(priceText);
            if (!Number.isFinite(n) || n < 0) { Alert.alert("Invalid", "Price must be a valid number."); return; }
            price = n;
        }
        setSaving(true);
        try {
            const uid = user.uid;
            // Ensure category exists in our list
            ensureCategoryExists(formCategory);

            if (editId) {
                await updateDoc(doc(db, "users", uid, "menuItems", editId), {
                    category: formCategory, name: trimmedName,
                    description: description.trim() || "", price,
                    isAvailable: !!isAvailable, updatedAt: serverTimestamp(),
                });
            } else {
                await addDoc(collection(db, "users", uid, "menuItems"), {
                    category: formCategory, name: trimmedName,
                    description: description.trim() || "", price,
                    isAvailable: !!isAvailable, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                });
            }
            setModalOpen(false);
            setAiHistory([]); setCurrentAiIndex(-1);
            hasAIGeneratedRef.current = false; aiRewriteAttemptRef.current = 0; setRewriteCount(0);
        } catch (e: any) {
            Alert.alert("Error", `Failed to save: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const toggleAvailability = async (dish: MenuItem) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, "users", user.uid, "menuItems", dish.id), {
                isAvailable: !(dish.isAvailable !== false), updatedAt: serverTimestamp(),
            });
        } catch (e: any) {
            Alert.alert("Error", `Failed to update: ${e.message}`);
        }
    };

    const deleteDish = (dish: MenuItem) => {
        if (!user) return;
        askConfirm({
            title: "Delete Dish",
            message: `Delete "${dish.name}"? This cannot be undone.`,
            confirmText: "Delete",
            variant: "destructive",
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, "users", user.uid, "menuItems", dish.id));
                } catch (e: any) {
                    Alert.alert("Error", `Failed to delete: ${e.message}`);
                }
            },
        });
    };

    // ─── RENDER CATEGORY ──────────────────────────────────────────────────────
    const renderCategory = (cat: CategoryDef) => {
        const list = itemsByCategory[cat.key] || [];
        const expanded = expandedCategory === cat.key;

        return (
            <View key={cat.key} style={[styles.categoryWrap, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                <Pressable
                    onPress={() => setExpandedCategory(expanded ? null : cat.key)}
                    style={({ pressed }) => [styles.categoryCard, { borderLeftColor: cat.accent }, pressed && { opacity: 0.92 }]}
                >
                    <View style={[styles.emojiWrap, { backgroundColor: `${cat.accent}18` }]}>
                        <Text style={styles.emoji}>{cat.icon}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.categoryTitle, { color: theme.textMain }]}>{cat.title}</Text>
                        <Text style={[styles.categorySub, { color: theme.textMuted }]} numberOfLines={1}>{cat.subtitle}</Text>
                    </View>
                    <View style={styles.categoryRight}>
                        <View style={[styles.countPill, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                            <Text style={[styles.countText, { color: cat.accent }]}>{list.length}</Text>
                        </View>
                        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={theme.textMuted} />
                    </View>
                </Pressable>

                {expanded && (
                    <View style={[styles.expandedArea, { backgroundColor: theme.glass, borderTopColor: theme.glassBorder }]}>
                        <View style={styles.expandedHeader}>
                            <Text style={[styles.expandedTitle, { color: theme.textMuted }]}>Dishes</Text>
                            <Pressable onPress={() => openAddDish(cat.key)}
                                style={({ pressed }) => [styles.addSmallBtn, { backgroundColor: cat.accent }, pressed && { opacity: 0.9 }]}>
                                <Ionicons name="add" size={16} color="#fff" />
                                <Text style={styles.addSmallText}>Add Dish</Text>
                            </Pressable>
                        </View>

                        {list.length === 0 ? (
                            <View style={styles.emptyDishBox}>
                                <Ionicons name="fast-food-outline" size={22} color={theme.textMuted} />
                                <Text style={[styles.emptyDishText, { color: theme.textMuted }]}>No {cat.title.toLowerCase()} dishes yet.</Text>
                            </View>
                        ) : (
                            list.map(dish => {
                                const available = dish.isAvailable !== false;
                                return (
                                    <View key={dish.id} style={[styles.dishCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                                        <View style={styles.dishTop}>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    {dish.isVeg !== null && dish.isVeg !== undefined && (
                                                        <View style={[styles.vegDot, { borderColor: dish.isVeg ? '#16A34A' : '#DC2626' }]}>
                                                            <View style={[styles.vegDotInner, { backgroundColor: dish.isVeg ? '#16A34A' : '#DC2626' }]} />
                                                        </View>
                                                    )}
                                                    <Text style={[styles.dishName, { color: theme.textMain }]} numberOfLines={1}>{dish.name}</Text>
                                                </View>
                                                {dish.description ? (
                                                    <Text style={[styles.dishDesc, { color: theme.textMuted }]} numberOfLines={2}>{dish.description}</Text>
                                                ) : null}
                                            </View>
                                            <Text style={[styles.dishPrice, { color: cat.accent }]}>
                                                {typeof dish.price === "number" ? `₹${dish.price}` : "—"}
                                            </Text>
                                        </View>
                                        <View style={styles.dishBottom}>
                                            <Pressable onPress={() => toggleAvailability(dish)}
                                                style={({ pressed }) => [styles.availPill,
                                                { backgroundColor: available ? "rgba(22,163,74,0.10)" : "rgba(220,38,38,0.10)", borderColor: available ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)" },
                                                pressed && { opacity: 0.9 }]}>
                                                <View style={[styles.availDot, { backgroundColor: available ? theme.success : theme.danger }]} />
                                                <Text style={[styles.availText, { color: available ? theme.success : theme.danger }]}>
                                                    {available ? "Available" : "Unavailable"}
                                                </Text>
                                            </Pressable>
                                            <View style={styles.actionsRow}>
                                                <Pressable onPress={() => openEditDish(dish)}
                                                    style={({ pressed }) => [styles.iconActionBtn, { backgroundColor: theme.glass, borderColor: theme.glassBorder }, pressed && { opacity: 0.85 }]} hitSlop={10}>
                                                    <Ionicons name="create-outline" size={18} color={theme.primary} />
                                                </Pressable>
                                                <Pressable onPress={() => deleteDish(dish)}
                                                    style={({ pressed }) => [styles.iconActionBtn, { backgroundColor: theme.glass, borderColor: theme.glassBorder }, pressed && { opacity: 0.85 }]} hitSlop={10}>
                                                    <Ionicons name="trash-outline" size={18} color={theme.danger} />
                                                </Pressable>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}

                        <Pressable onPress={() => openAddDish(cat.key)}
                            style={({ pressed }) => [styles.addBigBtn, { backgroundColor: cat.accent }, pressed && { opacity: 0.9 }]}>
                            <Ionicons name="add-circle-outline" size={18} color="#fff" />
                            <Text style={styles.addBigText}>Add More Dishes</Text>
                        </Pressable>
                    </View>
                )}
            </View>
        );
    };

    if (!user) {
        return (
            <SafeAreaView style={[styles.safe, { backgroundColor: theme.bgMain }]}>
                <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
                    <Ionicons name="lock-closed-outline" size={26} color={theme.textMuted} />
                    <Text style={{ marginTop: 10, color: theme.textMuted, fontWeight: "800" }}>Please login to manage Menu</Text>
                </View>
            </SafeAreaView>
        );
    }

    // ─── RENDER ────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.bgMain }]}>

            {/* ── CONFIRM MODAL ─────────────────────────────────────────────── */}
            <Modal visible={confirm.open} transparent animationType="fade" onRequestClose={closeConfirm}>
                <View style={styles.confirmOverlay}>
                    <View style={[styles.confirmCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                        <View style={styles.confirmHeader}>
                            <View style={[styles.confirmIcon, confirm.variant === "destructive" && styles.confirmIconDanger]}>
                                <Ionicons name={confirm.variant === "destructive" ? "warning-outline" : "help-circle-outline"} size={20}
                                    color={confirm.variant === "destructive" ? theme.danger : theme.primary} />
                            </View>
                            <Text style={[styles.confirmTitle, { color: theme.textMain }]} numberOfLines={2}>{confirm.title}</Text>
                        </View>
                        <Text style={[styles.confirmMessage, { color: theme.textMuted }]}>{confirm.message}</Text>
                        <View style={styles.confirmActions}>
                            <Pressable onPress={closeConfirm} disabled={confirmBusy}
                                style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnGhost, { backgroundColor: theme.glass, borderColor: theme.glassBorder }, pressed && { opacity: 0.9 }]}>
                                <Text style={[styles.confirmBtnGhostText, { color: theme.textMuted }]}>Cancel</Text>
                            </Pressable>
                            <Pressable onPress={async () => {
                                if (!confirm.onConfirm) return closeConfirm();
                                setConfirmBusy(true);
                                try { await confirm.onConfirm(); } finally { setConfirmBusy(false); closeConfirm(); }
                            }} disabled={confirmBusy}
                                style={({ pressed }) => [styles.confirmBtn,
                                { backgroundColor: confirm.variant === "destructive" ? theme.danger : theme.primary },
                                pressed && { opacity: 0.9 }]}>
                                {confirmBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>{confirm.confirmText}</Text>}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── ADD / EDIT MODAL ──────────────────────────────────────────── */}
            <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={closeModal}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder },
                    isWide && { maxWidth: 700, alignSelf: 'center', width: '100%' }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.glassBorder }]}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={[styles.modalIcon, { backgroundColor: `${theme.primary}15` }]}>
                                    <Ionicons name="restaurant-outline" size={18} color={theme.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.modalTitle, { color: theme.textMain }]}>
                                        {editId ? "Edit Dish" : "Add Dish"}{rewriteCount > 0 ? ` (AI ×${rewriteCount})` : ""}
                                    </Text>
                                    <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>Category + Name required</Text>
                                </View>
                            </View>
                            <Pressable onPress={closeModal} disabled={saving || rewriting}
                                style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: theme.glass, borderColor: theme.glassBorder }, pressed && { opacity: 0.85 }]}>
                                <Ionicons name="close" size={18} color={theme.textMuted} />
                            </Pressable>
                        </View>

                        <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
                            <Text style={[styles.label, { color: theme.textMain }]}>Category</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                                <View style={styles.chipsRow}>
                                    {categories.map(c => {
                                        const active = formCategory === c.key;
                                        return (
                                            <Pressable key={c.key} onPress={() => setFormCategory(c.key)}
                                                style={({ pressed }) => [styles.chip,
                                                { backgroundColor: active ? `${c.accent}15` : theme.glass, borderColor: active ? `${c.accent}40` : theme.glassBorder },
                                                pressed && { opacity: 0.9 }]}>
                                                <Text style={{ marginRight: 4 }}>{c.icon}</Text>
                                                <Text style={[styles.chipText, { color: active ? c.accent : theme.textMuted }]}>{c.title}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </ScrollView>

                            <Text style={[styles.label, { color: theme.textMain }]}>Dish Name *</Text>
                            <View style={[styles.inputWrap, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                                <Ionicons name="fast-food-outline" size={18} color={theme.primary} style={{ marginRight: 10 }} />
                                <TextInput value={name} onChangeText={setName}
                                    placeholder="e.g., Poha, Idli, Thali" placeholderTextColor={theme.textMuted}
                                    style={[styles.input, { color: theme.textMain }]} autoCorrect={false} />
                            </View>

                            <Text style={[styles.label, { color: theme.textMain }]}>Price (₹) (Optional)</Text>
                            <View style={[styles.inputWrap, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                                <Ionicons name="cash-outline" size={18} color={theme.success} style={{ marginRight: 10 }} />
                                <TextInput value={priceText} onChangeText={setPriceText}
                                    placeholder="0.00" placeholderTextColor={theme.textMuted}
                                    style={[styles.input, { color: theme.textMain }]} keyboardType="numeric" />
                            </View>

                            <View style={styles.labelRow}>
                                <Text style={[styles.label, { color: theme.textMain, marginBottom: 0 }]}>Description</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    {aiHistory.length > 0 && (
                                        <View style={[styles.historyNav, { backgroundColor: theme.glass }]}>
                                            <Pressable onPress={() => navigateAIHistory(-1)} disabled={currentAiIndex <= 0} style={styles.histBtn}>
                                                <Ionicons name="chevron-back" size={12} color={currentAiIndex <= 0 ? theme.textMuted : theme.textMain} />
                                            </Pressable>
                                            <Text style={[styles.histText, { color: theme.textMain }]}>{currentAiIndex + 1}/{aiHistory.length}</Text>
                                            <Pressable onPress={() => navigateAIHistory(1)} disabled={currentAiIndex >= aiHistory.length - 1} style={styles.histBtn}>
                                                <Ionicons name="chevron-forward" size={12} color={currentAiIndex >= aiHistory.length - 1 ? theme.textMuted : theme.textMain} />
                                            </Pressable>
                                        </View>
                                    )}
                                    <Pressable onPress={handleAIRewrite} disabled={rewriting}
                                        style={({ pressed }) => [styles.aiBtnSmall, pressed && { opacity: 0.8 }, rewriting && { opacity: 0.6 }]}>
                                        {rewriting ? <ActivityIndicator size="small" color="#fff" /> :
                                            <><Ionicons name="sparkles" size={12} color="#fff" /><Text style={styles.aiBtnText}>AI Rewrite</Text></>}
                                    </Pressable>
                                </View>
                            </View>
                            <View style={[styles.inputWrap, styles.textAreaWrap, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                                <TextInput value={description} onChangeText={setDescription}
                                    placeholder="Ingredients, preparation method..."
                                    placeholderTextColor={theme.textMuted}
                                    style={[styles.textArea, { color: theme.textMain }]}
                                    multiline textAlignVertical="top" />
                            </View>

                            <View style={[styles.switchRow, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                                <View>
                                    <Text style={[styles.switchLabel, { color: theme.textMain }]}>Available</Text>
                                    <Text style={[styles.switchSub, { color: theme.textMuted }]}>Show this item in guest menu</Text>
                                </View>
                                <Switch value={isAvailable} onValueChange={setIsAvailable}
                                    trackColor={{ false: theme.glassBorder, true: `${theme.primary}60` }}
                                    thumbColor={isAvailable ? theme.primary : "#F3F4F6"} />
                            </View>

                            {aiError && (
                                <View style={styles.errorBox}>
                                    <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
                                    <Text style={[styles.errorText, { color: theme.danger }]}>{aiError}</Text>
                                </View>
                            )}
                        </ScrollView>

                        <View style={[styles.modalFooter, { borderTopColor: theme.glassBorder }]}>
                            <Pressable onPress={closeModal} disabled={saving || rewriting}
                                style={({ pressed }) => [styles.btnCancel, { backgroundColor: theme.glass, borderColor: theme.glassBorder }, pressed && { opacity: 0.9 }]}>
                                <Text style={[styles.btnCancelText, { color: theme.textMuted }]}>Cancel</Text>
                            </Pressable>
                            <Pressable onPress={saveDish} disabled={saving || rewriting}
                                style={({ pressed }) => [styles.btnSave, { backgroundColor: theme.primary }, pressed && { opacity: 0.9 }, saving && { opacity: 0.7 }]}>
                                {saving ? <ActivityIndicator color="#fff" size="small" /> :
                                    <Text style={styles.btnSaveText}>{editId ? "Save Changes" : "Create Dish"}</Text>}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── AI REWRITE MODAL ──────────────────────────────────────────── */}
            <Modal visible={showAIRewriteModal} animationType="fade" transparent onRequestClose={closeAIRewriteModal}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, styles.aiModalCard, { backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.glassBorder }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={styles.aiIconBadge}><Ionicons name="sparkles" size={16} color="#7C3AED" /></View>
                                <Text style={[styles.modalTitle, { color: theme.textMain }]}>AI Magic Rewrite</Text>
                            </View>
                            <Pressable onPress={closeAIRewriteModal} style={[styles.closeBtn, { backgroundColor: theme.glass }]}>
                                <Ionicons name="close" size={20} color={theme.textMuted} />
                            </Pressable>
                        </View>
                        <ScrollView style={styles.modalBody}>
                            <Text style={[styles.label, { color: theme.textMain, marginTop: 0 }]}>Enhance "{name}"</Text>
                            <Pressable onPress={handleQuickAIRewrite}
                                style={({ pressed }) => [styles.aiOptionBtn, pressed && { opacity: 0.9 }]}>
                                <View style={styles.aiOptionIcon}><Ionicons name="flash" size={20} color="#F59E0B" /></View>
                                <View style={styles.aiOptionContent}>
                                    <Text style={styles.aiOptionTitle}>Quick Enhance</Text>
                                    <Text style={styles.aiOptionDesc}>Instantly make it sound premium</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
                            </Pressable>
                            <View style={styles.divider}><Text style={styles.dividerText}>OR CUSTOMIZE</Text></View>
                            <Text style={[styles.subLabel, { color: theme.textMain }]}>Title Keywords</Text>
                            <TextInput style={[styles.aiInput, { backgroundColor: theme.glass, borderColor: theme.glassBorder, color: theme.textMain }]}
                                placeholder="e.g., Spicy, Homemade, Crispy" placeholderTextColor={theme.textMuted}
                                value={userTitleHints} onChangeText={setUserTitleHints} />
                            <Text style={[styles.subLabel, { color: theme.textMain }]}>Description Details</Text>
                            <TextInput style={[styles.aiInput, { backgroundColor: theme.glass, borderColor: theme.glassBorder, color: theme.textMain }]}
                                placeholder="e.g., served with chutney, made in ghee" placeholderTextColor={theme.textMuted}
                                value={userDescriptionHints} onChangeText={setUserDescriptionHints} />
                            <Pressable onPress={handleCustomAIRewrite} disabled={!userTitleHints && !userDescriptionHints}
                                style={({ pressed }) => [styles.generateBtn, (!userTitleHints && !userDescriptionHints) && { backgroundColor: theme.glassBorder }, pressed && { opacity: 0.9 }]}>
                                <Ionicons name="sparkles" size={18} color="#fff" />
                                <Text style={styles.generateBtnText}>Generate Custom</Text>
                            </Pressable>
                            <View style={[styles.quickActions, { borderTopColor: theme.glassBorder }]}>
                                <Pressable style={styles.textBtn} onPress={handleFreshRewrite}>
                                    <Ionicons name="refresh" size={14} color={theme.textMain} />
                                    <Text style={[styles.textBtnColor, { color: theme.textMain }]}>Fresh Rewrite</Text>
                                </Pressable>
                                {(aiHistory.length > 0 || hasAIGeneratedRef.current) && (
                                    <Pressable style={styles.textBtn} onPress={() => { handleRemoveAI(); closeAIRewriteModal(); }}>
                                        <Ionicons name="arrow-undo-outline" size={14} color={theme.danger} />
                                        <Text style={[styles.textBtnColor, { color: theme.danger }]}>Revert Original</Text>
                                    </Pressable>
                                )}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── AI MENU IMPORT MODAL ──────────────────────────────────────── */}
            <Modal visible={aiImportModalOpen} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { height: '90%', backgroundColor: theme.bgCard, borderColor: theme.glassBorder }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.glassBorder }]}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={[styles.modalIcon, { backgroundColor: '#7C3AED18' }]}>
                                    <Ionicons name="sparkles" size={18} color="#7C3AED" />
                                </View>
                                <View>
                                    <Text style={[styles.modalTitle, { color: theme.textMain }]}>AI Menu Sync</Text>
                                    <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>
                                        {aiParsing ? parseProgress || "Analyzing..." : `${parsedItems.length} items detected`}
                                    </Text>
                                </View>
                            </View>
                            {!aiParsing && (
                                <Pressable onPress={() => { setAiImportModalOpen(false); setParsedItems([]); }}
                                    style={[styles.modalCloseBtn, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                                    <Ionicons name="close" size={18} color={theme.textMuted} />
                                </Pressable>
                            )}
                        </View>

                        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
                            {aiParsing ? (
                                <View style={styles.parsingContainer}>
                                    <View style={styles.parsingSpinner}>
                                        <ActivityIndicator size="large" color="#7C3AED" />
                                    </View>
                                    <Text style={[styles.parsingTitle, { color: theme.textMain }]}>AI is reading your menu...</Text>
                                    <Text style={[styles.parsingDesc, { color: theme.textMuted }]}>
                                        {parseProgress || "Analyzing all items, prices and categories. This may take 10-30 seconds."}
                                    </Text>
                                    <View style={styles.parsingTips}>
                                        {["Detecting every dish name", "Extracting prices", "Auto-categorizing items", "Creating descriptions"].map((tip, i) => (
                                            <View key={i} style={styles.parsingTipRow}>
                                                <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
                                                <Text style={[styles.parsingTipText, { color: theme.textMuted }]}>{tip}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            ) : (
                                <>
                                    {parsedItems.length > 0 && (
                                        <View style={[styles.selectAllRow, { borderBottomColor: theme.glassBorder }]}>
                                            <Pressable onPress={toggleSelectAll} style={styles.selectAllBtn}>
                                                <Ionicons
                                                    name={selectedParsedItems.size === parsedItems.length ? "checkbox" : "square-outline"}
                                                    size={20} color={theme.primary} />
                                                <Text style={[styles.selectAllText, { color: theme.textMain }]}>
                                                    {selectedParsedItems.size === parsedItems.length ? "Deselect All" : "Select All"}
                                                    <Text style={{ color: theme.textMuted }}> ({selectedParsedItems.size}/{parsedItems.length})</Text>
                                                </Text>
                                            </Pressable>

                                            {/* Group by category stats */}
                                            <Text style={[styles.categoryCount, { color: theme.textMuted }]}>
                                                {new Set(parsedItems.map((i: any) => i.category)).size} categories
                                            </Text>
                                        </View>
                                    )}

                                    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                        {parsedItems.map((item: any, index: number) => {
                                            const isSelected = selectedParsedItems.has(index);
                                            const meta = getCategoryMeta(item.category);
                                            return (
                                                <Pressable key={index} onPress={() => toggleParsedItemSelection(index)}
                                                    style={[styles.parsedItemCard,
                                                    { backgroundColor: isSelected ? `${meta.accent}08` : theme.glass, borderColor: isSelected ? `${meta.accent}40` : theme.glassBorder }]}>
                                                    <View style={styles.parsedItemHeader}>
                                                        <Ionicons
                                                            name={isSelected ? "checkbox" : "square-outline"}
                                                            size={18} color={isSelected ? meta.accent : theme.textMuted}
                                                            style={{ marginRight: 10 }} />
                                                        <View style={{ flex: 1 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                                <Text style={[styles.parsedItemName, { color: theme.textMain }]}>{item.name}</Text>
                                                                {item.isVeg !== null && item.isVeg !== undefined && (
                                                                    <View style={[styles.vegDot, { borderColor: item.isVeg ? '#16A34A' : '#DC2626' }]}>
                                                                        <View style={[styles.vegDotInner, { backgroundColor: item.isVeg ? '#16A34A' : '#DC2626' }]} />
                                                                    </View>
                                                                )}
                                                            </View>
                                                            {item.description ? (
                                                                <Text style={[styles.parsedItemDesc, { color: theme.textMuted }]} numberOfLines={2}>{item.description}</Text>
                                                            ) : null}
                                                        </View>
                                                        <Text style={[styles.parsedItemPrice, { color: meta.accent }]}>
                                                            {item.price ? `₹${item.price}` : '—'}
                                                        </Text>
                                                    </View>
                                                    <View style={styles.parsedBadgeRow}>
                                                        <View style={[styles.parsedBadge, { backgroundColor: `${meta.accent}15` }]}>
                                                            <Text style={{ marginRight: 4, fontSize: 10 }}>{meta.icon}</Text>
                                                            <Text style={[styles.parsedBadgeText, { color: meta.accent }]}>
                                                                {item.category.replace(/_/g, ' ').toUpperCase()}
                                                            </Text>
                                                        </View>
                                                        {!STANDARD_CATEGORIES.includes(item.category) && (
                                                            <View style={[styles.parsedBadge, { backgroundColor: '#FEF3C7' }]}>
                                                                <Text style={[styles.parsedBadgeText, { color: '#92400E' }]}>NEW CATEGORY</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                </Pressable>
                                            );
                                        })}
                                        <View style={{ height: 20 }} />
                                    </ScrollView>
                                </>
                            )}
                        </View>

                        {!aiParsing && parsedItems.length > 0 && (
                            <View style={[styles.modalFooter, { borderTopColor: theme.glassBorder }]}>
                                <Pressable onPress={() => { setAiImportModalOpen(false); setParsedItems([]); }}
                                    style={[styles.btnCancel, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                                    <Text style={[styles.btnCancelText, { color: theme.textMuted }]}>Discard</Text>
                                </Pressable>
                                <Pressable onPress={saveParsedItems} disabled={saving || selectedParsedItems.size === 0}
                                    style={[styles.btnSave, { backgroundColor: '#7C3AED', opacity: selectedParsedItems.size === 0 ? 0.5 : 1 }]}>
                                    {saving ? <ActivityIndicator color="#fff" size="small" /> :
                                        <Text style={styles.btnSaveText}>Save {selectedParsedItems.size} Items</Text>}
                                </Pressable>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            {/* ── MAIN CONTENT ──────────────────────────────────────────────── */}
            <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
                <View style={[styles.header, { backgroundColor: theme.bgCard }]}>
                    <View style={styles.headerTop}>
                        <View>
                            <Text style={[styles.headerTitle, { color: theme.textMain }]}>Food Menu</Text>
                            <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
                                {items.length} dishes · {categories.length} categories
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Pressable onPress={() => setIsDark(!isDark)}
                                style={({ pressed }) => [styles.themeToggle, { backgroundColor: theme.glass, borderColor: theme.glassBorder }, pressed && { opacity: 0.9 }]}>
                                <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={theme.primary} />
                            </Pressable>
                            <Pressable onPress={handleCameraScan}
                                style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.9 }]}>
                                <Ionicons name="camera" size={18} color="#fff" />
                                <Text style={styles.scanBtnText}>Scan</Text>
                            </Pressable>
                        </View>
                    </View>

                    <View style={[styles.importOptions, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
                        <Pressable onPress={handleGalleryUpload}
                            style={({ pressed }) => [styles.importOption, pressed && { opacity: 0.8 }]}>
                            <Ionicons name="images-outline" size={16} color={theme.textMain} />
                            <Text style={[styles.importOptionText, { color: theme.textMain }]}>Photo Library</Text>
                        </Pressable>
                        <View style={[styles.vDivider, { backgroundColor: theme.glassBorder }]} />
                        <Pressable onPress={handlePDFUpload}
                            style={({ pressed }) => [styles.importOption, pressed && { opacity: 0.8 }]}>
                            <Ionicons name="document-text-outline" size={16} color={theme.textMain} />
                            <Text style={[styles.importOptionText, { color: theme.textMain }]}>PDF / File</Text>
                        </Pressable>
                        <View style={[styles.vDivider, { backgroundColor: theme.glassBorder }]} />
                        <Pressable onPress={() => openAddDish()}
                            style={({ pressed }) => [styles.importOption, pressed && { opacity: 0.8 }]}>
                            <Ionicons name="add-circle-outline" size={16} color={theme.primary} />
                            <Text style={[styles.importOptionText, { color: theme.primary }]}>Manual Add</Text>
                        </Pressable>
                    </View>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {categories.map(cat => renderCategory(cat))}
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

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safe: { flex: 1 },
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    headerTitle: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 13, marginTop: 3, fontWeight: '600' },
    themeToggle: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
    scanBtn: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#7C3AED',
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, gap: 6,
        shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 5,
    },
    scanBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    importOptions: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 4, borderWidth: 1.5 },
    importOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, gap: 5, borderRadius: 10 },
    importOptionText: { fontSize: 12, fontWeight: '700' },
    vDivider: { width: 1.5, height: 16 },
    scrollContent: { padding: 16, paddingBottom: 100 },
    categoryWrap: { marginBottom: 14, borderRadius: 20, overflow: "hidden", borderWidth: 1.5, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
    categoryCard: { flexDirection: "row", alignItems: "center", padding: 16, borderLeftWidth: 4 },
    emojiWrap: { width: 44, height: 44, borderRadius: 14, justifyContent: "center", alignItems: "center", marginRight: 14 },
    emoji: { fontSize: 22 },
    categoryTitle: { fontSize: 17, fontWeight: "800", marginBottom: 2 },
    categorySub: { fontSize: 12, fontWeight: '600' },
    categoryRight: { flexDirection: "row", alignItems: "center", gap: 10 },
    countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5 },
    countText: { fontSize: 12, fontWeight: "900" },
    expandedArea: { borderTopWidth: 1.5, paddingBottom: 12 },
    expandedHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
    expandedTitle: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1 },
    addSmallBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, gap: 4 },
    addSmallText: { color: "#fff", fontSize: 12, fontWeight: "800" },
    emptyDishBox: { alignItems: "center", paddingVertical: 24 },
    emptyDishText: { fontSize: 14, marginTop: 6, fontWeight: '600' },
    dishCard: { marginHorizontal: 14, marginBottom: 10, borderRadius: 16, padding: 14, borderWidth: 1.5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
    dishTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10 },
    dishName: { fontSize: 15, fontWeight: "800", marginBottom: 3 },
    dishDesc: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
    dishPrice: { fontSize: 15, fontWeight: "900", minWidth: 40, textAlign: 'right' },
    dishBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    availPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5, gap: 6 },
    availDot: { width: 6, height: 6, borderRadius: 4 },
    availText: { fontSize: 11, fontWeight: "800" },
    actionsRow: { flexDirection: "row", gap: 10 },
    iconActionBtn: { padding: 7, borderRadius: 10, borderWidth: 1.5 },
    addBigBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginHorizontal: 14, marginTop: 8, paddingVertical: 12, borderRadius: 14, gap: 6 },
    addBigText: { color: "#fff", fontWeight: "800", fontSize: 14 },
    vegDot: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    vegDotInner: { width: 6, height: 6, borderRadius: 1 },

    // MODALS
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
    modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, height: "90%", width: "100%", borderWidth: 1.5, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 20, display: "flex", flexDirection: "column" },
    modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1.5 },
    modalHeaderLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
    modalIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 12 },
    modalTitle: { fontSize: 18, fontWeight: "900" },
    modalSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 1 },
    modalCloseBtn: { padding: 6, borderRadius: 999, borderWidth: 1.5 },
    modalBody: { flex: 1, padding: 20 },
    label: { fontSize: 12, fontWeight: "900", marginBottom: 8, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },
    chipsRow: { flexDirection: "row", gap: 8, flexWrap: 'nowrap' },
    chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5 },
    chipText: { fontSize: 13, fontWeight: "700" },
    inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, marginBottom: 16, height: 50 },
    input: { flex: 1, height: "100%", fontSize: 15, fontWeight: "600" },
    labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    aiBtnSmall: { flexDirection: "row", alignItems: "center", backgroundColor: "#7C3AED", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, gap: 4 },
    aiBtnText: { color: "#fff", fontSize: 11, fontWeight: "900" },
    textAreaWrap: { height: 120, alignItems: "flex-start", paddingVertical: 12 },
    textArea: { flex: 1, height: "100%", fontSize: 14, lineHeight: 21, fontWeight: '500' },
    switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderRadius: 14, borderWidth: 1.5, marginBottom: 16 },
    switchLabel: { fontSize: 15, fontWeight: "700" },
    switchSub: { fontSize: 12, marginTop: 2, fontWeight: '500' },
    errorBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#FEF2F2", padding: 12, borderRadius: 10, gap: 8, marginBottom: 16 },
    errorText: { fontSize: 13, flex: 1, fontWeight: '600' },
    modalFooter: { flexDirection: "row", padding: 20, borderTopWidth: 1.5, gap: 12 },
    btnCancel: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    btnCancelText: { fontSize: 15, fontWeight: "800" },
    btnSave: { flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    btnSaveText: { fontSize: 15, fontWeight: "900", color: "#fff" },

    // AI REWRITE MODAL
    aiModalCard: { height: "auto", maxHeight: "85%" },
    aiIconBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#F3E8FF", justifyContent: "center", alignItems: "center", marginRight: 10 },
    closeBtn: { padding: 8, borderRadius: 999 },
    aiOptionBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFBEB", padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: "#FCD34D", marginBottom: 20 },
    aiOptionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#FEF3C7", justifyContent: "center", alignItems: "center", marginRight: 12 },
    aiOptionContent: { flex: 1 },
    aiOptionTitle: { fontSize: 16, fontWeight: "800", color: "#92400E" },
    aiOptionDesc: { fontSize: 12, color: "#B45309", marginTop: 2 },
    divider: { marginBottom: 16 },
    dividerText: { textAlign: "center", fontSize: 11, fontWeight: "900", color: "#9CA3AF", letterSpacing: 1 },
    subLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
    aiInput: { borderWidth: 1.5, borderRadius: 14, padding: 12, fontSize: 14, marginBottom: 14, fontWeight: '500' },
    generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#7C3AED", paddingVertical: 14, borderRadius: 14, gap: 8, marginBottom: 16 },
    generateBtnText: { color: "#fff", fontSize: 15, fontWeight: "900" },
    quickActions: { flexDirection: "row", justifyContent: "space-between", paddingTop: 14, borderTopWidth: 1.5 },
    textBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: 6 },
    textBtnColor: { fontSize: 13, fontWeight: "800" },
    historyNav: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 2 },
    histBtn: { padding: 4, paddingHorizontal: 6 },
    histText: { fontSize: 10, fontWeight: "800", minWidth: 24, textAlign: "center" },

    // PARSING
    parsingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    parsingSpinner: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F3E8FF', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    parsingTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
    parsingDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22, fontWeight: '500', marginBottom: 20 },
    parsingTips: { alignSelf: 'stretch', gap: 8 },
    parsingTipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    parsingTipText: { fontSize: 13, fontWeight: '600' },

    selectAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, marginBottom: 10, borderBottomWidth: 1 },
    selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    selectAllText: { fontSize: 14, fontWeight: '700' },
    categoryCount: { fontSize: 12, fontWeight: '600' },

    parsedItemCard: { borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1.5 },
    parsedItemHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
    parsedItemName: { fontSize: 15, fontWeight: '900' },
    parsedItemPrice: { fontSize: 14, fontWeight: '900', marginLeft: 8 },
    parsedItemDesc: { fontSize: 12, lineHeight: 17, fontWeight: '500', marginTop: 2 },
    parsedBadgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    parsedBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7 },
    parsedBadgeText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },

    // CONFIRM
    confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", padding: 20, justifyContent: "center", alignItems: "center" },
    confirmCard: { width: "100%", maxWidth: 500, borderRadius: 20, borderWidth: 1.5, padding: 18 },
    confirmHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
    confirmIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(37,99,235,0.10)", alignItems: "center", justifyContent: "center" },
    confirmIconDanger: { backgroundColor: "rgba(220,38,38,0.10)" },
    confirmTitle: { fontSize: 15, fontWeight: "900", flex: 1 },
    confirmMessage: { fontSize: 13, fontWeight: "500", lineHeight: 18, marginBottom: 16 },
    confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
    confirmBtn: { height: 44, paddingHorizontal: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    confirmBtnGhost: { borderWidth: 1.5 },
    confirmBtnGhostText: { fontWeight: "900" },
    confirmBtnText: { color: "#FFFFFF", fontWeight: "900" },

    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", zIndex: 999 },
    loadingBox: { padding: 28, borderRadius: 20, alignItems: "center" },
    loadingText: { marginTop: 12, fontSize: 15, fontWeight: "800" },
});