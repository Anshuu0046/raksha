import { describe, expect, it, vi } from "vitest";
import { createHoldTracker, createTapDetector } from "@/lib/emergency/gestures";
import { WebEmergencyTriggerProvider } from "@/lib/emergency/triggers/web";
import { AndroidEmergencyTriggerProvider } from "@/lib/emergency/triggers/android";

describe("SOS activation: press and hold", () => {
  it("completes only after the full hold duration", () => {
    const hold = createHoldTracker(2000);
    hold.start(1000);
    expect(hold.isComplete(2999)).toBe(false);
    expect(hold.progress(2000)).toBeCloseTo(0.5);
    expect(hold.isComplete(3000)).toBe(true);
  });

  it("an early release cancels without triggering", () => {
    const hold = createHoldTracker(2000);
    hold.start(0);
    hold.cancel();
    expect(hold.active).toBe(false);
    expect(hold.isComplete(5000)).toBe(false);
    expect(hold.progress(5000)).toBe(0);
  });
});

describe("SOS activation: three quick taps", () => {
  it("fires on the third tap inside the window", () => {
    const taps = createTapDetector({ count: 3, windowMs: 1200 });
    expect(taps.tap(0)).toBe(false);
    expect(taps.tap(300)).toBe(false);
    expect(taps.tap(600)).toBe(true);
  });

  it("does not fire when taps are too slow (accidental touches)", () => {
    const taps = createTapDetector({ count: 3, windowMs: 1200 });
    taps.tap(0);
    taps.tap(800);
    expect(taps.tap(1700)).toBe(false); // first tap fell out of the window
    expect(taps.pending).toBe(2);
  });

  it("resets after firing so a fourth tap does not re-trigger", () => {
    const taps = createTapDetector();
    taps.tap(0);
    taps.tap(100);
    expect(taps.tap(200)).toBe(true);
    expect(taps.tap(300)).toBe(false);
  });
});

describe("EmergencyTriggerProvider", () => {
  it("web provider honestly reports no hardware triggers", () => {
    const caps = new WebEmergencyTriggerProvider().capabilities();
    expect(caps.hold && caps.tripleTap && caps.keyboard).toBe(true);
    expect(caps.hardwareVolume || caps.hardwarePower || caps.lockScreen || caps.backgroundDetection).toBe(false);
  });

  it("delivers emitted triggers to subscribers and supports unsubscribe", () => {
    const p = new WebEmergencyTriggerProvider();
    const listener = vi.fn();
    const off = p.subscribe(listener);
    p.emit("hold");
    off();
    p.emit("triple_tap");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].method).toBe("hold");
  });

  it("android provider reads native capabilities and receives native hardware triggers", () => {
    const acknowledge = vi.fn();
    const win = { RakshaAndroid: { getCapabilities: () => JSON.stringify({ hardwareVolume: true, backgroundDetection: true }), acknowledge } } as unknown as Window;
    vi.stubGlobal("window", win);
    const p = new AndroidEmergencyTriggerProvider(win.RakshaAndroid!);
    const listener = vi.fn();
    p.subscribe(listener);
    expect(p.capabilities().hardwareVolume).toBe(true);
    expect(p.capabilities().hold).toBe(true);
    win.__rakshaNativeTrigger!("hardware_volume");
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ method: "hardware_volume" }));
    expect(acknowledge).toHaveBeenCalledWith("hardware_volume");
    p.dispose();
    vi.unstubAllGlobals();
  });
});
