// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bufferSource } from "./apk/bytes";
import { fixturePng } from "../../test/helpers/binaries";

const mocks = vi.hoisted(() => {
  const identity = () => ({
    key: {} as CryptoKey,
    certDer: new Uint8Array([1]),
    publicKeySpki: new Uint8Array([2]),
    backup: new Uint8Array([3]),
    modulusLength: 2048 as const,
    createdAt: 0,
  });
  return {
    identity,
    buildApk: vi.fn(async () => new Uint8Array([1, 2, 3])),
    renderIconLayers: vi.fn(async () => new Map<string, Uint8Array>()),
    createIdentity: vi.fn(async () => identity()),
    importIdentity: vi.fn(async () => identity()),
    loadIdentity: vi.fn(async (): Promise<unknown> => null),
    saveIdentity: vi.fn(async () => undefined),
    buildDesktopArtifact: vi.fn(() => ({
      bytes: new Uint8Array([4]),
      filename: "app.zip",
    })),
    loadManifest: vi.fn(async () => ({ version: "1", artifacts: {} })),
    findBase: vi.fn(() => ({
      url: "/shells/base",
      size: 1,
      sha256: "a".repeat(64),
    })),
    fetchBase: vi.fn(async () => new Uint8Array([9])),
    needsConfirmation: vi.fn(() => false),
    formatBytes: vi.fn((value: number) => `${value} B`),
    paintLetter: vi.fn(),
    paintImage: vi.fn(() => true),
    loadImage: vi.fn(async () => ({ naturalWidth: 10, naturalHeight: 10 })),
  };
});

vi.mock("./apk/build", () => ({ buildApk: mocks.buildApk }));
vi.mock("./apk/icons", () => ({ renderIconLayers: mocks.renderIconLayers }));
vi.mock("./apk/keys", () => ({
  createIdentity: mocks.createIdentity,
  importIdentity: mocks.importIdentity,
  loadIdentity: mocks.loadIdentity,
  saveIdentity: mocks.saveIdentity,
}));
vi.mock("./desktop/build", () => ({
  buildDesktopArtifact: mocks.buildDesktopArtifact,
}));
vi.mock("./desktop/manifest", () => ({
  loadManifest: mocks.loadManifest,
  findBase: mocks.findBase,
  fetchBase: mocks.fetchBase,
  needsConfirmation: mocks.needsConfirmation,
  formatBytes: mocks.formatBytes,
}));
vi.mock("./paint", () => ({
  paintLetter: mocks.paintLetter,
  paintImage: mocks.paintImage,
  loadImage: mocks.loadImage,
}));

const HTML = `
<form id="builder-form">
  <select id="target">
    <option value="android">Android</option>
    <option value="windows">Windows</option>
    <option value="linux">Linux</option>
  </select>
  <input id="site-url" />
  <input id="app-name" />
  <select id="arch"><option value="x64">x64</option><option value="arm64">arm64</option></select>
  <select id="artifact"></select>
  <div data-desktop-only hidden></div>
  <button type="button" data-icon-source="letter" aria-selected="true"></button>
  <button type="button" data-icon-source="upload" aria-selected="false"></button>
  <button type="button" data-icon-source="fetch" aria-selected="false"></button>
  <div data-icon-panel="letter"></div>
  <div data-icon-panel="upload" hidden></div>
  <div data-icon-panel="fetch" hidden></div>
  <input id="icon-file" type="file" />
  <button type="button" data-fetch-icon></button>
  <div data-android-only></div>
  <input id="version-code" type="number" value="1" />
  <span data-package-label></span>
  <p data-package></p>
  <button data-build disabled></button>
  <p data-url-note></p>
  <p data-build-status></p>
  <p data-preview-name></p>
  <p data-preview-package></p>
  <canvas data-icon-preview width="256" height="256"></canvas>
  <div data-key-row></div>
  <span data-key-status></span>
  <button type="button" data-backup-key></button>
  <button type="button" data-import-key></button>
  <input data-import-file type="file" />
  <p data-target-note></p>
  <p data-macos-note hidden></p>
  <h1><span data-hero-article>An</span> <span data-hero-target>Android</span></h1>
  <span data-spec-runtime></span>
  <span data-spec-signing></span>
  <span data-spec-network></span>
</form>
<dialog id="key-dialog">
  <form id="key-form">
    <h2 id="key-dialog-title"></h2>
    <p data-key-copy></p>
    <input id="key-password" />
    <input id="key-confirm" />
    <div data-key-confirm-field></div>
    <p data-key-error></p>
    <button data-key-submit></button>
    <button type="button" data-key-cancel></button>
  </form>
</dialog>
`;

