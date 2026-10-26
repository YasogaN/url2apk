import { bufferSource } from "./apk/bytes";
import type { Identity } from "./apk/keys";
import {
  buildDesktopConfig,
  type DesktopArch,
  type DesktopArtifact,
} from "./desktop/config";
import type { ShellManifest } from "./desktop/manifest";
import {
  detectArch,
  detectHost,
  primaryTarget,
  type HostPlatform,
  type PrimaryTarget,
} from "./desktop/platform";
import {
  formatVersionCode,
  initials,
  normalizeUrl,
  packageName,
  suggestName,
} from "./domain";
import { createHero, type HeroController } from "./hero";
import {
  loadAndroidModules,
  loadDesktopModules,
  loadKeys,
} from "./lazy";
import { loadImage, paintImage, paintLetter } from "./paint";

type IconSource = "letter" | "upload" | "fetch";
type Target = PrimaryTarget;

const SHELL_TEMPLATE_URL = "/shell.apk";
const SHELL_TEMPLATE_ERROR = "The Android shell template could not be loaded.";

function requireElement<T>(selector: string): T {
  const element = document.querySelector(selector);
  if (element === null) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element as T;
}

const form = requireElement<HTMLFormElement>("#builder-form");
const urlInput = requireElement<HTMLInputElement>("#site-url");
const nameInput = requireElement<HTMLInputElement>("#app-name");
const versionInput = requireElement<HTMLInputElement>("#version-code");
const fileInput = requireElement<HTMLInputElement>("#icon-file");
const fetchButton = requireElement<HTMLButtonElement>("[data-fetch-icon]");
const buildButton = requireElement<HTMLButtonElement>("[data-build]");
const urlNote = requireElement<HTMLElement>("[data-url-note]");
const statusLine = requireElement<HTMLElement>("[data-build-status]");
const previewName = requireElement<HTMLElement>("[data-preview-name]");
const previewPackage = requireElement<HTMLElement>("[data-preview-package]");
const packageValues = Array.from(
  document.querySelectorAll<HTMLElement>("[data-package]"),
);
const canvas = requireElement<HTMLCanvasElement>("[data-icon-preview]");
const tabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-icon-source]"),
);
const panels = Array.from(
  document.querySelectorAll<HTMLElement>("[data-icon-panel]"),
);

const keyDialog = requireElement<HTMLDialogElement>("#key-dialog");
const keyForm = requireElement<HTMLFormElement>("#key-form");
const keyDialogTitle = requireElement<HTMLElement>("#key-dialog-title");
const keyCopy = requireElement<HTMLElement>("[data-key-copy]");
const keyPassword = requireElement<HTMLInputElement>("#key-password");
const keyConfirm = requireElement<HTMLInputElement>("#key-confirm");
const keyConfirmField = requireElement<HTMLElement>("[data-key-confirm-field]");
const keyError = requireElement<HTMLElement>("[data-key-error]");
const keySubmit = requireElement<HTMLButtonElement>("[data-key-submit]");
const keyCancel = requireElement<HTMLButtonElement>("[data-key-cancel]");
const keyStatus = requireElement<HTMLElement>("[data-key-status]");
const backupKeyButton = requireElement<HTMLButtonElement>("[data-backup-key]");
const importKeyButton = requireElement<HTMLButtonElement>("[data-import-key]");
const importFile = requireElement<HTMLInputElement>("[data-import-file]");
const targetSelect = requireElement<HTMLSelectElement>("#target");
const archSelect = requireElement<HTMLSelectElement>("#arch");
const artifactSelect = requireElement<HTMLSelectElement>("#artifact");
const desktopFields = requireElement<HTMLElement>("[data-desktop-only]");
const androidFields = Array.from(
  document.querySelectorAll<HTMLElement>("[data-android-only]"),
);
const keyRow = requireElement<HTMLElement>("[data-key-row]");
const packageLabel = requireElement<HTMLElement>("[data-package-label]");
const targetNote = requireElement<HTMLElement>("[data-target-note]");
const macNote = requireElement<HTMLElement>("[data-macos-note]");
const heroArticle = requireElement<HTMLElement>("[data-hero-article]");
const heroTarget = requireElement<HTMLElement>("[data-hero-target]");
const specRuntime = requireElement<HTMLElement>("[data-spec-runtime]");
const specSigning = requireElement<HTMLElement>("[data-spec-signing]");
const specNetwork = requireElement<HTMLElement>("[data-spec-network]");

