import { buildApk } from "./apk/build";
import { bufferSource } from "./apk/bytes";
import { renderIconLayers } from "./apk/icons";
import {
  createIdentity,
  importIdentity,
  loadIdentity,
  saveIdentity,
  type Identity,
} from "./apk/keys";
import {
  formatVersionCode,
  initials,
  normalizeUrl,
  packageName,
  suggestName,
} from "./domain";
import { loadImage, paintImage, paintLetter } from "./paint";

type IconSource = "letter" | "upload" | "fetch";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
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

let currentUrl: URL | null = null;
let nameTouched = false;
let iconImage: HTMLImageElement | null = null;
let iconSource: IconSource = "letter";
let identity: Identity | null = null;
let template: Uint8Array | null = null;
let passwordResolver: ((value: string | null) => void) | null = null;
let passwordMode: "create" | "import" = "create";

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

async function syncIdentity(): Promise<void> {
  if (urlInput.value.trim() === "") {
    currentUrl = null;
    setUrlNote(
      "HTTPS and a full domain. The app loads the live site.",
      false,
    );
    setStatus("Enter an HTTPS URL to begin.");
    buildButton.disabled = true;
    return;
  }

  const normalized = normalizeUrl(urlInput.value);
  if (!normalized.ok) {
    currentUrl = null;
    setUrlNote(normalized.message, true);
    setStatus("Enter an HTTPS URL to begin.");
    buildButton.disabled = true;
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

  const name = currentName();
  const packageValue = packageName(normalized.url);

  for (const element of packageValues) {
    element.textContent = packageValue;
  }
  previewPackage.textContent = packageValue;
  previewName.textContent = name;
  renderIcon();

  buildButton.disabled = false;
  setStatus("Ready to sign locally.");
}

function selectIconSource(source: IconSource): void {
  iconSource = source;
  for (const tab of tabs) {
    tab.setAttribute("aria-selected", String(tab.dataset.iconSource === source));
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
      ? "The key is generated here. The encrypted backup is the only copy you can move. Lose it and you cannot update the app."
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
  setStatus("Generating a local RSA-2048 key…");
  try {
    const created = await createIdentity(2048, password);
    identity = created;
    await saveIdentity(created);
    downloadBytes(created.backup, "url-to-apk-key.p1x", "application/octet-stream");
    updateKeyStatus();
    setStatus("Key created. Backup downloaded.");
    return created;
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "The key could not be created.",
      "error",
    );
    return null;
  }
}

async function loadTemplate(): Promise<Uint8Array> {
  if (template !== null) {
    return template;
  }
  const response = await fetch("/shell.apk");
  if (!response.ok) {
    throw new Error("The Android shell template could not be loaded.");
  }
  template = new Uint8Array(await response.arrayBuffer());
  return template;
}

async function build(): Promise<void> {
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
    const chosen = await ensureIdentity();
    if (chosen === null) {
      setStatus("Build cancelled.");
      return;
    }

    setStatus("Preparing the shell…");
    const shell = await loadTemplate();
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

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    const source = tab.dataset.iconSource as IconSource | undefined;
    if (source === undefined) {
      return;
    }
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
    "url-to-apk-key.p1x",
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
      const imported = await importIdentity(new Uint8Array(buffer), password);
      identity = imported;
      await saveIdentity(imported);
      updateKeyStatus();
      setStatus("Key imported.");
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
void loadIdentity()
  .then((stored) => {
    if (stored !== null) {
      identity = stored;
      updateKeyStatus();
    }
  })
  .catch(() => {
    setStatus("IndexedDB is unavailable; the key will not persist.", "error");
  });
void syncIdentity();
