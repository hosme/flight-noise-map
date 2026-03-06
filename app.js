const map = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: true,
}).setView([47.3769, 8.5417], 9);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

const aircraftList = document.getElementById("aircraftList");
const aircraftCount = document.getElementById("aircraftCount");
const lastUpdate = document.getElementById("lastUpdate");
const noiseScore = document.getElementById("noiseScore");
const panelAircraftCount = document.getElementById("panelAircraftCount");
const panelLastUpdate = document.getElementById("panelLastUpdate");
const refreshButton = document.getElementById("refresh");
const radiusInput = document.getElementById("radiusInput");
const radiusValue = document.getElementById("radiusValue");
const radiusLabel = document.getElementById("radiusLabel");

const regionForm = document.getElementById("regionForm");
const latInput = document.getElementById("lat");
const lonInput = document.getElementById("lon");
const placeSearch = document.getElementById("placeSearch");
const placeSuggestions = document.getElementById("placeSuggestions");

let markers = [];
let searchController = null;
let currentCenter = { lat: 47.3769, lon: 8.5417 };
let lastPlaceResults = [];
let centerMarker = null;
let currentRadiusKm = 18;

const toKm = (meters) => (meters ? (meters / 1000).toFixed(1) : "-");
const toKts = (ms) => (ms ? (ms * 1.94384).toFixed(0) : "-");
const updateNoiseScore = (aircraft, lat, lon) => {
  noiseScore.textContent = "1.0";
  if (!aircraft.length) {
    return;
  }

  const nearestDistance = aircraft.reduce((closest, item) => {
    if (!item.latitude || !item.longitude) return closest;
    const distance = haversineDistance(lat, lon, item.latitude, item.longitude);
    return Math.min(closest, distance);
  }, Number.POSITIVE_INFINITY);

  const localRadiusKm = 18;
  const cappedDistance = Number.isFinite(nearestDistance)
    ? Math.min(nearestDistance, localRadiusKm)
    : localRadiusKm;
  const distanceRatio = cappedDistance / localRadiusKm;
  const mappedScore = Math.round(10 - Math.pow(distanceRatio, 1.4) * 9);
  const countBoost = Math.min(aircraft.length, 4) * 0.1;
  const finalScore = Math.min(10, Math.max(1, mappedScore + countBoost));
  noiseScore.textContent = Number.isFinite(finalScore)
    ? finalScore.toFixed(1)
    : "1.0";

  noiseScore.classList.remove("score-low", "score-mid", "score-high");
  if (finalScore >= 7.5) {
    noiseScore.classList.add("score-high");
  } else if (finalScore >= 4) {
    noiseScore.classList.add("score-mid");
  } else {
    noiseScore.classList.add("score-low");
  }

};


const renderList = (aircraft, lat, lon) => {
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
    const distanceValue = item.latitude && item.longitude
      ? haversineDistance(lat, lon, item.latitude, item.longitude)
      : null;
    const distance = Number.isFinite(distanceValue)
      ? distanceValue.toFixed(1)
      : "-";
    meta.innerHTML = `
      <div>Typ: ${item.icao24 || "-"}</div>
      <div>Höhe: ${toKm(item.baro_altitude)} km</div>
      <div>Geschwindigkeit: ${toKts(item.velocity)} kt</div>
      <div>Entfernung: ${distance} km</div>
      <div>Von: ${item.originCountry || "-"}</div>
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
    const rotation = Number.isFinite(item.heading) ? item.heading : 0;
    const planeIcon = L.divIcon({
      className: "plane-icon",
      html: `<div class="plane" style="transform: rotate(${rotation}deg)"></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const marker = L.marker([item.latitude, item.longitude], {
      icon: planeIcon,
    }).addTo(map);

    marker.bindPopup(`
      <strong>${item.callsign || "Unbekannt"}</strong><br />
      Typ: ${item.icao24 || "-"}<br />
      Höhe: ${toKm(item.baro_altitude)} km<br />
      Geschwindigkeit: ${toKts(item.velocity)} kt<br />
      Entfernung: ${haversineDistance(currentCenter.lat, currentCenter.lon, item.latitude, item.longitude).toFixed(1)} km
    `);

    markers.push(marker);
  });
};

const updateCenterMarker = (lat, lon) => {
  if (centerMarker) {
    centerMarker.setLatLng([lat, lon]);
    return;
  }

  centerMarker = L.circleMarker([lat, lon], {
    radius: 7,
    color: "#d42a1f",
    fillColor: "#ff3b30",
    fillOpacity: 0.9,
    weight: 2,
  }).addTo(map);
  centerMarker.bindPopup("Dein Standort");
};

