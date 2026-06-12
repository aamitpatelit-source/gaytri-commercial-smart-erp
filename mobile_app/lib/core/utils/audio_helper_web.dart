import 'dart:js' as js;

void playBeepSound(bool success) {
  try {
    final frequency = success ? 880 : 220;
    final duration = success ? 0.18 : 0.35;
    final gainVal = success ? 0.08 : 0.12;
    js.context.callMethod('eval', [
      """
      (function() {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return;
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime($frequency, ctx.currentTime);
          gain.gain.setValueAtTime($gainVal, ctx.currentTime);
          osc.start();
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + $duration);
          osc.stop(ctx.currentTime + $duration);
        } catch (e) {
          console.error(e);
        }
      })();
      """
    ]);
  } catch (e) {
    // Silently catch exceptions in production
  }
}
