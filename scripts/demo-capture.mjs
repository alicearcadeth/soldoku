import { mkdirSync, writeFileSync } from "node:fs";

/** Capture the app's actual canvas and Web Audio, keeping idle waits in separate takes. */
export async function demoCapture(context, page, output) {
  mkdirSync(output, { recursive: true });
  await context.addInitScript(() => {
    const NativeContext = window.AudioContext;
    const nativeConnect = AudioNode.prototype.connect;
    const mixer = new NativeContext();
    const sink = mixer.createMediaStreamDestination();
    window.demoMixer = mixer; window.demoSink = sink;
    window.AudioContext = class extends NativeContext {
      constructor(...args) {
        super(...args);
        this.demoSink = this.createMediaStreamDestination();
        const bridge = mixer.createMediaStreamSource(this.demoSink.stream);
        nativeConnect.call(bridge, sink);
      }
    };
    AudioNode.prototype.connect = function(target, ...args) {
      if (target instanceof AudioDestinationNode && target.context.demoSink) {
        nativeConnect.call(this, target.context.demoSink, ...args);
      }
      return nativeConnect.call(this, target, ...args);
    };
  });
  const session = await context.newCDPSession(page);
  const takes = []; let active = null;
  session.on("Page.screencastFrame", async event => {
    if (active && (!active.frames.length || event.metadata.timestamp - active.frames.at(-1).time >= 1 / 30)) {
      const name = `frame-${String(active.frames.length).padStart(5, "0")}.jpg`;
      writeFileSync(`${active.directory}/${name}`, Buffer.from(event.data, "base64"));
      active.frames.push({ name, time: event.metadata.timestamp });
    }
    await session.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
  });
  async function start(name) {
    if (active) throw new Error("Stop the previous capture before starting another.");
    const directory = `${output}/${name}`; mkdirSync(directory, { recursive: true });
    const audioStart = await page.evaluate(async () => {
      await window.demoMixer.resume();
      const silent = window.demoMixer.createOscillator(); const gain = window.demoMixer.createGain(); gain.gain.value = 0;
      silent.connect(gain); gain.connect(window.demoSink); silent.start();
      window.demoSilent = silent; window.demoChunks = [];
      window.demoRecorder = new MediaRecorder(window.demoSink.stream, { mimeType: "audio/webm;codecs=opus" });
      window.demoRecorder.ondataavailable = event => { if (event.data.size) window.demoChunks.push(event.data); };
      window.demoRecorder.start(); return Date.now() / 1000;
    });
    active = { name, directory, audioStart, frames: [] };
    await session.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 780, maxHeight: 1800, everyNthFrame: 1 });
  }
  async function stop() {
    if (!active) return;
    await session.send("Page.stopScreencast");
    const end = Date.now() / 1000; const take = active;
    const data = await page.evaluate(async () => {
      await new Promise(resolve => { window.demoRecorder.onstop = resolve; window.demoRecorder.stop(); });
      window.demoSilent.stop();
      const blob = new Blob(window.demoChunks, { type: "audio/webm" });
      return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(",")[1]); reader.readAsDataURL(blob); });
    });
    writeFileSync(`${take.directory}/audio.webm`, Buffer.from(data, "base64"));
    if (!take.frames.length) throw new Error("Capture contains no frames.");
    let concat = "";
    for (let i = 0; i < take.frames.length; i++) {
      const frame = take.frames[i];
      concat += `file '${frame.name}'\nduration ${Math.max(0.001, (take.frames[i + 1]?.time ?? end) - frame.time)}\n`;
    }
    concat += `file '${take.frames.at(-1).name}'\n`;
    writeFileSync(`${take.directory}/frames.txt`, concat);
    const metadata = { name: take.name, directory: take.directory, audioStart: take.audioStart, videoStart: take.frames[0].time,
      audioOffset: take.audioStart - take.frames[0].time, end, duration: end - take.frames[0].time, frames: take.frames.length };
    writeFileSync(`${take.directory}/timing.json`, JSON.stringify(metadata, null, 2));
    takes.push(metadata); writeFileSync(`${output}/takes.json`, JSON.stringify(takes, null, 2)); active = null;
    console.log(`Captured ${take.name}: ${metadata.frames} real browser frames.`);
  }
  return { start, stop };
}
