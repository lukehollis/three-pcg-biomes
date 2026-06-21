import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import type { ControllerOptions } from "./types.js";

export class BiomeFirstPersonController {
  readonly controls: PointerLockControls;
  readonly velocity = new THREE.Vector3();
  readonly direction = new THREE.Vector3();

  private readonly keys = new Set<string>();
  private readonly eyeHeight: number;
  private readonly walkSpeed: number;
  private readonly sprintSpeed: number;
  private readonly jumpSpeed: number;
  private readonly gravity: number;
  private grounded = false;
  private disposed = false;
  private suppressNextPointerLockError = false;

  constructor(private readonly options: ControllerOptions) {
    this.controls = new PointerLockControls(options.camera, options.domElement);
    this.eyeHeight = options.eyeHeight ?? 1.72;
    this.walkSpeed = options.walkSpeed ?? 7;
    this.sprintSpeed = options.sprintSpeed ?? 12;
    this.jumpSpeed = options.jumpSpeed ?? 5.6;
    this.gravity = options.gravity ?? 17;

    const start = options.start ?? new THREE.Vector3(0, 0, 18);
    const ground = options.heightAt(start.x, start.z);
    this.controls.object.position.set(start.x, ground + this.eyeHeight, start.z);

    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    options.domElement.ownerDocument.addEventListener("pointerlockerror", this.onPointerLockError, true);
    options.domElement.addEventListener("click", this.requestLock);
  }

  get object(): THREE.Object3D {
    return this.controls.object;
  }

  requestLock = (): boolean => {
    if (this.disposed || this.controls.isLocked) {
      return true;
    }
    if (!this.options.domElement.requestPointerLock) {
      return false;
    }

    try {
      this.suppressNextPointerLockError = true;
      const requestPointerLock = this.options.domElement.requestPointerLock as (
        options?: { unadjustedMovement?: boolean }
      ) => Promise<void> | void;
      const result = requestPointerLock.call(this.options.domElement, { unadjustedMovement: false });
      if (result && typeof result.catch === "function") {
        void result.catch(() => undefined);
      }
      window.setTimeout(() => {
        this.suppressNextPointerLockError = false;
      }, 2000);
      return true;
    } catch {
      this.suppressNextPointerLockError = false;
      return false;
    }
  };

  update(deltaSeconds: number): void {
    if (this.disposed) {
      return;
    }

    const object = this.controls.object;
    const speed = this.keys.has("shiftleft") || this.keys.has("shiftright") ? this.sprintSpeed : this.walkSpeed;
    this.direction.set(0, 0, 0);

    if (this.keys.has("keyw")) this.direction.z -= 1;
    if (this.keys.has("keys")) this.direction.z += 1;
    if (this.keys.has("keya")) this.direction.x -= 1;
    if (this.keys.has("keyd")) this.direction.x += 1;
    if (this.direction.lengthSq() > 0) {
      this.direction.normalize();
    }

    const forward = new THREE.Vector3();
    object.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3()
      .addScaledVector(forward, -this.direction.z)
      .addScaledVector(right, this.direction.x)
      .multiplyScalar(speed);

    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, move.x, 12, deltaSeconds);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, move.z, 12, deltaSeconds);
    this.velocity.y -= this.gravity * deltaSeconds;

    object.position.addScaledVector(this.velocity, deltaSeconds);

    const ground = this.options.heightAt(object.position.x, object.position.z) + this.eyeHeight;
    if (object.position.y <= ground) {
      object.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.controls.disconnect();
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    this.options.domElement.ownerDocument.removeEventListener("pointerlockerror", this.onPointerLockError, true);
    this.options.domElement.removeEventListener("click", this.requestLock);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.code.toLowerCase());
    if (event.code === "Space" && this.grounded) {
      this.velocity.y = this.jumpSpeed;
      this.grounded = false;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code.toLowerCase());
  };

  private readonly onPointerLockError = (event: Event): void => {
    if (!this.suppressNextPointerLockError) {
      return;
    }
    event.stopImmediatePropagation();
    this.suppressNextPointerLockError = false;
  };
}
