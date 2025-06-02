const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
    entry: path.resolve(__dirname, 'src'),

    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
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
                        presets: [
                            '@babel/env',
                            '@babel/typescript',
                            ['@babel/preset-react', {runtime: 'automatic'}]
                        ],
                        plugins: ['@babel/proposal-class-properties'],
                    },
                },
                exclude: /node_modules/,
            }
        ],
    },

    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
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

    devServer: {
        contentBase: './dist',
    },
};
