// ─────────────────────────────────────────────────────────────────────────────
// lib/aiService.js
// OCR.space + Gemini 1.5 Flash REST (both free, no SDK needed)
// FIXED: Better PDF handling, retry logic, and error messages
// ─────────────────────────────────────────────────────────────────────────────

const OCR_API_KEY = process.env.EXPO_PUBLIC_OCR_API_KEY || 'helloworld';
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

// ⚠️ URL is built INSIDE functions so the key is always read at call-time
const getGeminiURL = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const OCR_URL = 'https://api.ocr.space/parse/image';

// ─── STANDARD CATEGORIES ──────────────────────────────────────────────────────
export const STANDARD_CATEGORIES = [
  'breakfast', 'lunch', 'dinner', 'beverages', 'desserts', 'snacks',
  'starters', 'soups', 'salads', 'pizza', 'burgers', 'pasta',
  'seafood', 'biryani', 'chinese', 'continental', 'indian',
  'rolls', 'thali', 'combo', 'mocktails', 'specials', 'main_course',
  'breads', 'rice', 'dal', 'sweets'
];

// ─── CATEGORY META ────────────────────────────────────────────────────────────
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

// ─── STEP 1: OCR.SPACE ────────────────────────────────────────────────────────
const extractTextOCR = async (base64, mimeType = 'image/jpeg') => {
  console.log('📷 OCR.space: extracting text, mime =', mimeType);

  // Handle different mime types
  let fileType = 'jpg';
  if (mimeType.includes('png')) fileType = 'png';
  if (mimeType.includes('pdf')) fileType = 'pdf';

  const prefix = fileType === 'pdf'
    ? 'data:application/pdf;base64,'
    : `data:image/${fileType};base64,`;

  const form = new FormData();
  form.append('apikey', OCR_API_KEY);
  form.append('language', 'eng');
  form.append('isOverlayRequired', 'false');
  form.append('detectOrientation', 'true');
  form.append('scale', 'true');
  form.append('isTable', 'true');
  form.append('OCREngine', '2');

  // For PDFs, we need to specify it's a PDF
  if (fileType === 'pdf') {
    form.append('filetype', 'pdf');
  }

  form.append('base64Image', `${prefix}${base64}`);

  console.log('📤 Sending to OCR.space...');

  const resp = await fetch(OCR_URL, {
    method: 'POST',
    body: form,
    headers: {
      'Accept': 'application/json',
    }
  });

  if (!resp.ok) throw new Error(`OCR.space HTTP ${resp.status}`);

  const json = await resp.json();
  console.log('OCR response:', {
    isError: json.IsErroredOnProcessing,
    errorMessage: json.ErrorMessage,
    pages: json.ParsedResults?.length
  });

  if (json.IsErroredOnProcessing) {
    const msg = json.ErrorMessage || json.ParsedResults?.[0]?.ErrorMessage || 'OCR failed';
    throw new Error(msg);
  }

  const text = (json.ParsedResults || [])
    .map(r => r.ParsedText || '')
    .join('\n\n')
    .trim();

  if (!text || text.length < 10) {
    throw new Error('OCR found no readable text. Try a clearer, well-lit photo with better contrast.');
  }

  console.log(`✅ OCR: ${text.length} chars extracted. Preview:\n${text.substring(0, 300)}`);
  return text;
};

