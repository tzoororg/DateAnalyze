// Seed catalog of date ideas, used by the suggestion engine for "explore" candidates.
// Solves cold-start: useful suggestions exist even before you've logged much.
// estCost is a rough per-couple guide; effort is energy/planning required (1 easy .. 5 big).

export const CATALOG = [
  // Dining
  { title: "Try a new cuisine restaurant", category: "dining", estCost: 60, effort: 2, desc: "Pick a cuisine neither of you has had together." },
  { title: "Dessert crawl", category: "dining", estCost: 30, effort: 2, desc: "Three stops, one dessert each." },
  { title: "Cook a recipe from scratch", category: "dining", estCost: 25, effort: 3, desc: "Shop together, cook together." },
  { title: "Brunch somewhere new", category: "dining", estCost: 40, effort: 1, desc: "Slow morning, good coffee." },
  { title: "Street-food / market tasting", category: "dining", estCost: 25, effort: 2, desc: "Share lots of small bites." },

  // Outdoors
  { title: "Sunset hike", category: "outdoors", estCost: 0, effort: 3, desc: "Time it to catch golden hour." },
  { title: "Picnic in a park", category: "outdoors", estCost: 20, effort: 2, desc: "Blanket, snacks, no phones." },
  { title: "Rent bikes for the afternoon", category: "outdoors", estCost: 30, effort: 3, desc: "Find a scenic loop." },
  { title: "Botanical garden stroll", category: "outdoors", estCost: 20, effort: 1, desc: "Wander and chat." },
  { title: "Stargazing trip", category: "outdoors", estCost: 5, effort: 3, desc: "Drive out of the city lights." },
  { title: "Kayaking / paddle boarding", category: "outdoors", estCost: 50, effort: 4, desc: "On the water together." },

  // Movie / Show
  { title: "Outdoor / rooftop cinema", category: "movie", estCost: 35, effort: 2, desc: "A film under the stars." },
  { title: "Comedy night", category: "movie", estCost: 40, effort: 2, desc: "Live stand-up beats a couch." },
  { title: "Theme movie marathon at home", category: "movie", estCost: 15, effort: 1, desc: "A trilogy + themed snacks." },
  { title: "Catch a live theatre show", category: "movie", estCost: 80, effort: 2, desc: "Dress up a little." },

  // Travel
  { title: "Day trip to a nearby town", category: "travel", estCost: 70, effort: 3, desc: "Explore somewhere new for a day." },
  { title: "Weekend getaway", category: "travel", estCost: 250, effort: 5, desc: "Two nights, fresh scenery." },
  { title: "Be tourists in your own city", category: "travel", estCost: 40, effort: 2, desc: "Do the things locals skip." },
  { title: "Scenic train ride", category: "travel", estCost: 60, effort: 3, desc: "Window seats and snacks." },

  // Creative / Class
  { title: "Pottery class", category: "creative", estCost: 70, effort: 3, desc: "Make something with your hands." },
  { title: "Paint & sip", category: "creative", estCost: 50, effort: 2, desc: "Wine and two questionable canvases." },
  { title: "Cooking or baking class", category: "creative", estCost: 90, effort: 3, desc: "Learn a dish to repeat at home." },
  { title: "Dance lesson", category: "creative", estCost: 40, effort: 3, desc: "Salsa, swing, whatever's fun." },
  { title: "DIY craft night", category: "creative", estCost: 25, effort: 2, desc: "Build / make something together at home." },

  // At home
  { title: "Themed dinner night in", category: "athome", estCost: 30, effort: 2, desc: "Pick a country, cook + decorate." },
  { title: "Board game tournament", category: "athome", estCost: 0, effort: 1, desc: "Best of five, loser does dishes." },
  { title: "Build a blanket fort movie night", category: "athome", estCost: 10, effort: 1, desc: "Cozy maximalism." },
  { title: "Spa night at home", category: "athome", estCost: 20, effort: 1, desc: "Face masks, music, candles." },
  { title: "Bake-off challenge", category: "athome", estCost: 20, effort: 2, desc: "Same recipe, judge each other." },

  // Nightlife
  { title: "Cocktail bar hop", category: "nightlife", estCost: 70, effort: 2, desc: "One signature drink per stop." },
  { title: "Live music / gig", category: "nightlife", estCost: 60, effort: 2, desc: "See a band you half-know." },
  { title: "Trivia night", category: "nightlife", estCost: 30, effort: 2, desc: "Team of two vs the bar." },
  { title: "Dancing out", category: "nightlife", estCost: 40, effort: 3, desc: "Find a floor and stay late." },

  // Culture
  { title: "Museum or gallery visit", category: "culture", estCost: 30, effort: 2, desc: "Invent backstories for the art." },
  { title: "Local festival or fair", category: "culture", estCost: 25, effort: 2, desc: "Whatever's on this weekend." },
  { title: "Historic walking tour", category: "culture", estCost: 20, effort: 2, desc: "Learn your city's secrets." },
  { title: "Bookstore + coffee afternoon", category: "culture", estCost: 25, effort: 1, desc: "Pick a book for each other." },

  // Sport / Active
  { title: "Rock climbing (indoor)", category: "active", estCost: 40, effort: 4, desc: "Belay and trust falls." },
  { title: "Mini golf", category: "active", estCost: 25, effort: 2, desc: "Petty competition, big fun." },
  { title: "Ice / roller skating", category: "active", estCost: 30, effort: 3, desc: "Hold hands, fall gracefully." },
  { title: "Tennis or badminton", category: "active", estCost: 15, effort: 3, desc: "Loser buys smoothies." },
  { title: "Bowling night", category: "active", estCost: 30, effort: 2, desc: "Silly team names required." },

  // Special / Other
  { title: "Recreate your first date", category: "special", estCost: 50, effort: 2, desc: "Same place, new memories." },
  { title: "Sunrise breakfast date", category: "special", estCost: 20, effort: 3, desc: "Wake early, watch it come up." },
  { title: "Write letters to open in a year", category: "special", estCost: 5, effort: 1, desc: "Seal them, set a reminder." },
  { title: "Volunteer together", category: "special", estCost: 0, effort: 3, desc: "Do some good as a team." },
];
