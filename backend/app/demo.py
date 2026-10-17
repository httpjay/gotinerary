"""Demo mode: works with no API key (Paris sample data + simple rules).

Used when GEMINI_API_KEY is missing, or as a safety net if the AI call fails
during a live demo.
"""
from .models import LLMItinerary, LLMDay, LLMStop, LLMReplan, LLMSwap
from .scheduling import haversine_km


def S(name, cat, lat, lng, mins, cost, indoor, desc, why=""):
    return LLMStop(name=name, category=cat, description=desc, why=why or desc,
                   lat=lat, lng=lng, duration_min=mins, est_cost_usd=cost, indoor=indoor)


DAYS = [
    LLMDay(theme="The historic heart of Paris", stops=[
        S("Notre-Dame Cathedral", "sight", 48.8530, 2.3499, 60, 0, True,
          "The famous Gothic cathedral, reopened after the 2019 fire.", "A must-see for history lovers."),
        S("Sainte-Chapelle", "sight", 48.8554, 2.3450, 60, 15, True,
          "A small chapel with walls made of stained glass.", "One of the most beautiful rooms in Europe."),
        S("Le Procope", "food", 48.8530, 2.3388, 75, 35, True,
          "Paris's oldest cafe-restaurant, open since 1686.", "Classic French lunch with a story."),
        S("Luxembourg Gardens", "park", 48.8462, 2.3372, 75, 0, False,
          "Large palace garden with fountains and green chairs.", "Relax like a local."),
        S("Panthéon", "sight", 48.8462, 2.3464, 60, 13, True,
          "Domed monument where great French figures are buried.", "Great views and history."),
        S("Shakespeare and Company", "shopping", 48.8526, 2.3471, 40, 0, True,
          "Famous English bookstore facing Notre-Dame.", "A cozy stop for book lovers."),
        S("Le Comptoir du Relais", "food", 48.8521, 2.3389, 90, 45, True,
          "Popular bistro in Saint-Germain.", "Real Parisian bistro dinner."),
    ]),
    LLMDay(theme="Art and the Eiffel Tower", stops=[
        S("Louvre Museum", "museum", 48.8606, 2.3376, 150, 24, True,
          "The world's largest art museum, home of the Mona Lisa.", "Top pick for art lovers."),
        S("Angelina", "cafe", 48.8650, 2.3285, 60, 30, True,
          "Elegant tea room famous for thick hot chocolate.", "A sweet, classic lunch break."),
        S("Tuileries Garden", "park", 48.8635, 2.3275, 45, 0, False,
          "Formal garden between the Louvre and Place de la Concorde.", "Easy walk between museums."),
        S("Musée d'Orsay", "museum", 48.8600, 2.3266, 120, 18, True,
          "Impressionist art inside an old train station.", "Monet, Van Gogh and Renoir in one place."),
        S("Eiffel Tower", "sight", 48.8584, 2.2945, 90, 30, False,
          "The symbol of Paris, best near sunset.", "The classic Paris view."),
        S("Café Constant", "food", 48.8578, 2.3053, 90, 40, True,
          "Friendly bistro near the Eiffel Tower.", "Good French food at a fair price."),
    ]),
    LLMDay(theme="Montmartre and grand boulevards", stops=[
        S("Sacré-Cœur Basilica", "sight", 48.8867, 2.3431, 60, 0, False,
          "White basilica on the highest hill in Paris.", "Best free view of the city."),
        S("Place du Tertre", "experience", 48.8865, 2.3408, 45, 0, False,
          "Square full of painters working outside.", "Watch artists at work."),
        S("La Maison Rose", "food", 48.8873, 2.3398, 75, 30, True,
          "Pink cafe made famous by painters and photos.", "Charming Montmartre lunch."),
        S("Musée de Montmartre", "museum", 48.8881, 2.3405, 60, 15, True,
          "Museum in the oldest house of Montmartre.", "Learn the area's artist history."),
        S("Galeries Lafayette Haussmann", "shopping", 48.8738, 2.3320, 75, 0, True,
          "Grand department store with a glass dome and free rooftop.", "Shopping plus a free view."),
        S("Palais Garnier", "sight", 48.8720, 2.3316, 60, 15, True,
          "The golden opera house that inspired The Phantom of the Opera.", "Stunning interiors."),
        S("Bouillon Chartier", "food", 48.8720, 2.3436, 75, 25, True,
          "Historic, low-cost French restaurant from 1896.", "Cheap and full of character."),
    ]),
]

