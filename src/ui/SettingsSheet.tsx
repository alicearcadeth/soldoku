import { useState } from "react";
import { armSavedMusic, playCue, setMusicWanted } from "./audio";
import { applyAppearance, hapticsSupported, prefs, savePrefs, type FontChoice, type Prefs, type TextSize } from "./feel";
import { DialogFrame } from "./dialogFocus";

export const THEMES = ["light", "dark", "midnight", "arcade"] as const;
export type ThemeName = (typeof THEMES)[number];

export function readTheme(): ThemeName {
  const saved = localStorage.getItem("sudoku.theme");
  return saved === "dark" || saved === "midnight" || saved === "arcade" ? saved : "light";
}

export function applyTheme(next: ThemeName) {
  document.documentElement.dataset.theme = next === "light" ? "" : next;
  localStorage.setItem("sudoku.theme", next);
}

export function themeLabel(name: ThemeName): string {
  if (name === "light") return "Ink";
  if (name === "arcade") return "Arcade";
  return name[0].toUpperCase() + name.slice(1);
}

export function SettingsSheet({ onClose, onHome }: { onClose: () => void; onHome?: () => void }) {
  const [theme, setTheme] = useState<ThemeName>(readTheme);
  const [options, setOptions] = useState<Prefs>(prefs);
  const haptics = hapticsSupported();

  function update(next: Prefs) {
    setOptions(next);
    savePrefs(next);
    applyAppearance(next.font, next.text);
  }

  function choose(next: ThemeName) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <DialogFrame id="settings-title" onClose={onClose}>
        <h2 id="settings-title">Settings</h2>
        <p className="choice-note">Theme, type, and sound stay on this phone.</p>
        <h3 className="settings-heading">Theme</h3>
        <div className="segment" role="group" aria-label="Theme">
          {THEMES.map((name) => (
            <button key={name} className={theme === name ? "on" : ""} type="button" aria-pressed={theme === name} onClick={() => choose(name)}>
              {themeLabel(name)}
            </button>
          ))}
        </div>
        <h3 className="settings-heading">Font</h3>
        <div className="segment" role="group" aria-label="Font">
          {FONTS.map(([value, label]) => (
            <button key={value} className={options.font === value ? "on" : ""} type="button" aria-pressed={options.font === value} onClick={() => update({ ...options, font: value })}>
              {label}
            </button>
          ))}
        </div>
        <div className="font-sample"><span className="choice-note">Font preview</span><p className="font-preview">The quick brown fox</p><span className="choice-note">Sudoku digits</span><p className="digit-preview">1 2 3 4 5 6 7 8 9</p></div>
        <p className="choice-note">Sudoku digits stay in Easy Read so 1 and 7 stay distinct.</p>
        <h3 className="settings-heading">Size</h3>
        <div className="segment" role="group" aria-label="Text size">
          {SIZES.map(([value, label]) => (
            <button key={value} className={options.text === value ? "on" : ""} type="button" aria-pressed={options.text === value} onClick={() => update({ ...options, text: value })}>
              {label}
            </button>
          ))}
        </div>
        <h3 className="settings-heading">Sound & feedback</h3>
        <Toggle
          label="Music"
          on={options.music}
          onClick={() => {
            const music = !options.music;
            update({ ...options, music });
            setMusicWanted(music);
          }}
        />
        <Toggle
          label="Sound effects"
          on={options.sound}
          onClick={() => {
            const sound = !options.sound;
            update({ ...options, sound });
            if (sound) playCue("tap");
          }}
        />
        {haptics && (
          <Toggle label="Haptic feedback" on={options.haptics} onClick={() => update({ ...options, haptics: !options.haptics })} />
        )}
        <Toggle label="Highlight related cells" on={options.highlights} onClick={() => update({ ...options, highlights: !options.highlights })} />
        <button className="primary" type="button" onClick={onClose}>Done</button>
        {onHome && <button className="text" type="button" aria-label="Go home" onClick={onHome}>Home</button>}
    </DialogFrame>
  );
}

const FONTS: Array<[FontChoice, string]> = [
  ["system", "System"],
  ["modern", "Modern"],
  ["readable", "Easy Read"],
];

const SIZES: Array<[TextSize, string]> = [
  ["default", "Default"],
  ["large", "Large"],
];

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button className={on ? "secondary on" : "secondary"} type="button" aria-pressed={on} onClick={onClick}>
      {label}: {on ? "On" : "Off"}
    </button>
  );
}

export function listenForSavedMusic(enabled: boolean) {
  armSavedMusic(enabled);
}
