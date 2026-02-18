// aiRewriteService.js - Dedicated service for AI rewrite functionality
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const API_KEY = process.env.REACT_APP_GEMINI_API_KEY || 'AIzaSyBs2vjR4E9DKMWCCzSYiFHDvYwQkWS5SWQ';
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
    1. A premium version of the dish name (Short, compelling)
    2. A mouth-watering description (20-40 words, vivid language)

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
      title: `Artisan ${name}`,
      description: `Our signature ${name.toLowerCase()} prepared with the finest ingredients and traditional techniques.`
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
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    let prompt = `As an expert hospitality data architect, analyze this menu ${type === 'image' ? 'image' : 'document'}.
    
    1. EXTRACT all food and drink items.
    2. CATEGORIZE each item into exactly one of these keys: "breakfast", "lunch", "dinner", "beverages", "desserts", "snacks".
    3. SUB-CATEGORIZE if applicable (e.g., "North Indian", "Continental", "Fresh Juices").
    4. DETECT price (as a number).
    5. GENERATE a professional description for any item lacking one.
    
    REQUIRED FORMAT: Return ONLY a JSON array of objects:
    [
      {
        "name": "Item Name",
        "description": "Short appetizing description",
        "price": 250,
        "category": "lunch",
        "subCategory": "North Indian"
      }
    ]
    
    Order the items logically by category. If you can't find a price, set it to null.`;

    let result;
    if (type === 'image') {
      // Safety check: strip base64 prefix if present (common in web environments)
      const base64Data = source.includes('base64,') ? source.split('base64,')[1] : source;

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
      result = await model.generateContent(prompt + "\n\nMenu Content:\n" + source);
    }

    const response = await result.response;
    const aiText = response.text();

    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('Could not parse menu data from AI response');
  } catch (error) {
    console.error('parseMenuFromAI failed:', error);
    throw error;
  }
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