import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('dist',{recursive:true});
copyFileSync('THIRD_PARTY_NOTICES.md','dist/THIRD_PARTY_NOTICES.txt');
copyFileSync('node_modules/vite/LICENSE.md','dist/VITE_LICENSE.txt');
