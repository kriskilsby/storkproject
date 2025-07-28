console.log(" app.js loaded");

// Define custom hourly time slots for categorising data by time of day.
// Slot 0 spans across midnight to represent nighttime activity (10pm–4am).
const customSlots = [
  { id: 0, ranges: [[22, 24], [0, 4]] },  // Night slot
  { id: 1, ranges: [[4, 10]] },
  { id: 2, ranges: [[10, 13]] },
  { id: 3, ranges: [[13, 16]] },
  { id: 4, ranges: [[16, 19]] },
  { id: 5, ranges: [[19, 22]] }
];

// Selects or deselects all checkboxes that match a given prefix (e.g., "hour-", "month-")
// Triggers a change event to ensure filters update in the UI
window.toggleAll = function(type, check) {
  const checkboxes = document.querySelectorAll(`input[type="checkbox"][id^="${type}-"]`);
  checkboxes.forEach(cb => {
    cb.checked = check;
    cb.dispatchEvent(new Event('change')); // Trigger filter update
  });
};

// ===============================
// Top level global variables
// =============================== 

// Map and visual layers
let map;
let clusterLayerGroup;
let animationLayerGroup;

// Animation state
let timeSlider;
let timeSliderLabel;
let animationMarker = null;
let animationInterval = null;
let animationIndex = 0;
let animationGroupedPoints = null;
let animationTimestamps = null;
let animationTrail = [];
let animationPolyline = null;
let animationPaused = false;
let isAnimating = false;
let playPauseBtn;
let pauseBtn;

// Data state
let allPoints = [];
let allSortedPoints = [];
let originalAllPoints = []; // Backup before filters
let currentBird = "all";
let currentYear = "all";
let mapHasBeenCentered = false;
let selectedCluster = null;
let sortedTimePoints = [];
let birdSelect;

// Metadata for dropdowns
let metadata = {
  birds: {},
  years: {}
};


// Global colour map for year-based visuals
const yearColorMap = {
    2016: '#e6194b',  // Red
    2017: '#3cb44b',  // Green
    2018: '#ffe119',  // Yellow
    2019: '#0082c8',  // Blue
    2020: '#f58231',  // Orange
    2021: '#911eb4',  // Purple
    2022: '#46f0f0',  // Cyan
    2023: '#f032e6',  // Magenta
    2024: '#fabebe'   // Pink
  };


// Returns the selected checkbox values
function getSelectedCheckboxValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
    .map(cb => parseInt(cb.value, 10));
}


// Initialise the map and add tile layers
function initMap() {
  map = L.map('map').setView([48.0, 10.0], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(map);

  clusterLayerGroup = L.layerGroup().addTo(map);
  animationLayerGroup = L.layerGroup().addTo(map);

}

// Adding an animated month and year visual to the map for the animated slider
const timeDisplayControl = L.control({ position: 'bottomleft' });

timeDisplayControl.onAdd = function (map) {
  const div = L.DomUtil.create('div', 'map-time-label');
  div.style.background = 'rgba(0,0,0,0.6)';
  div.style.color = 'white';
  div.style.padding = '4px 10px';
  div.style.borderRadius = '8px';
  div.style.fontSize = '16px';
  div.style.fontWeight = 'bold';
  div.style.pointerEvents = 'none'; // Prevent blocking map interaction
  div.innerHTML = 'Month Year';
  return div;
};


// Helper function for slider colour per year - parses 'YYYY-Www' into a Date object
function parseISOWeek(isoWeekStr) {
  const [yearStr, weekStr] = isoWeekStr.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);

  // Start from Jan 4 (guaranteed to be in the first week)
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // ISO: 1 = Monday ... 7 = Sunday

  // Calculate the start of the first ISO week
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  return weekStart;
}


function updateSliderYearColors(timestamps, sliderElement) {
  if (!sliderElement || !Array.isArray(timestamps)) return;

  const total = timestamps.length;
  const yearSegments = [];

   // Use custom parser function if needed
  const getYear = (ts) => {
    return ts.includes('-W') ? parseISOWeek(ts).getUTCFullYear() : new Date(ts).getFullYear();
  };

  // Group consecutive timestamps by year
  let currentYear = getYear(timestamps[0]);
  let startIdx = 0;

  console.log("Timestamps passed to updateSliderYearColors:", timestamps);

  for (let i = 1; i < total; i++) {
    // const tsYear = new Date(timestamps[i]).getFullYear();
    const tsYear = getYear(timestamps[i]); // KK change this check
    if (tsYear !== currentYear) {
      const startPercent = (startIdx / total) * 100;
      const endPercent = (i / total) * 100;
      const color = yearColorMap[currentYear] || '#ccc';

      console.log(`📅 Year segment: ${currentYear}, color: ${color}, range: ${startPercent.toFixed(2)}% - ${endPercent.toFixed(2)}%`);

      yearSegments.push(`${color} ${startPercent.toFixed(2)}% ${endPercent.toFixed(2)}%`);
      currentYear = tsYear;
      startIdx = i;
    }
  }


  // Add last segment
  const finalColor = yearColorMap[currentYear] || '#ccc';
  const finalStartPercent = (startIdx / total) * 100;

  console.log(`📅 Final year segment: ${currentYear}, color: ${finalColor}, range: ${finalStartPercent.toFixed(2)}% - 100%`);

  yearSegments.push(`${finalColor} ${(startIdx / total) * 100}% 100%`);

  // Apply to slider
  // sliderElement.style.background = `linear-gradient(to right, ${yearSegments.join(', ')})`;
  const gradient = `linear-gradient(to right, ${yearSegments.join(', ')})`;

  console.log("🎨 Final gradient string applied to slider:", gradient);

  sliderElement.style.background = gradient
}


