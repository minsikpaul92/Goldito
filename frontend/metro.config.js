const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Body font on web: react-native-web's style compiler goes through theme/web/createReactDOMStyle.ts, which puts
// Plus Jakarta Sans in front of the "System" font stack. Native keeps the platform font.
const RNW_DOM_STYLE = /react-native-web[\\/]dist[\\/](cjs[\\/])?exports[\\/]StyleSheet[\\/]compiler[\\/]createReactDOMStyle\.js$/;
const WRAPPER = path.join(__dirname, "theme", "web", "createReactDOMStyle.ts");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolved = context.resolveRequest(context, moduleName, platform);
  if (
    platform === "web" &&
    resolved.type === "sourceFile" &&
    RNW_DOM_STYLE.test(resolved.filePath) &&
    context.originModulePath !== WRAPPER
  ) {
    return { type: "sourceFile", filePath: WRAPPER };
  }
  return resolved;
};

module.exports = config;
