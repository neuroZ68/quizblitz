import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                host: resolve(__dirname, 'host.html'),
                play: resolve(__dirname, 'play.html'),
            },
        },
    },
    server: {
        port: 3000,
        open: true,
    },
});