const fetchAircraft = async (lat, lon) => {
  
  const radiusDegrees = currentRadiusKm / 111;
  const lamin = lat - radiusDegrees;
  const lomin = lon - radiusDegrees;
  const lamax = lat + radiusDegrees;
  const lomax = lon + radiusDegrees;

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
    heading: state[10],
    originCountry: state[2],
  }));

    if (!map._loaded) {
      map.setView([lat, lon], 9);
    } else {
      map.panTo([lat, lon], { animate: true });
    }
    updateCenterMarker(lat, lon);
    const filtered = aircraft.filter((item) => {
      if (!item.latitude || !item.longitude) return false;
      const distance = haversineDistance(lat, lon, item.latitude, item.longitude);
      return distance <= currentRadiusKm;
    });
    updateMarkers(filtered);
    renderList(filtered, lat, lon);
    aircraftCount.textContent = filtered.length;
    if (panelAircraftCount) {
      panelAircraftCount.textContent = filtered.length;
    }
    updateNoiseScore(filtered, lat, lon);
    lastUpdate.textContent = new Date().toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (panelLastUpdate) {
      panelLastUpdate.textContent = lastUpdate.textContent;
    }
    
  } catch (error) {
    
  }
};

const handleRefresh = () => {
  const lat = Number.parseFloat(latInput.value) || 47.3769;
  const lon = Number.parseFloat(lonInput.value) || 8.5417;
  currentCenter = { lat, lon };
  fetchAircraft(lat, lon);
};

const updateRadiusLabels = () => {
  const rounded = Math.round(currentRadiusKm);
  if (radiusValue) {
    radiusValue.textContent = `${rounded} km`;
  }
  if (radiusLabel) {
    radiusLabel.textContent = `${rounded}`;
  }
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
  lastPlaceResults = results;
  placeSuggestions.innerHTML = "";
  if (!results.length) {
    placeSuggestions.hidden = true;
    return;
  }

  results.slice(0, 5).forEach((result) => {
    const option = document.createElement("button");
    option.type = "button";
    option.textContent = result.display_name;
    option.dataset.index = `${lastPlaceResults.indexOf(result)}`;
    option.addEventListener("click", () => {
      applyPlaceResult(result);
    });
    placeSuggestions.appendChild(option);
  });

  placeSuggestions.hidden = false;
};

const searchPlaces = async (query) => {
  if (query.length < 3) {
    lastPlaceResults = [];
    placeSuggestions.hidden = true;
    return;
  }

  if (searchController) {
    searchController.abort();
  }

  searchController = new AbortController();
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      query
    )}&addressdetails=1&limit=5&accept-language=de`;
    const response = await fetch(nominatimUrl, {
      signal: searchController.signal,
    });

    if (!response.ok) {
      throw new Error("Suche fehlgeschlagen");
    }

    const results = await response.json();
    renderSuggestions(results);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(
        query
      )}&limit=5&lang=de`;
      const response = await fetch(photonUrl, {
        signal: searchController.signal,
      });
      if (!response.ok) {
        throw new Error("Suche fehlgeschlagen");
      }
      const data = await response.json();
      const results = (data.features || []).map((feature) => ({
        display_name: feature.properties?.name
          ? `${feature.properties.name}, ${feature.properties.country || ""}`.trim()
          : feature.properties?.label || "",
        lat: feature.geometry?.coordinates?.[1],
        lon: feature.geometry?.coordinates?.[0],
      }));
      renderSuggestions(results.filter((item) => item.display_name));
    } catch (fallbackError) {
      placeSuggestions.hidden = true;
      lastPlaceResults = [];
    }
  }
};

const applyPlaceResult = (result) => {
  if (!result || !result.lat || !result.lon) return false;
  latInput.value = Number.parseFloat(result.lat).toFixed(4);
  lonInput.value = Number.parseFloat(result.lon).toFixed(4);
  placeSuggestions.hidden = true;
  placeSearch.value = result.display_name;
  placeSearch.blur();
  handleRefresh();
  return true;
};

regionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (placeSearch.value.trim() && lastPlaceResults.length) {
    if (applyPlaceResult(lastPlaceResults[0])) {
      return;
    }
  }
  placeSuggestions.hidden = true;
  handleRefresh();
});

refreshButton.addEventListener("click", handleRefresh);

if (radiusInput) {
  radiusInput.addEventListener("input", (event) => {
    currentRadiusKm = Number.parseFloat(event.target.value) || 18;
    updateRadiusLabels();
  });

  radiusInput.addEventListener("change", () => {
    handleRefresh();
  });
}

placeSearch.addEventListener("input", (event) => {
  const query = event.target.value.trim();
  if (!query) {
    placeSuggestions.innerHTML = "";
    placeSuggestions.hidden = true;
    lastPlaceResults = [];
    return;
  }
  searchPlaces(query);
});

placeSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && lastPlaceResults.length) {
    event.preventDefault();
    applyPlaceResult(lastPlaceResults[0]);
  }
});

placeSearch.addEventListener("blur", () => {
  setTimeout(() => {
    placeSuggestions.hidden = true;
  }, 150);
});

placeSuggestions.addEventListener("mousedown", (event) => {
  event.preventDefault();
});

document.addEventListener("click", (event) => {
  if (!placeSuggestions.contains(event.target) && event.target !== placeSearch) {
    placeSuggestions.hidden = true;
  }
});

document.addEventListener("touchstart", (event) => {
  if (!placeSuggestions.contains(event.target) && event.target !== placeSearch) {
    placeSuggestions.hidden = true;
  }
});

handleRefresh();
updateRadiusLabels();
setInterval(handleRefresh, 15000);
