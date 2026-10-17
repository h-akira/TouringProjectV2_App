// Plays the answer clips one after another. expo-audio reports a load/playback failure only as status.error
// (never didJustFinish), and a stalled stream reports nothing, so both must settle the promise or the ask loop
// would stay in "speaking" forever. The watchdog uses the injected (native) sleep: JS timers stop in the background.
export type ClipStatus = { didJustFinish: boolean; error?: string | null; currentTime: number };
export type ClipPlayer = {
  play(): void;
  pause(): void;
  remove(): void;
  addListener(event: "playbackStatusUpdate", listener: (status: ClipStatus) => void): { remove(): void };
};
export type PlaybackDeps = { create(url: string): ClipPlayer; sleep(ms: number): Promise<void> };

export const CLIP_STALL_MS = 15_000;
const WATCH_MS = 1_000;

export async function playClips(urls: string[], deps: PlaybackDeps, stopRef: { stop: (() => void) | null }): Promise<void> {
  const session = { stopped: false };
  for (const url of urls) {
    if (session.stopped) return;
    await playClip(url, deps, stopRef, session);
  }
}

function playClip(url: string, deps: PlaybackDeps, stopRef: { stop: (() => void) | null }, session: { stopped: boolean }): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const player = deps.create(url);
    let settled = false;
    let lastTime = -1;
    let idleMs = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      sub.remove();
      player.remove();
      // Another playback may have taken over stopRef meanwhile; its stop must stay reachable.
      if (stopRef.stop === stop) stopRef.stop = null;
      if (error) reject(error);
      else resolve();
    };
    const sub = player.addListener("playbackStatusUpdate", (status) => {
      if (status.error) finish(new Error(status.error));
      else if (status.didJustFinish) finish();
      else if (status.currentTime !== lastTime) {
        lastTime = status.currentTime;
        idleMs = 0;
      }
    });
    const stop = () => {
      session.stopped = true;
      player.pause();
      finish();
    };
    stopRef.stop = stop;
    player.play();
    void (async () => {
      while (!settled) {
        await deps.sleep(WATCH_MS);
        if (settled) return;
        idleMs += WATCH_MS;
        if (idleMs >= CLIP_STALL_MS) finish(new Error("stalled"));
      }
    })();
  });
}