type FakeContext = Record<string, unknown>;
let lastCanvas: HTMLCanvasElement | null = null;

function installDom(): void {
  document.body.innerHTML = HTML;
  lastCanvas = document.querySelector<HTMLCanvasElement>("[data-icon-preview]");
}

function setNavigator(
  userAgent: string,
  platform: string,
  userAgentData?: unknown,
): void {
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "platform", {
    value: platform,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "userAgentData", {
    value: userAgentData,
    configurable: true,
  });
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const flushImmediate = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

async function boot(options: {
  userAgent?: string;
  platform?: string;
  userAgentData?: unknown;
  before?: () => void;
} = {}): Promise<void> {
  installDom();
  setNavigator(
    options.userAgent ?? "Mozilla/5.0 (X11; Linux x86_64)",
    options.platform ?? "Linux x86_64",
    options.userAgentData,
  );
  options.before?.();
  vi.resetModules();
  await import("./main");
  await flush();
}

function element<T>(selector: string): T {
  return document.querySelector(selector) as T;
}

function typeUrl(value: string): void {
  const input = element<HTMLInputElement>("#site-url");
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function typeName(value: string): void {
  const input = element<HTMLInputElement>("#app-name");
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function selectTarget(value: string): void {
  const select = element<HTMLSelectElement>("#target");
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

function selectArch(value: string): void {
  const select = element<HTMLSelectElement>("#arch");
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

function selectArtifact(value: string): void {
  const select = element<HTMLSelectElement>("#artifact");
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

function submit(): void {
  element<HTMLFormElement>("#builder-form").dispatchEvent(
    new Event("submit", { cancelable: true }),
  );
}

function click(selector: string): void {
  element<HTMLElement>(selector).click();
}

let fetchMock: ReturnType<typeof vi.fn>;
let mediaListener: (() => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadIdentity.mockResolvedValue(null);
  mocks.buildApk.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.buildDesktopArtifact.mockReturnValue({
    bytes: new Uint8Array([4]),
    filename: "app.zip",
  });
  mocks.loadManifest.mockResolvedValue({ version: "1", artifacts: {} });
  mocks.findBase.mockReturnValue({
    url: "/shells/base",
    size: 1,
    sha256: "a".repeat(64),
  });
  mocks.fetchBase.mockResolvedValue(new Uint8Array([9]));
  mocks.needsConfirmation.mockReturnValue(false);
  mocks.formatBytes.mockImplementation((value: number) => `${value} B`);
  mocks.loadImage.mockResolvedValue({
    naturalWidth: 10,
    naturalHeight: 10,
  } as HTMLImageElement);
  mocks.paintImage.mockReturnValue(true);

  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/shell.apk") {
      return new Response(new Uint8Array([1, 2, 3]));
    }
    if (url.startsWith("/api/favicon")) {
      return new Response(
        new Blob([bufferSource(fixturePng())], { type: "image/png" }),
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "confirm", {
    configurable: true,
    value: vi.fn(() => true),
  });
  mediaListener = undefined;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      addEventListener: vi.fn((_event: string, callback: () => void) => {
        mediaListener = callback;
      }),
    })),
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({}) as unknown as CanvasRenderingContext2D,
  );
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value: vi.fn(
      (callback: BlobCallback, type?: string) => {
        callback(new Blob([bufferSource(fixturePng())], { type }));
      },
    ),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  lastCanvas = null;
});

describe("startup", () => {
  it("selects Linux on Linux and hides Android fields", async () => {
    await boot();
    expect(element<HTMLSelectElement>("#target").value).toBe("linux");
    expect(element<HTMLButtonElement>("[data-build]").textContent).toBe(
      "Generate Linux app",
    );
    expect(element<HTMLElement>("[data-desktop-only]").hidden).toBe(false);
    expect(element<HTMLElement>("[data-android-only]").hidden).toBe(true);
    expect(element<HTMLElement>("[data-key-row]").hidden).toBe(true);
    expect(element<HTMLSelectElement>("#artifact").options).toHaveLength(3);
    expect(element<HTMLSelectElement>("#artifact").value).toBe(
      "linux-appimage",
    );
    expect(element<HTMLElement>("[data-hero-target]").textContent).toBe(
      "Linux",
    );
    expect(element<HTMLElement>("[data-hero-article]").textContent).toBe("A");
    expect(element<HTMLElement>("[data-spec-runtime]").textContent).toBe(
      "WebKitGTK",
    );
    expect(element<HTMLElement>("[data-spec-signing]").textContent).toBe(
      "Unsigned",
    );
    expect(element<HTMLElement>("[data-spec-network]").textContent).toBe(
      "Favicon + on-demand shell",
    );
  });

  it("selects Windows on Windows", async () => {
    await boot({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      platform: "Win32",
    });
    expect(element<HTMLSelectElement>("#target").value).toBe("windows");
    expect(element<HTMLButtonElement>("[data-build]").textContent).toBe(
      "Generate Windows app",
    );
    expect(element<HTMLSelectElement>("#artifact").value).toBe(
      "windows-setup-user",
    );
    expect(element<HTMLElement>("[data-hero-target]").textContent).toBe(
      "Windows",
    );
    expect(element<HTMLElement>("[data-hero-article]").textContent).toBe("A");
    expect(element<HTMLElement>("[data-spec-runtime]").textContent).toBe(
      "WebView2",
    );
  });

  it("uses Android on macOS and shows the contribution note", async () => {
    await boot({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
      platform: "MacIntel",
    });
    expect(element<HTMLSelectElement>("#target").value).toBe("android");
    expect(element<HTMLElement>("[data-macos-note]").hidden).toBe(false);
    expect(element<HTMLButtonElement>("[data-build]").textContent).toBe(
      "Generate APK",
    );
    expect(element<HTMLElement>("[data-hero-target]").textContent).toBe(
      "Android",
    );
    expect(element<HTMLElement>("[data-hero-article]").textContent).toBe("An");
    expect(element<HTMLElement>("[data-spec-runtime]").textContent).toBe(
      "Android System WebView",
    );
    expect(element<HTMLElement>("[data-spec-signing]").textContent).toBe(
      "Local key · APK v2",
    );
  });

  it("uses Android on Android", async () => {
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    expect(element<HTMLSelectElement>("#target").value).toBe("android");
    expect(element<HTMLElement>("[data-desktop-only]").hidden).toBe(true);
    expect(element<HTMLElement>("[data-key-row]").hidden).toBe(false);
  });

  it("does not download build data until a build is requested", async () => {
    await boot();
    expect(fetchMock).not.toHaveBeenCalledWith("/shell.apk");
    expect(mocks.loadManifest).not.toHaveBeenCalled();
    expect(mocks.fetchBase).not.toHaveBeenCalled();
  });

  it("stops the hero when the page is hidden", async () => {
    await boot();
    window.dispatchEvent(new Event("pagehide"));
  });

  it("uses Client Hints for the architecture", async () => {
    await boot({
      userAgentData: {
        getHighEntropyValues: vi.fn(async () => ({ architecture: "arm" })),
      },
    });
    expect(element<HTMLSelectElement>("#arch").value).toBe("arm64");
  });

  it("keeps the user-agent architecture when Client Hints fail", async () => {
    await boot({
      userAgentData: {
        getHighEntropyValues: vi.fn(async () => {
          throw new Error("nope");
        }),
      },
    });
    expect(element<HTMLSelectElement>("#arch").value).toBe("x64");
  });

  it("throws when a required element is missing", async () => {
    installDom();
    element<HTMLElement>("#target").remove();
    setNavigator("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64");
    vi.resetModules();
    await expect(import("./main")).rejects.toThrow("Missing element");
  });
});

describe("form", () => {
  it("starts disabled and reports an empty URL", async () => {
    await boot();
    expect(element<HTMLButtonElement>("[data-build]").disabled).toBe(true);
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Enter an HTTPS URL to begin.",
    );
  });

  it("rejects an invalid URL", async () => {
    await boot();
    typeUrl("http://example.com");
    await flush();
    expect(element<HTMLElement>("[data-url-note]").dataset.error).toBe("true");
    expect(element<HTMLButtonElement>("[data-build]").disabled).toBe(true);
  });

  it("shows the desktop app id for a valid URL", async () => {
    await boot();
    typeUrl("https://example.com");
    await flush();
    expect(element<HTMLElement>("[data-package-label]").textContent).toBe(
      "App id",
    );
    expect(element<HTMLElement>("[data-package]").textContent).toMatch(
      /^napp-[0-9a-f]{12}$/,
    );
    expect(element<HTMLButtonElement>("[data-build]").disabled).toBe(false);
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Ready to build.",
    );
  });

  it("shows the Android package for the Android target", async () => {
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    typeUrl("https://example.com");
    await flush();
    expect(element<HTMLElement>("[data-package-label]").textContent).toBe(
      "Package",
    );
    expect(element<HTMLElement>("[data-package]").textContent).toBe(
      "com.example",
    );
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Ready to sign locally.",
    );
  });

  it("keeps a typed name and marks the desktop id invalid for a bad name", async () => {
    await boot();
    typeUrl("https://example.com");
    typeName("My App");
    await flush();
    expect(element<HTMLElement>("[data-preview-name]").textContent).toBe(
      "My App",
    );
    typeName("😀");
    await flush();
    expect(element<HTMLElement>("[data-package]").textContent).toBe("—");
  });

  it("suggests a name when the field is cleared", async () => {
    await boot();
    typeUrl("https://example.com");
    await flush();
    typeName("Custom");
    typeName("");
    await flush();
    expect(element<HTMLElement>("[data-preview-name]").textContent).toBe(
      "Example",
    );
  });

  it("re-renders when the Android version code changes", async () => {
    await boot();
    typeUrl("https://example.com");
    await flush();
    const version = element<HTMLInputElement>("#version-code");
    version.value = "2";
    version.dispatchEvent(new Event("input"));
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Ready to build.",
    );
  });

  it("updates the target, artifact and architecture selects", async () => {
    await boot();
    typeUrl("https://example.com");
    await flush();
    selectTarget("windows");
    await flush();
    expect(element<HTMLSelectElement>("#artifact").value).toBe(
      "windows-setup-user",
    );
    expect(element<HTMLElement>("[data-hero-target]").textContent).toBe(
      "Windows",
    );
    selectArtifact("windows-portable");
    selectTarget("linux");
    await flush();
    expect(element<HTMLElement>("[data-hero-target]").textContent).toBe(
      "Linux",
    );
    selectArch("arm64");
    await flush();
    expect(element<HTMLSelectElement>("#arch").value).toBe("arm64");
    selectTarget("android");
    await flush();
    expect(element<HTMLElement>("[data-desktop-only]").hidden).toBe(true);
    expect(element<HTMLElement>("[data-key-row]").hidden).toBe(false);
    expect(element<HTMLElement>("[data-hero-target]").textContent).toBe(
      "Android",
    );
    expect(element<HTMLElement>("[data-hero-article]").textContent).toBe("An");
    expect(element<HTMLElement>("[data-spec-runtime]").textContent).toBe(
      "Android System WebView",
    );
  });

  it("re-renders the icon when the color scheme changes", async () => {
    await boot();
    mediaListener?.();
    expect(mocks.paintLetter).toHaveBeenCalled();
  });
});

