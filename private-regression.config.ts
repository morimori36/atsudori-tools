import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['private-tests/**/*.test.ts'],maxWorkers:1,reporters:'dot'}});
