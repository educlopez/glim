// Avatar de Lumi: una luciérnaga, animada con open-bot-avatar (MIT, Dominik Scholz).
// La silueta se diseñó con su skill generate-avatar y pasa `avatar-validate --strict`; la librería pone el volumen,
// la mirada, el parpadeo y el ánimo (idle, thinking, happy).
import { useEffect, useRef } from "react";
import { mountAvatar } from "open-bot-avatar/dom";

export const LUMI = {
  version: 1,
  id: "lumi",
  name: "Lumi",
  body: { path: "M20 58A30 30 0 1 1 80 58A30 30 0 1 1 20 58ZM15.53 42.03A14 9 -35 1 1 38.47 25.97A14 9 -35 1 1 15.53 42.03ZM61.53 25.97A14 9 35 1 1 84.47 42.03A14 9 35 1 1 61.53 25.97ZM46 31.5L40 15.5L36 17L42 33ZM54 31.5L58 33L64 17L60 15.5ZM33 15A5 5 0 1 1 43 15A5 5 0 1 1 33 15ZM57 15A5 5 0 1 1 67 15A5 5 0 1 1 57 15Z" },
  eyes: { x: 50, y: 60, spacing: 16, scale: 1.2 },
};

// Ajustes → «Animaciones: no» manda sobre el sistema; si no, el sistema decide.
const movimiento = () => (document.documentElement.dataset.animacion === "no" ? true : "system");

export function LumiAvatar({ size = 20, mood = "idle", still = false, followPointer = false, className = "" }) {
  const host = useRef(null);
  const avatar = useRef(null);
  useEffect(() => {
    avatar.current = mountAvatar(host.current, {
      definition: LUMI, color: "var(--accent)", mood, still, followPointer, reducedMotion: movimiento(), label: "",
    });
    return () => { avatar.current && avatar.current.destroy(); avatar.current = null; };
  }, [still]);
  useEffect(() => { avatar.current && avatar.current.update({ mood, followPointer, reducedMotion: movimiento() }); }, [mood, followPointer]);
  return <span ref={host} className={`lumiavatar ${className}`.trim()} style={{ width: size, height: size }} aria-hidden="true" />;
}