describe("icons", () => {
  it("switches tabs and opens the file picker", async () => {
    await boot();
    const file = element<HTMLInputElement>("#icon-file");
    const fileClick = vi.spyOn(file, "click").mockImplementation(() => {});
    click("[data-icon-source='upload']");
    expect(fileClick).toHaveBeenCalled();
    expect(element<HTMLElement>("[data-icon-panel='upload']").hidden).toBe(
      false,
    );
    click("[data-icon-source='letter']");
    expect(mocks.paintLetter).toHaveBeenCalled();
  });

  it("ignores an empty or non-image upload", async () => {
    await boot();
    const input = element<HTMLInputElement>("#icon-file");
    input.dispatchEvent(new Event("change"));
    const bad = new File(["x"], "x.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [bad], configurable: true });
    input.dispatchEvent(new Event("change"));
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Choose an image file.",
    );
  });

  it("loads an uploaded image", async () => {
    await boot();
    const input = element<HTMLInputElement>("#icon-file");
    const file = new File(["x"], "x.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    await flush();
    expect(mocks.loadImage).toHaveBeenCalled();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Icon loaded from your file.",
    );
  });

  it("reports an image load failure", async () => {
    await boot();
    mocks.loadImage.mockRejectedValueOnce(new Error("bad image"));
    const input = element<HTMLInputElement>("#icon-file");
    const file = new File(["x"], "x.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "bad image",
    );
  });

  it("reports a non-Error upload failure", async () => {
    await boot();
    mocks.loadImage.mockRejectedValueOnce("bad image string");
    const input = element<HTMLInputElement>("#icon-file");
    const file = new File(["x"], "x.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "That image could not be read.",
    );
  });

  it("fetches a favicon", async () => {
    await boot();
    typeUrl("https://example.com");
    await flush();
    click("[data-fetch-icon]");
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/favicon?url=https%3A%2F%2Fexample.com%2F",
    );
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Favicon loaded from the site.",
    );
  });

  it("requires a URL before fetching a favicon", async () => {
    await boot();
    click("[data-fetch-icon]");
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Enter an HTTPS URL first.",
    );
  });

  it("reports a favicon API error", async () => {
    await boot();
    typeUrl("https://example.com");
    await flush();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "nope" }), { status: 404 }),
    );
    click("[data-fetch-icon]");
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe("nope");
  });

  it("reports a non-JSON favicon error", async () => {
    await boot();
    typeUrl("https://example.com");
    await flush();
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 500 }));
    click("[data-fetch-icon]");
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "No icon could be fetched.",
    );
  });

  it("reports a favicon fetch rejection", async () => {
    await boot();
    typeUrl("https://example.com");
    await flush();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    click("[data-fetch-icon]");
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "offline",
    );
  });

  it("reports a favicon image rejection", async () => {
    await boot();
    typeUrl("https://example.com");
    await flush();
    mocks.loadImage.mockRejectedValueOnce(new Error("bad favicon"));
    click("[data-fetch-icon]");
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "bad favicon",
    );
  });

  it("reports a non-Error favicon image rejection", async () => {
    await boot();
    typeUrl("https://example.com");
    await flush();
    mocks.loadImage.mockRejectedValueOnce("bad favicon string");
    click("[data-fetch-icon]");
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "No icon could be fetched.",
    );
  });
});

