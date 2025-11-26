/// <reference types="vite/client" />

// 可选：声明我们会用到的环境变量，便于类型提示 & 消除 import.meta.env 报错
interface ImportMetaEnv {
  readonly VITE_PLATO_API_KEY: "sk-vuOSva5fSrMmwIuX8Zb8DyTSGxoYNAsx19gEttt2UuPzf8yf";
  readonly VITE_PLATO_BASE_URL: "https://api.bltcy.ai";
  readonly VITE_PLATO_DEFAULT_MODEL: "gemini-3-pro-preview";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

