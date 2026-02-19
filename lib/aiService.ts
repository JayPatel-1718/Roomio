// ─────────────────────────────────────────────────────────────────────────────
// aiService.js  —  TWO-STEP MENU PARSING PIPELINE
//
//  Step 1 → OCR.space REST API  (free, 500 req/day)
//           Extracts ALL text from image or PDF reliably
//
//  Step 2 → Gemini 1.5 Flash REST API  (free, ~500 req/day)
//           Structures the raw text into menu JSON
//
//  WHY NOT just Gemini Vision?
//  • @google/generative-ai SDK does NOT work in React Native/Expo
//  • Direct fetch() to REST endpoints works everywhere
//  • OCR.space is purpose-built for text extraction — more reliable
//  • Two focused steps = much higher accuracy
// ─────────────────────────────────────────────────────────────────────────────

const OCR_API_KEY = process.env.EXPO_PUBLIC_OCR_API_KEY || 'helloworld'; // demo key works but is slow
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

const OCR_URL = 'https://api.ocr.space/parse/image';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
export const STANDARD_CATEGORIES = [
  'breakfast', 'lunch', 'dinner', 'beverages', 'desserts', 'snacks',
];

const META = {
  breakfast: { icon: '🍳', accent: '#2563EB', subtitle: 'Morning dishes' },
  lunch: { icon: '🍱', accent: '#16A34A', subtitle: 'Main course & combos' },
  dinner: { icon: '🍽️', accent: '#7C3AED', subtitle: 'Evening meals' },
  beverages: { icon: '🥤', accent: '#06B6D4', subtitle: 'Drinks & juices' },
  desserts: { icon: '🍨', accent: '#EC4899', subtitle: 'Sweets & treats' },
  snacks: { icon: '🍟', accent: '#F59E0B', subtitle: 'Light bites' },
  starters: { icon: '🥗', accent: '#84CC16', subtitle: 'Appetizers & starters' },
  soups: { icon: '🍲', accent: '#0891B2', subtitle: 'Soups & broths' },
  salads: { icon: '🥙', accent: '#65A30D', subtitle: 'Fresh salads' },
  pizza: { icon: '🍕', accent: '#DC2626', subtitle: 'Pizza & flatbreads' },
  burgers: { icon: '🍔', accent: '#D97706', subtitle: 'Burgers & sandwiches' },
  pasta: { icon: '🍝', accent: '#9333EA', subtitle: 'Pasta & noodles' },
  seafood: { icon: '🦞', accent: '#0369A1', subtitle: 'Seafood dishes' },
  biryani: { icon: '🍚', accent: '#92400E', subtitle: 'Biryani varieties' },
  chinese: { icon: '🥡', accent: '#C2410C', subtitle: 'Chinese cuisine' },
  continental: { icon: '🍴', accent: '#4F46E5', subtitle: 'Continental' },
  indian: { icon: '🫕', accent: '#F97316', subtitle: 'Indian cuisine' },
  rolls: { icon: '🌯', accent: '#D97706', subtitle: 'Rolls & wraps' },
  thali: { icon: '🍛', accent: '#059669', subtitle: 'Thali meals' },
  combo: { icon: '🎁', accent: '#7C3AED', subtitle: 'Combo meals' },
  mocktails: { icon: '🧃', accent: '#0891B2', subtitle: 'Mocktails & coolers' },
  cocktails: { icon: '🍹', accent: '#7C3AED', subtitle: 'Cocktails & spirits' },
  specials: { icon: '⭐', accent: '#EF4444', subtitle: "Chef's specials" },
  main_course: { icon: '🍛', accent: '#16A34A', subtitle: 'Main course' },
  breads: { icon: '🫓', accent: '#D97706', subtitle: 'Breads & rotis' },
  rice: { icon: '🍚', accent: '#15803D', subtitle: 'Rice dishes' },
  dal: { icon: '🫕', accent: '#B45309', subtitle: 'Dal & lentils' },
  sweets: { icon: '🍮', accent: '#DB2777', subtitle: 'Indian sweets' },
};

