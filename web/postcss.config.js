const tailwindcss = require('@tailwindcss/postcss');

module.exports = {
    plugins: [
        tailwindcss('./tailwind.config.js'),
        require('autoprefixer'),
    ],
}