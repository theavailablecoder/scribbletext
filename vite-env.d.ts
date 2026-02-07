/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_KEY_1: string;
  readonly VITE_API_KEY_2: string;
  readonly VITE_API_KEY_3: string;
  readonly VITE_API_KEY_4: string;
  readonly VITE_STARTING_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
