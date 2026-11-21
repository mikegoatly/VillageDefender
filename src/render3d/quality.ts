// Automatic quality step-down: when frames stay slow, draw fewer pixels. On a high-DPI screen a weak
// GPU spends most of its time on pixels, so lowering the pixel-ratio cap is the cheapest big win and
// changes no shaders. Only ever steps down, never below `floor`, and only after a sustained slow
// stretch: the median frame of a window is judged, so hitches (shaders compiling as a town loads)
// never count. Pure (no three.js), unit-tested.

export const AUTO_DPR = {
  /** A window whose median frame is slower than this (ms, ~38 fps) is too slow. */
  slowMs: 26,
  /** Seconds of frames in a window (judged, then started afresh, so also the wait after a step). */
  window: 2.5,
  /** Each step lowers the cap by this much, down to `floor`. */
  step: 0.5,
  floor: 1,
};

export class PixelRatioGovernor {
  private readonly times: number[] = [];
  private elapsed = 0;

  /** `cap`: the starting pixel-ratio cap; `device`: the screen's devicePixelRatio (the cap never matters above it). */
  constructor(public cap: number, device: number, private readonly opts = AUTO_DPR) {
    this.cap = Math.min(cap, device);
  }

  /**
   * Feed one frame's time (ms; frames over 250 ms, e.g. a hidden tab or a pause, are ignored).
   * Returns the new cap when it steps down, else null.
   */
  frame(ms: number): number | null {
    if (ms > 250 || this.cap <= this.opts.floor) return null;
    this.times.push(ms);
    this.elapsed += ms / 1000;
    if (this.elapsed < this.opts.window) return null;
    const median = this.times.sort((a, b) => a - b)[Math.floor(this.times.length / 2)];
    this.times.length = 0;
    this.elapsed = 0;
    if (median <= this.opts.slowMs) return null;
    this.cap = Math.max(this.opts.floor, this.cap - this.opts.step);
    return this.cap;
  }
}