// ─── STEP 2: GEMINI STRUCTURE ─────────────────────────────────────────────────
const structureWithGemini = async (rawText) => {
  const key = GEMINI_API_KEY;
  if (!key) {
    console.warn('No Gemini key — using raw text parser fallback');
    return parseRawTextFallback(rawText);
  }

  console.log('🤖 Gemini: structuring', rawText.length, 'chars of menu text');

  // First attempt: Try to get JSON directly
  const jsonPrompt = `You are a restaurant menu data extractor. Extract ALL food and drink items from this menu text.

MENU TEXT:
"""
${rawText.substring(0, 8000)}
"""

Return a VALID JSON array ONLY. Each object must have:
- "name": the dish name
- "price": number (extract price, if none use null)
- "category": one of these exact categories based on the item type:
  breakfast, lunch, dinner, beverages, desserts, snacks, starters, soups, salads, pizza, burgers, pasta, seafood, biryani, chinese, continental, indian, rolls, thali, combo, main_course, breads, rice, dal, sweets
- "isVeg": true for vegetarian, false for non-veg, null if unknown
- "description": short 10-15 word appetizing description

Example format:
[
  {"name": "Masala Dosa", "price": 120, "category": "breakfast", "isVeg": true, "description": "Crispy rice crepe filled with spiced potatoes, served with coconut chutney and sambar."},
  {"name": "Chicken Biryani", "price": 280, "category": "biryani", "isVeg": false, "description": "Fragrant basmati rice layered with tender chicken and aromatic spices."}
]

Extract EVERY item from the menu. Be thorough.`;

  // Try JSON format first (3 attempts)
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      console.log(`⏳ Gemini JSON attempt ${attempt}/3 after ${2000 * attempt}ms...`);
      await sleep(2000 * attempt);
    }

    try {
      const result = await callGemini(jsonPrompt, 0.1, 4096);
      if (result) {
        // Try to parse JSON
        const items = safeParseJsonArray(result);
        if (items && items.length > 0) {
          console.log(`✅ Gemini JSON attempt ${attempt}: parsed ${items.length} items`);
          return items;
        }
      }
    } catch (err) {
      console.warn(`Gemini JSON attempt ${attempt} failed:`, err.message);
    }
  }

  // If JSON fails, try pipe format (more reliable)
  console.log('🔄 Trying pipe format...');

  const pipePrompt = `You are a restaurant menu data extractor. Extract EVERY food/drink item from this menu.

MENU TEXT:
"""
${rawText.substring(0, 8000)}
"""

For EACH item output EXACTLY one line in this pipe-separated format:
NAME|PRICE|CATEGORY|VEG|DESCRIPTION

Rules:
- NAME: exact dish name
- PRICE: number only (e.g. 250). Write 0 if unknown
- CATEGORY: one word from this list based on item type:
  breakfast, lunch, dinner, beverages, desserts, snacks, starters, soups, salads, pizza, burgers, pasta, seafood, biryani, chinese, indian, rolls, thali, combo, main_course, breads, rice, dal, sweets
- VEG: V if vegetarian, N if non-veg, U if unknown
- DESCRIPTION: short 10-15 word description

Output ONLY the pipe-separated lines. No headers, no JSON, no explanation.

Example:
Masala Dosa|120|breakfast|V|Crispy rice crepe with spiced potato filling, served with chutney and sambar.
Chicken Biryani|280|biryani|N|Fragrant basmati rice layered with tender chicken and aromatic spices.
Cold Coffee|90|beverages|V|Refreshing chilled coffee blended with milk and chocolate.`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      console.log(`⏳ Gemini pipe attempt ${attempt}/3...`);
      await sleep(2000 * attempt);
    }

    try {
      const result = await callGemini(pipePrompt, 0.2, 8192);
      if (result) {
        const items = parsePipeFormat(result);
        if (items && items.length > 0) {
          console.log(`✅ Gemini pipe attempt ${attempt}: parsed ${items.length} items`);
          return items;
        }
      }
    } catch (err) {
      console.warn(`Gemini pipe attempt ${attempt} failed:`, err.message);
    }
  }

  // If all Gemini attempts fail, use raw text fallback
  console.warn('All Gemini attempts failed, using raw text fallback parser');
  return parseRawTextFallback(rawText);
};

// Helper to call Gemini API
const callGemini = async (prompt, temperature = 0.1, maxTokens = 4096) => {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      topK: 1,
      topP: 0.95,
      maxOutputTokens: maxTokens,
    },
  };

  const resp = await fetch(getGeminiURL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await resp.json();

  if (!resp.ok) {
    const errMsg = data?.error?.message || `HTTP ${resp.status}`;
    throw new Error(errMsg);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty response from Gemini');

  return text;
};

// ─── PIPE FORMAT PARSER ───────────────────────────────────────────────────────
const parsePipeFormat = (text) => {
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.includes('|') && !l.startsWith('NAME|') && !l.startsWith('---'));

  const items = [];

  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 3) continue;

    const [namePart, pricePart, categoryPart, vegPart, ...descParts] = parts;
    const description = descParts.join('|') || ''; // Rejoin if description had pipes

    if (!namePart || namePart.length < 2) continue;

    const price = toNumber(pricePart);
    const category = normalizeCategory(categoryPart || 'lunch');
    const veg = vegPart?.toUpperCase();
    const isVeg = veg === 'V' ? true : veg === 'N' ? false : null;

    items.push({
      name: namePart,
      price,
      category,
      isVeg,
      description: description || fallbackDesc(namePart, category),
    });
  }

  return items.length > 0 ? items : null;
};

