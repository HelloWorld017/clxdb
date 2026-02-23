import type { Plugin } from 'vite';

const umdEntryModuleId = 'virtual:umd-entry';
const resolvedUmdEntryModuleId = `\0${umdEntryModuleId}`;

function umdEntry(): Plugin {
  let entryPaths: string[] = [];

  return {
    name: 'vite-plugin-umd-entry',
    enforce: 'pre',
    config(config, { command }) {
      if (command !== 'build' || !config.build?.lib || !config.build.lib.entry) {
        return;
      }

      const entries = config.build.lib.entry;
      if (typeof entries === 'string') {
        return;
      }

      entryPaths = Array.isArray(entries) ? entries : Object.values(entries);

      return {
        build: {
          lib: { ...config.build.lib, entry: umdEntryModuleId },
        },
      };
    },
    resolveId: id => (id.endsWith(umdEntryModuleId) ? resolvedUmdEntryModuleId : undefined),
    load: id =>
      id === resolvedUmdEntryModuleId
        ? entryPaths.map(path => `export * from ${JSON.stringify(path)};`).join('\n')
        : undefined,
  };
}

export default umdEntry;
