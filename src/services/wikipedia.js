/**
 * wikipedia.js
 *
 * Smarte Wikipedia-Suche für Navix.
 *
 * Die Logik unterscheidet zwischen:
 * - Geschäften und Marken
 * - bewusst gesuchten Orten
 * - freien Kartenklicks
 *
 * Dadurch bekommt man bei "Edeka" eher den Markenartikel
 * und bei "Biberach" eher den passenden Ortsartikel.
 */

// ── API-Endpunkt ─────────────────────────────────

const WIKIPEDIA_API_URL = "https://de.wikipedia.org/w/api.php";

// ── Einstellungen ─────────────────────────────────

const EXTRACT_MAX_LENGTH              = 600;
const DEFAULT_GEO_RADIUS_IN_METERS    = 5000;
const BUSINESS_GEO_RADIUS_IN_METERS   = 1200;
const DEFAULT_TEXT_SEARCH_RESULT_LIMIT = 8;
const DEFAULT_GEO_SEARCH_RESULT_LIMIT  = 5;

// ── Bekannte Marken ─────────────────────────────────

const KNOWN_BRANDS = [
  { match: ["edeka"], query: "Edeka" },
  { match: ["rewe"], query: "Rewe" },
  { match: ["norma"], query: "Norma Lebensmittel-Discounter" },
  { match: ["aldi"], query: "Aldi" },
  { match: ["lidl"], query: "Lidl" },
  { match: ["kaufland"], query: "Kaufland" },
  { match: ["penny"], query: "Penny Markt" },
  { match: ["netto"], query: "Netto Marken-Discount" },
  { match: ["dm", "dm-drogerie"], query: "Dm-drogerie markt" },
  { match: ["rossmann"], query: "Dirk Rossmann GmbH" },
  { match: ["mcdonald", "mcdonalds", "mc donald"], query: "McDonald’s" },
  { match: ["burger king"], query: "Burger King" },
  { match: ["subway"], query: "Subway" },
  { match: ["kfc"], query: "Kentucky Fried Chicken" },
  { match: ["ikea"], query: "Ikea" },
  { match: ["obi"], query: "Obi" },
  { match: ["hornbach"], query: "Hornbach" },
];

// ── Text normalisieren ─────────────────────────────────

function normalizeText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// ── Text kürzen ─────────────────────────────────

function shortenExtractText(extractText) {
  if (!extractText) {
    return null;
  }

  if (extractText.length <= EXTRACT_MAX_LENGTH) {
    return extractText;
  }

  return `${extractText.slice(0, EXTRACT_MAX_LENGTH).trimEnd()} ...`;
}

// ── Markenartikel erkennen ─────────────────────────────────

function findKnownBrandQuery(text) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return null;
  }

  const matchingBrand = KNOWN_BRANDS.find((brand) => {
    return brand.match.some((brandName) => {
      return normalizedText.includes(normalizeText(brandName));
    });
  });

  return matchingBrand?.query ?? null;
}

// ── Geschäft / POI erkennen ─────────────────────────────────

function isBusinessPlace(osmCategory, text) {
  const normalizedOsmCategory = normalizeText(osmCategory);

  if (findKnownBrandQuery(text)) {
    return true;
  }

  return [
    "shop",
    "amenity",
    "craft",
    "office",
  ].includes(normalizedOsmCategory);
}

// ── Koordinaten prüfen ─────────────────────────────────

function hasValidCoordinates(latitude, longitude) {
  return (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  );
}

// ── Artikel-Parameter bauen ─────────────────────────────────

function buildArticleParams(pageId) {
  return new URLSearchParams({
    action:      "query",
    pageids:     String(pageId),
    prop:        "extracts|pageimages|info",
    exintro:     "1",
    explaintext: "1",
    piprop:      "thumbnail",
    pithumbsize: "500",
    inprop:      "url",
    format:      "json",
    origin:      "*",
  });
}

// ── Textsuche-Parameter bauen ─────────────────────────────────

function buildTextSearchParams(searchText, limit) {
  return new URLSearchParams({
    action:   "query",
    list:     "search",
    srsearch: searchText,
    srlimit:  String(limit),
    format:   "json",
    origin:   "*",
  });
}

// ── Koordinatensuche-Parameter bauen ─────────────────────────────────

function buildGeoSearchParams(latitude, longitude, radiusInMeters, limit) {
  return new URLSearchParams({
    action:   "query",
    list:     "geosearch",
    gscoord:  `${latitude}|${longitude}`,
    gsradius: String(radiusInMeters),
    gslimit:  String(limit),
    format:   "json",
    origin:   "*",
  });
}