// Formats various timestamp formats for display:
// - Accepts standard ISO strings or week-based keys (e.g., "2024-W05")
// - Returns a consistent UK-style date/time string
// - Handles invalid/malformed inputs gracefully
function formatTimestamp(iso) {
  if (typeof iso !== 'string') {
    if (iso instanceof Date) {
      return iso.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    console.warn("⚠️ formatTimestamp received non-string:", iso);
    return 'Invalid timestamp';
  }


  // Handle ISO week keys like "2024-W05"
  if (iso.includes('-W')) {
    const [year, weekStr] = iso.split('-W');
    const week = parseInt(weekStr);
    if (isNaN(week)) return 'Invalid week';

    const firstDay = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    return `Week ${week}, ${year} (${firstDay.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`;
  }

  // Handle regular ISO string
  const date = new Date(iso);
  if (isNaN(date)) return 'Invalid date';

  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}


// Updates the map with data for a specific timestamp index during animation.
// Clears previous markers and renders current clusters with popups.
// Also updates the slider and time label accordingly.
function updateMapForTimeIndex(groupedPoints, timestamps, index) {
  console.log("updateMapForTimeIndex called. Index:", index);
  console.log("Timestamp:", timestamps[index]);
  console.log("Number of points:", (groupedPoints[timestamps[index]] || []).length);
  clusterLayerGroup.clearLayers();
  const points = groupedPoints[timestamps[index]] || [];

  points.forEach((point) => {
    const lat = point.location_lat;
    const lon = point.location_long;
    const cluster = point.cluster;

    const marker = L.circleMarker([lat, lon], {
      radius: 6,
      fillColor: getColorForCluster(cluster),
      color: '#333',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    }).bindPopup(() => {
      const heading = Math.round(point.calculated_heading);
      const distance = point.distance?.toFixed(1);
      const compass = point.compass_direction || 'N/A';
      const timestamp = point.timestamp ? formatTimestamp(point.timestamp) : 'N/A';

      return `
        <div>
          <strong>Cluster:</strong> ${cluster}<br/>
          <strong>Bird ID:</strong> ${point.individual_local_identifier}<br/>
          <strong>Heading:</strong> ${heading}° (${compass})<br/>
          <strong>Distance:</strong> ${distance} m<br/>
          <strong>Time:</strong> ${timestamp}
        </div>
      `;
    });

    clusterLayerGroup.addLayer(marker);
  });

  // UPDATE SLIDER UI
  if (timeSlider) {
    timeSlider.value = index;
  }

  if (timeSliderLabel) {
    timeSliderLabel.textContent = `Time: ${formatTimestamp(timestamps[index])}`;
  }
}


// Populates the simple dropdowns for Bird and Year selection,
// using unique values extracted from the dataset.
function populateDropdowns(points) {
  const birdSelect = document.getElementById("bird-select");
  const yearSelect = document.getElementById("year-select");

  const birds = [...new Set(points.map(p => p.individual_local_identifier))].sort();
  const years = [...new Set(points.map(p => new Date(p.timestamp).getFullYear().toString()))].sort();

  // Build bird options
  birdSelect.innerHTML = `<option value="all">All Birds</option>` +
    birds.map(id => `<option value="${id}">${id}</option>`).join("");

  // Build year options
  yearSelect.innerHTML = `<option value="all">All Years</option>` +
    years.map(y => `<option value="${y}">${y}</option>`).join("");

  // Set the selects to current values
  birdSelect.value = currentBird;
  yearSelect.value = currentYear;
}

// Updates the bird and year dropdown filters based on current selections.
// This ensures that only relevant combinations are shown.
function updateFilteredDropdowns() {
  const selectedYears = getSelectedValues("year-select-clustering");
  const selectedBirds = getSelectedValues("bird-select-clustering");

  console.log("Selected Years:", selectedYears);
  console.log("Selected Birds:", selectedBirds);

  // Filter years: keep only years that have at least one selected bird (or all years if no bird selected)
  const filteredYears = Object.entries(metadata.years).filter(([year, birdsObj]) => {
    if (selectedBirds.length === 0) return true;
    // Check if any selected bird appears in this year's data
    return selectedBirds.some(bird => birdsObj.hasOwnProperty(bird));
  });

  // Filter birds: keep only birds that have data in at least one selected year (or all birds if no year selected)
  const filteredBirds = Object.entries(metadata.birds).filter(([bird, yearsObj]) => {
    if (selectedYears.length === 0) return true;
    // yearsObj keys are years (numbers or strings), check if any selected year is present
    return selectedYears.some(year => yearsObj.hasOwnProperty(year));
  });

  // Update Year dropdown with filtered results
  const yearSelect = document.getElementById("year-select-clustering");
  yearSelect.innerHTML = "";
  filteredYears.forEach(([year, birdsObj]) => {
    const count = Object.values(birdsObj).reduce((a, b) => a + b, 0);  // Total points in year
    const option = document.createElement("option");
    option.value = year;
    option.textContent = `${year} (${count})`;
    if (selectedYears.includes(year)) option.selected = true; // Preserve selection
    yearSelect.appendChild(option);
  });

  // Update Bird dropdown with filtered results
  const birdSelect = document.getElementById("bird-select-clustering");
  birdSelect.innerHTML = "";
  filteredBirds.forEach(([bird, yearsObj]) => {
    // Count total points for this bird (sum of counts over all years)
    const count = Object.values(yearsObj).reduce((a, b) => a + b, 0);  // Total points for bird
    const option = document.createElement("option");
    option.value = bird;
    option.textContent = `${bird} (${count})`;
    if (selectedBirds.includes(bird)) option.selected = true;  // Preserve selection
    birdSelect.appendChild(option);
  });
}

// Builds the year dropdown using total counts from metadata
// and passes them to a helper function to populate the multi-select UI.
function renderYearOptions(yearList) {
  const yearCounts = {};
  yearList.forEach(year => {
    const birdData = metadata.years[year];
    const total = Object.values(birdData || {}).reduce((a, b) => a + b, 0);  
    yearCounts[year] = total;
  });
  populateMultiSelectWithCounts("year-select-clustering", yearList, yearCounts);
}

// Builds the bird dropdown using total counts from metadata
// and passes them to a helper function to populate the multi-select UI.
function renderBirdOptions(birdList) {
  const birdCounts = {};
  birdList.forEach(bird => {
    const yearData = metadata.birds[bird];
    const total = Object.values(yearData || {}).reduce((a, b) => a + b, 0);
    birdCounts[bird] = total;
  });
  populateMultiSelectWithCounts("bird-select-clustering", birdList, birdCounts);
}

// Returns an array of selected <option> values from a given <select> element by ID.
function getSelectedValues(selectId) {
  const select = document.getElementById(selectId);
  return Array.from(select.selectedOptions).map(opt => opt.value);
}

// Asynchronously fetches metadata from the backend and populates the clustering dropdowns.
// The dropdowns are built using helper functions `renderYearOptions` and `renderBirdOptions`.
async function fetchAndPopulateDropdowns() {
  try {
    const response = await fetch('/api/metadata');
    const data = await response.json();

    metadata = data;

    renderYearOptions(Object.keys(data.years));
    renderBirdOptions(Object.keys(data.birds));
  } catch (err) {
    console.error("Error fetching metadata:", err);
  }
}

// Animates a number (e.g., cluster size) counting up over a short duration.
// Used to visually emphasise the count in the legend (e.g., "(120 pts)").
function animateCountUp(element, targetNumber, duration = 1000) {
  let start = 0;
  const stepTime = Math.abs(Math.floor(duration / targetNumber));
  const startTime = Date.now();

  function update() {
    const elapsed = Date.now() - startTime;
    let progress = Math.min(elapsed / duration, 1);
    let current = Math.floor(progress * targetNumber);
    element.textContent = `(${current} pts)`;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  update();
}
// Moves the animation marker to the current point in the time slider
// Also updates the map view and the time label displayed on the interface
function updateAnimationMarker(index) {
  if (!Array.isArray(sortedTimePoints) || sortedTimePoints.length === 0) return;

  const point = sortedTimePoints[index];
  if (!point) {
    console.warn("No point at index", index);
    return; // exit early if no valid point
  }

  const latlng = [point.location_lat, point.location_long];

  if (!animationMarker) {
    animationMarker = L.circleMarker(latlng, {
      radius: 10,
      fillColor: '#f00',
      color: '#000',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(animationLayerGroup);
  } else {
    animationMarker.setLatLng(latlng);
  }

  map.panTo(latlng);

  // Update time label
  const ts = new Date(point.timestamp);
  document.getElementById('time-label').textContent = ts.toLocaleString();
}


// Downsamples a list of points by selecting every 'step'-th point
// Used to reduce animation slider density for performance
// function downsamplePoints(points, step = 100) {
//   const sampledPoints = [];
//   for (let i = 0; i < points.length; i += step) {
//     sampledPoints.push(points[i]);
//   }
//   return sampledPoints;
// }


// Groups points by month and returns average GPS location for each month
// Used for slider animation to smooth out dense datasets
function getMonthlyAveragedPoints(allPoints) {
  // Group points by "YYYY-MM" string
  const grouped = {};

  allPoints.forEach(point => {
    // Parse timestamp into a Date
    const date = new Date(point.timestamp);
    if (isNaN(date)) return; // skip invalid dates

    // Format as "YYYY-MM" to group by month
    const monthKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');

    if (!grouped[monthKey]) {
      grouped[monthKey] = [];
    }

    grouped[monthKey].push(point);
  });

  // Average points per month
  const averagedPoints = {};

  for (const monthKey in grouped) {
    const points = grouped[monthKey];
    if (points.length === 0) continue;

    // Average lat/lon
    let sumLat = 0;
    let sumLon = 0;
    points.forEach(p => {
      sumLat += p.location_lat;
      sumLon += p.location_long;
    });

    const avgLat = sumLat / points.length;
    const avgLon = sumLon / points.length;

    // Create a averaged point
    averagedPoints[monthKey] = [{
      ...points[0],            
      location_lat: avgLat,
      location_long: avgLon,
      timestamp: monthKey + '-01T00:00:00Z'  // assign first day of month as timestamp
    }];
  }

  // Sort timestamps (monthKeys)
  const timestamps = Object.keys(averagedPoints).sort();

  return {
    groupedPoints: averagedPoints,
    timestamps
  };
}


// Groups points by ISO week and returns average location for each week
// Supports weekly time slider playback mode
function getWeeklyAveragedPoints(allPoints) {
  const grouped = {};

  allPoints.forEach(point => {
    const date = new Date(point.timestamp);
    if (isNaN(date)) return;

    // Calculate ISO week number
    const tempDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = tempDate.getUTCDay() || 7;
    tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);

    const weekKey = `${tempDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;

    if (!grouped[weekKey]) {
      grouped[weekKey] = [];
    }
    grouped[weekKey].push(point);
  });

  const averagedPoints = {};

  for (const weekKey in grouped) {
    const points = grouped[weekKey];
    if (points.length === 0) continue;

    let sumLat = 0;
    let sumLon = 0;
    points.forEach(p => {
      sumLat += p.location_lat;
      sumLon += p.location_long;
    });

    const avgLat = sumLat / points.length;
    const avgLon = sumLon / points.length;

     // Create a real ISO date for the start of the week
    const [year, weekStr] = weekKey.split('-W');
    const week = parseInt(weekStr);
    const firstDayOfWeek = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));

    averagedPoints[weekKey] = [{
      ...points[0],
      location_lat: avgLat,
      location_long: avgLon,
      timestamp: firstDayOfWeek.toISOString()
    }];
  }

  const timestamps = Object.keys(averagedPoints).sort();

  return {
    groupedPoints: averagedPoints,
    timestamps
  };
}


// ############## KK NEW CODE ADDED BELOW ##################
function resetFiltersAndAnimation() {
  // Stop animation if running
  if (animationInterval) stopAnimation();

  // Reset global state
  currentBird = "all";
  currentYear = "all";

  // Reset dropdowns
  const yearSelect = document.getElementById("year-select");
  const birdSelect = document.getElementById("bird-select");
  if (yearSelect) {
    yearSelect.value = "all";
    $('#year-select').trigger('change.select2');
  }
  if (birdSelect) {
    birdSelect.value = "all";
    $('#bird-select').trigger('change.select2');
  }

  // Uncheck checkboxes silently (no event firing)
  document.querySelectorAll('input[name="month"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('input[name="hour"]').forEach(cb => cb.checked = false);

  // Clear distance range inputs
  document.getElementById("distanceMin").value = "";
  document.getElementById("distanceMax").value = "";

  // Reset time slider UI
  const timeSlider = document.getElementById("time-slider");
  const timeLabel = document.getElementById("time-label");
  if (timeSlider) timeSlider.value = 0;
  if (timeLabel) timeLabel.innerText = "No time loaded";

  // Reset play/pause UI controls
  if (playPauseBtn) playPauseBtn.textContent = "▶️ Play";
  const pauseBtn = document.getElementById("pauseButton");
  if (pauseBtn) {
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";
  }

  // Optional: Reset time grouping to monthly
  const monthlyRadio = document.querySelector('input[name="timeGrouping"][value="monthly"]');
  if (monthlyRadio) monthlyRadio.checked = true;

  // Hide year legend / show cluster legend
  document.getElementById("year-legend-container").style.display = "none";
  document.getElementById("cluster-legend-container").style.display = "block";

  // Reset internal flags
  mapHasBeenCentered = false;
}

// ==========================================================
//     MAIN WORKING CODE renderClustersOnMap
// ========================================================== KK CHECKED

// ############## KK NEW CODE ADDED BELOW ##################
// Main function responsible for rendering filtered points
function renderClustersOnMap(data) {
  console.time("⌚ Start renderClustersOnMap");
  // Skip rendering if animation is running and reset map layer and legend
  if (isAnimating) {
    console.log("🚫 renderClustersOnMap skipped — isAnimating = true");
    return;
  }

  // ##### KK NEW CODE ADDED BELOW ######################

  // === Cleanup previous UI state before rendering new data ===

  // // Stop any running animation
  // if (animationInterval) stopAnimation();

  // // 🧽 Clear filters
  // currentBird = "all";
  // currentYear = "all";

  // // Reset dropdowns
  // const yearSelect = document.getElementById("year-select");
  // birdSelect = document.getElementById("bird-select");
  // if (yearSelect) {
  //   yearSelect.value = "all";
  //   $('#year-select').trigger('change.select2');
  // }
  // if (birdSelect) {
  //   birdSelect.value = "all";
  //   $('#bird-select').trigger('change.select2');
  // }

  // // Uncheck all Month and Hour checkboxes
  // document.querySelectorAll('input[name="month"]').forEach(cb => {
  //   cb.checked = false;
  //   // cb.dispatchEvent(new Event("change"));
  // });
  // document.querySelectorAll('input[name="hour"]').forEach(cb => {
  //   cb.checked = false;
  //   // cb.dispatchEvent(new Event("change"));
  // });

  // // Clear distance filter inputs
  // document.getElementById("distanceMin").value = "";
  // document.getElementById("distanceMax").value = "";

  // // Reset time slider UI
  // timeSlider = document.getElementById("time-slider");
  // timeSliderLabel = document.getElementById("time-label");
  // if (timeSlider) timeSlider.value = 0;
  // if (timeSliderLabel) timeSliderLabel.innerText = "No time loaded";

  // // Reset play/pause UI controls
  // if (playPauseBtn) playPauseBtn.textContent = "▶️ Play";
  // pauseBtn = document.getElementById("pauseButton");
  // if (pauseBtn) {
  //   pauseBtn.disabled = true;
  //   pauseBtn.textContent = "Pause";
  // }

  // // Clear time display control if visible
  // if (timeDisplayControl && timeDisplayControl.getContainer()) {
  //   timeDisplayControl.getContainer().innerHTML = "";
  // }

  // // Toggle legend containers
  // document.getElementById("year-legend-container").style.display = "none";
  // document.getElementById("cluster-legend-container").style.display = "block";

  // // Ensure future map centering works
  // mapHasBeenCentered = false;


  // ##### KK NEW CODE ADDED ABOVE ######################

  console.time("🧹 Clear previous clusterLayerGroup");
  clusterLayerGroup.clearLayers();
  console.timeEnd("🧹 Clear previous clusterLayerGroup");

  const legendContainer = document.getElementById("legend");
  console.time("🧹 Clear previous legend");
  legendContainer.innerHTML = ""; // Clear old legend entries
  console.timeEnd("🧹 Clear previous legend");
  
  // Clear previous selection highlight
  document.querySelectorAll(".legend-item").forEach(item => {
    item.classList.remove("selected-cluster");
  });

  // Get key UI references and exit if no valid data
  const uniqueClusters = new Set();
  timeSlider = document.getElementById('time-slider');
  timeSliderLabel = document.getElementById('time-label');
  playPauseBtn = document.getElementById('playButton');

  if (!data || !data.all_points || data.all_points.length === 0) {
    alert('No preview data returned');
    return;
  }

  // Stop any running animation and store the incoming points
  if (animationInterval) {
    console.time("🧹 Clear previous clearInterval");
    clearInterval(animationInterval);
    console.timeEnd("🧹 Clear previous clearInterval");
    animationInterval = null;
    if (playPauseBtn) playPauseBtn.textContent = '▶️ Play';
  }

  console.time("🧹 Clear previous animationLayerGroup");
  animationLayerGroup.clearLayers();
  console.timeEnd("🧹 Clear previous animationLayerGroup");
  allPoints = data.all_points;

  console.log("🔢 Total points to render:", allPoints.length);


 // Enable play button only if a single bird is selected or available
  const birdSelect = document.getElementById("bird-select");
  // birdSelect = document.getElementById("bird-select");
  const playBtn = document.getElementById("playButton");

  // console.log("Rendering clusters on map. currentBird:", currentBird);
  const uniqueBirds = new Set(allPoints.map(p => p.individual_local_identifier));
  // console.log("Unique birds in current dataset:", [...uniqueBirds]);
  const selectedBird = birdSelect?.value;

  // Enable play only if a single bird is selected
  if (uniqueBirds.size === 1 || (selectedBird && selectedBird !== "all")) {
    playBtn.disabled = false;
    playBtn.title = "▶️ Play animation";
    playBtn.classList.remove("disabled");
  } else {
    playBtn.disabled = true;
    playBtn.title = "Select a bird to play the animation";
    playBtn.classList.add("disabled");
  }
  // console.log("Play button enabled:", !playBtn.disabled);
  // console.log("uniqueBirds.size:", uniqueBirds.size, "selectedBird:", selectedBird);

  // Apply all user-defined filters to the dataset:
  // - Bird ID
  // - Year
  // - Month checkboxes
  // - Time slot checkboxes (mapped via customSlots)
  // - Distance range
  // - Selected cluster (via legend click)
  const selectedMonths = getSelectedCheckboxValues("month"); 
  const selectedSlots = getSelectedCheckboxValues("hour");   

  console.time("📍create filteredPoints");
  const filteredPoints = allPoints.filter(p => { 
    const date = new Date(p.timestamp);
    const year = date.getFullYear().toString();
    const month = date.getUTCMonth() + 1;
    const hour = date.getHours();

    // Map hour to one of the custom time slots
    let timeslot = null;
    
    for (const slot of customSlots) {
      for (const [start, end] of slot.ranges) {
        if (
          (start <= end && hour >= start && hour < end) ||  
          (start > end && (hour >= start || hour < end))    
        ) {
          timeslot = slot.id;
          break;
        }
      }
      if (timeslot !== null) break;
    }
    
    const distanceMin = parseFloat(document.getElementById('distanceMin').value) || 0;
    const distanceMax = parseFloat(document.getElementById('distanceMax').value) || Infinity;

    const birdMatch = currentBird === "all" || p.individual_local_identifier === currentBird;
    const yearMatch = currentYear === "all" || year === currentYear;
    const monthMatch = selectedMonths.length === 0 || selectedMonths.includes(month);
    const slotMatch = selectedSlots.length === 0 || selectedSlots.includes(timeslot);
    const distance = p.distance ?? 0;
    const distanceMatch = distance >= distanceMin && distance <= distanceMax;
    const clusterMatch = selectedCluster === null || p.cluster === selectedCluster;

    return birdMatch && yearMatch && monthMatch && slotMatch && distanceMatch && clusterMatch;
  });
  console.timeEnd("📍create filteredPoints");

  // Prepare data for time slider animation:
  // - Sort filtered points by timestamp
  // - Group into weekly or monthly intervals based on user selection
  // - Generate averaged points per time slot
  // - Store grouped data and timestamps for use in animation
  // - Update slider background to reflect year ranges via color gradient
  allSortedPoints = [...filteredPoints].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const downsampleStep = 50;  // Can be changed to anything such as 50, 100, 200, etc.
  
  // Monthly or weekly slider toggle
  const timeGrouping = document.querySelector('input[name="timeGrouping"]:checked')?.value || 'monthly';

  // Whether to use weekly or monthly average points for the slider animation
  console.time("📍get average points");
  let result;
  if (timeGrouping === 'weekly') {
    result = getWeeklyAveragedPoints(allSortedPoints);
  } else {
    result = getMonthlyAveragedPoints(allSortedPoints);
  }
  console.timeEnd("📍get average points");

  animationGroupedPoints = result.groupedPoints;
  animationTimestamps = result.timestamps;

  console.time("➕ Update updateSliderYearColors");
  updateSliderYearColors(animationTimestamps, timeSlider);
  console.timeEnd("➕ Update updateSliderYearColors");

  // console.log("DEBUG → groupedPoints:", animationGroupedPoints);
  // console.log("DEBUG → timestamps:", animationTimestamps);

  if (timeSlider && sortedTimePoints.length) {
    timeSlider.max = sortedTimePoints.length - 1;
    timeSlider.value = 0;
    timeSliderLabel.textContent = formatTimestamp(sortedTimePoints[0].timestamp);
  }

  // centre on the map on first load
  if (!mapHasBeenCentered && allPoints.length > 0) {
  const bounds = L.latLngBounds(allPoints.map(p => [p.location_lat, p.location_long]));
  map.fitBounds(bounds);
  mapHasBeenCentered = true;
  }

  // Populate dropdowns
  console.time("➕ Update populateDropdowns");
  populateDropdowns(allPoints);
  console.timeEnd("➕ Update populateDropdowns");
  
  
  const isSingleBird = currentBird !== "all";
  
  console.time("🍹 Slider setup & timestamps");
  // Setup slider and time animation controls (only for single bird selection)
  if (isSingleBird && allSortedPoints.length > 0) {
    // Display animation controls
    // Validate animation data
    // Initialize slider range and labels
    // Bind slider input to update animation frame on map
    // Show the first frame
    document.getElementById('time-animation-controls').style.display = 'flex';

    // console.log("Monthly Averaged Points Result:", result);  // ← Debug output

      // Guard against bad data
    if (!animationGroupedPoints || !animationTimestamps || !animationTimestamps.length) {
      console.warn('⚠️ No animation data available');
      return;
    }

    // Set up slider
    timeSlider.max = animationTimestamps.length - 1;
    timeSlider.value = 0;
    animationIndex = 0;

    // Format the first timestamp for label
    const firstTimestamp = animationTimestamps[0] + '-01T00:00:00Z';
    timeSliderLabel.textContent = formatTimestamp(firstTimestamp);

    timeSlider.oninput = () => {
      animationIndex = parseInt(timeSlider.value);
      const currentTimestamp = animationTimestamps[animationIndex] + '-01T00:00:00Z';
      timeSliderLabel.textContent = formatTimestamp(currentTimestamp);
      updateMapForTimeIndex(animationGroupedPoints, animationTimestamps, animationIndex);
    };


    // Show first frame
    updateMapForTimeIndex(animationGroupedPoints, animationTimestamps, 0);
    
  } else {
    // Hide controls if animation is not applicable
    document.getElementById('time-animation-controls').style.display = 'none';
  }
  console.timeEnd("🍹 Slider setup & timestamps");

  // Rebuild groupedPoints with filtered data
  const groupedPoints = {};
  filteredPoints.forEach(point => {
    const time = point.timestamp;
    if (!groupedPoints[time]) groupedPoints[time] = [];
    groupedPoints[time].push(point);
    uniqueClusters.add(point.cluster);
  });

  // Count the number of points in each cluster
  const clusterCounts = {};
  filteredPoints.forEach(p => {
  clusterCounts[p.cluster] = (clusterCounts[p.cluster] || 0) + 1;
  });

  // Sort clusters by descending size and extract the top N
  const sortedClusters = Object.entries(clusterCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([clusterId]) => parseInt(clusterId));

  const topClustersToShow = 20;

  // Build legend entries for top N clusters
  console.time("🏗️ Build legend entries");
  sortedClusters.slice(0, topClustersToShow).forEach((clusterId) => {
    const color = getColorForCluster(clusterId);
    const count = clusterCounts[clusterId];

    const item = document.createElement("div");
  
    item.classList.add("legend-item");
    item.style.cursor = "pointer";
    item.innerHTML = `
      <div class="color-box" style="background:${color}; display: inline-block; width: 16px; height: 16px; margin-right: 8px;"></div>
      <span class="legend-label">Cluster ${clusterId}</span> 
      <span class="legend-count" style="color: #666;"></span>
    `;

    // If user previously selected this cluster, highlight it
    if (selectedCluster === clusterId) {
      item.classList.add("selected-cluster");
    }

    legendContainer.appendChild(item);

    // Enable click-to-filter for this cluster
    item.addEventListener("click", () => {
      // Toggle cluster selection
      if (selectedCluster === clusterId) {
        selectedCluster = null; // Unselect if already selected
      } else {
        selectedCluster = clusterId;
      }
      // Re-render map with selected cluster filter
      renderClustersOnMap({ all_points: allPoints });
    });

    // Animate count up on the span element
    animateCountUp(item.querySelector(".legend-count"), count, 1500);
  });
  console.timeEnd("🏗️ Build legend entries");


  if (sortedClusters.length > topClustersToShow) {
    const remaining = sortedClusters.length - topClustersToShow;
    const item = document.createElement("div");
    item.innerHTML = `
      <div class="color-box" style="background: #999;"></div>
      ${remaining} more clusters hidden
    `;
    legendContainer.appendChild(item);
  }

  // Fit the map to the bounds of all filtered points
  if (allPoints.length > 0) {
    const bounds = L.latLngBounds(filteredPoints.map(p => [p.location_lat, p.location_long]));
    map.fitBounds(bounds);
  }


  // Add all filtered points to the map (outside of time-based animation)
  console.time("➕ Add all filtered points to map");
  Object.values(groupedPoints).flat().forEach((point) => {
    const lat = point.location_lat;
    const lon = point.location_long;
    const cluster = point.cluster;

    // Draw each point as a styled circle marker
    const marker = L.circleMarker([lat, lon], {
      radius: 6,
      fillColor: getColorForCluster(cluster),
      color: '#333',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    }).bindPopup(() => {
      // Format popup content with relevant point data
      const heading = Math.round(point.calculated_heading);
      const distance = point.distance?.toFixed(1);
      const compass = point.compass_direction || 'N/A';
      const timestamp = point.timestamp ? formatTimestamp(point.timestamp) : 'N/A';

      return `
        <div>
          <strong>Cluster:</strong> ${cluster}<br/>
          <strong>Bird ID:</strong> ${point.individual_local_identifier}<br/>
          <strong>Heading:</strong> ${heading}° (${compass})<br/>
          <strong>Distance:</strong> ${distance} m<br/>
          <strong>Time:</strong> ${timestamp}<br/>
          <strong>Latitude:</strong> ${lat}<br/>
          <strong>Longitude:</strong> ${lon}<br/>
          <div style="margin-top: 6px;">
            <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" style="margin-right: 8px;">🌍 Google Maps</a>
          </div>
        </div>
      `;
    });

    // Add the marker to the cluster layer group
    clusterLayerGroup.addLayer(marker);
  });
  console.timeEnd("➕ Add all filtered points to map");

  // Ensure the Play button is enabled/disabled correctly after rendering
  updatePlayButtonState();

  console.timeEnd("⌚ Start renderClustersOnMap");
}

// kk check break
// Get a color for the given cluster ID using D3.js color palettes
function getColorForCluster(clusterId) {
  const palette = d3.schemeCategory10.concat(d3.schemePaired); 
  return palette[clusterId % palette.length];
}


// Populate a multi-select dropdown with plain option values
function populateMultiSelect(id, values) {
  const select = document.getElementById(id);
  select.innerHTML = "";
  values.forEach(val => {
    const option = document.createElement("option");
    option.value = val;
    option.textContent = val;
    select.appendChild(option);
  });
}


// Select all options in a dropdown and trigger a UI update
function selectAll(id) {
  const select = document.getElementById(id);
  for (let opt of select.options) opt.selected = true;
  $(`#${id}`).trigger('change');
}


// Deselect all options in a dropdown and trigger a UI update
function deselectAll(id) {
  const select = document.getElementById(id);
  for (let opt of select.options) opt.selected = false;
  $(`#${id}`).trigger('change'); 
}


// Update bird options to include only those found in the selected years
function filterBirdsByYears(years) {
  if (years.length === 0) {
    renderBirdOptions(Object.keys(metadata.birds));
    return;
  }

  const filtered = new Set();
  years.forEach(year => {
    const birdsInYear = metadata.years[year];
    if (birdsInYear) {
      Object.keys(birdsInYear).forEach(bird => filtered.add(bird));
    }
  });

  renderBirdOptions(Array.from(filtered));
}


// Populate multi-select with option labels including record counts (e.g., "2021 (45)")
function populateMultiSelectWithCounts(id, values, countMap) {
  const select = document.getElementById(id);
  select.innerHTML = "";

  values.forEach(val => {
    const option = document.createElement("option");
    option.value = val;
    const count = countMap[val] || 0;
    option.textContent = `${val} (${count})`;
    select.appendChild(option);
  });

  $(`#${id}`).trigger('change.select2');
}


// Update year options to include only those relevant to the selected birds
function filterYearsByBirds(birds) {
  if (birds.length === 0) {
    renderYearOptions(Object.keys(metadata.years));
    return;
  }

  const filtered = new Set();
  birds.forEach(bird => {
    const yearsForBird = metadata.birds[bird];
    if (yearsForBird) {
      Object.keys(yearsForBird).forEach(year => filtered.add(year));
    }
  });

  renderYearOptions(Array.from(filtered));
}


// Show or hide the GPS cluster layer depending on `show` flag
function toggleGPSFilterLayer(show) {
  if (clusterLayerGroup) {
    show ? map.addLayer(clusterLayerGroup) : map.removeLayer(clusterLayerGroup);
  }
}


// Build and display a year-color legend based on available timestamps
function showYearLegend(timestamps) {
  const yearLegend = document.getElementById("year-legend");
  yearLegend.innerHTML = ""; // Clear any previous content

  if (!Array.isArray(timestamps) || timestamps.length === 0) {
    console.warn("⚠️ No timestamps provided for year legend.");
    return;
  }

  const getYear = (ts) => {
    return ts.includes('-W') ? parseISOWeek(ts).getUTCFullYear() : new Date(ts).getFullYear();
  };

  const uniqueYears = [...new Set(timestamps.map(getYear))].sort();

  uniqueYears.forEach(year => {
    const color = yearColorMap[year] || '#ccc';

    const item = document.createElement("div");
    item.className = "legend-item";

    const colorBox = document.createElement("div");
    colorBox.className = "color-box";
    colorBox.style.backgroundColor = color;

    const label = document.createElement("span");
    label.textContent = year;

    item.appendChild(colorBox);
    item.appendChild(label);

    yearLegend.appendChild(item);
  });
}


// Enable play button only when a specific bird is selected
// function updatePlayButtonState() {
//   const playBtn = document.getElementById("playButton");

//   const uniqueBirds = new Set(allSortedPoints.map(p => p.individual_local_identifier));
//   const multipleBirds = uniqueBirds.size > 1;
//   const allBirdsSelected = !currentBird || currentBird === "all";

//   if (multipleBirds && allBirdsSelected) {
//     playBtn.disabled = true;
//     playBtn.title = "Select a specific bird to enable animation.";
//   } else {
//     playBtn.disabled = false;
//     playBtn.title = "";
//   }
// }

function updatePlayButtonState() {
  const playBtn = document.getElementById("playButton");
  const playBtnLabel = document.querySelector('label[for="playButton"]');

  const uniqueBirds = new Set(allSortedPoints.map(p => p.individual_local_identifier));
  const multipleBirds = uniqueBirds.size > 1;
  const allBirdsSelected = !currentBird || currentBird === "all";

  let tooltipText = "";

  if (multipleBirds && allBirdsSelected) {
    playBtn.disabled = true;
    tooltipText = "Select a specific bird to enable animation.";
  } else {
    playBtn.disabled = false;
    tooltipText = "Start the migration animation playback.";
  }

  // Update tooltip content on the LABEL
  if (playBtnLabel) {
    playBtnLabel.setAttribute("title", tooltipText);

    const tooltipInstance = bootstrap.Tooltip.getInstance(playBtnLabel);
    if (tooltipInstance) {
      tooltipInstance.setContent({ '.tooltip-inner': tooltipText });
    }
  }
}

// ===========================
  // Stop Animation code
  // ===========================  KK CHECKED

// Start the animated time slider playback, showing GPS movement over time
function startAnimation(timeGrouping = 'monthly') {
  isAnimating = true;
  animationPaused = false;

  if (playPauseBtn) {
    playPauseBtn.textContent = "🛑 End";
    playPauseBtn.setAttribute("title", "Stop the animation");

    const tooltipInstance = bootstrap.Tooltip.getInstance(playPauseBtn);
    if (tooltipInstance) {
      tooltipInstance.setContent({ '.tooltip-inner': "Stop the animation" });
    }
  }

  
  // If multiple birds exist, but 'All Birds' is selected, block animation
  // console.log("Animation started. currentBird:", currentBird);
  const uniqueBirds = new Set(allSortedPoints.map(p => p.individual_local_identifier));
  // console.log("Unique birds in allSortedPoints for animation:", [...uniqueBirds]);

  if (uniqueBirds.size > 1 && (!currentBird || currentBird === "all")) {
    alert("Please select a specific bird from the dropdown to use the animation.");
    return;
  }

  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }

  // Dynamically select based on current radio button
  const result = timeGrouping === 'weekly'
    ? getWeeklyAveragedPoints(allSortedPoints)
    : getMonthlyAveragedPoints(allSortedPoints);

  animationGroupedPoints = result.groupedPoints;
  // animationTimestamps = result.sortedTimestamps;
  animationTimestamps = result.timestamps;
  // console.log("Animation Data Returned:", result);

  // Show year legend, hide cluster legend
  document.getElementById("cluster-legend-container").style.display = "none";
  document.getElementById("year-legend-container").style.display = "block";
  showYearLegend(animationTimestamps);

 
  if (!animationGroupedPoints || !Array.isArray(animationTimestamps) || animationTimestamps.length === 0) {
    console.warn("Invalid animation data.");
    return;
  }

  const speedInput = document.getElementById("speedSelect");
  const selectedSpeed = speedInput?.value || "medium";

  // Mode-specific interval mapping
  const speedMap = {
    weekly: {
      fast: 200,
      medium: 400,
      slow: 600
    },
    monthly: {
      fast: 400,
      medium: 600,
      slow: 800
    }
  };

  const intervalMs = speedMap[timeGrouping]?.[selectedSpeed] || 600;

  toggleGPSFilterLayer(false); // Hide regular points

  // Enable the pause button when animation starts
  document.getElementById("pauseButton").disabled = false;

  animationIndex = 0;
  animationTrail = [];

  // Clear old animation
  clusterLayerGroup.clearLayers(); // Optional — for clarity
  animationLayerGroup.clearLayers();
  if (animationPolyline) {
    animationLayerGroup.removeLayer(animationPolyline);
    animationPolyline = null;
  }
  if (animationMarker) {
    animationLayerGroup.removeLayer(animationMarker);
    animationMarker = null;
  }

  // Update slider range
  if (timeSlider) {
    timeSlider.min = 0;
    timeSlider.max = animationTimestamps.length - 1;
    timeSlider.value = 0; // Reset to start
    updateSliderYearColors(animationTimestamps, timeSlider); // KK added for the colour per year for time slider 
  }

  if (timeSliderLabel && animationTimestamps.length > 0) {
    const firstPoint = animationGroupedPoints[animationTimestamps[0]]?.[0];
    if (firstPoint) {
      timeSliderLabel.textContent = formatTimestamp(firstPoint.timestamp);
    }
  }

  const legend = document.getElementById("legend");
  // if (legend) legend.style.display = "none";
  if (legend) legend.classList.add("hide");


  timeDisplayControl.addTo(map);

  animationInterval = setInterval(() => {
    // console.log("Checking animationPaused:", animationPaused);
    // console.log("⏳ setInterval assigned. ID:", animationInterval);
     if (animationPaused) return;
     console.log("Animation tick:", animationIndex);

    if (animationIndex >= animationTimestamps.length) {
      stopAnimation();
      return;
    }

    const timestamp = animationTimestamps[animationIndex];
    // console.log(`Animation frame ${animationIndex + 1} / ${animationTimestamps.length}`);
    // console.log("Timestamp:", timestamp);
    const points = animationGroupedPoints[timestamp] || [];
    // console.log("Points for this timestamp:", points);
    const point = animationGroupedPoints[timestamp]?.[0];

    if (!point) {
      animationIndex++;
      return;
    }

    const latLng = [point.location_lat, point.location_long];
    animationTrail.push(latLng);

    // code below for colours on polylines per year 
    // Clear existing polylines
    animationLayerGroup.eachLayer(layer => {
      if (layer instanceof L.Polyline) animationLayerGroup.removeLayer(layer);
    });

    // Group trail points by year
    const trailByYear = {};

    animationTrail.forEach((latLng, idx) => {
      const point = animationGroupedPoints[animationTimestamps[idx]]?.[0];
      if (!point) return;

      const year = new Date(point.timestamp).getFullYear();
      if (!trailByYear[year]) trailByYear[year] = [];
      trailByYear[year].push(latLng);
    });

    // Add one polyline per year
    Object.entries(trailByYear).forEach(([year, latLngs]) => {
      const color = yearColorMap[year] || '#999';
      const polyline = L.polyline(latLngs, {
        color,
        weight: 4,
        opacity: 0.8
      });
      polyline.addTo(animationLayerGroup);
    });

    // Move or create the animated marker
    if (!animationMarker) {
      animationMarker = L.circleMarker(latLng, {
        radius: 8,
        fillColor: 'red',
        color: 'black',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.9
      }).bindPopup(`Time: ${formatTimestamp(point.timestamp)}`).addTo(animationLayerGroup);
    } else {
      animationMarker.setLatLng(latLng);
      animationMarker.setPopupContent(`Time: ${formatTimestamp(point.timestamp)}`);
    }

    if (timeSlider) timeSlider.value = animationIndex;
    
    if (timeSliderLabel) {
      const ts = new Date(point.timestamp);
      timeSliderLabel.textContent = formatTimestamp(ts);

      const timeDisplayElement = timeDisplayControl.getContainer();
      if (timeDisplayElement) {
        // Different format for weekly vs monthly
        timeDisplayElement.innerHTML =
          timeGrouping === 'weekly'
            ? `Week of ${ts.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
            : ts.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      }
    }
    animationIndex++;
  }, intervalMs);
}

// ===========================
  // Stop Animation code
  // ===========================  KK CHECKED few slight code changes nothing of note such as reset play/pause button

// Slider animation stop
function stopAnimation() {
  // console.log("🛑 START OF stopAnimation() function CALLED");
  // console.trace("🧭 Trace stopAnimation call");
 
  if (!animationInterval) {
    console.log("🟡 stopAnimation() skipped — no animation running");
    return;
  }

  // console.log("🛑 stopAnimation() CALLED");
  clearInterval(animationInterval);
  animationInterval = null;

  isAnimating = false;
  clearInterval(animationInterval);
  animationInterval = null;
  animationIndex = 0;

  // Restore the filtered GPS points if they were removed or hidden
  toggleGPSFilterLayer(true);  // This should re-show the filter results

  // Force refresh by dispatching 'change' on all checked filters
  document.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
    cb.dispatchEvent(new Event('change'));
  });

  // Remove animation visuals
  animationLayerGroup.clearLayers();

  // Reset play/pause button
  if (playPauseBtn) {
    playPauseBtn.textContent = "▶️ Play";
    playPauseBtn.setAttribute("title", "Start the migration animation playback");

    const tooltipInstance = bootstrap.Tooltip.getInstance(playPauseBtn);
    if (tooltipInstance) {
      tooltipInstance.setContent({ '.tooltip-inner': "Start the migration animation playback" });
    }
  }


  document.getElementById("pauseButton").disabled = true;
  document.getElementById("pauseButton").textContent = "Pause";
  animationPaused = false;

  if (timeSlider) timeSlider.value = 0;
  if (timeSliderLabel) timeSliderLabel.textContent = 'No time loaded';

  if (timeDisplayControl && timeDisplayControl.getContainer()) {
    timeDisplayControl.getContainer().innerHTML = '';
  }
  
  // Restore legend
  const legend = document.getElementById("legend");
  // if (legend) legend.style.display = "block";
  if (legend) legend.classList.remove("hide");
  window.dispatchEvent(new Event('resize')); // Optional but helps refresh layout

  // Restore legend containers
  document.getElementById("year-legend-container").style.display = "none";
  document.getElementById("cluster-legend-container").style.display = "block";

  map.removeControl(timeDisplayControl);
}

  // ===========================
  // Always keep just above DOM
  // ===========================  KK CHECKED

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'; // Prevents browser from restoring scroll position on reload
}

  // ===========================
  //   DOM code added below
  // ===========================  KK CHECKED

// Waits for the DOM to be fully loaded before running the app
document.addEventListener("DOMContentLoaded", async () => {
  window.scrollTo(0, 0); // Immediately scroll to the top when page loads

  // Initialise the map
  initMap();

  // Wait for dropdown values (year/bird etc.) to be fetched from the backend
  await fetchAndPopulateDropdowns();

  // Fade out the loading screen once dropdowns are ready
  const loadingSection = document.getElementById('loading-section');
  // Start fade-out
  loadingSection.classList.add('fade-out');
  // Hide after fade-out transition
  loadingSection.addEventListener('transitionend', () => {
    loadingSection.style.display = 'none';
  });

    // Initialise Select2 on clustering dropdowns for multi-select UI
  $('#year-select-clustering').select2({
    placeholder: "Select year(s)",
    width: '100%'
  });

  $('#bird-select-clustering').select2({
    placeholder: "Select bird(s)",
    width: '100%'
  });

  // Get references for the time slider and label
  timeSlider = document.getElementById("time-slider");
  timeSliderLabel = document.getElementById("time-label");

  document.getElementById("selectAllYears").addEventListener("click", () => {
  selectAll("year-select-clustering");
  updateFilteredDropdowns();
  });

  document.getElementById("deselectAllYears").addEventListener("click", () => {
    deselectAll("year-select-clustering");
    updateFilteredDropdowns();
  });

  document.getElementById("selectAllBirds").addEventListener("click", () => {
    selectAll("bird-select-clustering");
    updateFilteredDropdowns();
  });

  document.getElementById("deselectAllBirds").addEventListener("click", () => {
    deselectAll("bird-select-clustering");
    updateFilteredDropdowns();
  });

  // Listen for select/deselect changes in clustering dropdowns
  $("#year-select-clustering").on("select2:select select2:unselect", updateFilteredDropdowns);
  $("#bird-select-clustering").on("select2:select select2:unselect", updateFilteredDropdowns);

  // Toggle clustering parameter inputs based on selected method (e.g. show/hide DBSCAN fields)
  const form = document.getElementById("clusteringForm");
  document.getElementById("method").addEventListener("change", function () {
    // Hide all method-specific parameter sections
    document.querySelectorAll(".method-params").forEach(el => el.classList.add("d-none"));

    // Show only the relevant section for selected method
    const visible = document.getElementById(`${this.value}-params`);
    if (visible) visible.classList.remove("d-none");
  });
  
  // ################## KK NEW CODE BLOCK BELOW ADDED #########################

//   document.getElementById("clusteringForm").addEventListener("submit", () => {
//   // 🛑 Stop animation if it's running
//   if (animationInterval) stopAnimation();

//   // // ✅ Reset global filter state
//   // currentBird = "all";
//   // currentYear = "all";

//   // // ✅ Reset Year & Bird dropdowns to "all"
//   // const yearSelect = document.getElementById("year-select");
//   // const birdSelect = document.getElementById("bird-select");
//   // if (yearSelect) yearSelect.value = "all";
//   // if (birdSelect) birdSelect.value = "all";
//   // if (yearSelect) yearSelect.dispatchEvent(new Event("change"));
//   // if (birdSelect) birdSelect.dispatchEvent(new Event("change"));

//   // // ✅ Uncheck all Month & Hour checkboxes
//   // document.querySelectorAll('input[name="month"], input[name="hour"]').forEach(cb => {
//   //   cb.checked = false;
//   //   cb.dispatchEvent(new Event("change"));
//   // });

//   // // ✅ Clear distance inputs
//   // document.getElementById("distanceMin").value = "";
//   // document.getElementById("distanceMax").value = "";

//   // // ✅ Reset time slider
//   // const timeSlider = document.getElementById("time-slider");
//   // const timeLabel = document.getElementById("time-label");
//   // if (timeSlider) timeSlider.value = 0;
//   // if (timeLabel) timeLabel.innerText = "No time loaded";

//   // // ✅ Reset time grouping to monthly
//   // const monthlyRadio = document.querySelector('input[name="timeGrouping"][value="monthly"]');
//   // if (monthlyRadio) monthlyRadio.checked = true;

//   // // ✅ Reset play/pause button states
//   // updatePlayButtonState();

//   // // ✅ Hide year legend, restore cluster legend
//   // const yearLegend = document.getElementById("year-legend-container");
//   // const clusterLegend = document.getElementById("cluster-legend-container");
//   // if (yearLegend) yearLegend.style.display = "none";
//   // if (clusterLegend) clusterLegend.style.display = "block";
// });



  // ################# KK NEW CODE BLOCK ADDED ABOVE ########################


    // ===========================
    // Bird Dropdown Change Event
    // ===========================  KK CHECKED

  document.getElementById("bird-select").addEventListener("change", (e) => {
    const selected = e.target.value;

    // If selection has not changed, skip re-render
    if (selected === currentBird) {
      console.log("⚠️ Bird selection hasn't changed. Skipping re-render.");
      return;
    }

    // If animation is currently running (and not just paused), ignore the change
    if (animationInterval && !animationPaused) {
      console.log("⏳ Animation in progress. Ignoring dropdown change.");
      return;
    }
   
    // Clear any leftover animation interval (e.g., paused or stale)
    if (animationInterval) {
      clearInterval(animationInterval);
      animationInterval = null;
    }

    console.log("✅ Bird dropdown changed. New selection:", selected);
    currentBird = selected;

    renderClustersOnMap({ all_points: allPoints });
    updatePlayButtonState();
  });

    // ===========================
    // Year Dropdown Change Event
    // ===========================  KK CHECKED

  document.getElementById("year-select").addEventListener("change", (e) => {
    currentYear = e.target.value;
    renderClustersOnMap({ all_points: allPoints });
  });

    // ===========================
    // Time Slider Input Event
    // =========================== KK CHECKED

  document.getElementById('time-slider').addEventListener('input', (e) => {
    const index = parseInt(e.target.value, 10);
    updateAnimationMarker(index);
  });

    // ===========================
    // Toggle Buttons (All/None)
    // =========================== KK CHECKED

  document.querySelectorAll('button[data-toggle-type]').forEach(button => {
    button.addEventListener('click', () => {
      const type = button.dataset.toggleType;
      const check = button.dataset.toggleCheck === 'true';
      toggleAll(type, check);
    });
  });

    // ===========================
    // Distance Filter Button
    // =========================== KK CHECKED

  document.getElementById("applyDistanceFilter").addEventListener("click", () => {
    renderClustersOnMap({ all_points: allPoints });
  });
  
    // ===========================
    // Clustering Form Submission
    // =========================== KK CHECKED SLIGHT CHANGES BUT SWAPED IT OUT WITH OLD AND IT STILL SHOWED SAME ERROR

 
  form.addEventListener("submit", async (e) => {
    console.time("📝 form.addEventListener submit");
    e.preventDefault(); // Prevent default form submit behaviour

    // Clear previous logs
    document.getElementById("logsOutput").textContent = "";

    const timerDisplay = document.getElementById("clustering-timer");
    timerDisplay.textContent = "Running...";
    const startTime = performance.now(); // Start timer

    // Collect form values
    const formData = new FormData(form);
    const method = formData.get("method");

    const params = {
      decimal_places: parseInt(formData.get("decimal_places")),
      interval_minutes: parseInt(formData.get("interval_minutes")),
      sample_rate: parseInt(formData.get("sample_rate")),
      use_distance: formData.get("use_distance") === "on",
      use_heading: formData.get("use_heading") === "on",
      use_year: formData.get("use_year") === "on",
      use_month: formData.get("use_month") === "on",
      use_scaling: formData.get("use_scaling") === "on",
      use_coordinates: formData.get("use_coordinates") === "on",
      use_interval_mins: formData.get("use_interval_mins") === "on"
    };

    console.log("Clustering method:", method);
    console.log("Params being sent:", params);

    // Add extra parameters based on method
    if (method === "kmeans") {
      const autoSilhouette = formData.get("auto_silhouette") === "on";
      if (autoSilhouette) {
        params.auto_silhouette = true;
      } else {
        params.n_clusters = parseInt(formData.get("n_clusters"));
      }
    }

    if (method === "dbscan") {
      params.eps = parseFloat(formData.get("eps"));
      params.min_samples = parseInt(formData.get("min_samples"));
      params.leaf_size = parseInt(formData.get("leaf_size_dbscan")) || 40;
    }
    if (method === "hdbscan") {
      params.min_cluster_size = parseInt(formData.get("min_cluster_size"));
      const mcs = formData.get("max_cluster_size");
      if (mcs) params.max_cluster_size = parseInt(mcs);
      params.leaf_size = parseInt(formData.get("leaf_size_hdbscan")) || 40;
    }

    try {
      // Add selected dropdown filters
      params.selected_years = getSelectedValues("year-select-clustering").map(Number);
      params.selected_birds = getSelectedValues("bird-select-clustering");

      console.log("Clustering method:", method);
      console.log("Params being sent:", params);
      console.log("Selected Years:", params.selected_years);
      console.log("Selected Birds:", params.selected_birds);
      
      // Send clustering request to backend
      console.time("⏱️ Full fetch + parse + handle");
      const response = await fetch("/api/cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, params })
      });
      console.timeLog("⏱️ Full fetch + parse + handle", "🔁 fetch complete");

      // KK TEMP ADD
      // const cloned = response.clone();
      // const rawText = await cloned.text();
      console.timeLog("⏱️ Full fetch + parse + handle", "📦 raw text cloned");
      // console.log("📦 Raw response length (chars):", rawText.length);
      // console.log("📦 Approximate size (KB):", (new Blob([rawText]).size / 1024).toFixed(2));

      // If the response was not OK, throw error
      if (!response.ok) throw new Error(`HTTP ${response.status}`); 

      console.log("➡️ About to await response.json()");
      console.time("📥 await response.json()");
      // alert("About to parse JSON");  // You’ll definitely see this if reached
      // document.body.style.backgroundColor = "pink"; // You’ll definitely see this if reached
      const data = await response.json();
      console.timeLog("⏱️ Full fetch + parse + handle", "✅ json parsed");
      console.timeEnd("⏱️ Full fetch + parse + handle");
      console.timeEnd("📥 await response.json()");
      console.log("✅ Done parsing response.json");

      // ✅ Test memory pressure with stringify clone
      console.time("🧠 Memory pressure: JSON stringify clone");
      const memClone = JSON.stringify(data);
      console.timeEnd("🧠 Memory pressure: JSON stringify clone");

      if (data?.all_points?.length > 0) {
        console.log("🚨 Sample point object size:", JSON.stringify(data.all_points[0]).length, "chars");
        console.log("🧮 Total all_points:", data.all_points.length);
        console.log("🔬 Sample all_points[0]:", data.all_points[0]);
        console.log("🔍 Keys in first point:", Object.keys(data.all_points[0]));
      }
      // Clustering timer
      const endTime = performance.now(); // End timer
      const duration = ((endTime - startTime) / 1000).toFixed(2); // in seconds
      const rawSeconds = (endTime - startTime) / 1000;
      const minutes = Math.floor(rawSeconds / 60);
      const seconds = (rawSeconds % 60).toFixed(2);

      let timeText = '';
      if (minutes > 0) {
        timeText = `Completed in: ${minutes} min, ${seconds} sec`;
      } else {
        timeText = `Completed in: ${seconds} sec`;
      }
      timerDisplay.textContent = timeText;


      console.log("Clustering result:", data);

      // Display logs in the UI if provided
      if (data?.logs) {
        const logsBox = document.getElementById("logsOutput");
        if (logsBox) {
          logsBox.textContent = typeof data.logs === 'string'
            ? data.logs
            : JSON.stringify(data.logs, null, 2);

          logsBox.scrollTop = logsBox.scrollHeight;  // Scroll to bottom for long logs
          console.log(" Logs displayed in frontend:", logsBox.textContent);
        } else {
          console.warn(" logsOutput element not found");
        }
      } else {
        console.warn(" No logs found in data.logs:", data?.logs);
      }

      // Sort all points by timestamp for animation
      console.time("⏳ Sort sortedTimePoints");
      sortedTimePoints = (data?.all_points || []).slice().sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      console.timeEnd("⏳ Sort sortedTimePoints");

      // ##################### KK NEW CODE BELOW #########################
      // ✅ Reset filters & stop animation just before rendering new results
      console.time("🧹 resetFiltersAndAnimation");
      resetFiltersAndAnimation();
      console.timeEnd("🧹 resetFiltersAndAnimation");
      // ##################### KK NEW CODE ABOVE #########################

      // Render clusters on the map
      console.time("⏳ renderClustersOnMap call");
      renderClustersOnMap(data);
      console.timeEnd("⏳ renderClustersOnMap call");

      const resultsBox = document.getElementById("clusteringResults");
      if (resultsBox) resultsBox.textContent = JSON.stringify(data, null, 2);

      // Update cluster metrics if present
      if (data.metrics) {
        const metricsList = document.getElementById("metricsList");
        const m = data.metrics;

        metricsList.innerHTML = `
          <li><strong>Silhouette Score:</strong> ${formatMetric(m.silhouette_score)}</li>
          <li><strong>Adjusted Rand Index:</strong> ${formatMetric(m.adjusted_rand_index)}</li>
          <li><strong>Calinski-Harabasz Index:</strong> ${formatMetric(m.calinski_harabasz)}</li>
          <li><strong>Davies-Bouldin Index:</strong> ${formatMetric(m.davies_bouldin)}</li>
          <li><strong>Number of Clusters:</strong> ${formatMetric(m.n_clusters, 0)}</li>
          <li><strong>Noise Ratio:</strong> ${formatMetric(m.noise_ratio, 2)}</li>
        `;
      }

       // Save current settings to localStorage
      const fieldsToPersist = [
        "method", "n_clusters", "eps", "min_samples", "min_cluster_size",
        "decimal_places", "interval_minutes", "sample_rate",
        "use_distance", "use_heading", "use_year", "use_month", "use_scaling",
        "use_timestamp", "use_interval_mins", "auto_silhouette", "max_cluster_size", 
        "leaf_size_dbscan", "leaf_size_hdbscan", "timeGrouping", "use_coordinates", "animationSpeed"  
      ];

      console.time("💾 Save to localStorage");
      fieldsToPersist.forEach((key) => {
        let input = document.querySelector(`[name="${key}"]`);

        // For radio groups, get the checked one
        if (input?.type === "radio") {
          input = document.querySelector(`input[name="${key}"]:checked`);
        }

        if (input) {
          const value = input.type === "checkbox" ? input.checked : input.value;
          localStorage.setItem(`clustering_${key}`, value);
        }
      });
      console.timeEnd("💾 Save to localStorage");

    } catch (err) {
      console.error("Clustering error:", err);
      alert("There was an error running clustering.");
    }
    console.timeEnd("📝 form.addEventListener submit");
  });
  
   // ############## KK REMOVED BELOW FOR TESTING ###########################
  // #################################################################
  
  // ############## KK REMOVED ABOVE FOR TESTING ###########################
  // ################################################################

  // Helper function to format metric values
  function formatMetric(value, decimals = 3) {
    return value != null && !isNaN(value) ? value.toFixed(decimals) : 'N/A';
  }

    // ===============================
    // Refresh map when checkboxes change
    // =============================== KK CHECKED

  document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", () => {
      if (allPoints.length === 0) return; // Skip if no data has been loaded
      renderClustersOnMap({ all_points: allPoints });
    });
  });

    // ===============================
    // Restore previous form state from localStorage
    // =============================== KK CHECKED
 
  const persistFields = [
    "method", "n_clusters", "eps", "min_samples", "min_cluster_size",
    "decimal_places", "interval_minutes", "sample_rate",
    "use_distance", "use_heading", "use_year", "use_month", "use_scaling",
    "use_timestamp", "use_interval_mins", "auto_silhouette", "max_cluster_size", 
    "leaf_size_dbscan", "leaf_size_hdbscan", "timeGrouping", "use_coordinates", "animationSpeed"
  ];

  persistFields.forEach((key) => {
    const saved = localStorage.getItem(`clustering_${key}`);
    if (saved === null) return;

    // Try to get input by name
    const input = document.querySelector(`[name="${key}"]`);

    // Special case: radio buttons (e.g. timeGrouping)
    const radios = document.querySelectorAll(`input[type="radio"][name="${key}"]`);
    if (radios.length > 0) {
      radios.forEach(radio => {
        radio.checked = radio.value === saved;
      });
      return;
    }

    if (!input) return;

    if (input.type === "checkbox") {
      input.checked = saved === "true";
    } else {
      input.value = saved;
    }

    // Show method-specific parameters when restoring selected method
    if (key === "method") {
      document.querySelectorAll(".method-params").forEach(el => el.classList.add("d-none"));
      const visible = document.getElementById(`${saved}-params`);
      if (visible) visible.classList.remove("d-none");
    }
  });

  // Restore animation speed (if saved)
  const savedSpeed = localStorage.getItem("clustering_animationSpeed");
  if (savedSpeed) {
    const speedSelect = document.getElementById("speedSelect");
    if (speedSelect) speedSelect.value = savedSpeed;
  }

    // ===============================
    // Manual slider input: update animation state
    // =============================== KK CHECKED
  
  timeSlider.addEventListener('input', (e) => {
  const newIndex = parseInt(e.target.value, 10);
  animationPaused = true; // Pause animation if slider moved manually

  // Update pause button text to reflect paused state
  pauseBtn = document.getElementById("pauseButton");
  if (pauseBtn) pauseBtn.textContent = "Resume";

  // Change play/pause button to "Stop"
  const playPauseBtn = document.getElementById("playButton");
  if (playPauseBtn) playPauseBtn.textContent = "⏹️ Stop";

  animationIndex = newIndex;

  const timestamp = animationTimestamps[newIndex];
  const point = animationGroupedPoints[timestamp]?.[0];
  if (!point) return;

  const latlng = [point.location_lat, point.location_long];

  // Build trail up to current index
  animationTrail = animationTimestamps
    .slice(0, newIndex + 1)
    .map(ts => {
      const p = animationGroupedPoints[ts]?.[0];
      return p ? [p.location_lat, p.location_long] : null;
    })
    .filter(Boolean);

  // Clear existing polylines
  animationLayerGroup.eachLayer(layer => {
    if (layer instanceof L.Polyline) animationLayerGroup.removeLayer(layer);
  });

  // Group trail points by year for color-coded paths
  const trailByYear = {};
  animationTrail.forEach((latLng, idx) => {
    const point = animationGroupedPoints[animationTimestamps[idx]]?.[0];
    if (!point) return;
    const year = new Date(point.timestamp).getFullYear();
    if (!trailByYear[year]) trailByYear[year] = [];
    trailByYear[year].push(latLng);
  });

  // Draw polylines for each year's trail
  Object.entries(trailByYear).forEach(([year, latLngs]) => {
    const color = yearColorMap[year] || '#999';
    const polyline = L.polyline(latLngs, {
      color,
      weight: 4,
      opacity: 0.8
    });
    polyline.addTo(animationLayerGroup);
  });
  
  // Create or update current marker
  if (!animationMarker) {
    animationMarker = L.circleMarker(latlng, {
      radius: 8,
      fillColor: 'red',
      color: 'black',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(animationLayerGroup);
  } else {
    animationMarker.setLatLng(latlng);
  }

  // Update timestamp label
  if (timeSliderLabel) {
    const ts = new Date(point.timestamp);
    timeSliderLabel.textContent = formatTimestamp(ts);
  }

  animationMarker.bindPopup(`Time: ${formatTimestamp(point.timestamp)}`);
  map.panTo(latlng);
});

    // ===============================
    // Play / Stop button
    // =============================== KK CHECKED

  document.getElementById("playButton").addEventListener("click", () => {
    const selectedGrouping = document.querySelector('input[name="timeGrouping"]:checked')?.value || "monthly";

    if (animationInterval) {
      stopAnimation();
    } else {
      startAnimation(selectedGrouping);
    }
  });

    // ===============================
    // Pause / Resume button
    // =============================== KK CHECKED

  document.getElementById("pauseButton").addEventListener("click", () => {
    animationPaused = !animationPaused;

    pauseBtn = document.getElementById("pauseButton");
    pauseBtn.textContent = animationPaused ? "Resume" : "Pause";
  });

    // ===============================
    // Time grouping: persist selected option
    // =============================== KK CHECKED

  document.querySelectorAll('input[name="timeGrouping"]').forEach(rb => {
    rb.addEventListener('change', () => {
      const selected = document.querySelector('input[name="timeGrouping"]:checked')?.value;
      localStorage.setItem("clustering_timeGrouping", selected);
    });
  });

    // ===============================
    // Animation speed: persist dropdown value
    // =============================== KK CHECKED

  document.getElementById("speedSelect").addEventListener("change", (e) => {
    localStorage.setItem("clustering_animationSpeed", e.target.value);
  });

   // ===============================
  // Clear All Filters Button (Filter Panel)
  // =============================== KK CHECKED

  document.getElementById("clearAllFilters").addEventListener("click", () => {
    // Reset global state
    currentBird = "all";
    currentYear = "all";
    
    // Reset Year & Bird dropdowns to "all"
    const yearSelect = document.getElementById("year-select");
    const birdSelect = document.getElementById("bird-select");
    yearSelect.value = "all";
    birdSelect.value = "all";

    // Trigger dropdown change events to re-render map
    yearSelect.dispatchEvent(new Event("change"));
    birdSelect.dispatchEvent(new Event("change"));

    // Uncheck all Month checkboxes
    document.querySelectorAll('input[name="month"]').forEach(cb => {
      cb.checked = false;
      cb.dispatchEvent(new Event("change")); // if needed to trigger updates
    });

    // Uncheck all Hour checkboxes
    document.querySelectorAll('input[name="hour"]').forEach(cb => {
      cb.checked = false;
      cb.dispatchEvent(new Event("change")); // if needed
    });

    // Clear distance filter inputs
    document.getElementById("distanceMin").value = "";
    document.getElementById("distanceMax").value = "";

    // Re-render map using cleared filters
    renderClustersOnMap({ all_points: allPoints });

    // Reset time slider
    const timeSlider = document.getElementById("time-slider");
    const timeLabel = document.getElementById("time-label");
    if (timeSlider && timeLabel) {
      timeSlider.value = 0;
      timeLabel.innerText = "No time loaded";
    }

    // Reset time grouping to 'monthly'
    const monthlyRadio = document.querySelector('input[name="timeGrouping"][value="monthly"]');
    if (monthlyRadio) monthlyRadio.checked = true;

    // Update slider play/pause button states (if required)
    updatePlayButtonState();
  });

    // ===============================
    // Deferred Tooltip Setup
    // =============================== KK CHECKED

  // Step 1: Temporarily disable tooltips to prevent unstyled html
  document.querySelectorAll('.deferred-tooltip').forEach(el => {
    const tooltipInstance = bootstrap.Tooltip.getInstance(el);
    if (tooltipInstance) {
      tooltipInstance.disable();
    }
  });

  // Step 2: Transfer data-title-html -> title attribute
  document.querySelectorAll('.deferred-tooltip').forEach(el => {
    const htmlTitle = el.getAttribute('data-title-html');
    if (htmlTitle) {
      el.setAttribute('title', htmlTitle);
    }
  });

  // Step 3: Initialise all Bootstrap tooltips
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(function (tooltipTriggerEl) {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Step 4: Reveal all label text (initially hidden to avoid layout shift)
  document.querySelectorAll('.method-label-text').forEach(el => {
  el.style.visibility = 'visible';
  });

  // Step 5: Re-enable tooltips once setup is complete
  document.querySelectorAll('.deferred-tooltip').forEach(el => {
    const tooltipInstance = bootstrap.Tooltip.getInstance(el);
    if (tooltipInstance) {
      tooltipInstance.enable();
    }
  });

});
