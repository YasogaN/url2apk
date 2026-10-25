export type HeroTarget = "android" | "windows" | "linux";

export type HeroSpec = {
  article: "A" | "An";
  label: string;
  runtime: string;
  signing: string;
  network: string;
};

export type HeroElements = {
  article: HTMLElement;
  target: HTMLElement;
  runtime: HTMLElement;
  signing: HTMLElement;
  network: HTMLElement;
};

export type HeroOptions = {
  reducedMotion?: boolean;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  holdDelay?: number;
  eraseDelay?: number;
  typeDelay?: number;
};

export type HeroController = {
  start(): void;
  stop(): void;
  setTarget(target: HeroTarget): void;
  target(): HeroTarget;
};

export const HERO_SPECS: Record<HeroTarget, HeroSpec> = {
  android: {
    article: "An",
    label: "Android",
    runtime: "Android System WebView",
    signing: "Local key · APK v2",
    network: "Favicon + on-demand shell",
  },
  windows: {
    article: "A",
    label: "Windows",
    runtime: "WebView2",
    signing: "Unsigned",
    network: "Favicon + on-demand shell",
  },
  linux: {
    article: "A",
    label: "Linux",
    runtime: "WebKitGTK",
    signing: "Unsigned",
    network: "Favicon + on-demand shell",
  },
};

const ORDER: HeroTarget[] = ["android", "windows", "linux"];

export function createHero(
  elements: HeroElements,
  initial: HeroTarget,
  options: HeroOptions = {},
): HeroController {
  const setTimer =
    options.setTimer ??
    ((callback: () => void, delay: number) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  const reducedMotion = options.reducedMotion === true;
  const holdDelay = options.holdDelay ?? 1600;
  const eraseDelay = options.eraseDelay ?? 45;
  const typeDelay = options.typeDelay ?? 70;

  let current = initial;
  let text = HERO_SPECS[initial].label;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  function applySpec(target: HeroTarget): void {
    const spec = HERO_SPECS[target];
    elements.article.textContent = spec.article;
    elements.runtime.textContent = spec.runtime;
    elements.signing.textContent = spec.signing;
    elements.network.textContent = spec.network;
  }

  function render(): void {
    elements.target.textContent = text;
  }

  function schedule(callback: () => void, delay: number): void {
    if (timer !== undefined) {
      clearTimer(timer);
    }
    timer = setTimer(callback, delay);
  }

  function nextTarget(): HeroTarget {
    return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  }

  function erase(): void {
    if (text.length > 0) {
      text = text.slice(0, -1);
      render();
      schedule(erase, eraseDelay);
      return;
    }
    current = nextTarget();
    applySpec(current);
    render();
    schedule(type, typeDelay);
  }

  function type(): void {
    const full = HERO_SPECS[current].label;
    if (text.length < full.length) {
      text = full.slice(0, text.length + 1);
      render();
      schedule(type, typeDelay);
      return;
    }
    schedule(erase, holdDelay);
  }

  function start(): void {
    if (running) {
      return;
    }
    running = true;
    text = HERO_SPECS[current].label;
    applySpec(current);
    render();
    if (!reducedMotion) {
      schedule(erase, holdDelay);
    }
  }

  function stop(): void {
    running = false;
    if (timer !== undefined) {
      clearTimer(timer);
      timer = undefined;
    }
  }

  function setTarget(target: HeroTarget): void {
    current = target;
    text = HERO_SPECS[target].label;
    applySpec(target);
    render();
    if (!running || reducedMotion) {
      return;
    }
    schedule(erase, holdDelay);
  }

  return {
    start,
    stop,
    setTarget,
    target: () => current,
  };
}
