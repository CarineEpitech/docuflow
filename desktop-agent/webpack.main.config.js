module.exports = {
  entry: './src/main/index.ts',
  // Native addons and Electron modules can't be bundled by webpack
  externals: {
    'better-sqlite3': 'commonjs better-sqlite3',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
};
