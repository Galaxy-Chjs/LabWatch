/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  /**
   * Set by the VS Code webview before the bundle runs, when the dashboard is shown
   * inside the editor. The extension also installs a `fetch` shim for `/api/*`, so
   * this flag is only needed to explain a failure in the panel's own words.
   */
  __LABWATCH_WEBVIEW__?: boolean
}
