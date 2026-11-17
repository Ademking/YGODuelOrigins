import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json';

// __APP_VERSION__ is the version in package.json: bump it there and the game shows the new number.
export default defineConfig({ publicDir: 'assets', plugins: [tailwindcss()], server: { port: 5173 }, define: { __APP_VERSION__: JSON.stringify(pkg.version) } });
