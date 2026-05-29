module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@digilog/shared': '../../packages/shared/src',
            '@': './src',
          },
        },
      ],
    ],
  };
};