let currentUrl: URL | null = null;
let nameTouched = false;
let iconImage: HTMLImageElement | null = null;
let iconSource: IconSource = "letter";
let identity: Identity | null = null;
let template: Uint8Array | null = null;
let passwordResolver: ((value: string | null) => void) | null = null;
let passwordMode: "create" | "import" = "create";
let target: Target = "android";
let arch: DesktopArch = "x64";
let artifact: DesktopArtifact = "windows-setup-user";
let host: HostPlatform = "other";
let hero: HeroController | null = null;
let manifest: ShellManifest | null = null;
let manifestLoading: Promise<ShellManifest | null> | null = null;

const WINDOWS_ARTIFACTS: ReadonlyArray<{
  value: DesktopArtifact;
  label: string;
}> = [
  { value: "windows-setup-user", label: "Setup · current user" },
  { value: "windows-setup-system", label: "Setup · all users" },
  { value: "windows-portable", label: "Portable .zip" },
];

const LINUX_ARTIFACTS: ReadonlyArray<{
  value: DesktopArtifact;
  label: string;
}> = [
  { value: "linux-appimage", label: "AppImage · system WebKit" },
  { value: "linux-appimage-full", label: "AppImage · bundled WebKit" },
  { value: "linux-tar", label: "tar.gz" },
];

function setStatus(message: string, tone: "muted" | "error" = "muted"): void {
  statusLine.textContent = message;
  statusLine.dataset.tone = tone;
}

function setUrlNote(message: string, error: boolean): void {
  urlNote.textContent = message;
  if (error) {
    urlNote.dataset.error = "true";
  } else {
    delete urlNote.dataset.error;
  }
}

function currentName(): string {
  const typed = nameInput.value.trim();
  if (typed !== "") {
    return typed;
  }
  return currentUrl === null ? "Example" : suggestName(currentUrl);
}

function renderIcon(): void {
  const name = currentName();
  if (iconImage !== null && paintImage(canvas, iconImage)) {
    return;
  }
  paintLetter(canvas, initials(name));
}

function renderPreview(): void {
  previewName.textContent = currentName();
  renderIcon();
}

function isDesktop(): boolean {
  return target !== "android";
}

function renderTargetUi(): void {
  const desktop = isDesktop();
  desktopFields.hidden = !desktop;
  for (const field of androidFields) {
    field.hidden = desktop;
  }
  keyRow.hidden = desktop;
  macNote.hidden = host !== "mac";
  targetNote.textContent = desktop
    ? "The prebuilt shell downloads once and the package is assembled here."
    : "Android builds use a local signing key. Desktop builds are unsigned.";
  buildButton.textContent =
    target === "windows"
      ? "Generate Windows app"
      : target === "linux"
        ? "Generate Linux app"
        : "Generate APK";

  if (desktop) {
    const options =
      target === "windows" ? WINDOWS_ARTIFACTS : LINUX_ARTIFACTS;
    if (!options.some((option) => option.value === artifact)) {
      artifact = options[0].value;
    }
    artifactSelect.replaceChildren(
      ...options.map((option) => {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        return element;
      }),
    );
    artifactSelect.value = artifact;
    archSelect.value = arch;
  }
  void syncIdentity();
}

function previewPackageValue(url: URL | null): string {
  if (url === null) {
    return "—";
  }
  if (!isDesktop()) {
    return packageName(url);
  }
  const result = buildDesktopConfig({ url: url.href, name: currentName() });
  return result.ok ? result.config.id : "—";
}

function updatePackagePreview(): void {
  packageLabel.textContent = isDesktop() ? "App id" : "Package";
  const value = previewPackageValue(currentUrl);
  for (const element of packageValues) {
    element.textContent = value;
  }
  previewPackage.textContent = value;
}

async function syncIdentity(): Promise<void> {
  if (urlInput.value.trim() === "") {
    currentUrl = null;
    setUrlNote(
      "HTTPS and a full domain. The app loads the live site.",
      false,
    );
    setStatus("Enter an HTTPS URL to begin.");
    buildButton.disabled = true;
    updatePackagePreview();
    return;
  }

  const normalized = normalizeUrl(urlInput.value);
  if (!normalized.ok) {
    currentUrl = null;
    setUrlNote(normalized.message, true);
    setStatus("Enter an HTTPS URL to begin.");
    buildButton.disabled = true;
    updatePackagePreview();
    return;
  }

  currentUrl = normalized.url;
  setUrlNote(
    "HTTPS and a full domain. The app loads the live site.",
    false,
  );

  if (!nameTouched) {
    nameInput.value = suggestName(normalized.url);
  }

  previewName.textContent = currentName();
  updatePackagePreview();
  renderIcon();

  buildButton.disabled = false;
  setStatus(isDesktop() ? "Ready to build." : "Ready to sign locally.");
}

