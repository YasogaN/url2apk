import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceText(source: string | Uint8Array): string {
  return typeof source === "string" ? source : new TextDecoder().decode(source);
}

function inlineStylesheet(): Plugin {
  return {
    name: "inline-stylesheet",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const outputs = Object.values(bundle);
      const html = outputs.find(
        (output) => output.type === "asset" && output.fileName.endsWith(".html"),
      );
      const css = outputs.find(
        (output) => output.type === "asset" && output.fileName.endsWith(".css"),
      );
      if (html?.type !== "asset" || css?.type !== "asset") {
        return;
      }
      const link = new RegExp(
        `<link[^>]*href="[^"]*${escapePattern(css.fileName)}"[^>]*>`,
      );
      const htmlSource = sourceText(html.source);
      if (!link.test(htmlSource)) {
        return;
      }
      html.source = htmlSource.replace(
        link,
        `<style>${sourceText(css.source)}</style>`,
      );
      delete bundle[css.fileName];
    },
  };
}

export default defineConfig({
  plugins: [cloudflare(), tailwindcss(), inlineStylesheet()],
  build: {
    target: "es2022",
  },
});
