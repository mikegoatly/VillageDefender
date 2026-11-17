import { emptyInput, type InputState } from '../sim/types';
import { TouchControls, type TouchMode } from '../ui/TouchControls';

/** Touch -> InputState. Owns the DOM overlay (TouchControls) and reads its state. */
export class TouchSource {
  readonly controls: TouchControls;

  constructor(root: HTMLElement) {
    this.controls = new TouchControls(root);
  }

  /** True while any finger is on the overlay. */
  hasInput(): boolean {
    return this.controls.isTouched();
  }

  poll(): InputState {
    const s = emptyInput();
    const c = this.controls.state;
    s.move = { x: c.move.x, y: c.move.y };
    s.attack = c.attack;
    s.dodge = c.dodge;
    s.rally = c.rally;
    s.ability1 = c.trap;
    return s;
  }

  setVisible(v: boolean): void {
    this.controls.setVisible(v);
  }

  setMode(mode: TouchMode): void {
    this.controls.setMode(mode);
  }

  destroy(): void {
    this.controls.destroy();
  }
}
