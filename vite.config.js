import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// three and react rarely change; give them their own chunks so a content
// update doesn't make returning visitors download them again.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|motion|framer-motion|motion-dom|motion-utils)[\\/]/ },
          ],
        },
      },
    },
  },
});
