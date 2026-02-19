// aiRewriteService.js - Dedicated service for AI rewrite functionality
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || 'AIzaSyBs2vjR4E9DKMWCCzSYiFHDvYwQkWS5SWQ';
const genAI = new GoogleGenerativeAI(API_KEY);

// Store rewrite history for undo/redo functionality
let rewriteHistory = {
  current: null,
  previousVersions: [],
  original: null
};

// Cache for rewrite suggestions
let rewriteCache = new Map();

// Rewrite templates based on cuisine types
const REWRITE_TEMPLATES = {
  italian: {
    titlePrefixes: ['Artisan', 'Authentic', 'Traditional', 'Gourmet', 'Classic', 'Regional', 'Handcrafted', 'Family Recipe'],
    descriptionAdjectives: ['slow-cooked', 'simmered in', 'infused with', 'layered with', 'topped with', 'finished with', 'garnished with', 'drizzled with'],
    signatureElements: ['fresh basil', 'extra virgin olive oil', 'Parmigiano-Reggiano', 'San Marzano tomatoes', 'handmade pasta', 'Italian herbs', 'garlic confit', 'truffle oil']
  },
  indian: {
    titlePrefixes: ['Royal', 'Traditional', 'Authentic', 'Spicy', 'Aromatic', 'Tandoori', 'Mughlai', 'Chef Special'],
    descriptionAdjectives: ['slow-cooked', 'marinated in', 'tempered with', 'infused with', 'simmered in', 'blended with', 'seasoned with', 'roasted with'],
    signatureElements: ['fresh herbs', 'garlic-ginger paste', 'Indian spices', 'clay oven', 'ghee', 'curry leaves', 'mustard seeds', 'coconut milk']
  },
  chinese: {
    titlePrefixes: ['Authentic', 'Szechuan', 'Cantonese', 'Wok-fried', 'Chef Special', 'Traditional', 'Imperial', 'Dragon Style'],
    descriptionAdjectives: ['stir-fried', 'wok-tossed', 'braised in', 'steamed with', 'marinated in', 'glazed with', 'seasoned with', 'infused with'],
    signatureElements: ['soy sauce', 'ginger-garlic', 'Szechuan peppercorns', 'hoisin sauce', 'oyster sauce', 'sesame oil', 'star anise', 'five-spice powder']
  },
  mexican: {
    titlePrefixes: ['Authentic', 'Street Style', 'Homemade', 'Traditional', 'Spicy', 'Chef Special', 'Premium', 'Gourmet'],
    descriptionAdjectives: ['slow-cooked', 'marinated in', 'grilled with', 'stuffed with', 'topped with', 'layered with', 'drizzled with', 'garnished with'],
    signatureElements: ['fresh cilantro', 'lime juice', 'avocado', 'Mexican spices', 'cotija cheese', 'chipotle peppers', 'pico de gallo', 'crema']
  },
  american: {
    titlePrefixes: ['Classic', 'Gourmet', 'Premium', 'Signature', 'Chef Special', 'Deluxe', 'Ultimate', 'Traditional'],
    descriptionAdjectives: ['grilled to perfection', 'slow-smoked', 'hand-breaded', 'freshly made', 'perfectly seasoned', 'artisanal', 'homestyle', 'farm-to-table'],
    signatureElements: ['secret sauce', 'house spices', 'fresh ingredients', 'local produce', 'artisanal bread', 'aged cheese', 'smoky flavor', 'herb butter']
  }
};

