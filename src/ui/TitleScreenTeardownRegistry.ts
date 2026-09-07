export type TeardownCallback = () => void;

/**
 * Global Title Screen Scene Teardown Registry
 *
 * Centralizes lifecycle management and resource cleanup for all title screen
 * assets, secondary WebGLRenderers, 2D particle canvases, animation frames,
 * and window event listeners when transitioning into the main game.
 */
export class TitleScreenTeardownRegistry {
  private static callbacks: TeardownCallback[] = [];
  private static isTornDown: boolean = false;

  /**
   * Register a teardown callback for a title screen component.
   * Returns an unregister function.
   */
  public static register(callback: TeardownCallback): () => void {
    if (this.isTornDown) {
      try {
        callback();
      } catch (e) {
        console.error('[TitleScreenRegistry] Immediate teardown error:', e);
      }
      return () => {};
    }
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Executes all registered teardown routines in reverse registration order,
   * purging WebGL contexts, canceling render loops, and releasing memory.
   */
  public static teardownAll(): void {
    if (this.isTornDown) return;
    this.isTornDown = true;
    console.log(`[TitleScreenRegistry] Tearing down ${this.callbacks.length} title screen resource(s)...`);

    while (this.callbacks.length > 0) {
      const cb = this.callbacks.pop();
      if (cb) {
        try {
          cb();
        } catch (err) {
          console.error('[TitleScreenRegistry] Error executing teardown routine:', err);
        }
      }
    }
  }

  /**
   * Resets registry state (useful if returning to title screen from pause/death).
   */
  public static reset(): void {
    this.isTornDown = false;
    this.callbacks = [];
  }
}