export const getCategoryMeta = (key) => {
  if (!key) return { key: 'lunch', icon: '🍜', accent: '#16A34A', subtitle: 'Dishes' };
  const k = String(key).toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (META[k]) return { ...META[k], key: k };
  const COLORS = ['#2563EB', '#16A34A', '#7C3AED', '#06B6D4', '#EC4899', '#F59E0B', '#EA580C', '#0891B2'];
  const ICONS = ['🍜', '🥘', '🍣', '🫔', '🧆', '🥪', '🍱', '🍲'];
  const idx = Math.abs([...k].reduce((a, c) => a + c.charCodeAt(0), 0)) % COLORS.length;
  return { key: k, icon: ICONS[idx], accent: COLORS[idx], subtitle: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
};

// ─── STEP 1: EXTRACT TEXT WITH OCR.SPACE ──────────────────────────────────────
const extractTextOCR = async (base64, mimeType = 'image/jpeg') => {
  console.log('📷 OCR.space: starting text extraction...');

  const dataPrefix = mimeType === 'application/pdf'
    ? 'data:application/pdf;base64,'
    : `data:${mimeType};base64,`;

  const form = new FormData();
  form.append('apikey', OCR_API_KEY);
  form.append('language', 'eng');
  form.append('isOverlayRequired', 'false');
  form.append('detectOrientation', 'true');
  form.append('scale', 'true');
  form.append('isTable', 'true');   // Better for menu grid layouts
  form.append('OCREngine', '2');    // Engine 2 = more accurate for complex docs
  form.append('base64Image', `${dataPrefix}${base64}`);

  const resp = await fetch(OCR_URL, { method: 'POST', body: form });

  if (!resp.ok) throw new Error(`OCR.space HTTP ${resp.status}: ${resp.statusText}`);

  const json = await resp.json();
  console.log('🔍 OCR.space response summary:', {
    isError: json.IsErroredOnProcessing,
    pageCount: json.ParsedResults?.length,
  });

  if (json.IsErroredOnProcessing) {
    const msg = json.ParsedResults?.[0]?.ErrorMessage
      || json.ErrorMessage
      || 'OCR processing failed';
    throw new Error(`OCR failed: ${msg}`);
  }

  const text = (json.ParsedResults || [])
    .map(r => r.ParsedText || '')
    .join('\n\n')
    .trim();

  if (!text || text.length < 10) {
    throw new Error('OCR found no readable text. Try a clearer, better-lit photo.');
  }

  console.log(`✅ OCR extracted ${text.length} chars. Preview: "${text.substring(0, 200)}"`);
  return text;
};

// ─── STEP 2: STRUCTURE WITH GEMINI REST ───────────────────────────────────────
const structureWithGemini = async (rawText) => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key missing. Set EXPO_PUBLIC_GEMINI_API_KEY in .env');
  }

  console.log('🤖 Gemini: structuring menu text...');

  const prompt = `You are a precise restaurant menu data extractor.

Extract every food and drink item from the menu text below.

IMPORTANT RULES:
- Extract EVERY single item — nothing should be skipped
- Use the EXACT section name from the menu as the category (lowercase, underscores)
  Examples: "starters", "main_course", "biryani", "cold_beverages", "south_indian"
- price must be a NUMBER only (e.g. 250 not "₹250"). Use null if not shown
- isVeg: true if vegetarian symbol shown, false if non-veg, null if unknown
- If no description exists, write a short appetizing 10-15 word one
- Return ONLY a valid JSON array. No explanation, no markdown, no code blocks.

MENU TEXT:
"""
${rawText.substring(0, 12000)}
"""

JSON array output:`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.05,
      topK: 1,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      console.log(`⏳ Gemini retry ${attempt}/3...`);
      await sleep(2500 * attempt);
    }

    try {
      const resp = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await resp.json();

      if (!resp.ok) {
        const errMsg = data?.error?.message || `HTTP ${resp.status}`;
        console.warn(`Gemini attempt ${attempt} error: ${errMsg}`);
        if (resp.status === 429) {
          // Rate limited — wait longer
          await sleep(10000);
        }
        continue;
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      console.log(`🤖 Gemini response (attempt ${attempt}):`, text?.substring(0, 400));

      if (!text) {
        console.warn('Gemini returned empty text');
        continue;
      }

      const parsed = safeParseJsonArray(text);
      if (parsed && parsed.length > 0) {
        console.log(`✅ Gemini structured ${parsed.length} items`);
        return parsed;
      }

      console.warn('Could not parse JSON from Gemini response');
    } catch (err) {
      console.error(`Gemini attempt ${attempt} threw: ${err.message}`);
    }
  }

  throw new Error('Gemini could not structure the menu after 3 attempts');
};