// ─── RAW TEXT FALLBACK PARSER ─────────────────────────────────────────────────
const parseRawTextFallback = (rawText) => {
  console.log('🔧 Using raw text fallback parser...');
  const lines = rawText.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2);

  const items = [];

  // Price patterns: ₹250, Rs.250, 250.00, $5
  const priceRegex = /(?:₹|Rs\.?|\$|€)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:₹|Rs)/i;

  // Skip lines that are clearly headers/decorators
  const skipWords = [
    'menu', 'welcome', 'restaurant', 'hotel', 'phone', 'address',
    'www', 'http', 'gst', 'tax', 'total', 'bill', 'thank', 'visit',
    '---', '===', '___', '...', 'table', 'order', 'special', 'chef',
    'recommend', 'signature', 'price', 'item', 'dish', 'food', 'drink'
  ];

  // Category detection keywords
  const catKeywords = {
    'breakfast': 'breakfast', 'morning': 'breakfast',
    'lunch': 'lunch', 'main course': 'main_course',
    'dinner': 'dinner', 'evening': 'dinner',
    'starter': 'starters', 'appetizer': 'starters',
    'beverage': 'beverages', 'drink': 'beverages', 'juice': 'beverages',
    'coffee': 'beverages', 'tea': 'beverages', 'shake': 'beverages',
    'dessert': 'desserts', 'sweet': 'desserts', 'ice cream': 'desserts',
    'biryani': 'biryani', 'rice': 'rice', 'bread': 'breads', 'roti': 'breads',
    'naan': 'breads', 'pizza': 'pizza', 'burger': 'burgers', 'pasta': 'pasta',
    'noodle': 'chinese', 'fried rice': 'chinese',
    'soup': 'soups', 'salad': 'salads', 'roll': 'rolls', 'wrap': 'rolls',
    'thali': 'thali', 'combo': 'combo', 'dal': 'dal', 'curry': 'indian',
    'seafood': 'seafood', 'fish': 'seafood', 'prawn': 'seafood',
  };

  let currentCategory = 'lunch';

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Skip if contains skip words
    if (skipWords.some(w => lower.includes(w))) continue;
    if (line.length > 100) continue; // Too long, probably not a dish
    if (/^\d+$/.test(line)) continue; // Just a number

    // Check if it's a category header
    const isHeader = (line === line.toUpperCase() && line.length < 40 && !/\d/.test(line)) ||
      (line.endsWith(':') && line.length < 35) ||
      (line.length < 30 && !priceRegex.test(line) && /^[A-Z\s&/]+$/.test(line));

    if (isHeader) {
      for (const [kw, cat] of Object.entries(catKeywords)) {
        if (lower.includes(kw)) {
          currentCategory = cat;
          break;
        }
      }
      continue;
    }

    // Try to extract price
    const priceMatch = line.match(priceRegex);
    const price = priceMatch ? toNumber(priceMatch[1] || priceMatch[2]) : null;

    // Clean the name (remove price, special chars)
    let name = line
      .replace(priceRegex, '')
      .replace(/[₹$€]/g, '')
      .replace(/\.\.\.*\s*\d*/g, '')
      .replace(/[-_]{2,}/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Remove leading/trailing punctuation
    name = name.replace(/^[^a-zA-Z0-9]+/, '').replace(/[^a-zA-Z0-9)]+$/, '').trim();

    if (!name || name.length < 2) continue;
    if (/^\d+$/.test(name)) continue;

    // Auto-detect category from name
    let detectedCat = currentCategory;
    for (const [kw, cat] of Object.entries(catKeywords)) {
      if (lower.includes(kw)) {
        detectedCat = cat;
        break;
      }
    }

    items.push({
      name,
      price,
      category: detectedCat,
      isVeg: null,
      description: fallbackDesc(name, detectedCat),
    });
  }

  console.log(`🔧 Raw text fallback found ${items.length} items`);
  return items;
};

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export const parseMenuFromAI = async (source, type = 'image') => {
  console.log(`\n🚀 parseMenuFromAI — type="${type}" len=${source?.length}`);

  let rawText;

  if (type === 'text') {
    rawText = source;
  } else {
    // Handle base64 data
    let b64 = source;
    if (typeof source === 'string' && source.includes('base64,')) {
      b64 = source.split('base64,')[1];
    }

    const mime = type === 'pdf' ? 'application/pdf' : 'image/jpeg';

    try {
      rawText = await extractTextOCR(b64, mime);
    } catch (ocrError) {
      console.error('OCR failed:', ocrError);
      throw new Error(`OCR failed: ${ocrError.message}. Please ensure the image is clear and text is readable.`);
    }
  }

  if (!rawText?.trim()) {
    throw new Error('No text found in image. Please try a clearer photo with better lighting.');
  }

  const items = await structureWithGemini(rawText);

  if (!items || items.length === 0) {
    throw new Error('Could not extract menu items. Please try a clearer photo with better contrast.');
  }

  // Clean and validate items
  const cleaned = items
    .filter(item => item?.name && String(item.name).trim().length > 1)
    .map(item => ({
      name: String(item.name).trim(),
      description: String(item.description || fallbackDesc(item.name, item.category)).trim(),
      price: toNumber(item.price),
      category: normalizeCategory(item.category),
      isVeg: (item.isVeg === true || item.isVeg === false) ? item.isVeg : null,
    }))
    .filter(item => item.name && item.name.length > 0); // Remove any empty items

  console.log(`🎉 Final: ${cleaned.length} clean items`);
  return cleaned;
};

