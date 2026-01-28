const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { resolve } = require("metro-resolver");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push("mjs");
config.resolver.unstable_enablePackageExports = true;
config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    zustand: path.resolve(__dirname, "node_modules/zustand/index.js"),
    "zustand/middleware": path.resolve(
        __dirname,
        "node_modules/zustand/middleware.js",
    ),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "zustand") {
        return {
            type: "sourceFile",
            filePath: path.resolve(__dirname, "node_modules/zustand/index.js"),
        };
    }
    if (moduleName === "zustand/middleware") {
        return {
            type: "sourceFile",
            filePath: path.resolve(
                __dirname,
                "node_modules/zustand/middleware.js",
            ),
        };
    }
    return resolve(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