// Main rewrite function
export const rewriteWithAI = async (originalText, options = {}) => {
  const {
    category = 'lunch',
    cuisine = 'general',
    style = 'premium',
    intensity = 'medium',
    usePreviousVersion = false,
    userPreferences = null
  } = options;

  // Generate cache key
  const cacheKey = `${originalText}-${category}-${cuisine}-${style}-${intensity}-${JSON.stringify(userPreferences)}`;

  // Check cache first
  if (rewriteCache.has(cacheKey) && !usePreviousVersion) {
    console.log('Returning cached rewrite');
    return rewriteCache.get(cacheKey);
  }

  // Store original if not already stored
  if (!rewriteHistory.original) {
    rewriteHistory.original = {
      text: originalText,
      timestamp: new Date().toISOString()
    };
  }

  try {
    // Use Gemini AI for rewriting
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: getTemperature(intensity),
        topK: 1,
        topP: 0.9,
        maxOutputTokens: 250,
      }
    });

    // Build rewrite prompt
    const prompt = buildRewritePrompt(originalText, options);

    console.log('Sending rewrite prompt:', prompt.substring(0, 150) + '...');

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiText = response.text();

    console.log('AI Rewrite Response:', aiText.substring(0, 150) + '...');

    // Process AI response
    const rewrittenText = processAIResponse(aiText, originalText, options);

    // Store in history
    if (rewriteHistory.current) {
      rewriteHistory.previousVersions.push({
        ...rewriteHistory.current,
        archivedAt: new Date().toISOString()
      });

      // Keep only last 5 versions
      if (rewriteHistory.previousVersions.length > 5) {
        rewriteHistory.previousVersions.shift();
      }
    }

    const newVersion = {
      text: rewrittenText,
      timestamp: new Date().toISOString(),
      options,
      aiResponse: aiText
    };

    rewriteHistory.current = newVersion;

    // Cache the result
    rewriteCache.set(cacheKey, rewrittenText);

    return rewrittenText;

  } catch (error) {
    console.error('AI rewrite failed, using fallback:', error.message);

    // Use fallback rewrite
    return fallbackRewrite(originalText, options);
  }
};

// Specialized function for generating whole menu item content
export const generateAIMenuText = async (name, category, userPreferences = null) => {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.8,
        topK: 1,
        topP: 0.9,
        maxOutputTokens: 300,
      }
    });

    const prompt = `As a professional menu writer, enhance this food item:
    Name: "${name}"
    Category: "${category}"
    ${userPreferences ? `User Preferences: ${JSON.stringify(userPreferences)}` : ''}

    REQUIRED: Generate two things:
    1. A premium version of the dish name (Short, compelling, 2-4 words)
    2. A mouth-watering description (15-25 words, vivid language)

    Return ONLY a JSON object in this format:
    {"title": "Enhanced Name", "description": "Compelling description..."}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiText = response.text();

    // Clean and parse JSON
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('AI did not return valid JSON');
  } catch (error) {
    console.error('generateAIMenuText failed:', error);
    // Return a basic fallback that matches the structure
    return {
      title: `Signature ${name}`,
      description: `Our carefully crafted ${name.toLowerCase()} made with premium ingredients and authentic recipes.`
    };
  }
};

/**
 * Parses a menu from an image (base64) or text.
 * Automatically sorts items into categories: breakfast, lunch, dinner, beverages, desserts, snacks.
 * Detects sub-categories like North Indian, South Indian, etc.
 */
export const parseMenuFromAI = async (source, type = 'image') => {
  try {
    console.log(`🔍 Starting AI menu parsing from ${type}...`);

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.2, // Lower temperature for more consistent results
        topK: 1,
        topP: 0.8,
        maxOutputTokens: 2048, // Increased for more items
      }
    });

    let prompt = `You are an expert menu parser with high accuracy. Analyze this menu ${type === 'image' ? 'image' : 'text'} and extract ALL food and drink items.

IMPORTANT: You MUST extract REAL items from the image, not generate sample data. Look carefully at the menu and identify:

1. **DISH NAMES**: Extract the exact names as they appear (e.g., "Chicken Tikka Masala", "Veg Biryani", "Cold Coffee")
2. **PRICES**: Look for numbers with currency symbols (₹, $, Rs.) and extract as numbers only
3. **DESCRIPTIONS**: If descriptions exist, use them. If not, create a SHORT appetizing description (10-15 words)
4. **CATEGORIES**: Assign each item to EXACTLY one of these categories:
   - "breakfast" (morning dishes: eggs, pancakes, idli, poha, cereal, paratha, etc.)
   - "lunch" (main meals: thali, biryani, rice bowls, sandwiches, curry meals, etc.)
   - "dinner" (evening meals: curries, roti, pasta, grilled items, etc.)
   - "beverages" (drinks: coffee, tea, juice, soda, lassi, shakes, etc.)
   - "desserts" (sweets: ice cream, cake, gulab jamun, kheer, etc.)
   - "snacks" (small bites: samosa, pakora, fries, starters, etc.)

5. **SUB-CATEGORIES**: Detect cuisine type (North Indian, South Indian, Chinese, Continental, etc.)

Return a VALID JSON array with ALL items you can find. Be thorough - extract EVERYTHING.

FORMAT:
[
  {
    "name": "Exact Dish Name",
    "description": "Brief appetizing description (10-15 words)",
    "price": 250,
    "category": "lunch",
    "subCategory": "North Indian"
  }
]