// ── JSON sicher abrufen ─────────────────────────────────

async function fetchWikipediaJson(requestParams) {
  const response = await fetch(`${WIKIPEDIA_API_URL}?${requestParams}`);

  if (!response.ok) {
    return null;
  }

  return response.json();
}

// ── Artikel per Page-ID laden ─────────────────────────────────

async function fetchArticleByPageId(pageId, additionalData = {}) {
  if (!pageId) {
    return null;
  }

  try {
    const articleParams = buildArticleParams(pageId);
    const articleData   = await fetchWikipediaJson(articleParams);

    const articlePage = articleData?.query?.pages?.[pageId];

    if (!articlePage || articlePage.missing) {
      return null;
    }

    return {
      title:     articlePage.title,
      extract:   shortenExtractText(articlePage.extract),
      thumbnail: articlePage.thumbnail?.source ?? null,
      url:       articlePage.fullurl,
      ...additionalData,
    };
  } catch (error) {
    console.warn("Wikipedia-Artikel konnte nicht geladen werden:", error);

    return null;
  }
}

// ── Textkandidaten laden ─────────────────────────────────

async function fetchTextCandidates(searchText, limit = DEFAULT_TEXT_SEARCH_RESULT_LIMIT) {
  const trimmedSearchText = String(searchText ?? "").trim();

  if (!trimmedSearchText) {
    return [];
  }

  try {
    const searchParams = buildTextSearchParams(trimmedSearchText, limit);
    const searchData   = await fetchWikipediaJson(searchParams);

    return searchData?.query?.search ?? [];
  } catch (error) {
    console.warn("Wikipedia-Textsuche fehlgeschlagen:", error);

    return [];
  }
}

// ── Koordinatenkandidaten laden ─────────────────────────────────

async function fetchGeoCandidates(
  latitude,
  longitude,
  radiusInMeters,
  limit = DEFAULT_GEO_SEARCH_RESULT_LIMIT
) {
  if (!hasValidCoordinates(latitude, longitude)) {
    return [];
  }

  try {
    const geoParams = buildGeoSearchParams(
      latitude,
      longitude,
      radiusInMeters,
      limit
    );

    const geoData = await fetchWikipediaJson(geoParams);

    return geoData?.query?.geosearch ?? [];
  } catch (error) {
    console.warn("Wikipedia-Koordinatensuche fehlgeschlagen:", error);

    return [];
  }
}

// ── Texttreffer bewerten ─────────────────────────────────

function calculateTextCandidateScore(candidateTitle, wantedText) {
  const title  = normalizeText(candidateTitle);
  const wanted = normalizeText(wantedText);

  if (!title || !wanted) {
    return 0;
  }

  const brandQuery = findKnownBrandQuery(wanted);

  if (brandQuery) {
    const normalizedBrandQuery = normalizeText(brandQuery);

    if (title === normalizedBrandQuery) {
      return 10000;
    }

    if (title.includes(normalizedBrandQuery)) {
      return 9500;
    }

    const brandWords = normalizedBrandQuery
      .split(" ")
      .filter((word) => word.length > 2);

    if (brandWords.some((word) => title.includes(word))) {
      return 9000;
    }
  }

  if (title === wanted) {
    return 8500;
  }

  if (title.startsWith(wanted)) {
    return 7500;
  }

  if (title.includes(wanted)) {
    return 6500;
  }

  const ignoredWords = [
    "deutschland",
    "filiale",
    "markt",
    "supermarkt",
    "restaurant",
    "geschaeft",
    "laden",
    "gmbh",
    "kg",
    "ag",
  ];

  const wantedWords = wanted
    .split(" ")
    .filter((word) => {
      return word.length > 2 && !ignoredWords.includes(word);
    });

  const matchingWords = wantedWords.filter((word) => {
    return title.includes(word);
  });

  if (matchingWords.length === 0) {
    return 0;
  }

  return 3000 + matchingWords.length * 500;
}

// ── Besten Textartikel laden ─────────────────────────────────