describe("Android build", () => {
  it("builds and downloads with an existing identity", async () => {
    mocks.loadIdentity.mockResolvedValue(mocks.identity());
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    typeUrl("https://example.com");
    await flush();
    submit();
    await flush();
    expect(mocks.buildApk).toHaveBeenCalled();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "APK signed and downloaded.",
    );
  });

  it("creates a key through the dialog", async () => {
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    typeUrl("https://example.com");
    await flush();
    submit();
    await flush();
    const password = element<HTMLInputElement>("#key-password");
    const confirm = element<HTMLInputElement>("#key-confirm");
    password.value = "long-enough-password";
    confirm.value = "long-enough-password";
    element<HTMLFormElement>("#key-form").dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await flush();
    expect(mocks.createIdentity).toHaveBeenCalled();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "APK signed and downloaded.",
    );
  });

  it("rejects a short password and a mismatch", async () => {
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    typeUrl("https://example.com");
    await flush();
    submit();
    await flush();
    const form = element<HTMLFormElement>("#key-form");
    element<HTMLInputElement>("#key-password").value = "short";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(element<HTMLElement>("[data-key-error]").textContent).toBe(
      "Use at least 10 characters.",
    );
    element<HTMLInputElement>("#key-password").value = "long-enough-password";
    element<HTMLInputElement>("#key-confirm").value = "different-password";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(element<HTMLElement>("[data-key-error]").textContent).toBe(
      "The passwords do not match.",
    );
  });

  it("cancels the key dialog", async () => {
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    typeUrl("https://example.com");
    await flush();
    submit();
    await flush();
    click("[data-key-cancel]");
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Build cancelled.",
    );
    click("[data-key-cancel]");
    await flush();
  });

  it("handles a failed key save", async () => {
    mocks.saveIdentity.mockRejectedValueOnce(new Error("no storage"));
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    typeUrl("https://example.com");
    await flush();
    submit();
    await flush();
    element<HTMLInputElement>("#key-password").value = "long-enough-password";
    element<HTMLInputElement>("#key-confirm").value = "long-enough-password";
    element<HTMLFormElement>("#key-form").dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await flush();
    expect(element<HTMLElement>("[data-key-status]").textContent).toContain(
      "Browser storage failed",
    );
  });

  it("revokes the download object URL after the timeout", async () => {
    mocks.loadIdentity.mockResolvedValue(mocks.identity());
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    typeUrl("https://example.com");
    await flush();
    vi.spyOn(window, "setTimeout").mockImplementation(
      (handler: TimerHandler) => {
        if (typeof handler === "function") {
          handler();
        }
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
    );
    submit();
    await flushImmediate();
    await flushImmediate();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "APK signed and downloaded.",
    );
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("reuses the cached Android template", async () => {
    mocks.loadIdentity.mockResolvedValue(mocks.identity());
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    typeUrl("https://example.com");
    await flush();
    submit();
    await flush();
    submit();
    await flush();
    const templateCalls = fetchMock.mock.calls.filter(
      ([input]) => String(input) === "/shell.apk",
    );
    expect(templateCalls).toHaveLength(1);
  });

  it("rejects an invalid Android URL", async () => {
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Enter a valid https URL.",
    );
  });

  it("falls back to an app slug when the name has no ASCII characters", async () => {
    mocks.loadIdentity.mockResolvedValue(mocks.identity());
    let downloaded: string | undefined;
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(
      function (this: HTMLAnchorElement) {
        downloaded = this.download;
      },
    );
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    typeUrl("https://example.com");
    typeName("😀");
    await flush();
    submit();
    await flush();
    expect(downloaded).toBe("app-1.apk");
  });

  it("reports a missing template and a build error", async () => {
    mocks.loadIdentity.mockResolvedValue(mocks.identity());
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    typeUrl("https://example.com");
    await flush();
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 404 }));
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "The Android shell template could not be loaded.",
    );
    mocks.buildApk.mockRejectedValueOnce("plain failure");
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "The APK could not be built.",
    );
  });
});

