// aiService.js - Complete AI Service for Menu Management
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || 'AIzaSyBs2vjR4E9DKMWCCzSYiFHDvYwQkWS5SWQ';
const genAI = new GoogleGenerativeAI(API_KEY);

// ─── STANDARD CATEGORIES ───────────────────────────────────────────────────────
export const STANDARD_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'beverages', 'desserts', 'snacks'];

// ─── CATEGORY ICONS MAP ─────────────────────────────────────────────────────────
export const CATEGORY_ICONS = {
  breakfast: { icon: '🍳', accent: '#2563EB', subtitle: 'Morning dishes & beverages' },
  lunch: { icon: '🍱', accent: '#16A34A', subtitle: 'Main course & combos' },
  dinner: { icon: '🍽️', accent: '#7C3AED', subtitle: 'Evening meals & specials' },
  beverages: { icon: '🥤', accent: '#06B6D4', subtitle: 'Drinks, Shakes & Juices' },
  desserts: { icon: '🍨', accent: '#EC4899', subtitle: 'Sweets & Treats' },
  snacks: { icon: '🍟', accent: '#F59E0B', subtitle: 'Light bites & sides' },
  // Dynamic category defaults
  starters: { icon: '🥗', accent: '#84CC16', subtitle: 'Appetizers & starters' },
  mains: { icon: '🍛', accent: '#EA580C', subtitle: 'Main course dishes' },
  soups: { icon: '🍲', accent: '#0891B2', subtitle: 'Soups & broths' },
  salads: { icon: '🥙', accent: '#65A30D', subtitle: 'Fresh salads' },
  pizza: { icon: '🍕', accent: '#DC2626', subtitle: 'Pizzas & flatbreads' },
  burgers: { icon: '🍔', accent: '#D97706', subtitle: 'Burgers & sandwiches' },
  pasta: { icon: '🍝', accent: '#9333EA', subtitle: 'Pasta & noodles' },
  seafood: { icon: '🦞', accent: '#0369A1', subtitle: 'Seafood dishes' },
  vegetarian: { icon: '🥦', accent: '#15803D', subtitle: 'Vegetarian dishes' },
  vegan: { icon: '🌱', accent: '#16A34A', subtitle: 'Vegan dishes' },
  'non-vegetarian': { icon: '🍗', accent: '#B45309', subtitle: 'Non-veg dishes' },
  biryani: { icon: '🍚', accent: '#92400E', subtitle: 'Biryani varieties' },
  chinese: { icon: '🥡', accent: '#C2410C', subtitle: 'Chinese cuisine' },
  continental: { icon: '🍴', accent: '#4F46E5', subtitle: 'Continental dishes' },
  indian: { icon: '🫕', accent: '#F97316', subtitle: 'Indian cuisine' },
  combo: { icon: '🎁', accent: '#7C3AED', subtitle: 'Combo meals & sets' },
  thali: { icon: '🍱', accent: '#059669', subtitle: 'Thali meals' },
  rolls: { icon: '🌯', accent: '#D97706', subtitle: 'Rolls & wraps' },
  ice_cream: { icon: '🍦', accent: '#DB2777', subtitle: 'Ice creams & gelato' },
  mocktails: { icon: '🧃', accent: '#0891B2', subtitle: 'Mocktails & coolers' },
  cocktails: { icon: '🍹', accent: '#7C3AED', subtitle: 'Cocktails & spirits' },
  kids: { icon: '👶', accent: '#F59E0B', subtitle: "Kids' menu" },
  specials: { icon: '⭐', accent: '#EF4444', subtitle: "Chef's specials" },
};

