// Falls back from .js to .ts when resolving generated Prisma client imports
module.exports = (moduleName, options) => {
  const { defaultResolver } = options;
  try {
    return defaultResolver(moduleName, options);
  } catch (e) {
    if (moduleName.endsWith('.js')) {
      try {
        return defaultResolver(moduleName.replace(/\.js$/, '.ts'), options);
      } catch {}
    }
    throw e;
  }
};
