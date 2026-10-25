import { describe, expect, it, vi } from "vitest";
import {
  HERO_SPECS,
  createHero,
  type HeroElements,
  type HeroOptions,
} from "./hero";

type Scheduled = { callback: () => void; delay: number };

function elements(): HeroElements {
  return {
    article: { textContent: "" } as HTMLElement,
    target: { textContent: "" } as HTMLElement,
    runtime: { textContent: "" } as HTMLElement,
    signing: { textContent: "" } as HTMLElement,
    network: { textContent: "" } as HTMLElement,
  };
}

function setup(initial: "android" | "windows" | "linux", options: HeroOptions = {}) {
  const scheduled: Scheduled[] = [];
  const cleared = vi.fn();
  const nodes = elements();
  const hero = createHero(nodes, initial, {
    ...options,
    setTimer: (callback, delay) => {
      scheduled.push({ callback, delay });
      return scheduled.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: cleared,
  });
  const tick = (): Scheduled => {
    const next = scheduled.shift();
    if (next === undefined) {
      throw new Error("No timer scheduled");
    }
    next.callback();
    return next;
  };
  return { hero, nodes, scheduled, cleared, tick };
}

describe("createHero", () => {
  it("renders the initial target and spec", () => {
    const { hero, nodes } = setup("android");
    hero.start();
    expect(nodes.target.textContent).toBe("Android");
    expect(nodes.article.textContent).toBe("An");
    expect(nodes.runtime.textContent).toBe("Android System WebView");
    expect(nodes.signing.textContent).toBe("Local key · APK v2");
    expect(nodes.network.textContent).toBe("Favicon + on-demand shell");
    expect(hero.target()).toBe("android");
  });

  it("erases, cycles and retypes Windows and Linux", () => {
    const { hero, nodes, tick } = setup("android");
    hero.start();
    expect(tick().delay).toBe(1600);
    for (let index = 0; index < "Android".length; index += 1) {
      tick();
    }
    expect(nodes.target.textContent).toBe("");
    tick();
    expect(nodes.article.textContent).toBe("A");
    expect(nodes.runtime.textContent).toBe("WebView2");
    expect(nodes.signing.textContent).toBe("Unsigned");
    for (let index = 0; index < "Windows".length; index += 1) {
      tick();
    }
    expect(nodes.target.textContent).toBe("Windows");
    expect(tick().delay).toBe(1600);
    for (let index = 0; index < "Windows".length; index += 1) {
      tick();
    }
    tick();
    expect(nodes.article.textContent).toBe("A");
    expect(nodes.runtime.textContent).toBe("WebKitGTK");
    for (let index = 0; index < "Linux".length; index += 1) {
      tick();
    }
    expect(nodes.target.textContent).toBe("Linux");
    expect(hero.target()).toBe("linux");
  });

  it("wraps around to Android after Linux", () => {
    const { hero, nodes, tick } = setup("linux");
    hero.start();
    tick();
    for (let index = 0; index < "Linux".length; index += 1) {
      tick();
    }
    tick();
    expect(nodes.article.textContent).toBe("An");
    expect(nodes.runtime.textContent).toBe("Android System WebView");
    for (let index = 0; index < "Android".length; index += 1) {
      tick();
    }
    expect(nodes.target.textContent).toBe("Android");
    expect(hero.target()).toBe("android");
  });

  it("switches target while running and clears the pending timer", () => {
    const { hero, nodes, tick, cleared } = setup("android");
    hero.start();
    hero.setTarget("windows");
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(nodes.target.textContent).toBe("Windows");
    expect(nodes.article.textContent).toBe("A");
    expect(nodes.runtime.textContent).toBe("WebView2");
    expect(tick().delay).toBe(1600);
  });

  it("switches target while stopped without scheduling", () => {
    const { hero, nodes, scheduled } = setup("android");
    hero.setTarget("linux");
    expect(nodes.target.textContent).toBe("Linux");
    expect(nodes.article.textContent).toBe("A");
    expect(scheduled).toHaveLength(0);
    hero.start();
    expect(scheduled).toHaveLength(1);
  });

  it("does not restart an already running hero", () => {
    const { hero, scheduled } = setup("android");
    hero.start();
    hero.start();
    expect(scheduled).toHaveLength(1);
  });

  it("stops and clears the timer", () => {
    const { hero, cleared, scheduled } = setup("android");
    hero.start();
    hero.stop();
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(1);
    hero.stop();
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it("stops scheduling after stop and can restart", () => {
    const { hero, nodes, scheduled, tick } = setup("android");
    hero.start();
    hero.stop();
    hero.setTarget("windows");
    expect(scheduled).toHaveLength(1);
    hero.start();
    expect(nodes.target.textContent).toBe("Windows");
    expect(scheduled).toHaveLength(2);
    expect(tick()).toBeDefined();
  });

  it("respects reduced motion", () => {
    const { hero, nodes, scheduled } = setup("android", { reducedMotion: true });
    hero.start();
    expect(nodes.target.textContent).toBe("Android");
    expect(scheduled).toHaveLength(0);
    hero.setTarget("linux");
    expect(nodes.target.textContent).toBe("Linux");
    expect(scheduled).toHaveLength(0);
    hero.stop();
  });

  it("uses the real timer defaults", () => {
    vi.useFakeTimers();
    try {
      const nodes = elements();
      const hero = createHero(nodes, "windows");
      hero.start();
      expect(nodes.target.textContent).toBe("Windows");
      vi.advanceTimersByTime(1600);
      expect(nodes.target.textContent).toBe("Window");
      hero.stop();
      vi.advanceTimersByTime(1000);
      expect(nodes.target.textContent).toBe("Window");
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes every spec", () => {
    expect(HERO_SPECS.android.article).toBe("An");
    expect(HERO_SPECS.windows.article).toBe("A");
    expect(HERO_SPECS.linux.article).toBe("A");
    expect(HERO_SPECS.windows.runtime).toBe("WebView2");
    expect(HERO_SPECS.linux.runtime).toBe("WebKitGTK");
  });
});