// ─── MAIN: parseMenuFromAI ─────────────────────────────────────────────────────
export const parseMenuFromAI = async (source, type = 'image') => {
  console.log(`\n🚀 parseMenuFromAI — type="${type}" source_len=${source?.length}`);

  let rawText;

  if (type === 'text') {
    rawText = source;
    console.log('📝 Text mode: using source directly');
  } else {
    // Strip data URL prefix if present
    let b64 = source;
    if (source.includes('base64,')) {
      b64 = source.split('base64,')[1];
    }
    const mime = type === 'pdf' ? 'application/pdf' : 'image/jpeg';
    rawText = await extractTextOCR(b64, mime);
  }

  if (!rawText?.trim()) throw new Error('No text could be extracted');

  const raw = await structureWithGemini(rawText);

  // Clean and normalize every item
  const cleaned = raw
    .filter(item => item?.name && String(item.name).trim().length > 1)
    .map(item => ({
      name: String(item.name).trim(),
      description: String(item.description || fallbackDesc(item.name, item.category)).trim(),
      price: toNumber(item.price),
      category: normalizeCategory(item.category),
      isVeg: (item.isVeg === true || item.isVeg === false) ? item.isVeg : null,
    }));

  console.log(`🎉 Returning ${cleaned.length} clean items`);
  return cleaned;
};

// ─── GENERATE AI MENU TEXT (rewrite) ─────────────────────────────────────────
export const generateAIMenuText = async (name, category, userPreferences = null) => {
  const fallback = {
    title: `Signature ${name}`,
    description: `Our special ${name.toLowerCase()} prepared fresh daily with premium ingredients.`,
  };

  if (!GEMINI_API_KEY) return fallback;

  const prefPart = userPreferences
    ? `\nUser preferences — Title keywords: "${userPreferences.titleElements || 'none'}". Desc style: "${userPreferences.descriptionElements || 'none'}".`
    : '';

  const prompt = `Restaurant menu copywriter. Enhance this dish entry.
Dish: "${name}"
Category: "${category}"${prefPart}

Respond ONLY with valid JSON (no markdown, no explanation):
{"title":"Premium 2-5 word name","description":"Vivid 15-25 word mouth-watering description"}`;

  try {
    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 200 },
      }),
    });
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      if (obj.title && obj.description) return obj;
    }
  } catch (e) {
    console.error('generateAIMenuText failed:', e.message);
  }

  return fallback;
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const ALIASES = {
  main_courses: 'main_course', mains: 'main_course',
  appetizer: 'starters', appetizers: 'starters', starter: 'starters',
  drinks: 'beverages', cold_drinks: 'beverages', hot_drinks: 'beverages',
  soft_drinks: 'beverages', juices: 'beverages', milkshakes: 'beverages', shakes: 'beverages',
  sweet: 'desserts', sweets_desserts: 'desserts', ice_creams: 'desserts',
  side_dish: 'snacks', sides: 'snacks', side_dishes: 'snacks', finger_foods: 'snacks',
  morning: 'breakfast', evening: 'dinner', night: 'dinner',
  north_indian: 'indian', south_indian: 'indian', mughlai: 'indian',
};

const normalizeCategory = (cat) => {
  if (!cat) return 'lunch';
  const c = String(cat).toLowerCase().trim().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  return ALIASES[c] || c || 'lunch';
};

const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return (!isNaN(n) && isFinite(n) && n > 0) ? Math.round(n * 100) / 100 : null;
};

const fallbackDesc = (name, category) => {
  const map = {
    breakfast: `Freshly prepared ${name} to start your morning right.`,
    lunch: `Hearty ${name} perfect for a satisfying midday meal.`,
    dinner: `Exquisite ${name} for a perfect evening dining experience.`,
    beverages: `Refreshing ${name} to complement your meal perfectly.`,
    desserts: `Indulgent ${name} — a delightful sweet ending.`,
    snacks: `Crispy and delicious ${name} for a quick bite.`,
    starters: `Delightful ${name} to begin your culinary journey.`,
  };
  return map[normalizeCategory(category)] || `Delicious ${name} made with the finest ingredients.`;
};

const safeParseJsonArray = (text) => {
  // 1. Direct
  try { if (text.trim().startsWith('[')) return JSON.parse(text.trim()); } catch { }
  // 2. Strip code fences
  const stripped = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try { if (stripped.startsWith('[')) return JSON.parse(stripped); } catch { }
  // 3. Find [ ... ]
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s !== -1 && e > s) {
    try { return JSON.parse(text.substring(s, e + 1)); } catch { }
  }
  // 4. Append missing ]
  if (s !== -1) {
    try { return JSON.parse(text.substring(s) + ']'); } catch { }
  }
  return null;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));