const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for more file extensions
config.resolver.sourceExts.push('cjs');

// Optimize for web
config.transformer.minifierConfig = {
    compress: {
        drop_console: true,
    },
};

module.exports = config;