// Get icon/accent for any category (including dynamic ones)
export const getCategoryMeta = (key) => {
  const normalized = key.toLowerCase().replace(/\s+/g, '_');
  if (CATEGORY_ICONS[normalized]) return { ...CATEGORY_ICONS[normalized], key: normalized };
  // Generate consistent color from key
  const colors = ['#2563EB', '#16A34A', '#7C3AED', '#06B6D4', '#EC4899', '#F59E0B', '#EA580C', '#0891B2', '#84CC16', '#9333EA'];
  const icons = ['🍜', '🥘', '🍣', '🫔', '🧆', '🥪', '🍱', '🍲', '🫕', '🥗'];
  const idx = Math.abs(normalized.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length;
  return {
    key: normalized,
    icon: icons[idx],
    accent: colors[idx],
    subtitle: `${key.charAt(0).toUpperCase() + key.slice(1)} dishes`,
  };
};

// ─── PARSE MENU FROM IMAGE OR PDF TEXT ─────────────────────────────────────────
export const parseMenuFromAI = async (source, type = 'image') => {
  console.log(`🤖 parseMenuFromAI called — type: ${type}, source length: ${source?.length}`);

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      temperature: 0.1,
      topK: 1,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  });

  const systemPrompt = `You are an expert OCR and menu parser. Your job is to extract EVERY SINGLE food and drink item from a menu.

CRITICAL RULES:
1. Extract EVERY item you can see — do NOT skip anything
2. Be extremely thorough — if you see 50 items, return all 50
3. Detect the actual category from the menu section headers (e.g., "Starters", "Main Course", "Beverages", "Desserts", "Soups", "Pizza", "Biryani", etc.)
4. Use the EXACT section/category name from the menu as the "category" field (lowercase, underscores for spaces)
5. If no section header, intelligently infer the category
6. Extract price as a NUMBER only (e.g., 250, not ₹250 or $5.99)
7. If price is not visible, set to null
8. Generate a SHORT appetizing description (10-20 words) if not present
9. NEVER return empty array if there is text/food visible

VALID STANDARD CATEGORIES: breakfast, lunch, dinner, beverages, desserts, snacks
ALSO ACCEPT CUSTOM CATEGORIES from the menu like: starters, main_course, soups, pizza, biryani, rolls, chinese, continental, seafood, salads, combo, thali, mocktails, cocktails, etc.

OUTPUT FORMAT — return ONLY a valid JSON array, nothing else:
[
  {
    "name": "Exact item name from menu",
    "description": "Short appetizing description",
    "price": 150,
    "category": "starters",
    "isVeg": true
  }
]

- "isVeg": true if vegetarian, false if non-veg, null if unknown
- category must be lowercase with underscores (e.g., "main_course", "cold_beverages")
- Include EVERY item — appetizers, mains, drinks, desserts, combos, everything`;

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`📡 Attempt ${attempts}/${maxAttempts}...`);

    try {
      let result;

      if (type === 'image') {
        let base64Data = source;
        if (source.includes('base64,')) {
          base64Data = source.split('base64,')[1];
        }

        // Try JPEG first, then PNG
        const mimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const mimeType = mimeTypes[(attempts - 1) % mimeTypes.length];

        result = await model.generateContent([
          systemPrompt,
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
        ]);
      } else {
        // Text/PDF content
        result = await model.generateContent(
          `${systemPrompt}\n\nHere is the menu text to parse:\n\n${source}`
        );
      }

      const response = await result.response;
      const aiText = response.text().trim();
      console.log(`✅ AI response (${aiText.length} chars):`, aiText.substring(0, 400));

      // Extract JSON
      const parsed = extractJsonArray(aiText);
      if (parsed && parsed.length > 0) {
        const cleaned = parsed
          .filter(item => item.name && item.name.trim().length > 0)
          .map(item => ({
            name: String(item.name).trim(),
            description: String(item.description || generateDescription(item.name, item.category)).trim(),
            price: validatePrice(item.price),
            category: normalizeCategory(item.category),
            isVeg: item.isVeg ?? null,
          }));

        console.log(`✅ Parsed ${cleaned.length} items`);
        return cleaned;
      }

      console.warn(`⚠️ Attempt ${attempts}: No items extracted, retrying...`);
    } catch (err) {
      console.error(`❌ Attempt ${attempts} failed:`, err.message);
      if (attempts >= maxAttempts) throw err;
      await sleep(1000 * attempts);
    }
  }

  throw new Error('Failed to parse menu after multiple attempts');
};

// ─── PARSE PDF ──────────────────────────────────────────────────────────────────
// Takes extracted PDF text and parses it through AI
export const parsePDFMenuFromText = async (pdfText) => {
  console.log('📄 Parsing PDF text, length:', pdfText.length);
  return parseMenuFromAI(pdfText, 'text');
};