function selectIconSource(source: IconSource): void {
  iconSource = source;
  for (const tab of tabs) {
    tab.setAttribute("aria-pressed", String(tab.dataset.iconSource === source));
  }
  for (const panel of panels) {
    panel.hidden = panel.dataset.iconPanel !== source;
  }
  if (source === "letter") {
    iconImage = null;
    renderIcon();
  }
}

function updateKeyStatus(): void {
  keyStatus.textContent =
    identity === null
      ? "No key yet. It is created on the first build."
      : "Key stored. Keep the backup safe.";
}

function requestPassword(mode: "create" | "import"): Promise<string | null> {
  passwordMode = mode;
  keyError.textContent = "";
  keyPassword.value = "";
  keyConfirm.value = "";
  keyConfirmField.hidden = mode === "import";
  keyDialogTitle.textContent =
    mode === "create"
      ? "Create the key that signs this app."
      : "Unlock the key backup.";
  keyCopy.textContent =
    mode === "create"
      ? "The key is generated here. The encrypted backup is the only copy you can move. Lose it and you cannot install over the app again."
      : "Choose the .p1x backup, then enter its password.";
  keySubmit.textContent =
    mode === "create" ? "Create key & download backup" : "Unlock key";
  keyDialog.showModal();
  keyPassword.focus();
  return new Promise((resolve) => {
    passwordResolver = resolve;
  });
}

function closePassword(value: string | null): void {
  const resolve = passwordResolver;
  passwordResolver = null;
  keyDialog.close();
  if (resolve !== null) {
    resolve(value);
  }
}

async function ensureIdentity(): Promise<Identity | null> {
  if (identity !== null) {
    return identity;
  }
  const password = await requestPassword("create");
  if (password === null) {
    return null;
  }
  const { createIdentity, saveIdentity } = await loadKeys();
  setStatus("Generating a local RSA-2048 key…");
  const created = await createIdentity(2048, password);
  identity = created;
  downloadBytes(
    created.backup,
    "url-to-app-key.p1x",
    "application/octet-stream",
  );
  try {
    await saveIdentity(created);
    updateKeyStatus();
  } catch {
    keyStatus.textContent =
      "Key ready in this tab. Browser storage failed; keep the .p1x backup and import it next time.";
  }
  setStatus("Key created. Backup downloaded.");
  return created;
}

async function loadTemplate(): Promise<Uint8Array> {
  if (template !== null) {
    return template;
  }
  const { loadShell } = await loadAndroidModules();
  template = await loadShell(SHELL_TEMPLATE_URL, {
    message: SHELL_TEMPLATE_ERROR,
  });
  return template;
}

async function buildAndroid(): Promise<void> {
  const normalized = normalizeUrl(urlInput.value);
  if (!normalized.ok) {
    setStatus(normalized.message, "error");
    return;
  }

  const name = currentName();
  const versionCode = formatVersionCode(versionInput.valueAsNumber);
  const packageValue = packageName(normalized.url);

  buildButton.disabled = true;
  try {
    const modules = loadAndroidModules();
    const chosen = await ensureIdentity();
    if (chosen === null) {
      setStatus("Build cancelled.");
      return;
    }

    setStatus("Preparing the shell…");
    const shell = await loadTemplate();
    const { buildApk, renderIconLayers } = await modules;
    setStatus("Rendering the icon layers…");
    const icons = await renderIconLayers(iconImage, name);
    setStatus("Assembling and signing the APK…");
    const apk = await buildApk({
      template: shell,
      packageName: packageValue,
      label: name,
      versionCode,
      url: normalized.url.href,
      name,
      icons,
      identity: chosen,
    });
    downloadBytes(
      apk,
      `${slug(name)}-${versionCode}.apk`,
      "application/vnd.android.package-archive",
    );
    setStatus(
      "APK signed and downloaded.",
    );
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "The APK could not be built.",
      "error",
    );
  } finally {
    buildButton.disabled = false;
  }
}

