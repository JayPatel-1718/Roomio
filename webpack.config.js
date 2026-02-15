const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
    const config = await createExpoWebpackConfigAsync(env, argv);

    // Customize webpack config for better icon loading
    config.module.rules.push({
        test: /\.ttf$/,
        loader: 'file-loader',
        options: {
            name: 'static/media/[name].[hash:8].[ext]',
        },
    });

    return config;
};