Rules:
- If you see "₹250" or "$250", extract as 250
- If price not visible, use null
- Be accurate with categories based on the item type
- Extract ALL items - don't miss any
- Return ONLY the JSON array, no other text`;

    let result;
    if (type === 'image') {
      // Handle base64 image data
      let base64Data = source;

      // Remove data URL prefix if present
      if (source.includes('base64,')) {
        base64Data = source.split('base64,')[1];
      }

      console.log('📸 Sending image to Gemini API for analysis...');
      console.log('Image data length:', base64Data.length);

      result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: "image/jpeg"
          }
        }
      ]);
    } else {
      console.log('📝 Sending text to Gemini API...');
      result = await model.generateContent(prompt + "\n\nMENU TEXT:\n" + source);
    }

    const response = await result.response;
    const aiText = response.text();

    console.log('✅ AI Response received, length:', aiText.length);
    console.log('📄 AI Response preview:', aiText.substring(0, 300));

    // Extract JSON array from response
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsedData = JSON.parse(jsonMatch[0]);
        console.log(`✅ Successfully parsed ${parsedData.length} menu items`);

        if (parsedData.length === 0) {
          console.log('⚠️ No items found in AI response');
          return [];
        }

        // Validate and clean each item
        const cleanedData = parsedData.map(item => ({
          name: item.name || 'Unknown Item',
          description: item.description || generateDescription(item.name, item.category),
          price: validatePrice(item.price),
          category: validateCategory(item.category),
          subCategory: item.subCategory || detectSubCategory(item.name, item.category)
        }));

        console.log('📋 Cleaned items:', cleanedData);
        return cleanedData;
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        console.log('Raw AI text:', aiText);
        throw new Error('Failed to parse AI response as JSON');
      }
    }

    console.log('⚠️ No JSON array found in response');
    return [];

  } catch (error) {
    console.error('❌ parseMenuFromAI failed:', error);
    // Instead of returning sample data, throw error to show real failure
    throw new Error(`AI parsing failed: ${error.message}`);
  }
};

// Helper function to generate description if missing
const generateDescription = (name, category) => {
  const descriptions = {
    breakfast: `Delicious ${name} to start your day right, prepared fresh.`,
    lunch: `Satisfying ${name} perfect for a hearty midday meal.`,
    dinner: `Flavorful ${name} for a perfect evening dining experience.`,
    beverages: `Refreshing ${name} to complement your meal.`,
    desserts: `Sweet ${name} to end your meal on a delightful note.`,
    snacks: `Tasty ${name} perfect for sharing or a quick bite.`
  };
  return descriptions[category] || `Delicious ${name} prepared with care.`;
};

// Helper function to validate price
const validatePrice = (price) => {
  if (typeof price === 'number' && !isNaN(price) && price > 0) {
    return price;
  }
  // Try to parse if it's a string
  if (typeof price === 'string') {
    const parsed = parseFloat(price.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

// Helper function to validate category
const validateCategory = (category) => {
  const validCategories = ['breakfast', 'lunch', 'dinner', 'beverages', 'desserts', 'snacks'];
  const cat = category?.toLowerCase().trim() || '';

  if (validCategories.includes(cat)) {
    return cat;
  }

  // Try to map similar categories
  if (cat.includes('break') || cat.includes('morn')) return 'breakfast';
  if (cat.includes('lunch') || cat.includes('meal')) return 'lunch';
  if (cat.includes('dinner') || cat.includes('eve')) return 'dinner';
  if (cat.includes('drink') || cat.includes('beverage') || cat.includes('juice') || cat.includes('coffee')) return 'beverages';
  if (cat.includes('dessert') || cat.includes('sweet') || cat.includes('ice cream')) return 'desserts';
  if (cat.includes('snack') || cat.includes('starter') || cat.includes('appetizer')) return 'snacks';

  // Default based on common patterns
  const name = category?.toLowerCase() || '';
  if (name.includes('tea') || name.includes('coffee') || name.includes('juice') || name.includes('soda')) return 'beverages';
  if (name.includes('cake') || name.includes('ice cream') || name.includes('sweet')) return 'desserts';
  if (name.includes('samosa') || name.includes('pakora') || name.includes('fries')) return 'snacks';
  if (name.includes('pancake') || name.includes('idli') || name.includes('dosa') || name.includes('poha')) return 'breakfast';

  return 'lunch'; // Default
};

// Helper function to detect sub-category
const detectSubCategory = (name, category) => {
  const nameLower = name?.toLowerCase() || '';

  // Indian cuisine detection
  if (nameLower.includes('tikka') || nameLower.includes('masala') || nameLower.includes('biryani') ||
    nameLower.includes('paneer') || nameLower.includes('roti') || nameLower.includes('naan') ||
    nameLower.includes('curry') || nameLower.includes('dosa') || nameLower.includes('idli')) {
    if (nameLower.includes('dosa') || nameLower.includes('idli') || nameLower.includes('vada')) {
      return 'South Indian';
    }
    return 'North Indian';
  }

  // Chinese cuisine detection
  if (nameLower.includes('noodles') || nameLower.includes('fried rice') ||
    nameLower.includes('manchurian') || nameLower.includes('schezwan')) {
    return 'Chinese';
  }

  // Italian cuisine detection
  if (nameLower.includes('pizza') || nameLower.includes('pasta') ||
    nameLower.includes('risotto') || nameLower.includes('lasagna')) {
    return 'Italian';
  }

  // Continental cuisine
  if (nameLower.includes('sandwich') || nameLower.includes('burger') ||
    nameLower.includes('fries') || nameLower.includes('grill')) {
    return 'Continental';
  }

  // Beverages
  if (category === 'beverages') {
    if (nameLower.includes('coffee') || nameLower.includes('espresso')) return 'Hot Beverages';
    if (nameLower.includes('juice') || nameLower.includes('smoothie')) return 'Fresh Juices';
    if (nameLower.includes('soda') || nameLower.includes('cola')) return 'Soft Drinks';
    if (nameLower.includes('lassi') || nameLower.includes('buttermilk')) return 'Traditional Drinks';
    return 'Beverages';
  }

  // Desserts
  if (category === 'desserts') {
    if (nameLower.includes('ice cream')) return 'Ice Creams';
    if (nameLower.includes('cake') || nameLower.includes('pastry')) return 'Cakes & Pastries';
    if (nameLower.includes('gulab') || nameLower.includes('jalebi')) return 'Indian Sweets';
    return 'Desserts';
  }

  return null;
};

// Function to remove previous AI and rewrite completely fresh
export const freshRewrite = async (originalText, options = {}) => {
  console.log('Performing fresh rewrite - removing previous AI content');

  // Clear any previous AI generations from cache
  clearRewriteCacheForText(originalText);

  // Force new generation by using different parameters
  const freshOptions = {
    ...options,
    style: getRandomStyle(),
    intensity: getRandomIntensity(),
    forceFresh: true,
    timestamp: Date.now() // Add timestamp to ensure uniqueness
  };

  // Perform the rewrite
  return await rewriteWithAI(originalText, freshOptions);
};

// Smart rewrite with context understanding
export const smartRewrite = async (originalText, context = {}) => {
  const {
    menuType = 'restaurant',
    targetAudience = 'general',
    pricePoint = 'mid-range',
    previousRewrites = [],
    avoidDuplicates = true
  } = context;

  // If avoiding duplicates, check previous rewrites
  if (avoidDuplicates && previousRewrites.length > 0) {
    const lastRewrite = previousRewrites[previousRewrites.length - 1];

    // If last rewrite was recent and similar, change parameters
    const options = {
      style: shouldChangeStyle(lastRewrite) ? getDifferentStyle(lastRewrite.style) : lastRewrite.style,
      intensity: 'high', // Always use high intensity for smart rewrite
      contextAware: true,
      avoidRepetition: true,
      menuContext: menuType,
      audience: targetAudience,
      priceContext: pricePoint
    };

    return await rewriteWithAI(originalText, options);
  }

  // First-time smart rewrite
  return await rewriteWithAI(originalText, {
    style: 'premium',
    intensity: 'high',
    contextAware: true,
    menuContext: menuType,
    audience: targetAudience
  });
};

// Multiple rewrite variations at once
export const generateRewriteVariations = async (originalText, count = 3, baseOptions = {}) => {
  const variations = [];

  for (let i = 0; i < count; i++) {
    const options = {
      ...baseOptions,
      style: getVariationStyle(i),
      intensity: getVariationIntensity(i),
      variationIndex: i
    };

    try {
      const variation = await rewriteWithAI(originalText, options);
      variations.push({
        text: variation,
        style: options.style,
        intensity: options.intensity,
        index: i
      });
    } catch (error) {
      console.error(`Failed to generate variation ${i}:`, error);
      // Add fallback variation
      variations.push({
        text: fallbackRewrite(originalText, options),
        style: options.style,
        intensity: options.intensity,
        index: i,
        isFallback: true
      });
    }
  }

  return variations;
};

// Undo/Redo functionality for rewrites
export const undoRewrite = () => {
  if (rewriteHistory.previousVersions.length > 0) {
    const previousVersion = rewriteHistory.previousVersions.pop();
    const currentVersion = rewriteHistory.current;

    if (currentVersion) {
      // Archive current version
      rewriteHistory.previousVersions.unshift({
        ...currentVersion,
        archivedAt: new Date().toISOString()
      });
    }

    rewriteHistory.current = previousVersion;
    return previousVersion.text;
  }

  // If no previous versions, return original
  return rewriteHistory.original ? rewriteHistory.original.text : null;
};

export const redoRewrite = () => {
  // Implementation depends on your history structure
  // This is a simplified version
  return rewriteHistory.current ? rewriteHistory.current.text : null;
};

// Get rewrite history
export const getRewriteHistory = () => {
  return {
    original: rewriteHistory.original,
    current: rewriteHistory.current,
    previousVersions: [...rewriteHistory.previousVersions],
    totalRewrites: rewriteHistory.previousVersions.length + (rewriteHistory.current ? 1 : 0)
  };
};

// Clear rewrite history
export const clearRewriteHistory = () => {
  rewriteHistory = {
    current: null,
    previousVersions: [],
    original: null
  };
  rewriteCache.clear();
  console.log('Rewrite history and cache cleared');
};

// Helper Functions
const buildRewritePrompt = (originalText, options) => {
  const {
    category = 'general',
    cuisine = 'general',
    style = 'premium',
    intensity = 'medium',
    userPreferences = null,
    contextAware = false,
    menuContext = 'restaurant',
    audience = 'general'
  } = options;

  let prompt = `As a professional menu writer, REWRITE this menu item completely from scratch:
  
