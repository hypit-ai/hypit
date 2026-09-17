import { hypitFormats } from "../formats.ts";
import { FilmStill } from "./FilmStill.tsx";

export function Formats() {
  return (
    <div className="page">
      <h1 className="sr-only">Formats</h1>
      <p className="note">Angles for one link. Each one opens the Surreel packs listed on it, then the Hypit playbook.</p>
      <div className="folio">
        {hypitFormats.map((format, index) => (
          <a
            key={format.id}
            className={index === 0 ? "folio-hero" : "folio-tile"}
            href="#/queue"
            aria-label={`${format.title}. Still packs ${format.imageSkills.join(", ")}. Motion packs ${format.videoSkills.join(", ")}.`}
            onClick={() => sessionStorage.setItem("surreel.format", format.id)}
          >
            <FilmStill src={`/images/${format.image}.jpg`} kind="image" caption={format.title} className="still folio-still" eager={index === 0} />
          </a>
        ))}
      </div>
    </div>
  );
}