// ─── GENERATE AI MENU TEXT ──────────────────────────────────────────────────────
export const generateAIMenuText = async (name, category, userPreferences = null) => {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.85,
        topK: 1,
        topP: 0.9,
        maxOutputTokens: 300,
      },
    });

    const prefPart = userPreferences
      ? `\nUser preferences: ${JSON.stringify(userPreferences)}`
      : '';

    const prompt = `You are a professional menu copywriter. Enhance this food item for a restaurant menu:
Name: "${name}"
Category: "${category}"${prefPart}

Create:
1. A premium, compelling dish name (2-5 words, appetizing)
2. A mouth-watering description (15-30 words, vivid sensory language, no clichés)

Return ONLY valid JSON:
{"title": "Enhanced Name Here", "description": "Vivid description here..."}`;

    const result = await model.generateContent(prompt);
    const aiText = result.response.text();
    const jsonMatch = aiText.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title && parsed.description) return parsed;
    }
    throw new Error('Invalid AI response format');
  } catch (error) {
    console.error('generateAIMenuText failed:', error);
    return {
      title: `Signature ${name}`,
      description: `Our carefully crafted ${name.toLowerCase()} made with premium ingredients and authentic recipes for an unforgettable experience.`,
    };
  }
};

// ─── HELPERS ────────────────────────────────────────────────────────────────────
const extractJsonArray = (text) => {
  // Try direct parse
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  } catch { }

  // Extract from markdown code block
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch { }
  }

  // Extract first JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch { }
  }

  // Try to repair incomplete JSON
  const startIdx = text.indexOf('[');
  if (startIdx !== -1) {
    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < text.length; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx !== -1) {
      try { return JSON.parse(text.substring(startIdx, endIdx + 1)); } catch { }
    }
    // Try with closing bracket appended
    try { return JSON.parse(text.substring(startIdx) + ']'); } catch { }
  }

  return null;
};

const normalizeCategory = (cat) => {
  if (!cat) return 'lunch';
  const c = String(cat).toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  // Map common aliases
  const aliases = {
    'main_course': 'lunch',
    'main_courses': 'lunch',
    'mains': 'lunch',
    'appetizer': 'starters',
    'appetizers': 'starters',
    'starter': 'starters',
    'drinks': 'beverages',
    'cold_drinks': 'beverages',
    'hot_drinks': 'beverages',
    'soft_drinks': 'beverages',
    'juices': 'beverages',
    'sweet': 'desserts',
    'sweets': 'desserts',
    'ice_creams': 'desserts',
    'side_dish': 'snacks',
    'sides': 'snacks',
    'side_dishes': 'snacks',
    'light_bites': 'snacks',
    'morning': 'breakfast',
    'evening': 'dinner',
    'night': 'dinner',
  };

  return aliases[c] || c || 'lunch';
};

const validatePrice = (price) => {
  if (price === null || price === undefined || price === '') return null;
  if (typeof price === 'number' && isFinite(price) && price > 0) return Math.round(price * 100) / 100;
  if (typeof price === 'string') {
    const n = parseFloat(price.replace(/[^0-9.]/g, ''));
    if (!isNaN(n) && n > 0) return Math.round(n * 100) / 100;
  }
  return null;
};

const generateDescription = (name, category) => {
  const map = {
    breakfast: `Freshly prepared ${name}, a perfect way to start your morning.`,
    lunch: `Hearty and satisfying ${name}, crafted for the perfect midday meal.`,
    dinner: `Exquisite ${name}, an elegant choice for your evening dining.`,
    beverages: `Refreshing ${name} to complement your meal perfectly.`,
    desserts: `Indulgent ${name} to sweeten the perfect ending to your meal.`,
    snacks: `Crispy and delicious ${name}, perfect for a light bite anytime.`,
    starters: `Delightful ${name} to begin your culinary journey with us.`,
  };
  return map[category] || `Delicious ${name} prepared with care and the finest ingredients.`;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── REWRITE AI ─────────────────────────────────────────────────────────────────
export const rewriteWithAI = async (originalText, options = {}) => {
  const { category = 'lunch', style = 'premium', userPreferences = null } = options;
  return generateAIMenuText(originalText, category, userPreferences);
};