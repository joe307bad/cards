const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: path.resolve(__dirname, 'src'),
    
    // Different sourcemaps for dev vs prod
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    
    output: {
      filename: isProduction ? '[name].[contenthash].js' : 'bundle.js',
      path: path.resolve(__dirname, 'dist'),
      clean: true, // Clean dist folder before each build
      publicPath: '/', // Important for serving from ASP.NET Core
    },
    
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    
    module: {
      rules: [
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader', 'postcss-loader'],
        },
        {
          test: /\.(ts|js)x?$/,
          use: {
            loader: 'babel-loader',
            options: {
              inputSourceMap: false,
              presets: [
                ['@babel/env', {
                  // Only transform what's needed for target browsers in production
                  targets: isProduction ? '> 0.25%, not dead' : 'last 2 versions'
                }],
                '@babel/typescript',
                ['@babel/preset-react', { runtime: 'automatic' }],
              ],
              plugins: [
                '@babel/proposal-class-properties',
                ["@babel/plugin-transform-runtime", {
                  "regenerator": true
                }]
              ],
              sourceMaps: true,
            },
          },
          exclude: /node_modules/,
        }
      ],
    },
    
    plugins: [
      new webpack.DefinePlugin({
        'process.env.URL': JSON.stringify(process.env.URL || 'localhost:5001'),
        'process.env.APP_VERSION': JSON.stringify(process.env.APP_VERSION || '1.0.0'),
      }),
      new HtmlWebpackPlugin({
        template: './public/index.html',
        minify: isProduction ? {
          removeComments: true,
          collapseWhitespace: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
          removeEmptyAttributes: true,
          removeStyleLinkTypeAttributes: true,
          keepClosingSlash: true,
          minifyJS: true,
          minifyCSS: true,
          minifyURLs: true,
        } : false,
      }),
      new ForkTsCheckerWebpackPlugin({
        typescript: {
          configOverwrite: {
            compilerOptions: {
              skipLibCheck: true
            }
          }
        }
      })
    ],
    
    // Optimization settings
    optimization: {
      minimize: isProduction,
      splitChunks: isProduction ? {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      } : false,
    },
    
    // Dev server (only used in development)
    devServer: {
      contentBase: './dist',
      hot: true,
      port: 3000,
    },
    
    // Performance hints for production
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000,
    },
  };
};