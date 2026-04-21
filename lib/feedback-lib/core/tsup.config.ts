// tsup config for building the publishable @claudecontrol/feedback-lib bundle.
// Typed as `unknown` so addnewfeature (which doesn't depend on tsup) can
// typecheck this file without pulling in tsup's type declarations. When the
// core package is extracted to its own repo and tsup is installed as a
// devDependency, swap this for `defineConfig` from 'tsup'.
const config: unknown = {
  entry: ['index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['react', 'react-dom', 'next'],
};

export default config;
