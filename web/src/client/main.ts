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
const engineStatus = requireElement<HTMLElement>("[data-engine-status]");
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

let currentUrl: URL | null = null;
let nameTouched = false;
let iconImage: HTMLImageElement | null = null;
let iconSource: IconSource = "letter";
let identityToken = 0;
let engineReady = false;

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
    "HTTPS only. The generated app loads the live site; it is not an offline copy.",
    false,
  );

  if (!nameTouched) {
    nameInput.value = suggestName(normalized.url);
  }

  const name = currentName();
  const versionCode = formatVersionCode(versionInput.valueAsNumber);
  const token = ++identityToken;
  const packageValue = await packageName(
    normalized.url,
    `${name}\n${versionCode}`,
  );
  if (token !== identityToken) {
    return;
  }

  for (const element of packageValues) {
    element.textContent = packageValue;
  }
  previewPackage.textContent = packageValue;
  previewName.textContent = name;
  renderIcon();

  buildButton.disabled = !engineReady;
  engineStatus.textContent = engineReady
    ? "LOCAL ENGINE: READY"
    : "LOCAL ENGINE: IDLE";
  setStatus(
    engineReady
      ? "Ready to sign locally."
      : "The local packaging engine is not available in this build.",
    engineReady ? "muted" : "error",
  );
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
  if (currentUrl === null) {
    setStatus("Enter an HTTPS URL first.", "error");
    return;
  }
  setStatus("The local packaging engine is not available in this build.", "error");
});

const media = window.matchMedia("(prefers-color-scheme: dark)");
media.addEventListener("change", () => {
  renderIcon();
});

previewName.textContent = "Example";
paintLetter(canvas, "E");
void syncIdentity();
