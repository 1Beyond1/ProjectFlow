/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./App.{js,jsx,ts,tsx}",
        "./app/**/*.{js,jsx,ts,tsx}",
        "./components/**/*.{js,jsx,ts,tsx}",
    ],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                // Warm Terra 色系
                primary: {
                    DEFAULT: "#cc6933",  // Terracotta
                    dark: "#b05525",
                },
                secondary: "#9EC29C",  // Sage Green
                background: {
                    DEFAULT: "#FDFBF7",  // Creamy Off-white
                    dark: "#2a2522",
                },
                surface: {
                    DEFAULT: "#FFFFFF",
                    dark: "#36302c",
                },
                "text-main": "#47433F",      // Deep Warm Charcoal
                "text-subtle": "#837167",
                sand: "#EBE7E2",              // Warm Sand
                "input-bg": "#F2EFE9",
            },
            fontFamily: {
                display: ["Plus Jakarta Sans", "sans-serif"],
                body: ["Noto Sans", "sans-serif"],
            },
        },
    },
    plugins: [],
};