// ─── AI MENU TEXT REWRITE ─────────────────────────────────────────────────────
export const generateAIMenuText = async (name, category, userPreferences = null) => {
  const fallback = {
    title: `Signature ${name}`,
    description: `Our special ${name.toLowerCase()} prepared fresh daily with premium ingredients.`,
  };

  const key = GEMINI_API_KEY;
  if (!key) return fallback;

  const prefPart = userPreferences
    ? `\nUse these keywords: "${userPreferences.titleElements || ''}" in title. Description style: "${userPreferences.descriptionElements || ''}".`
    : '';

  const prompt = `You are a restaurant menu copywriter. Enhance this dish.
Dish name: "${name}"
Category: "${category}"${prefPart}

Return ONLY a JSON object with enhanced title and description:
{
  "title": "Enhanced dish name (2-4 words)",
  "description": "Vivid 15-25 word description mentioning ingredients and taste"
}`;

  try {
    const result = await callGemini(prompt, 0.8, 300);

    // Try to extract JSON
    const jsonMatch = result.match(/\{[^{}]*"title"[^{}]*"description"[^{}]*\}/s);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]);
      if (obj.title && obj.description) {
        return {
          title: obj.title,
          description: obj.description
        };
      }
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
  side_dish: 'snacks', sides: 'snacks', finger_foods: 'snacks',
  morning: 'breakfast', evening: 'dinner', night: 'dinner',
  north_indian: 'indian', south_indian: 'indian', mughlai: 'indian',
};

const normalizeCategory = (cat) => {
  if (!cat) return 'lunch';
  const c = String(cat).toLowerCase().trim().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  return ALIASES[c] || c || 'lunch';
};

const toNumber = (v) => {
  if (v === null || v === undefined || v === '' || v === 0) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return (!isNaN(n) && isFinite(n) && n > 0) ? Math.round(n * 100) / 100 : null;
};

const fallbackDesc = (name, category) => {
  const cat = normalizeCategory(category);
  const map = {
    breakfast: `Freshly prepared ${name} to start your morning right.`,
    lunch: `Hearty ${name} perfect for a satisfying midday meal.`,
    dinner: `Exquisite ${name} for a perfect evening dining experience.`,
    beverages: `Refreshing ${name} to complement your meal.`,
    desserts: `Indulgent ${name} — a perfect sweet ending.`,
    snacks: `Crispy and delicious ${name} for a quick bite.`,
    starters: `Delightful ${name} to begin your meal.`,
    soups: `Warm and comforting ${name}, made fresh daily.`,
    salads: `Fresh and healthy ${name} with premium ingredients.`,
    pizza: `Authentic ${name} baked to perfection.`,
    burgers: `Juicy ${name} served with crispy fries.`,
    pasta: `Delicious ${name} cooked al dente in our signature sauce.`,
    biryani: `Aromatic ${name} layered with fragrant basmati rice and spices.`,
    chinese: `Flavorful ${name} prepared in traditional wok style.`,
    indian: `Authentic ${name} cooked with traditional Indian spices.`,
  };
  return map[cat] || `Delicious ${name} made fresh with quality ingredients.`;
};

const safeParseJsonArray = (text) => {
  // Try direct parse
  try {
    if (text.trim().startsWith('[')) {
      return JSON.parse(text.trim());
    }
  } catch { }

  // Remove markdown code blocks
  const stripped = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try {
    if (stripped.startsWith('[')) {
      return JSON.parse(stripped);
    }
  } catch { }

  // Find array boundaries
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.substring(start, end + 1));
    } catch { }
  }

  return null;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));