Original: "${originalText}"

IMPORTANT INSTRUCTIONS:
1. This is a REWRITE - generate COMPLETELY NEW content
2. Do NOT reuse any phrases from previous versions
3. Create something fresh and unique

Style: ${style}
Intensity: ${intensity}
Category: ${category}
Cuisine: ${cuisine}

${contextAware ? `Context: ${menuContext} menu for ${audience} audience` : ''}

${userPreferences ? `User preferences: ${JSON.stringify(userPreferences)}` : ''}

Generate a SINGLE, compelling menu description (20-40 words) that:
- Sounds premium and appealing
- Uses vivid, appetizing language
- Mentions key ingredients or preparation methods
- Creates mouth-watering imagery
- Is completely different from any previous versions

Response format: Just the rewritten text, no explanations.`;

  return prompt;
};

const processAIResponse = (aiText, originalText, options) => {
  // Clean the response
  let cleaned = aiText
    .replace(/```json|```|["']/g, '')
    .replace(/Here( is|'s)?( the)?( rewritten)?( version)?:?/gi, '')
    .replace(/Rewritten( text)?:?/gi, '')
    .trim();

  // Ensure it's different from original
  if (cleaned.toLowerCase() === originalText.toLowerCase() ||
    cleaned.length < originalText.length / 2) {
    console.log('AI response too similar or too short, using enhanced fallback');
    return enhancedFallbackRewrite(originalText, options);
  }

  // Add style markers if needed
  if (options.style === 'premium') {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
};

const fallbackRewrite = (originalText, options) => {
  const { cuisine = 'general', style = 'premium' } = options;
  const templates = REWRITE_TEMPLATES[cuisine] || REWRITE_TEMPLATES.american;

  const titlePrefix = templates.titlePrefixes[
    Math.floor(Math.random() * templates.titlePrefixes.length)
  ];

  const adjective = templates.descriptionAdjectives[
    Math.floor(Math.random() * templates.descriptionAdjectives.length)
  ];

  const element = templates.signatureElements[
    Math.floor(Math.random() * templates.signatureElements.length)
  ];

  // Simple rewrite logic
  const words = originalText.toLowerCase().split(' ');
  const mainDish = words[words.length - 1] || originalText;

  let rewritten = `${titlePrefix} ${mainDish.charAt(0).toUpperCase() + mainDish.slice(1)}`;

  // Add description based on style
  const descriptions = {
    premium: `, ${adjective} ${element} for an exquisite dining experience.`,
    casual: `, ${adjective} ${element} - a crowd favorite!`,
    descriptive: `, featuring ${element} ${adjective} to perfection.`,
    simple: `, prepared with ${element}.`
  };

  rewritten += descriptions[style] || descriptions.premium;

  return rewritten;
};

const enhancedFallbackRewrite = (originalText, options) => {
  // More sophisticated fallback
  const styles = ['premium', 'casual', 'descriptive', 'minimalist'];
  const intensities = ['subtle', 'medium', 'bold'];

  const selectedStyle = options.style || styles[Math.floor(Math.random() * styles.length)];
  const selectedIntensity = options.intensity || intensities[Math.floor(Math.random() * intensities.length)];

  // Parse original text
  const originalLower = originalText.toLowerCase();
  const words = originalLower.split(/\s+/);

  // Identify key elements
  const cookingMethods = ['grilled', 'roasted', 'baked', 'fried', 'steamed', 'sauteed'];
  const ingredients = ['with herbs', 'in sauce', 'and spices', 'with vegetables'];
  const descriptors = ['delicious', 'flavorful', 'tasty', 'mouth-watering'];

  // Build new description
  let newText = '';

  if (selectedStyle === 'premium') {
    const premiumPrefixes = ['Artisan', 'Signature', 'Gourmet', 'Executive'];
    const prefix = premiumPrefixes[Math.floor(Math.random() * premiumPrefixes.length)];
    newText = `${prefix} ${words[0].charAt(0).toUpperCase() + words[0].slice(1)}`;
  } else {
    newText = words.map((w, i) => i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
  }

  // Add cooking method
  const method = cookingMethods[Math.floor(Math.random() * cookingMethods.length)];
  newText += `, ${method}`;

  // Add ingredient based on intensity
  const ingredient = ingredients[Math.floor(Math.random() * ingredients.length)];
  newText += ` ${ingredient}`;

  // Add descriptor based on intensity
  if (selectedIntensity === 'bold') {
    const descriptor = descriptors[Math.floor(Math.random() * descriptors.length)];
    newText += ` - ${descriptor} and satisfying.`;
  } else {
    newText += '.';
  }

  return newText;
};

// Utility functions
const getTemperature = (intensity) => {
  switch (intensity) {
    case 'low': return 0.3;
    case 'medium': return 0.7;
    case 'high': return 0.9;
    case 'creative': return 1.2;
    default: return 0.7;
  }
};

const getRandomStyle = () => {
  const styles = ['premium', 'casual', 'descriptive', 'minimalist', 'traditional', 'modern'];
  return styles[Math.floor(Math.random() * styles.length)];
};

const getRandomIntensity = () => {
  const intensities = ['low', 'medium', 'high', 'creative'];
  return intensities[Math.floor(Math.random() * intensities.length)];
};

const getVariationStyle = (index) => {
  const styles = ['premium', 'casual', 'descriptive', 'minimalist'];
  return styles[index % styles.length];
};

const getVariationIntensity = (index) => {
  const intensities = ['low', 'medium', 'high'];
  return intensities[index % intensities.length];
};

const getDifferentStyle = (currentStyle) => {
  const styles = ['premium', 'casual', 'descriptive', 'minimalist'];
  const currentIndex = styles.indexOf(currentStyle);
  const newIndex = (currentIndex + 1) % styles.length;
  return styles[newIndex];
};

const shouldChangeStyle = (lastRewrite) => {
  // Change style if last rewrite was less than 1 minute ago
  if (!lastRewrite.timestamp) return true;

  const lastTime = new Date(lastRewrite.timestamp);
  const now = new Date();
  const diffMinutes = (now - lastTime) / (1000 * 60);

  return diffMinutes < 1; // Change style if less than 1 minute ago
};

const clearRewriteCacheForText = (originalText) => {
  // Remove all cache entries for this text
  const keysToDelete = [];
  for (const key of rewriteCache.keys()) {
    if (key.startsWith(originalText)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach(key => rewriteCache.delete(key));
  console.log(`Cleared ${keysToDelete.length} cache entries for "${originalText}"`);
};

// Export utility functions if needed
export const getAvailableStyles = () => ['premium', 'casual', 'descriptive', 'minimalist', 'traditional', 'modern'];
export const getAvailableIntensities = () => ['low', 'medium', 'high', 'creative'];
export const getAvailableCuisines = () => Object.keys(REWRITE_TEMPLATES);