async function ensureManifest(): Promise<ShellManifest | null> {
  if (manifest !== null) {
    return manifest;
  }
  if (manifestLoading === null) {
    manifestLoading = loadDesktopModules()
      .then(({ loadManifest }) => loadManifest())
      .then((value) => {
        manifest = value;
        return value;
      })
      .catch((error: unknown) => {
        setStatus(
          error instanceof Error
            ? error.message
            : "The shell catalog could not be loaded.",
          "error",
        );
        return null;
      })
      .finally(() => {
        manifestLoading = null;
      });
  }
  return manifestLoading;
}

function canvasPng(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("The icon could not be rendered."));
        return;
      }
      void blob.arrayBuffer().then((buffer) => {
        resolve(new Uint8Array(buffer));
      }, reject);
    }, "image/png");
  });
}

async function buildDesktop(): Promise<void> {
  const normalized = normalizeUrl(urlInput.value);
  if (!normalized.ok) {
    setStatus(normalized.message, "error");
    return;
  }
  const configResult = buildDesktopConfig({
    url: normalized.url.href,
    name: currentName(),
  });
  if (!configResult.ok) {
    setStatus(configResult.message, "error");
    return;
  }

  const selectedArtifact = artifact;
  const selectedArch = arch;
  buildButton.disabled = true;
  try {
    const modules = loadDesktopModules();
    setStatus("Loading the shell catalog…");
    const catalog = await ensureManifest();
    if (catalog === null) {
      return;
    }
    const {
      fetchBase,
      findBase,
      formatBytes,
      needsConfirmation,
      buildDesktopArtifact,
      repackAppImage,
    } = await modules;
    const base = findBase(catalog, selectedArtifact, selectedArch);
    if (needsConfirmation(base)) {
      const proceed = window.confirm(
        `This build downloads a ${formatBytes(base.size)} shell. Continue?`,
      );
      if (!proceed) {
        setStatus("Download cancelled.");
        return;
      }
    }
    setStatus(`Downloading the ${formatBytes(base.size)} shell…`);
    const shell = await fetchBase(base);
    setStatus("Rendering the icon…");
    const icon = await canvasPng();
    let image = shell;
    if (
      selectedArtifact === "linux-appimage" ||
      selectedArtifact === "linux-appimage-full"
    ) {
      if (base.squashfsOffset === undefined) {
        throw new Error("The AppImage base is missing its filesystem offset.");
      }
      setStatus("Repacking the AppImage…");
      image = await repackAppImage(
        shell,
        base.squashfsOffset,
        configResult.config,
        icon,
        selectedArtifact === "linux-appimage" ? "lite" : "full",
      );
    }
    setStatus("Assembling the package…");
    const result = buildDesktopArtifact({
      config: configResult.config,
      icon,
      artifact: selectedArtifact,
      arch: selectedArch,
      base: image,
    });
    downloadBytes(result.bytes, result.filename, "application/octet-stream");
    setStatus(`${result.filename} downloaded.`);
  } catch (error) {
    setStatus(
      error instanceof Error
        ? error.message
        : "The desktop package could not be built.",
      "error",
    );
  } finally {
    buildButton.disabled = false;
  }
}

async function build(): Promise<void> {
  if (isDesktop()) {
    await buildDesktop();
  } else {
    await buildAndroid();
  }
}

function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  type: string,
): void {
  const blob = new Blob([bufferSource(bytes)], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized === "" ? "app" : normalized;
}

urlInput.addEventListener("input", () => {
  void syncIdentity();
});

nameInput.addEventListener("input", () => {
  nameTouched = true;
  renderPreview();
  void syncIdentity();
});

versionInput.addEventListener("input", () => {
  void syncIdentity();
});

targetSelect.addEventListener("change", () => {
  target = targetSelect.value as Target;
  hero?.setTarget(target);
  renderTargetUi();
});

artifactSelect.addEventListener("change", () => {
  artifact = artifactSelect.value as DesktopArtifact;
  void syncIdentity();
});

archSelect.addEventListener("change", () => {
  arch = archSelect.value as DesktopArch;
  void syncIdentity();
});

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    const source = tab.dataset.iconSource as IconSource;
    selectIconSource(source);
    if (source === "upload") {
      fileInput.click();
    }
  });
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file === undefined) {
    return;
  }
  if (!file.type.startsWith("image/")) {
    setStatus("Choose an image file.", "error");
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  void loadImage(objectUrl)
    .then((image) => {
      iconImage = image;
      selectIconSource("upload");
      renderIcon();
      setStatus("Icon loaded from your file.");
    })
    .catch((error: unknown) => {
      setStatus(
        error instanceof Error ? error.message : "That image could not be read.",
        "error",
      );
    })
    .finally(() => {
      URL.revokeObjectURL(objectUrl);
    });
});