async function fetchBestTextArticle(searchText, minimumScore = 2500) {
  const candidates = await fetchTextCandidates(
    searchText,
    DEFAULT_TEXT_SEARCH_RESULT_LIMIT
  );

  if (!candidates.length) {
    return null;
  }

  const scoredCandidates = candidates
    .map((candidate) => {
      return {
        candidate,
        score: calculateTextCandidateScore(candidate.title, searchText),
      };
    })
    .sort((firstCandidate, secondCandidate) => {
      return secondCandidate.score - firstCandidate.score;
    });

  const bestCandidate = scoredCandidates[0];

  if (!bestCandidate || bestCandidate.score < minimumScore) {
    return null;
  }

  return fetchArticleByPageId(bestCandidate.candidate.pageid, {
    searchSource: "text",
    matchScore:   bestCandidate.score,
  });
}

// ── Nächsten Koordinatenartikel laden ─────────────────────────────────

async function fetchNearestGeoArticle(latitude, longitude, radiusInMeters) {
  const candidates = await fetchGeoCandidates(
    latitude,
    longitude,
    radiusInMeters,
    DEFAULT_GEO_SEARCH_RESULT_LIMIT
  );

  if (!candidates.length) {
    return null;
  }

  const nearestCandidate = candidates[0];

  return fetchArticleByPageId(nearestCandidate.pageid, {
    searchSource:     "coordinates",
    distanceInMeters: nearestCandidate.dist ?? null,
  });
}

// ── Fallback-Suchtext bauen ─────────────────────────────────

function buildFallbackTextQuery({
  userSearchText,
  placeName,
  rawPlaceName,
  city,
}) {
  return (
    userSearchText ||
    placeName ||
    rawPlaceName ||
    city ||
    ""
  ).trim();
}

// ── Bevorzugten Wikipedia-Suchtext bestimmen ─────────────────────────────────

function resolvePreferredWikipediaQuery({
  userSearchText,
  placeName,
  rawPlaceName,
  city,
}) {
  const normalizedUserSearchText = normalizeText(userSearchText);
  const normalizedPlaceName      = normalizeText(placeName);
  const normalizedRawPlaceName   = normalizeText(rawPlaceName);

  if (placeName) {
    if (!userSearchText) {
      return placeName;
    }

    if (
      normalizedPlaceName === normalizedUserSearchText ||
      normalizedPlaceName.startsWith(normalizedUserSearchText)
    ) {
      return placeName;
    }
  }

  if (rawPlaceName) {
    if (!userSearchText) {
      return rawPlaceName;
    }

    if (
      normalizedRawPlaceName === normalizedUserSearchText ||
      normalizedRawPlaceName.startsWith(normalizedUserSearchText)
    ) {
      return rawPlaceName;
    }
  }

  return (
    userSearchText ||
    placeName ||
    rawPlaceName ||
    city ||
    ""
  ).trim();
}

// ── Smarten Wikipedia-Artikel laden ─────────────────────────────────

export async function fetchSmartWikipediaArticle({
  latitude,
  longitude,
  userSearchText = "",
  placeName      = "",
  rawPlaceName   = "",
  city           = "",
  osmCategory    = "",
} = {}) {
  const fallbackTextQuery = buildFallbackTextQuery({
    userSearchText,
    placeName,
    rawPlaceName,
    city,
  });

  const preferredTextQuery = resolvePreferredWikipediaQuery({
    userSearchText,
    placeName,
    rawPlaceName,
    city,
  });

  const brandQuery =
    findKnownBrandQuery(userSearchText) ||
    findKnownBrandQuery(placeName) ||
    findKnownBrandQuery(rawPlaceName);

  const businessPlace = isBusinessPlace(
    osmCategory,
    `${userSearchText} ${placeName} ${rawPlaceName}`
  );

  if (businessPlace) {
    const businessTextQuery = brandQuery || preferredTextQuery;

    const businessArticle = await fetchBestTextArticle(
      businessTextQuery,
      brandQuery ? 2500 : 4000
    );

    if (businessArticle) {
      return businessArticle;
    }

    return fetchNearestGeoArticle(
      latitude,
      longitude,
      BUSINESS_GEO_RADIUS_IN_METERS
    );
  }

  if (userSearchText || placeName || rawPlaceName) {
    const textArticle = await fetchBestTextArticle(preferredTextQuery, 2500);

    if (textArticle) {
      return textArticle;
    }

    return fetchNearestGeoArticle(
      latitude,
      longitude,
      DEFAULT_GEO_RADIUS_IN_METERS
    );
  }

  const nearbyArticle = await fetchNearestGeoArticle(
    latitude,
    longitude,
    DEFAULT_GEO_RADIUS_IN_METERS
  );

  if (nearbyArticle) {
    return nearbyArticle;
  }

  return fetchBestTextArticle(fallbackTextQuery, 2500);
}