describe("desktop build", () => {
  async function prepareDesktop(): Promise<void> {
    await boot();
    typeUrl("https://example.com");
    await flush();
  }

  it("builds a desktop download", async () => {
    await prepareDesktop();
    submit();
    await flush();
    expect(mocks.loadManifest).toHaveBeenCalled();
    expect(mocks.fetchBase).toHaveBeenCalled();
    expect(mocks.buildDesktopArtifact).toHaveBeenCalled();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "app.zip downloaded.",
    );
  });

  it("asks for confirmation before a large download", async () => {
    mocks.needsConfirmation.mockReturnValue(true);
    await prepareDesktop();
    submit();
    await flush();
    expect(confirm).toHaveBeenCalled();
    expect(mocks.fetchBase).toHaveBeenCalled();
  });

  it("cancels a large download", async () => {
    mocks.needsConfirmation.mockReturnValue(true);
    vi.mocked(window.confirm).mockReturnValue(false);
    await prepareDesktop();
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Download cancelled.",
    );
    expect(mocks.fetchBase).not.toHaveBeenCalled();
  });

  it("reports a manifest failure and retries", async () => {
    mocks.loadManifest.mockRejectedValueOnce(new Error("no manifest"));
    await prepareDesktop();
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "no manifest",
    );
    submit();
    await flush();
    expect(mocks.loadManifest).toHaveBeenCalledTimes(2);
  });

  it("reports a non-Error manifest failure", async () => {
    mocks.loadManifest.mockRejectedValueOnce("bad");
    await prepareDesktop();
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "The shell catalog could not be loaded.",
    );
  });

  it("reports missing targets and fetch failures", async () => {
    mocks.findBase.mockImplementation(() => {
      throw new Error("not available");
    });
    await prepareDesktop();
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "not available",
    );
    mocks.findBase.mockReturnValue({
      url: "/shells/base",
      size: 1,
      sha256: "a".repeat(64),
    });
    mocks.fetchBase.mockRejectedValueOnce(new Error("download failed"));
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "download failed",
    );
  });

  it("reports a canvas encoding failure", async () => {
    await prepareDesktop();
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(
      (callback) => {
        callback(null);
      },
    );
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "The icon could not be rendered.",
    );
  });

  it("reports a canvas read failure", async () => {
    await prepareDesktop();
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(
      (callback) => {
        callback({
          arrayBuffer: () => Promise.reject(new Error("read failed")),
        } as unknown as Blob);
      },
    );
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "read failed",
    );
  });

  it("reports a desktop build failure", async () => {
    mocks.buildDesktopArtifact.mockImplementation(() => {
      throw "bad build";
    });
    await prepareDesktop();
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "The desktop package could not be built.",
    );
  });

  it("rejects an invalid URL or name before building", async () => {
    await boot();
    typeUrl("http://example.com");
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Only https URLs are supported.",
    );
    typeUrl("https://example.com");
    typeName("😀");
    submit();
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Emojis are not supported in app names.",
    );
  });

  it("shares one manifest request between concurrent builds", async () => {
    await prepareDesktop();
    let resolveManifest!: (value: unknown) => void;
    mocks.loadManifest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveManifest = resolve as (value: unknown) => void;
        }),
    );
    submit();
    submit();
    await flush();
    resolveManifest({ version: "1", artifacts: {} });
    await flush();
    expect(mocks.loadManifest).toHaveBeenCalledTimes(1);
  });

  it("reuses a cached manifest", async () => {
    await prepareDesktop();
    submit();
    await flush();
    submit();
    await flush();
    expect(mocks.loadManifest).toHaveBeenCalledTimes(1);
  });
});

