import { ArrowRight, Compass, Landmark, MapPin, PenLine } from "lucide-react";
import { Landscape, Mark } from "./icons";
import { POPULAR } from "./Onboarding";

export default function Welcome({ onPlan, hasSaved, savedList }) {
  const explore = () => document.getElementById("popular")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="welcome">
      <section className="cover">
        <div className="cover-col">
          <div className="masthead">
            <span className="wordmark"><Mark size={34} /><span>GoTinerary</span></span>
            <span className="caps muted">AI trip planner</span>
          </div>

          <div className="cover-story">
            <div className="tagline"><span className="rule" /><span className="caps primary">All your travel, streamlined.</span></div>
            <h1 className="display">Your next adventure, <em>thoughtfully</em> planned.</h1>
            <p className="lede">Turn a destination, a city you’ve dreamed of, or a half-formed idea into a complete,
              realistic trip — without the hours of tabs and research.</p>
            <div className="cover-actions">
              <button className="btn primary xl" onClick={() => onPlan()}>Plan my trip <ArrowRight size={18} /></button>
              <button className="btn secondary xl" onClick={explore}><Compass size={18} /> Explore destinations</button>
            </div>
          </div>

          <div className="start-with">
            <span className="caps muted">Start with anything</span>
            <ul>
              <li><MapPin size={18} /> A destination</li>
              <li><Landmark size={18} /> A city you’ve dreamed of</li>
              <li><PenLine size={18} /> A loose idea</li>
            </ul>
          </div>
        </div>

        <div className="cover-art">
          <Landscape />
          <div className="stamp" aria-hidden="true"><span>Planned in</span><strong>minutes</strong><span>not evenings</span></div>
          <div className="cover-caption">
            <span className="caps">On the cover</span>
            <span className="cover-place">The Dolomites, Italy</span>
            <span className="cover-sub">Real places checked on Google · opening hours · food for your diet</span>
          </div>
        </div>
      </section>

      <section id="popular" className="popular-cities">
        <div className="section-head">
          <div>
            <span className="caps primary">Explore destinations</span>
            <h2 className="h2">Popular right now</h2>
          </div>
          <p className="muted">Pick a city to start planning. You can change anything on the next screen.</p>
        </div>
        <div className="city-grid">
          {POPULAR.map(([city, country], i) => (
            <button key={city} className={`city-card t${i % 4}`} onClick={() => onPlan(city)}>
              <span className="city-country caps">{country}</span>
              <span className="city-name">{city}</span>
              <span className="city-go">Plan a trip <ArrowRight size={16} /></span>
            </button>
          ))}
        </div>
        {hasSaved && <div className="welcome-saved">{savedList}</div>}
      </section>
    </div>
  );
}
