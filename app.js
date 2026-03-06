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
const refreshButton = document.getElementById("refresh");

const regionForm = document.getElementById("regionForm");
const latInput = document.getElementById("lat");
const lonInput = document.getElementById("lon");

let markers = [];

const toKm = (meters) => (meters ? (meters / 1000).toFixed(1) : "-");
const toKts = (ms) => (ms ? (ms * 1.94384).toFixed(0) : "-");

const updateStatus = (text) => {
  statusText.textContent = text;
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

regionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleRefresh();
});

refreshButton.addEventListener("click", handleRefresh);

handleRefresh();
setInterval(handleRefresh, 15000);
