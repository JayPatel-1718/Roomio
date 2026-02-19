import {
    SafeAreaView, ScrollView, StyleSheet, Text, View, Pressable,
    Modal, TextInput, Alert, Switch, ActivityIndicator,
    useWindowDimensions, useColorScheme, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState, useRef } from 'react';
import { getAuth } from 'firebase/auth';
import {
    addDoc, collection, deleteDoc, doc, onSnapshot,
    serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import {
    generateAIMenuText, parseMenuFromAI,
    getCategoryMeta, STANDARD_CATEGORIES,
} from '../../lib/aiService';

// ─── TYPES ─────────────────────────────────────────────────────────────────────
type MenuItem = {
    id: string; category: string; name: string;
    description?: string; price?: number | null;
    isAvailable?: boolean; isVeg?: boolean | null;
    createdAt?: any; updatedAt?: any;
};
type CatDef = { key: string; title: string; subtitle: string; icon: string; accent: string; };
type ConfirmState = {
    open: boolean; title: string; message: string;
    confirmText: string; variant: 'destructive' | 'primary';
    onConfirm?: () => void | Promise<void>;
};

// ─── DEFAULT CATEGORIES ────────────────────────────────────────────────────────
const DEFAULT_CATS: CatDef[] = [
    { key: 'breakfast', title: 'Breakfast', subtitle: 'Morning dishes', icon: '🍳', accent: '#2563EB' },
    { key: 'lunch', title: 'Lunch', subtitle: 'Main course & combos', icon: '🍱', accent: '#16A34A' },
    { key: 'dinner', title: 'Dinner', subtitle: 'Evening meals', icon: '🍽️', accent: '#7C3AED' },
    { key: 'beverages', title: 'Beverages', subtitle: 'Drinks & juices', icon: '🥤', accent: '#06B6D4' },
    { key: 'desserts', title: 'Desserts', subtitle: 'Sweets & treats', icon: '🍨', accent: '#EC4899' },
    { key: 'snacks', title: 'Snacks', subtitle: 'Light bites', icon: '🍟', accent: '#F59E0B' },
];

const catFromKey = (key: string): CatDef => {
    const m = getCategoryMeta(key);
    return {
        key: m.key,
        title: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        subtitle: m.subtitle,
        icon: m.icon,
        accent: m.accent,
    };
};

// ─── COMPONENT ─────────────────────────────────────────────────────────────────
export default function MenuScreen() {
    const auth = getAuth();
    const user = auth.currentUser;
    const { width } = useWindowDimensions();
    const systemScheme = useColorScheme();
    const isWide = width >= 900;

    const [isDark, setIsDark] = useState(systemScheme === 'dark');
    const [items, setItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<CatDef[]>(DEFAULT_CATS);
    const [expandedCat, setExpandedCat] = useState<string | null>('breakfast');

    // Add/Edit modal
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rewriting, setRewriting] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [formCat, setFormCat] = useState('breakfast');
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [priceText, setPriceText] = useState('');
    const [isAvail, setIsAvail] = useState(true);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiHistory, setAiHistory] = useState<{ title: string; description: string }[]>([]);
    const [aiIdx, setAiIdx] = useState(-1);
    const [origText, setOrigText] = useState({ title: '', description: '' });
    const [rewriteCount, setRewriteCount] = useState(0);
    const hasAiRef = useRef(false);

    // AI rewrite modal
    const [showRewriteModal, setShowRewriteModal] = useState(false);
    const [titleHints, setTitleHints] = useState('');
    const [descHints, setDescHints] = useState('');

    // Import modal
    const [importOpen, setImportOpen] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [parseStatus, setParseStatus] = useState('');
    const [parsedItems, setParsedItems] = useState<any[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());

    // Confirm
    const [confirm, setConfirm] = useState<ConfirmState>({
        open: false, title: '', message: '', confirmText: 'Confirm', variant: 'primary',
    });
    const [confirmBusy, setConfirmBusy] = useState(false);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    }, []);

    // ─── THEME ────────────────────────────────────────────────────────────────
    const T = isDark ? {
        bg: '#010409', card: 'rgba(13,17,23,0.97)', text: '#f0f6fc', muted: '#8b949e',
        glass: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.10)',
        primary: '#2563eb', success: '#22c55e', danger: '#ef4444', warning: '#f59e0b',
    } : {
        bg: '#f8fafc', card: '#ffffff', text: '#0f172a', muted: '#64748b',
        glass: 'rgba(37,99,235,0.04)', border: 'rgba(37,99,235,0.12)',
        primary: '#2563eb', success: '#16a34a', danger: '#dc2626', warning: '#f59e0b',
    };

    // ─── FIREBASE ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;
        const unsub = onSnapshot(collection(db, 'users', user.uid, 'menuItems'), snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() as any })) as MenuItem[];
            list.sort((a: any, b: any) => (b?.createdAt?.toMillis?.() ?? 0) - (a?.createdAt?.toMillis?.() ?? 0));
            setItems(list);
            // Auto-add any new categories found in items
            const keys = new Set(list.map(i => i.category).filter(Boolean));
            setCategories(prev => {
                const existing = new Set(prev.map(c => c.key));
                const added = [...prev];
                for (const k of keys) if (!existing.has(k)) added.push(catFromKey(k));
                return added;
            });
        });
        return () => unsub();
    }, [user]);

    const byCategory = useMemo(() => {
        const map: Record<string, MenuItem[]> = {};
        for (const c of categories) map[c.key] = [];
        for (const it of items) {
            if (!map[it.category]) map[it.category] = [];
            map[it.category].push(it);
        }
        return map;
    }, [items, categories]);

    const ensureCat = (key: string) => {
        setCategories(prev => prev.find(c => c.key === key) ? prev : [...prev, catFromKey(key)]);
    };

    // ─── CONFIRM HELPER ───────────────────────────────────────────────────────
    const askConfirm = (cfg: Omit<ConfirmState, 'open'>) => {
        if (Platform.OS !== 'web') {
            Alert.alert(cfg.title, cfg.message, [
                { text: 'Cancel', style: 'cancel' },
                { text: cfg.confirmText, style: cfg.variant === 'destructive' ? 'destructive' : 'default', onPress: cfg.onConfirm },
            ]);
            return;
        }
        setConfirm({ open: true, ...cfg });
    };

    // ─── CAMERA ───────────────────────────────────────────────────────────────
    const handleCamera = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Denied', 'Camera access is required to scan menus.'); return;
        }
        const r = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.9 });
        if (!r.canceled && r.assets[0]) {
            const b64 = r.assets[0].base64 || await readBase64(r.assets[0].uri);
            runImport(b64, 'image');
        }
    };

    // ─── GALLERY ──────────────────────────────────────────────────────────────
    const handleGallery = async () => {
        const r = await ImagePicker.launchImageLibraryAsync({
            base64: true, quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });
        if (!r.canceled && r.assets[0]) {
            const b64 = r.assets[0].base64 || await readBase64(r.assets[0].uri);
            runImport(b64, 'image');
        }
    };

    // ─── PDF / FILE ───────────────────────────────────────────────────────────
    const handleFile = async () => {
        try {
            const r = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'text/plain', 'image/*'],
                copyToCacheDirectory: true,
            });
            if (r.canceled || !r.assets?.[0]) return;
            const asset = r.assets[0];
            console.log('📄 File picked:', asset.name, asset.mimeType);

            if (asset.mimeType?.startsWith('image/')) {
                const b64 = await readBase64(asset.uri);
                runImport(b64, 'image');
                return;
            }
            if (asset.mimeType === 'text/plain' || asset.name?.endsWith('.txt')) {
                const text = await FileSystem.readAsStringAsync(asset.uri);
                runImport(text, 'text');
                return;
            }
            // PDF or unknown — read as base64 and send to OCR
            setParseStatus('Reading file...');
            setImportOpen(true);
            setParsing(true);
            setParsedItems([]);
            setSelected(new Set());
            try {
                const b64 = await readBase64(asset.uri);
                setParseStatus('OCR extracting text from PDF...');
                await runImportCore(b64, 'pdf');
            } catch (e: any) {
                setParsing(false);
                setImportOpen(false);
                Alert.alert(
                    'PDF Tip',
                    'For PDFs, best results come from:\n\n• Taking a photo of each menu page with your camera\n• Or uploading a screenshot of the PDF\n\nCamera scan works best!',
                    [{ text: 'OK' }]
                );
            }
        } catch (e: any) {
            if (!e?.message?.toLowerCase().includes('cancel')) {
                Alert.alert('Error', e.message);
            }
        }
    };

    // ─── IMPORT FLOW ──────────────────────────────────────────────────────────
    const runImport = (source: string, type: 'image' | 'text' | 'pdf') => {
        setImportOpen(true);
        setParsing(true);
        setParsedItems([]);
        setSelected(new Set());
        setParseStatus(
            type === 'text' ? 'Reading menu text...' :
                type === 'pdf' ? 'OCR extracting PDF text...' :
                    'OCR extracting image text...'
        );
        runImportCore(source, type).catch(() => { });
    };

    const runImportCore = async (source: string, type: 'image' | 'text' | 'pdf') => {
        try {
            setParseStatus('Step 1/2 — Extracting text...');
            const data = await parseMenuFromAI(source, type);
            setParseStatus('');

            if (data && data.length > 0) {
                setParsedItems(data);
                setSelected(new Set(data.map((_: any, i: number) => i)));
            } else {
                setImportOpen(false);
                Alert.alert(
                    'No Items Found',
                    'AI could not find menu items. Tips:\n\n• Use better lighting\n• Hold the camera steady\n• Get closer to the menu text\n• Make sure text is in focus',
                    [{ text: 'OK' }]
                );
            }
        } catch (e: any) {
            console.error('Import error:', e);
            setImportOpen(false);
            Alert.alert('Import Failed', `${e.message}\n\nTips:\n• Better lighting helps a lot\n• Hold phone steady\n• Text must be clearly visible`, [{ text: 'OK' }]);
        } finally {
            setParsing(false);
            setParseStatus('');
        }
    };

    const saveImported = async () => {
        if (!user || parsedItems.length === 0) return;
        const toSave = parsedItems.filter((_: any, i: number) => selected.has(i));
        if (toSave.length === 0) { Alert.alert('Nothing selected'); return; }
        setSaving(true);
        try {
            const newCats = new Set<string>();
            for (const item of toSave) {
                ensureCat(item.category);
                if (!STANDARD_CATEGORIES.includes(item.category)) newCats.add(item.category);
            }
            await Promise.all(toSave.map((item: any) =>
                addDoc(collection(db, 'users', user.uid, 'menuItems'), {
                    category: item.category, name: item.name,
                    description: item.description || '', price: item.price ?? null,
                    isAvailable: true, isVeg: item.isVeg ?? null,
                    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                })
            ));
            setImportOpen(false); setParsedItems([]); setSelected(new Set());
            Alert.alert(
                '✨ Menu Synced!',
                `${toSave.length} items added.${newCats.size > 0 ? `\n\n🆕 New categories created: ${[...newCats].join(', ')}` : ''}`,
                [{ text: 'Great!' }]
            );
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setSaving(false);
        }
    };

    // ─── ADD / EDIT ───────────────────────────────────────────────────────────
    const openAdd = (cat?: string) => {
        setEditId(null); setFormCat(cat || 'breakfast'); setName(''); setDesc('');
        setPriceText(''); setIsAvail(true); setAiError(null); setAiHistory([]);
        setAiIdx(-1); setOrigText({ title: '', description: '' }); hasAiRef.current = false;
        setRewriteCount(0); setModalOpen(true);
    };
    const openEdit = (d: MenuItem) => {
        setEditId(d.id); setFormCat(d.category); setName(d.name || ''); setDesc(d.description || '');
        setPriceText(typeof d.price === 'number' ? String(d.price) : '');
        setIsAvail(d.isAvailable !== false); setAiError(null); setAiHistory([]);
        setAiIdx(-1); setOrigText({ title: d.name || '', description: d.description || '' });
        hasAiRef.current = false; setRewriteCount(0); setModalOpen(true);
    };
    const closeModal = () => { if (saving || rewriting) return; setModalOpen(false); setAiError(null); };

    // ─── SAVE DISH ────────────────────────────────────────────────────────────
    const saveDish = async () => {
        if (!user) { Alert.alert('Login required'); return; }
        if (!name.trim()) { Alert.alert('Required', 'Dish name is required.'); return; }
        let price: number | null = null;
        if (priceText.trim()) {
            const n = Number(priceText);
            if (!Number.isFinite(n) || n < 0) { Alert.alert('Invalid', 'Price must be a positive number.'); return; }
            price = n;
        }
        setSaving(true);
        try {
            ensureCat(formCat);
            const payload = {
                category: formCat, name: name.trim(),
                description: desc.trim() || '', price,
                isAvailable: !!isAvail, updatedAt: serverTimestamp(),
            };
            if (editId) {
                await updateDoc(doc(db, 'users', user.uid, 'menuItems', editId), payload);
            } else {
                await addDoc(collection(db, 'users', user.uid, 'menuItems'), { ...payload, createdAt: serverTimestamp() });
            }
            setModalOpen(false); setAiHistory([]); hasAiRef.current = false; setRewriteCount(0);
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleAvail = async (dish: MenuItem) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'users', user.uid, 'menuItems', dish.id), {
                isAvailable: !(dish.isAvailable !== false), updatedAt: serverTimestamp(),
            });
        } catch (e: any) { Alert.alert('Error', e.message); }
    };

    const deleteDish = (dish: MenuItem) => {
        if (!user) return;
        askConfirm({
            title: 'Delete Dish', message: `Delete "${dish.name}"? This cannot be undone.`,
            confirmText: 'Delete', variant: 'destructive',
            onConfirm: async () => {
                try { await deleteDoc(doc(db, 'users', user.uid, 'menuItems', dish.id)); }
                catch (e: any) { Alert.alert('Error', e.message); }
            },
        });
    };

    // ─── AI REWRITE ───────────────────────────────────────────────────────────
    const doRewrite = async (prefs?: any) => {
        if (!name.trim()) { Alert.alert('Error', 'Enter a dish name first'); return; }
        if (!hasAiRef.current) setOrigText({ title: name, description: desc });
        setRewriting(true); setAiError(null);
        try {
            const r = await generateAIMenuText(name, formCat, prefs);
            const entry = { title: r.title, description: r.description };
            const hist = [...aiHistory, entry];
            setAiHistory(hist); setAiIdx(hist.length - 1);
            setName(r.title); setDesc(r.description);
            hasAiRef.current = true; setRewriteCount(p => p + 1);
        } catch (e: any) { setAiError(e.message); }
        finally { setRewriting(false); if (prefs) closeRewriteModal(); }
    };

    const closeRewriteModal = () => { setShowRewriteModal(false); setTitleHints(''); setDescHints(''); };

    const navHistory = (dir: number) => {
        const ni = Math.max(0, Math.min(aiHistory.length - 1, aiIdx + dir));
        setName(aiHistory[ni].title); setDesc(aiHistory[ni].description); setAiIdx(ni);
    };

    const revertAI = () => {
        if (origText.title) setName(origText.title);
        if (origText.description) setDesc(origText.description);
        setAiHistory([]); setAiIdx(-1); hasAiRef.current = false; setRewriteCount(0);
    };

    // ─── RENDER CATEGORY ──────────────────────────────────────────────────────
    const renderCat = (cat: CatDef) => {
        const list = byCategory[cat.key] || [];
        const open = expandedCat === cat.key;
        return (
            <View key={cat.key} style={[S.catWrap, { backgroundColor: T.card, borderColor: T.border }]}>
                <Pressable
                    onPress={() => setExpandedCat(open ? null : cat.key)}
                    style={({ pressed }) => [S.catRow, { borderLeftColor: cat.accent }, pressed && { opacity: 0.9 }]}>
                    <View style={[S.emojiBox, { backgroundColor: `${cat.accent}18` }]}>
                        <Text style={S.emoji}>{cat.icon}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[S.catTitle, { color: T.text }]}>{cat.title}</Text>
                        <Text style={[S.catSub, { color: T.muted }]} numberOfLines={1}>{cat.subtitle}</Text>
                    </View>
                    <View style={S.catRight}>
                        <View style={[S.countPill, { backgroundColor: T.glass, borderColor: T.border }]}>
                            <Text style={[S.countText, { color: cat.accent }]}>{list.length}</Text>
                        </View>
                        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={T.muted} />
                    </View>
                </Pressable>

                {open && (
                    <View style={[S.expandArea, { borderTopColor: T.border, backgroundColor: T.glass }]}>
                        <View style={S.expandHeader}>
                            <Text style={[S.expandLabel, { color: T.muted }]}>DISHES</Text>
                            <Pressable onPress={() => openAdd(cat.key)}
                                style={({ p }) => [S.addSmall, { backgroundColor: cat.accent }]}>
                                <Ionicons name="add" size={15} color="#fff" />
                                <Text style={S.addSmallTxt}>Add</Text>
                            </Pressable>
                        </View>

                        {list.length === 0 ? (
                            <View style={S.emptyBox}>
                                <Ionicons name="fast-food-outline" size={22} color={T.muted} />
                                <Text style={[S.emptyTxt, { color: T.muted }]}>No {cat.title.toLowerCase()} dishes yet.</Text>
                            </View>
                        ) : list.map(dish => {
                            const avail = dish.isAvailable !== false;
                            return (
                                <View key={dish.id} style={[S.dishCard, { backgroundColor: T.card, borderColor: T.border }]}>
                                    <View style={S.dishTop}>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                {dish.isVeg !== null && dish.isVeg !== undefined && (
                                                    <View style={[S.vegDot, { borderColor: dish.isVeg ? '#16A34A' : '#DC2626' }]}>
                                                        <View style={[S.vegInner, { backgroundColor: dish.isVeg ? '#16A34A' : '#DC2626' }]} />
                                                    </View>
                                                )}
                                                <Text style={[S.dishName, { color: T.text }]} numberOfLines={1}>{dish.name}</Text>
                                            </View>
                                            {!!dish.description && (
                                                <Text style={[S.dishDesc, { color: T.muted }]} numberOfLines={2}>{dish.description}</Text>
                                            )}
                                        </View>
                                        <Text style={[S.dishPrice, { color: cat.accent }]}>
                                            {typeof dish.price === 'number' ? `₹${dish.price}` : '—'}
                                        </Text>
                                    </View>
                                    <View style={S.dishBottom}>
                                        <Pressable onPress={() => toggleAvail(dish)}
                                            style={({ pressed }) => [S.availPill,
                                            {
                                                backgroundColor: avail ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)',
                                                borderColor: avail ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'
                                            },
                                            pressed && { opacity: 0.85 }]}>
                                            <View style={[S.dot, { backgroundColor: avail ? T.success : T.danger }]} />
                                            <Text style={[S.availTxt, { color: avail ? T.success : T.danger }]}>
                                                {avail ? 'Available' : 'Unavailable'}
                                            </Text>
                                        </Pressable>
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <Pressable onPress={() => openEdit(dish)}
                                                style={({ pressed }) => [S.iconBtn, { backgroundColor: T.glass, borderColor: T.border }, pressed && { opacity: 0.8 }]}>
                                                <Ionicons name="create-outline" size={17} color={T.primary} />
                                            </Pressable>
                                            <Pressable onPress={() => deleteDish(dish)}
                                                style={({ pressed }) => [S.iconBtn, { backgroundColor: T.glass, borderColor: T.border }, pressed && { opacity: 0.8 }]}>
                                                <Ionicons name="trash-outline" size={17} color={T.danger} />
                                            </Pressable>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}

                        <Pressable onPress={() => openAdd(cat.key)}
                            style={({ pressed }) => [S.addBig, { backgroundColor: cat.accent }, pressed && { opacity: 0.9 }]}>
                            <Ionicons name="add-circle-outline" size={17} color="#fff" />
                            <Text style={S.addBigTxt}>Add More Dishes</Text>
                        </Pressable>
                    </View>
                )}
            </View>
        );
    };

    if (!user) {
        return (
            <SafeAreaView style={[S.safe, { backgroundColor: T.bg }]}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="lock-closed-outline" size={28} color={T.muted} />
                    <Text style={{ marginTop: 12, color: T.muted, fontWeight: '800', fontSize: 15 }}>
                        Please login to manage menu
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    // ─── FULL RENDER ──────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[S.safe, { backgroundColor: T.bg }]}>

            {/* CONFIRM MODAL */}
            <Modal visible={confirm.open} transparent animationType="fade" onRequestClose={() => setConfirm(c => ({ ...c, open: false }))}>
                <View style={S.overlay}>
                    <View style={[S.confirmCard, { backgroundColor: T.card, borderColor: T.border }]}>
                        <View style={S.confirmHead}>
                            <View style={[S.confirmIcon, confirm.variant === 'destructive' && { backgroundColor: 'rgba(220,38,38,0.12)' }]}>
                                <Ionicons name={confirm.variant === 'destructive' ? 'warning-outline' : 'help-circle-outline'} size={20}
                                    color={confirm.variant === 'destructive' ? T.danger : T.primary} />
                            </View>
                            <Text style={[S.confirmTitle, { color: T.text, flex: 1 }]}>{confirm.title}</Text>
                        </View>
                        <Text style={[S.confirmMsg, { color: T.muted }]}>{confirm.message}</Text>
                        <View style={S.confirmBtns}>
                            <Pressable onPress={() => setConfirm(c => ({ ...c, open: false }))} disabled={confirmBusy}
                                style={({ pressed }) => [S.confirmBtn, { backgroundColor: T.glass, borderWidth: 1.5, borderColor: T.border }, pressed && { opacity: 0.9 }]}>
                                <Text style={[{ fontWeight: '900' }, { color: T.muted }]}>Cancel</Text>
                            </Pressable>
                            <Pressable disabled={confirmBusy}
                                onPress={async () => {
                                    if (!confirm.onConfirm) { setConfirm(c => ({ ...c, open: false })); return; }
                                    setConfirmBusy(true);
                                    try { await confirm.onConfirm(); } finally { setConfirmBusy(false); setConfirm(c => ({ ...c, open: false })); }
                                }}
                                style={({ pressed }) => [S.confirmBtn, { backgroundColor: confirm.variant === 'destructive' ? T.danger : T.primary }, pressed && { opacity: 0.9 }]}>
                                {confirmBusy ? <ActivityIndicator color="#fff" /> :
                                    <Text style={{ color: '#fff', fontWeight: '900' }}>{confirm.confirmText}</Text>}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ADD / EDIT MODAL */}
            <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={closeModal}>
                <View style={S.overlay}>
                    <View style={[S.modalCard, { backgroundColor: T.card, borderColor: T.border }, isWide && { maxWidth: 700, alignSelf: 'center', width: '100%' }]}>
                        <View style={[S.modalHead, { borderBottomColor: T.border }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                <View style={[S.modalIcon, { backgroundColor: `${T.primary}15` }]}>
                                    <Ionicons name="restaurant-outline" size={18} color={T.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[S.modalTitle, { color: T.text }]}>
                                        {editId ? 'Edit Dish' : 'Add Dish'}{rewriteCount > 0 ? ` (AI ×${rewriteCount})` : ''}
                                    </Text>
                                    <Text style={[S.modalSub, { color: T.muted }]}>Category + name required</Text>
                                </View>
                            </View>
                            <Pressable onPress={closeModal} disabled={saving || rewriting}
                                style={[S.closeBtn, { backgroundColor: T.glass, borderColor: T.border }]}>
                                <Ionicons name="close" size={18} color={T.muted} />
                            </Pressable>
                        </View>

                        <ScrollView style={S.modalBody} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
                            {/* Category chips */}
                            <Text style={[S.lbl, { color: T.text }]}>Category</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {categories.map(c => {
                                        const active = formCat === c.key;
                                        return (
                                            <Pressable key={c.key} onPress={() => setFormCat(c.key)}
                                                style={[S.chip,
                                                {
                                                    backgroundColor: active ? `${c.accent}15` : T.glass,
                                                    borderColor: active ? `${c.accent}40` : T.border
                                                }]}>
                                                <Text style={{ fontSize: 13, marginRight: 4 }}>{c.icon}</Text>
                                                <Text style={[S.chipTxt, { color: active ? c.accent : T.muted }]}>{c.title}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </ScrollView>

                            {/* Name */}
                            <Text style={[S.lbl, { color: T.text }]}>Dish Name *</Text>
                            <View style={[S.inputRow, { backgroundColor: T.glass, borderColor: T.border }]}>
                                <Ionicons name="fast-food-outline" size={17} color={T.primary} style={{ marginRight: 10 }} />
                                <TextInput value={name} onChangeText={setName}
                                    placeholder="e.g., Masala Dosa, Butter Chicken"
                                    placeholderTextColor={T.muted} style={[S.input, { color: T.text }]} autoCorrect={false} />
                            </View>

                            {/* Price */}
                            <Text style={[S.lbl, { color: T.text }]}>Price ₹ (optional)</Text>
                            <View style={[S.inputRow, { backgroundColor: T.glass, borderColor: T.border }]}>
                                <Ionicons name="cash-outline" size={17} color={T.success} style={{ marginRight: 10 }} />
                                <TextInput value={priceText} onChangeText={setPriceText}
                                    placeholder="0.00" placeholderTextColor={T.muted}
                                    style={[S.input, { color: T.text }]} keyboardType="numeric" />
                            </View>

                            {/* Description row */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Text style={[S.lbl, { color: T.text, marginBottom: 0 }]}>Description</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    {aiHistory.length > 0 && (
                                        <View style={[S.histNav, { backgroundColor: T.glass }]}>
                                            <Pressable onPress={() => navHistory(-1)} disabled={aiIdx <= 0} style={S.histBtn}>
                                                <Ionicons name="chevron-back" size={11} color={aiIdx <= 0 ? T.muted : T.text} />
                                            </Pressable>
                                            <Text style={[S.histTxt, { color: T.text }]}>{aiIdx + 1}/{aiHistory.length}</Text>
                                            <Pressable onPress={() => navHistory(1)} disabled={aiIdx >= aiHistory.length - 1} style={S.histBtn}>
                                                <Ionicons name="chevron-forward" size={11} color={aiIdx >= aiHistory.length - 1 ? T.muted : T.text} />
                                            </Pressable>
                                        </View>
                                    )}
                                    <Pressable onPress={() => { if (!name.trim()) { Alert.alert('Error', 'Enter dish name first'); return; } setShowRewriteModal(true); }}
                                        disabled={rewriting}
                                        style={[S.aiBtn, rewriting && { opacity: 0.6 }]}>
                                        {rewriting ? <ActivityIndicator size="small" color="#fff" /> :
                                            <><Ionicons name="sparkles" size={11} color="#fff" /><Text style={S.aiBtnTxt}>AI</Text></>}
                                    </Pressable>
                                </View>
                            </View>
                            <View style={[S.inputRow, S.textArea, { backgroundColor: T.glass, borderColor: T.border }]}>
                                <TextInput value={desc} onChangeText={setDesc}
                                    placeholder="Ingredients, preparation, taste..."
                                    placeholderTextColor={T.muted} style={[S.textAreaInput, { color: T.text }]}
                                    multiline textAlignVertical="top" />
                            </View>

                            {/* Available */}
                            <View style={[S.switchRow, { backgroundColor: T.glass, borderColor: T.border }]}>
                                <View>
                                    <Text style={[{ fontSize: 15, fontWeight: '700' }, { color: T.text }]}>Available</Text>
                                    <Text style={[{ fontSize: 12, marginTop: 2 }, { color: T.muted }]}>Show in guest menu</Text>
                                </View>
                                <Switch value={isAvail} onValueChange={setIsAvail}
                                    trackColor={{ false: T.border, true: `${T.primary}60` }} thumbColor={isAvail ? T.primary : '#F3F4F6'} />
                            </View>

                            {aiError && (
                                <View style={[S.errBox, { borderColor: `${T.danger}30` }]}>
                                    <Ionicons name="alert-circle-outline" size={15} color={T.danger} />
                                    <Text style={[{ fontSize: 12, flex: 1, fontWeight: '600' }, { color: T.danger }]}>{aiError}</Text>
                                </View>
                            )}
                        </ScrollView>

                        <View style={[S.modalFoot, { borderTopColor: T.border }]}>
                            <Pressable onPress={closeModal} disabled={saving || rewriting}
                                style={[S.btnCancel, { backgroundColor: T.glass, borderColor: T.border }]}>
                                <Text style={[{ fontSize: 14, fontWeight: '800' }, { color: T.muted }]}>Cancel</Text>
                            </Pressable>
                            <Pressable onPress={saveDish} disabled={saving || rewriting}
                                style={[S.btnSave, { backgroundColor: T.primary }, saving && { opacity: 0.7 }]}>
                                {saving ? <ActivityIndicator color="#fff" size="small" /> :
                                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>{editId ? 'Save Changes' : 'Create Dish'}</Text>}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* AI REWRITE MODAL */}
            <Modal visible={showRewriteModal} transparent animationType="fade" onRequestClose={closeRewriteModal}>
                <View style={S.overlay}>
                    <View style={[S.modalCard, S.aiModal, { backgroundColor: T.card, borderColor: T.border }]}>
                        <View style={[S.modalHead, { borderBottomColor: T.border }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={S.aiIconBadge}><Ionicons name="sparkles" size={15} color="#7C3AED" /></View>
                                <Text style={[S.modalTitle, { color: T.text }]}>AI Magic Rewrite</Text>
                            </View>
                            <Pressable onPress={closeRewriteModal} style={[S.closeBtn, { backgroundColor: T.glass, borderColor: T.border }]}>
                                <Ionicons name="close" size={18} color={T.muted} />
                            </Pressable>
                        </View>
                        <ScrollView style={{ padding: 20 }}>
                            <Text style={[S.lbl, { color: T.text, marginTop: 0 }]}>Enhance "{name}"</Text>

                            <Pressable onPress={() => { closeRewriteModal(); doRewrite(); }}
                                style={S.quickBtn}>
                                <View style={S.quickIcon}><Ionicons name="flash" size={20} color="#F59E0B" /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#92400E' }}>Quick Enhance</Text>
                                    <Text style={{ fontSize: 12, color: '#B45309', marginTop: 2 }}>Instantly improve name & description</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                            </Pressable>

                            <Text style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginVertical: 14 }}>
                                OR CUSTOMIZE
                            </Text>

                            <Text style={[S.lbl, { color: T.text, textTransform: 'none', fontSize: 13 }]}>Title Keywords (optional)</Text>
                            <TextInput style={[S.aiInput, { backgroundColor: T.glass, borderColor: T.border, color: T.text }]}
                                placeholder="e.g., Spicy, Crispy, Homemade" placeholderTextColor={T.muted}
                                value={titleHints} onChangeText={setTitleHints} />
                            <Text style={[S.lbl, { color: T.text, textTransform: 'none', fontSize: 13 }]}>Description Style (optional)</Text>
                            <TextInput style={[S.aiInput, { backgroundColor: T.glass, borderColor: T.border, color: T.text }]}
                                placeholder="e.g., served with mint chutney, cooked in ghee" placeholderTextColor={T.muted}
                                value={descHints} onChangeText={setDescHints} />
                            <Pressable onPress={() => doRewrite({ titleElements: titleHints, descriptionElements: descHints })}
                                disabled={!titleHints && !descHints}
                                style={[S.genBtn, (!titleHints && !descHints) && { backgroundColor: T.border }]}>
                                <Ionicons name="sparkles" size={17} color="#fff" />
                                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>Generate Custom</Text>
                            </Pressable>

                            <View style={[S.quickActs, { borderTopColor: T.border }]}>
                                <Pressable style={S.txtBtn} onPress={() => { closeRewriteModal(); const h = [...aiHistory]; const n = h; setAiHistory([]); setAiIdx(-1); hasAiRef.current = false; doRewrite(null); }}>
                                    <Ionicons name="refresh" size={13} color={T.text} />
                                    <Text style={[{ fontSize: 12, fontWeight: '800' }, { color: T.text }]}>Fresh Rewrite</Text>
                                </Pressable>
                                {(aiHistory.length > 0 || hasAiRef.current) && (
                                    <Pressable style={S.txtBtn} onPress={() => { revertAI(); closeRewriteModal(); }}>
                                        <Ionicons name="arrow-undo-outline" size={13} color={T.danger} />
                                        <Text style={[{ fontSize: 12, fontWeight: '800' }, { color: T.danger }]}>Revert Original</Text>
                                    </Pressable>
                                )}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* IMPORT MODAL */}
            <Modal visible={importOpen} animationType="slide" transparent>
                <View style={S.overlay}>
                    <View style={[S.modalCard, { height: '90%', backgroundColor: T.card, borderColor: T.border }]}>
                        <View style={[S.modalHead, { borderBottomColor: T.border }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                <View style={[S.modalIcon, { backgroundColor: '#7C3AED18' }]}>
                                    <Ionicons name="sparkles" size={18} color="#7C3AED" />
                                </View>
                                <View>
                                    <Text style={[S.modalTitle, { color: T.text }]}>AI Menu Sync</Text>
                                    <Text style={[S.modalSub, { color: T.muted }]}>
                                        {parsing ? parseStatus || 'Processing...' : `${parsedItems.length} items detected`}
                                    </Text>
                                </View>
                            </View>
                            {!parsing && (
                                <Pressable onPress={() => { setImportOpen(false); setParsedItems([]); }}
                                    style={[S.closeBtn, { backgroundColor: T.glass, borderColor: T.border }]}>
                                    <Ionicons name="close" size={18} color={T.muted} />
                                </Pressable>
                            )}
                        </View>

                        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 10 }}>
                            {parsing ? (
                                <View style={S.parsingBox}>
                                    <View style={S.spinnerWrap}>
                                        <ActivityIndicator size="large" color="#7C3AED" />
                                    </View>
                                    <Text style={[S.parsTitle, { color: T.text }]}>
                                        {parseStatus || 'AI is reading your menu...'}
                                    </Text>
                                    <Text style={[S.parsDesc, { color: T.muted }]}>
                                        OCR extracts all text, then AI structures it into menu items. This takes 10–30 seconds.
                                    </Text>
                                    {['Extracting text with OCR', 'Identifying every dish', 'Detecting prices', 'Auto-categorizing items'].map((t, i) => (
                                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                            <Ionicons name="ellipse" size={6} color="#7C3AED" />
                                            <Text style={{ color: T.muted, fontSize: 13 }}>{t}</Text>
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <>
                                    {parsedItems.length > 0 && (
                                        <View style={[S.selRow, { borderBottomColor: T.border }]}>
                                            <Pressable onPress={() => setSelected(
                                                selected.size === parsedItems.length ? new Set() : new Set(parsedItems.map((_: any, i: number) => i))
                                            )} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons name={selected.size === parsedItems.length ? 'checkbox' : 'square-outline'} size={20} color={T.primary} />
                                                <Text style={{ color: T.text, fontSize: 14, fontWeight: '700' }}>
                                                    {selected.size === parsedItems.length ? 'Deselect All' : 'Select All'}
                                                    <Text style={{ color: T.muted }}> ({selected.size}/{parsedItems.length})</Text>
                                                </Text>
                                            </Pressable>
                                            <Text style={{ color: T.muted, fontSize: 12 }}>
                                                {new Set(parsedItems.map((i: any) => i.category)).size} categories
                                            </Text>
                                        </View>
                                    )}
                                    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                        {parsedItems.map((item: any, idx: number) => {
                                            const sel = selected.has(idx);
                                            const meta = getCategoryMeta(item.category);
                                            return (
                                                <Pressable key={idx} onPress={() => {
                                                    const s = new Set(selected);
                                                    sel ? s.delete(idx) : s.add(idx);
                                                    setSelected(s);
                                                }}
                                                    style={[S.parsedCard,
                                                    {
                                                        backgroundColor: sel ? `${meta.accent}08` : T.glass,
                                                        borderColor: sel ? `${meta.accent}40` : T.border
                                                    }]}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                                        <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={18}
                                                            color={sel ? meta.accent : T.muted} style={{ marginRight: 10, marginTop: 2 }} />
                                                        <View style={{ flex: 1 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                                <Text style={{ fontSize: 15, fontWeight: '900', color: T.text }}>{item.name}</Text>
                                                                {item.isVeg !== null && item.isVeg !== undefined && (
                                                                    <View style={[S.vegDot, { borderColor: item.isVeg ? '#16A34A' : '#DC2626' }]}>
                                                                        <View style={[S.vegInner, { backgroundColor: item.isVeg ? '#16A34A' : '#DC2626' }]} />
                                                                    </View>
                                                                )}
                                                            </View>
                                                            {!!item.description && (
                                                                <Text style={{ fontSize: 12, color: T.muted, marginTop: 3, lineHeight: 17 }} numberOfLines={2}>
                                                                    {item.description}
                                                                </Text>
                                                            )}
                                                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                                                <View style={[S.badge, { backgroundColor: `${meta.accent}15` }]}>
                                                                    <Text style={{ marginRight: 3, fontSize: 10 }}>{meta.icon}</Text>
                                                                    <Text style={{ fontSize: 10, fontWeight: '900', color: meta.accent, textTransform: 'uppercase' }}>
                                                                        {item.category.replace(/_/g, ' ')}
                                                                    </Text>
                                                                </View>
                                                                {!STANDARD_CATEGORIES.includes(item.category) && (
                                                                    <View style={[S.badge, { backgroundColor: '#FEF3C7' }]}>
                                                                        <Text style={{ fontSize: 10, fontWeight: '900', color: '#92400E' }}>NEW CATEGORY</Text>
                                                                    </View>
                                                                )}
                                                                {item.price && (
                                                                    <Text style={{ fontSize: 13, fontWeight: '900', color: meta.accent, marginLeft: 'auto' }}>
                                                                        ₹{item.price}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        </View>
                                                    </View>
                                                </Pressable>
                                            );
                                        })}
                                        <View style={{ height: 20 }} />
                                    </ScrollView>
                                </>
                            )}
                        </View>

                        {!parsing && parsedItems.length > 0 && (
                            <View style={[S.modalFoot, { borderTopColor: T.border }]}>
                                <Pressable onPress={() => { setImportOpen(false); setParsedItems([]); }}
                                    style={[S.btnCancel, { backgroundColor: T.glass, borderColor: T.border }]}>
                                    <Text style={{ fontSize: 14, fontWeight: '800', color: T.muted }}>Discard</Text>
                                </Pressable>
                                <Pressable onPress={saveImported} disabled={saving || selected.size === 0}
                                    style={[S.btnSave, { backgroundColor: '#7C3AED' }, selected.size === 0 && { opacity: 0.5 }]}>
                                    {saving ? <ActivityIndicator color="#fff" size="small" /> :
                                        <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save {selected.size} Items</Text>}
                                </Pressable>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            {/* MAIN SCREEN */}
            <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
                {/* HEADER */}
                <View style={[S.header, { backgroundColor: T.card }]}>
                    <View style={S.headerTop}>
                        <View>
                            <Text style={[S.headerTitle, { color: T.text }]}>Food Menu</Text>
                            <Text style={[S.headerSub, { color: T.muted }]}>{items.length} dishes · {categories.length} categories</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Pressable onPress={() => setIsDark(!isDark)}
                                style={[S.themeBtn, { backgroundColor: T.glass, borderColor: T.border }]}>
                                <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={T.primary} />
                            </Pressable>
                            <Pressable onPress={handleCamera}
                                style={({ pressed }) => [S.scanBtn, pressed && { opacity: 0.9 }]}>
                                <Ionicons name="camera" size={17} color="#fff" />
                                <Text style={S.scanTxt}>Scan</Text>
                            </Pressable>
                        </View>
                    </View>

                    <View style={[S.importBar, { backgroundColor: T.glass, borderColor: T.border }]}>
                        <Pressable onPress={handleGallery}
                            style={({ pressed }) => [S.importOption, pressed && { opacity: 0.8 }]}>
                            <Ionicons name="images-outline" size={15} color={T.text} />
                            <Text style={[S.importTxt, { color: T.text }]}>Photo Library</Text>
                        </Pressable>
                        <View style={[S.dividerV, { backgroundColor: T.border }]} />
                        <Pressable onPress={handleFile}
                            style={({ pressed }) => [S.importOption, pressed && { opacity: 0.8 }]}>
                            <Ionicons name="document-text-outline" size={15} color={T.text} />
                            <Text style={[S.importTxt, { color: T.text }]}>PDF / File</Text>
                        </Pressable>
                        <View style={[S.dividerV, { backgroundColor: T.border }]} />
                        <Pressable onPress={() => openAdd()}
                            style={({ pressed }) => [S.importOption, pressed && { opacity: 0.8 }]}>
                            <Ionicons name="add-circle-outline" size={15} color={T.primary} />
                            <Text style={[S.importTxt, { color: T.primary }]}>Manual Add</Text>
                        </Pressable>
                    </View>
                </View>

                <ScrollView contentContainerStyle={S.list} showsVerticalScrollIndicator={false}>
                    {categories.map(c => renderCat(c))}
                </ScrollView>
            </Animated.View>

            {saving && (
                <View style={S.loadOverlay}>
                    <View style={[S.loadBox, { backgroundColor: T.card }]}>
                        <ActivityIndicator size="large" color={T.primary} />
                        <Text style={[{ marginTop: 12, fontSize: 14, fontWeight: '800' }, { color: T.text }]}>Saving...</Text>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────
const readBase64 = async (uri: string): Promise<string> => {
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
};

// ─── STYLES ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
    safe: { flex: 1 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    // Header
    header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    headerTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
    headerSub: { fontSize: 13, marginTop: 3, fontWeight: '600' },
    themeBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
    scanBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#7C3AED', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, gap: 6, shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 5 },
    scanTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
    importBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 4, borderWidth: 1.5 },
    importOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, gap: 5, borderRadius: 10 },
    importTxt: { fontSize: 12, fontWeight: '700' },
    dividerV: { width: 1.5, height: 16 },
    // Category
    list: { padding: 16, paddingBottom: 100 },
    catWrap: { marginBottom: 14, borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
    catRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderLeftWidth: 4 },
    emojiBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    emoji: { fontSize: 22 },
    catTitle: { fontSize: 17, fontWeight: '800', marginBottom: 2 },
    catSub: { fontSize: 12, fontWeight: '600' },
    catRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5 },
    countText: { fontSize: 12, fontWeight: '900' },
    expandArea: { borderTopWidth: 1.5, paddingBottom: 12 },
    expandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    expandLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
    addSmall: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, gap: 4 },
    addSmallTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
    emptyBox: { alignItems: 'center', paddingVertical: 24 },
    emptyTxt: { fontSize: 13, marginTop: 6, fontWeight: '600' },
    // Dish card
    dishCard: { marginHorizontal: 14, marginBottom: 10, borderRadius: 16, padding: 14, borderWidth: 1.5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
    dishTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
    dishName: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
    dishDesc: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
    dishPrice: { fontSize: 15, fontWeight: '900' },
    dishBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    availPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5, gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 4 },
    availTxt: { fontSize: 11, fontWeight: '800' },
    iconBtn: { padding: 7, borderRadius: 10, borderWidth: 1.5 },
    addBig: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14, marginTop: 8, paddingVertical: 12, borderRadius: 14, gap: 6 },
    addBigTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
    vegDot: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    vegInner: { width: 6, height: 6, borderRadius: 1 },
    // Modals
    modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '90%', width: '100%', borderWidth: 1.5, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 20, display: 'flex', flexDirection: 'column' },
    modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1.5 },
    modalIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    modalTitle: { fontSize: 18, fontWeight: '900' },
    modalSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
    closeBtn: { padding: 6, borderRadius: 999, borderWidth: 1.5 },
    modalBody: { flex: 1, padding: 20 },
    modalFoot: { flexDirection: 'row', padding: 20, borderTopWidth: 1.5, gap: 12 },
    btnCancel: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    btnSave: { flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    // Form
    lbl: { fontSize: 12, fontWeight: '900', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5 },
    chipTxt: { fontSize: 13, fontWeight: '700' },
    inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, marginBottom: 16, height: 50 },
    input: { flex: 1, height: '100%', fontSize: 15, fontWeight: '600' },
    textArea: { height: 110, alignItems: 'flex-start', paddingVertical: 12 },
    textAreaInput: { flex: 1, height: '100%', fontSize: 14, lineHeight: 21, fontWeight: '500' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 14, borderWidth: 1.5, marginBottom: 16 },
    errBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, gap: 8, marginBottom: 12, borderWidth: 1 },
    // AI rewrite modal
    aiModal: { height: 'auto', maxHeight: '85%' },
    aiIconBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3E8FF', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    quickBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: '#FCD34D', marginBottom: 16 },
    quickIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    aiInput: { borderWidth: 1.5, borderRadius: 14, padding: 12, fontSize: 14, marginBottom: 14, fontWeight: '500' },
    genBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C3AED', paddingVertical: 14, borderRadius: 14, gap: 8, marginBottom: 16 },
    quickActs: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, borderTopWidth: 1.5 },
    txtBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
    histNav: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 2 },
    histBtn: { padding: 4, paddingHorizontal: 6 },
    histTxt: { fontSize: 10, fontWeight: '800', minWidth: 24, textAlign: 'center' },
    aiBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#7C3AED', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, gap: 4 },
    aiBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '900' },
    // Import modal
    parsingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    spinnerWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F3E8FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    parsTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
    parsDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontWeight: '500', marginBottom: 16 },
    selRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 8, borderBottomWidth: 1 },
    parsedCard: { borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1.5 },
    badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
    // Confirm
    confirmCard: { width: '100%', maxWidth: 500, borderRadius: 20, borderWidth: 1.5, padding: 18 },
    confirmHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    confirmIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(37,99,235,0.10)', alignItems: 'center', justifyContent: 'center' },
    confirmTitle: { fontSize: 15, fontWeight: '900' },
    confirmMsg: { fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: 16, color: '#64748b' },
    confirmBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    confirmBtn: { height: 44, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    loadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
    loadBox: { padding: 28, borderRadius: 20, alignItems: 'center' },
});