import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

function page(name: string): string {
  return fileURLToPath(new URL(`./pages/${name}`, import.meta.url));
}

function readPartial(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./partials/${name}.html`, import.meta.url)),
    "utf8",
  );
}

function includePartials(): Plugin {
  const partials: Record<string, string> = {
    header: readPartial("header"),
    footer: readPartial("footer"),
  };
  return {
    name: "include-partials",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(
          /<!--\s*@include\s+([\w-]+)\s*-->/g,
          (match, name: string) => partials[name] ?? match,
        );
      },
    },
  };
}

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
      const htmlAssets = outputs.filter(
        (output) => output.type === "asset" && output.fileName.endsWith(".html"),
      );
      const cssAssets = outputs.filter(
        (output) => output.type === "asset" && output.fileName.endsWith(".css"),
      );
      for (const css of cssAssets) {
        if (css.type !== "asset") {
          continue;
        }
        const cssSource = sourceText(css.source);
        const link = new RegExp(
          `<link[^>]*href="[^"]*${escapePattern(css.fileName)}"[^>]*>`,
        );
        for (const html of htmlAssets) {
          if (html.type !== "asset") {
            continue;
          }
          const htmlSource = sourceText(html.source);
          if (!link.test(htmlSource)) {
            continue;
          }
          html.source = htmlSource.replace(
            link,
            `<style>${cssSource}</style>`,
          );
        }
        delete bundle[css.fileName];
      }
    },
  };
}

function flattenPages(): Plugin {
  return {
    name: "flatten-pages",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (
          output.type === "asset" &&
          output.fileName.startsWith("pages/") &&
          output.fileName.endsWith(".html")
        ) {
          output.fileName = output.fileName.slice("pages/".length);
        }
      }
    },
  };
}

function devPages(): Plugin {
  const routes = new Map([
    ["/", "/pages/"],
    ["/index.html", "/pages/"],
    ["/404.html", "/pages/404"],
    ["/website-to-apk", "/pages/website-to-apk"],
    ["/website-to-apk.html", "/pages/website-to-apk"],
    ["/website-to-desktop-app", "/pages/website-to-desktop-app"],
    ["/website-to-desktop-app.html", "/pages/website-to-desktop-app"],
    ["/pwabuilder-alternative", "/pages/pwabuilder-alternative"],
    ["/pwabuilder-alternative.html", "/pages/pwabuilder-alternative"],
    ["/apk-signing", "/pages/apk-signing"],
    ["/apk-signing.html", "/pages/apk-signing"],
  ]);
  return {
    name: "dev-pages",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === undefined) {
          next();
          return;
        }
        const [pathname, query] = request.url.split("?", 2);
        const target = routes.get(pathname ?? "");
        if (target === undefined) {
          next();
          return;
        }
        response.writeHead(302, {
          Location: query === undefined ? target : `${target}?${query}`,
        });
        response.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    devPages(),
    cloudflare(),
    tailwindcss(),
    includePartials(),
    inlineStylesheet(),
    flattenPages(),
  ],
  build: {
    target: "es2022",
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            index: page("index.html"),
            "404": page("404.html"),
            "website-to-apk": page("website-to-apk.html"),
            "website-to-desktop-app": page("website-to-desktop-app.html"),
            "pwabuilder-alternative": page("pwabuilder-alternative.html"),
            "apk-signing": page("apk-signing.html"),
          },
        },
      },
    },
  },
});