describe("keys", () => {
  it("backs up an existing identity", async () => {
    mocks.loadIdentity.mockResolvedValue(mocks.identity());
    await boot();
    click("[data-backup-key]");
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Backup downloaded.",
    );
  });

  it("refuses to back up without an identity", async () => {
    await boot();
    click("[data-backup-key]");
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Create a key with the first build first.",
    );
  });

  it("opens the import file picker", async () => {
    await boot();
    const input = element<HTMLInputElement>("[data-import-file]");
    const fileClick = vi.spyOn(input, "click").mockImplementation(() => {});
    click("[data-import-key]");
    expect(fileClick).toHaveBeenCalled();
  });

  it("cancels an import password prompt", async () => {
    await boot();
    const input = element<HTMLInputElement>("[data-import-file]");
    const file = new File(["x"], "key.p1x");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    await flush();
    click("[data-key-cancel]");
    await flush();
    expect(mocks.importIdentity).not.toHaveBeenCalled();
  });

  it("imports a key", async () => {
    await boot();
    const input = element<HTMLInputElement>("[data-import-file]");
    const file = new File(["x"], "key.p1x", {
      type: "application/octet-stream",
    });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    await flush();
    element<HTMLInputElement>("#key-password").value = "long-enough-password";
    element<HTMLFormElement>("#key-form").dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await flush();
    expect(mocks.importIdentity).toHaveBeenCalled();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Key imported.",
    );
  });

  it("imports a key when storage fails", async () => {
    mocks.saveIdentity.mockRejectedValueOnce(new Error("no storage"));
    await boot();
    const input = element<HTMLInputElement>("[data-import-file]");
    const file = new File(["x"], "key.p1x");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    await flush();
    element<HTMLInputElement>("#key-password").value = "long-enough-password";
    element<HTMLFormElement>("#key-form").dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Key imported for this tab.",
    );
  });

  it("reports an import failure", async () => {
    mocks.importIdentity.mockRejectedValueOnce(new Error("bad backup"));
    await boot();
    const input = element<HTMLInputElement>("[data-import-file]");
    const file = new File(["x"], "key.p1x");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    await flush();
    element<HTMLInputElement>("#key-password").value = "long-enough-password";
    element<HTMLFormElement>("#key-form").dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "bad backup",
    );
  });

  it("reports a non-Error import failure", async () => {
    mocks.importIdentity.mockRejectedValueOnce("bad string");
    await boot();
    const input = element<HTMLInputElement>("[data-import-file]");
    const file = new File(["x"], "key.p1x");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    await flush();
    element<HTMLInputElement>("#key-password").value = "long-enough-password";
    element<HTMLFormElement>("#key-form").dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "The backup could not be imported.",
    );
  });

  it("ignores an empty import selection", async () => {
    await boot();
    element<HTMLInputElement>("[data-import-file]").dispatchEvent(
      new Event("change"),
    );
    expect(mocks.importIdentity).not.toHaveBeenCalled();
  });

  it("reports a storage load failure", async () => {
    mocks.loadIdentity.mockRejectedValueOnce(new Error("no idb"));
    await boot();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "IndexedDB is unavailable; the key will not persist.",
    );
  });

  it("closes the key dialog without a password", async () => {
    await boot({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      platform: "Linux armv8l",
    });
    typeUrl("https://example.com");
    await flush();
    submit();
    await flush();
    element<HTMLDialogElement>("#key-dialog").dispatchEvent(
      new Event("close"),
    );
    await flush();
    expect(element<HTMLElement>("[data-build-status]").textContent).toBe(
      "Build cancelled.",
    );
  });
});
