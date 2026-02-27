import Clutter from 'gi://Clutter';

export interface Shape {
  widget: Clutter.Actor;

  onPointerButtonPress(button: number): boolean;

  destroy(): void;
}
