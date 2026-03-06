const map = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: false,
}).setView([47.3769, 8.5417], 9);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

const statusText = document.getElementById("statusText");
const aircraftList = document.getElementById("aircraftList");
const aircraftCount = document.getElementById("aircraftCount");
const lastUpdate = document.getElementById("lastUpdate");
const noiseScore = document.getElementById("noiseScore");
const refreshButton = document.getElementById("refresh");

const regionForm = document.getElementById("regionForm");
const latInput = document.getElementById("lat");
const lonInput = document.getElementById("lon");
const placeSearch = document.getElementById("placeSearch");
const placeSuggestions = document.getElementById("placeSuggestions");
const placeLabel = document.getElementById("placeLabel");

let markers = [];
let searchController = null;

const toKm = (meters) => (meters ? (meters / 1000).toFixed(1) : "-");
const toKts = (ms) => (ms ? (ms * 1.94384).toFixed(0) : "-");

const updateStatus = (text) => {
  statusText.textContent = text;
};

const updateNoiseScore = (aircraft, lat, lon) => {
  if (!aircraft.length) {
    noiseScore.textContent = "1";
    return;
  }

  const nearestDistance = aircraft.reduce((closest, item) => {
    if (!item.latitude || !item.longitude) return closest;
    const distance = haversineDistance(lat, lon, item.latitude, item.longitude);
    return Math.min(closest, distance);
  }, Number.POSITIVE_INFINITY);

  const cappedDistance = Number.isFinite(nearestDistance)
    ? Math.min(nearestDistance, 30)
    : 30;
  const mappedScore = Math.round(10 - (cappedDistance / 30) * 9);
  const countBoost = Math.min(aircraft.length, 6) * 0.2;
  const finalScore = Math.min(10, Math.max(1, mappedScore + countBoost));
  noiseScore.textContent = finalScore.toFixed(1);
};

const renderList = (aircraft) => {
  aircraftList.innerHTML = "";

  if (!aircraft.length) {
    aircraftList.innerHTML = "<p>Keine Flugzeuge in dieser Region.</p>";
    return;
  }

  aircraft.forEach((item) => {
    const card = document.createElement("div");
    card.className = "aircraft-card";

    const title = document.createElement("h4");
    title.textContent = item.callsign || "Unbekannter Flug";

    const meta = document.createElement("div");
    meta.className = "aircraft-meta";
    meta.innerHTML = `
      <div>Typ: ${item.icao24 || "-"}</div>
      <div>Hohe: ${toKm(item.baro_altitude)} km</div>
      <div>Geschwindigkeit: ${toKts(item.velocity)} kt</div>
    `;

    card.appendChild(title);
    card.appendChild(meta);
    aircraftList.appendChild(card);
  });
};

const clearMarkers = () => {
  markers.forEach((marker) => marker.remove());
  markers = [];
};

const updateMarkers = (aircraft) => {
  clearMarkers();
  aircraft.forEach((item) => {
    if (!item.latitude || !item.longitude) return;
    const marker = L.circleMarker([item.latitude, item.longitude], {
      radius: 6,
      color: "#ff7a18",
      fillColor: "#ff7a18",
      fillOpacity: 0.85,
    }).addTo(map);

    marker.bindPopup(`
      <strong>${item.callsign || "Unbekannt"}</strong><br />
      Typ: ${item.icao24 || "-"}<br />
      Hohe: ${toKm(item.baro_altitude)} km<br />
      Geschwindigkeit: ${toKts(item.velocity)} kt
    `);

    markers.push(marker);
  });
};

const fetchAircraft = async (lat, lon) => {
  updateStatus("Lade Daten...");
  const radius = 0.27;
  const lamin = lat - radius;
  const lomin = lon - radius;
  const lamax = lat + radius;
  const lomax = lon + radius;

  try {
    const response = await fetch(
      `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`
    );

    if (!response.ok) {
      throw new Error("API Fehler");
    }

    const data = await response.json();
    const aircraft = (data.states || []).map((state) => ({
      icao24: state[0],
      callsign: state[1]?.trim(),
      longitude: state[5],
      latitude: state[6],
      baro_altitude: state[7],
      velocity: state[9],
    }));

    map.setView([lat, lon], 9);
    updateMarkers(aircraft);
    renderList(aircraft);
    aircraftCount.textContent = aircraft.length;
    updateNoiseScore(aircraft, lat, lon);
    lastUpdate.textContent = new Date().toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    updateStatus("Aktualisiert");
  } catch (error) {
    updateStatus("Fehler beim Laden der Daten");
  }
};

const handleRefresh = () => {
  const lat = Number.parseFloat(latInput.value) || 47.3769;
  const lon = Number.parseFloat(lonInput.value) || 8.5417;
  fetchAircraft(lat, lon);
};

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

const renderSuggestions = (results) => {
  placeSuggestions.innerHTML = "";
  if (!results.length) {
    placeSuggestions.hidden = true;
    return;
  }

  results.slice(0, 5).forEach((result) => {
    const option = document.createElement("button");
    option.type = "button";
    option.textContent = result.display_name;
    option.addEventListener("click", () => {
      latInput.value = Number.parseFloat(result.lat).toFixed(4);
      lonInput.value = Number.parseFloat(result.lon).toFixed(4);
      placeLabel.textContent = `Aktuelle Region: ${result.display_name}`;
      placeSuggestions.hidden = true;
      placeSearch.value = result.display_name;
      handleRefresh();
    });
    placeSuggestions.appendChild(option);
  });

  placeSuggestions.hidden = false;
};

const searchPlaces = async (query) => {
  if (query.length < 3) {
    placeSuggestions.hidden = true;
    return;
  }

  if (searchController) {
    searchController.abort();
  }

  searchController = new AbortController();
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&addressdetails=1&limit=5&accept-language=de`,
      {
        signal: searchController.signal,
        headers: {
          "User-Agent": "flight-noise-map",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Suche fehlgeschlagen");
    }

    const results = await response.json();
    renderSuggestions(results);
  } catch (error) {
    if (error.name !== "AbortError") {
      placeSuggestions.hidden = true;
    }
  }
};

regionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  placeSuggestions.hidden = true;
  handleRefresh();
});

refreshButton.addEventListener("click", handleRefresh);

placeSearch.addEventListener("input", (event) => {
  searchPlaces(event.target.value.trim());
});

document.addEventListener("click", (event) => {
  if (!placeSuggestions.contains(event.target) && event.target !== placeSearch) {
    placeSuggestions.hidden = true;
  }
});

handleRefresh();
setInterval(handleRefresh, 15000);