fetchButton.addEventListener("click", () => {
  const normalized = normalizeUrl(urlInput.value);
  if (!normalized.ok) {
    setUrlNote(normalized.message, true);
    setStatus("Enter an HTTPS URL first.", "error");
    return;
  }

  const originalLabel = fetchButton.textContent;
  fetchButton.disabled = true;
  fetchButton.textContent = "Fetching…";
  setStatus("Asking the site for its icon…");

  void fetch(`/api/favicon?url=${encodeURIComponent(normalized.url.href)}`)
    .then(async (response) => {
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: unknown;
        };
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "No icon could be fetched.",
        );
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = await loadImage(objectUrl);
        iconImage = image;
        selectIconSource("fetch");
        renderIcon();
        setStatus("Favicon loaded from the site.");
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    })
    .catch((error: unknown) => {
      setStatus(
        error instanceof Error ? error.message : "No icon could be fetched.",
        "error",
      );
    })
    .finally(() => {
      fetchButton.disabled = false;
      fetchButton.textContent = originalLabel;
    });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void build();
});

keyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const password = keyPassword.value;
  if (password.length < 10) {
    keyError.textContent = "Use at least 10 characters.";
    return;
  }
  if (passwordMode === "create" && keyConfirm.value !== password) {
    keyError.textContent = "The passwords do not match.";
    return;
  }
  keyPassword.value = "";
  keyConfirm.value = "";
  closePassword(password);
});

keyCancel.addEventListener("click", () => {
  closePassword(null);
});

keyDialog.addEventListener("close", () => {
  if (passwordResolver !== null) {
    const resolve = passwordResolver;
    passwordResolver = null;
    resolve(null);
  }
});

backupKeyButton.addEventListener("click", () => {
  if (identity === null) {
    setStatus("Create a key with the first build first.", "error");
    return;
  }
  downloadBytes(
    identity.backup,
    "url-to-app-key.p1x",
    "application/octet-stream",
  );
  setStatus("Backup downloaded.");
});

importKeyButton.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (file === undefined) {
    return;
  }
  void file.arrayBuffer().then(async (buffer) => {
    const password = await requestPassword("import");
    if (password === null) {
      return;
    }
    setStatus("Unlocking the key backup…");
    try {
      const { importIdentity, saveIdentity } = await loadKeys();
      const imported = await importIdentity(new Uint8Array(buffer), password);
      identity = imported;
      try {
        await saveIdentity(imported);
        updateKeyStatus();
        setStatus("Key imported.");
      } catch {
        keyStatus.textContent =
          "Key ready in this tab. Browser storage failed; keep the .p1x backup.";
        setStatus("Key imported for this tab.");
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The backup could not be imported.",
        "error",
      );
    }
  });
});

const media = window.matchMedia("(prefers-color-scheme: dark)");
media.addEventListener("change", () => {
  renderIcon();
});

previewName.textContent = "Example";
paintLetter(canvas, "E");
host = detectHost(navigator.userAgent, navigator.platform);
target = primaryTarget(host);
targetSelect.value = target;
hero = createHero(
  {
    article: heroArticle,
    target: heroTarget,
    runtime: specRuntime,
    signing: specSigning,
    network: specNetwork,
  },
  target,
  {
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
  },
);
hero.start();
window.addEventListener("pagehide", () => hero?.stop());
arch = detectArch(navigator.userAgent);
archSelect.value = arch;
const highEntropy = (
  navigator as unknown as {
    userAgentData?: {
      getHighEntropyValues?: (
        hints: string[],
      ) => Promise<{ architecture?: string }>;
    };
  }
).userAgentData;
if (highEntropy?.getHighEntropyValues !== undefined) {
  void highEntropy
    .getHighEntropyValues(["architecture"])
    .then((values) => {
      arch = detectArch(navigator.userAgent, values.architecture);
      archSelect.value = arch;
    })
    .catch(() => {
      // Keep the user-agent fallback.
    });
}
renderTargetUi();
void loadKeys()
  .then(({ loadIdentity }) => loadIdentity())
  .then((stored) => {
    if (stored !== null) {
      identity = stored;
    }
    updateKeyStatus();
  })
  .catch(() => {
    setStatus("IndexedDB is unavailable; the key will not persist.", "error");
  });