POOL = [
    S("Musée de l'Orangerie", "museum", 48.8638, 2.3227, 75, 14, True,
      "Monet's giant Water Lilies paintings.", "Calm, indoor and beautiful."),
    S("Centre Pompidou", "museum", 48.8606, 2.3522, 120, 17, True,
      "Modern art museum with a colorful inside-out building.", "Modern art, fully indoors."),
    S("Musée Rodin", "museum", 48.8553, 2.3159, 75, 15, True,
      "Rodin's sculptures, including The Thinker.", "Art with a quiet garden."),
    S("Musée de Cluny", "museum", 48.8505, 2.3439, 75, 13, True,
      "Medieval museum with the Lady and the Unicorn tapestries.", "Indoor history close by."),
    S("Musée Picasso", "museum", 48.8598, 2.3625, 90, 16, True,
      "The largest Picasso collection in the world.", "Indoor art in the Marais."),
    S("Galerie Vivienne", "shopping", 48.8665, 2.3398, 30, 0, True,
      "Covered 19th-century shopping arcade with mosaic floors.", "Stay dry and explore."),
    S("Passage des Panoramas", "shopping", 48.8710, 2.3418, 40, 0, True,
      "The oldest covered passage in Paris.", "Covered walk full of small shops."),
    S("Le Bon Marché", "shopping", 48.8509, 2.3245, 60, 0, True,
      "Elegant department store with a big food hall.", "Indoor shopping and snacks."),
    S("Café de Flore", "cafe", 48.8542, 2.3326, 45, 15, True,
      "Legendary Saint-Germain cafe.", "Sit down and rest like a Parisian."),
    S("Café Kitsuné Palais Royal", "cafe", 48.8649, 2.3378, 40, 10, True,
      "Small coffee bar inside the Palais Royal.", "Quick coffee break."),
    S("L'As du Fallafel", "food", 48.8573, 2.3591, 45, 12, True,
      "Famous falafel spot in the Marais.", "Fast, cheap and very good."),
    S("Palais Royal Garden", "park", 48.8648, 2.3376, 30, 0, False,
      "Quiet garden with tree-lined walks.", "A calm place to sit."),
]


def demo_itinerary(days: int) -> LLMItinerary:
    chosen = [DAYS[i % len(DAYS)] for i in range(days)]
    return LLMItinerary(
        summary="Demo mode: a sample Paris trip mixing famous sights, art and local food. "
                "Add a Gemini API key to plan any city.",
        center_lat=48.8566, center_lng=2.3522, days=chosen,
        tips=["Buy a Navigo Easy card for the metro.",
              "Say 'Bonjour' when you enter a shop.",
              "Many museums are free on the first Sunday of the month."],
    )


def _nearest(lat, lng, used, pred):
    options = [p for p in POOL if p.name not in used and pred(p)]
    options.sort(key=lambda p: haversine_km(lat, lng, p.lat, p.lng))
    return options[0] if options else None


def demo_replan(reason, upcoming, used, lat, lng) -> LLMReplan:
    stops = [LLMStop(**{k: getattr(s, k) for k in LLMStop.model_fields}) for s in upcoming]
    used = set(used)
    msg = "Here is your updated plan."
    if reason == "rain":
        new = []
        for s in stops:
            if s.indoor:
                new.append(s)
                continue
            alt = _nearest(s.lat, s.lng, used, lambda p: p.indoor and p.category != "food")
            if alt:
                used.add(alt.name)
                new.append(alt)
        stops = new
        msg = "Rain is coming, so I swapped the outdoor stops for indoor places nearby."
    elif reason == "tired":
        food = [s for s in stops if s.category == "food"]
        other = [s for s in stops if s.category != "food"][:1]
        cafe = _nearest(lat, lng, used, lambda p: p.category == "cafe")
        stops = ([cafe] if cafe else []) + other + food
        msg = "You need a break. I added a cafe nearby and kept only the best remaining stop and your meals."
    elif reason == "late":
        msg = "You are running late, so I moved everything and removed what no longer fits today."
    elif reason == "closed" and stops:
        first = stops[0]
        alt = _nearest(first.lat, first.lng, used,
                       lambda p: p.category == first.category or p.indoor == first.indoor)
        if alt:
            stops[0] = alt
            msg = f"{first.name} is closed, so I replaced it with {alt.name}, which is close by."
    elif reason == "hungry":
        food = _nearest(lat, lng, used, lambda p: p.category == "food")
        if food:
            idx = next((i for i, s in enumerate(stops) if s.category == "food"), None)
            if idx is not None and idx <= 1:
                stops.pop(idx)
            stops = [food] + stops
            msg = f"Food first! {food.name} is the closest good option."
    elif reason == "custom":
        msg = "Custom requests need AI mode (add a Gemini API key). I re-timed your plan from now."
    return LLMReplan(explanation=msg, stops=stops)


def demo_swap(old, used) -> LLMSwap | None:
    alt = _nearest(old.lat, old.lng, set(used), lambda p: p.indoor == old.indoor or p.category == old.category)
    return LLMSwap(stop=alt) if alt else None
