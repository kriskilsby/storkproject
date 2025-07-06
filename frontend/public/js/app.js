console.log(" app.js loaded");

const customSlots = [
  { id: 0, ranges: [[22, 24], [0, 4]] },  // Night slot
  { id: 1, ranges: [[4, 10]] },
  { id: 2, ranges: [[10, 13]] },
  { id: 3, ranges: [[13, 16]] },
  { id: 4, ranges: [[16, 19]] },
  { id: 5, ranges: [[19, 22]] }
];

window.toggleAll = function(type, check) {
  const checkboxes = document.querySelectorAll(`input[type="checkbox"][id^="${type}-"]`);
  checkboxes.forEach(cb => {
    cb.checked = check;
    cb.dispatchEvent(new Event('change')); // Trigger filter update
  });
};

// Top level global variables
let map;
let clusterLayerGroup;
let timeSlider;
let timeSliderLabel;
let allPoints = [];
let currentBird = "all";
let currentYear = "all";
let mapHasBeenCentered = false;
let originalAllPoints = []; // unfiltered data source
let metadata = {
  birds: {},
  years: {}
};
let animationMarker = null;
let animationInterval = null;
let animationIndex = 0;
let animationLayerGroup;
let sortedTimePoints = [];
let animationGroupedPoints = null;
let animationTimestamps = null;
let animationTrail = [];
let animationPolyline = null;
let playPauseBtn;
let allSortedPoints = [];
let animationPaused = false;
let selectedCluster = null;
// let markerLayer = L.layerGroup().addTo(map);




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


// Re-formats the timestamps to a date time string
// function formatTimestamp(iso) {
//   const date = new Date(iso);
//   return date.toLocaleString('en-GB', {
//     day: '2-digit',
//     month: '2-digit',
//     year: '2-digit',
//     hour: '2-digit',
//     minute: '2-digit'
//   });
// }

// New to include weekly and monthly - Re-formats the timestamps to a date time string
// function formatTimestamp(iso) {
//   if (iso.includes('-W')) {
//     // Weekly formatted string like '2024-W05'
//     const [year, weekStr] = iso.split('-W');
//     const week = parseInt(weekStr);
//     const firstDay = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
//     return `Week ${week}, ${year} (${firstDay.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`;
//   }

//   const date = new Date(iso);
//   return date.toLocaleString('en-GB', {
//     day: '2-digit',
//     month: '2-digit',
//     year: '2-digit',
//     hour: '2-digit',
//     minute: '2-digit'
//   });
// }

// New to include weekly and monthly
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



// Time details on the map for slider
function updateMapForTimeIndex(groupedPoints, timestamps, index) {
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

  // ✅ UPDATE SLIDER UI
  if (timeSlider) {
    timeSlider.value = index;
  }

  if (timeSliderLabel) {
    timeSliderLabel.textContent = `Time: ${formatTimestamp(timestamps[index])}`;
  }
}


//Populates the bird and year drop-downs based on the data set
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

// Update the filtered dropdowns to show only those that are available
function updateFilteredDropdowns() {
  const selectedYears = getSelectedValues("year-select-clustering");
  const selectedBirds = getSelectedValues("bird-select-clustering");

  console.log("Selected Years:", selectedYears);
  console.log("Selected Birds:", selectedBirds);

  // Filter years: keep only years that have at least one selected bird (or all years if no bird selected)
  const filteredYears = Object.entries(metadata.years).filter(([year, birdsObj]) => {
    if (selectedBirds.length === 0) return true;
    // birdsObj keys are bird names, check if any selected bird is present
    return selectedBirds.some(bird => birdsObj.hasOwnProperty(bird));
  });

  // Filter birds: keep only birds that have data in at least one selected year (or all birds if no year selected)
  const filteredBirds = Object.entries(metadata.birds).filter(([bird, yearsObj]) => {
    if (selectedYears.length === 0) return true;
    // yearsObj keys are years (numbers or strings), check if any selected year is present
    return selectedYears.some(year => yearsObj.hasOwnProperty(year));
  });

  // Update Year dropdown
  const yearSelect = document.getElementById("year-select-clustering");
  yearSelect.innerHTML = "";
  filteredYears.forEach(([year, birdsObj]) => {
    // Count total bird points in this year (sum of bird counts)
    const count = Object.values(birdsObj).reduce((a, b) => a + b, 0);
    const option = document.createElement("option");
    option.value = year;
    option.textContent = `${year} (${count})`;
    if (selectedYears.includes(year)) option.selected = true;
    yearSelect.appendChild(option);
  });

  // Update Bird dropdown
  const birdSelect = document.getElementById("bird-select-clustering");
  birdSelect.innerHTML = "";
  filteredBirds.forEach(([bird, yearsObj]) => {
    // Count total points for this bird (sum of counts over all years)
    const count = Object.values(yearsObj).reduce((a, b) => a + b, 0);
    const option = document.createElement("option");
    option.value = bird;
    option.textContent = `${bird} (${count})`;
    if (selectedBirds.includes(bird)) option.selected = true;
    birdSelect.appendChild(option);
  });
}



// Years list - Update to use populateMultiSelectWithCounts function
function renderYearOptions(yearList) {
  const yearCounts = {};
  yearList.forEach(year => {
    const birdData = metadata.years[year];
    const total = Object.values(birdData || {}).reduce((a, b) => a + b, 0);
    yearCounts[year] = total;
  });
  populateMultiSelectWithCounts("year-select-clustering", yearList, yearCounts);
}

// Bird list - Update to use populateMultiSelectWithCounts function
function renderBirdOptions(birdList) {
  const birdCounts = {};
  birdList.forEach(bird => {
    const yearData = metadata.birds[bird];
    const total = Object.values(yearData || {}).reduce((a, b) => a + b, 0);
    birdCounts[bird] = total;
  });
  populateMultiSelectWithCounts("bird-select-clustering", birdList, birdCounts);
}

// KK check
function getSelectedValues(selectId) {
  const select = document.getElementById(selectId);
  return Array.from(select.selectedOptions).map(opt => opt.value);
}

// Fetch the available year and birds dropdown options
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

// Animates the number shown in the cluster legend
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

// Update the slider animation and time markers
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

// Function to downsample the time slider points
function downsamplePoints(points, step = 100) {
  const sampledPoints = [];
  for (let i = 0; i < points.length; i += step) {
    sampledPoints.push(points[i]);
  }
  return sampledPoints;
}

// Get monthly average GPS point data for the time slider
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

    // Create a representative averaged point (you can copy other props if needed)
    averagedPoints[monthKey] = [{
      ...points[0],            // take first point as base for other data (optional)
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

// Alternative: Get weekly average GPS point data for the time slider
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

     // Derive a real ISO date for the start of the week
    const [year, weekStr] = weekKey.split('-W');
    const week = parseInt(weekStr);
    const firstDayOfWeek = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));

    averagedPoints[weekKey] = [{
      ...points[0],
      location_lat: avgLat,
      location_long: avgLon,
      // timestamp: weekKey // We'll format this in the label
      timestamp: firstDayOfWeek.toISOString()
    }];
  }

  const timestamps = Object.keys(averagedPoints).sort();

  return {
    groupedPoints: averagedPoints,
    timestamps
  };
}




// Main function responsible for rendering filtered points
function renderClustersOnMap(data) {
  clusterLayerGroup.clearLayers();
  const legendContainer = document.getElementById("legend");
  legendContainer.innerHTML = ""; // Clear old legend entries

  // Clear previous selection highlight
  document.querySelectorAll(".legend-item").forEach(item => {
    item.classList.remove("selected-cluster");
  });

  const uniqueClusters = new Set();

  timeSlider = document.getElementById('time-slider');
  timeSliderLabel = document.getElementById('time-label');
  playPauseBtn = document.getElementById('playButton');

  if (!data || !data.all_points || data.all_points.length === 0) {
    alert('No preview data returned');
    return;
  }

  // Stop Playback of time slider on new render
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
    if (playPauseBtn) playPauseBtn.textContent = '▶️ Play';
  }

  animationLayerGroup.clearLayers();
  allPoints = data.all_points;

  const selectedMonths = getSelectedCheckboxValues("month"); // from checkboxes
  const selectedSlots = getSelectedCheckboxValues("hour");   // from checkboxes

  const filteredPoints = allPoints.filter(p => {
    const date = new Date(p.timestamp);
    const year = date.getFullYear().toString();
    const month = date.getUTCMonth() + 1;
    // const hour = date.getUTCHours();
    const hour = date.getHours();

    // Map hour to one of the custom time slots
    let timeslot = null;
    for (const slot of customSlots) {
      for (const [start, end] of slot.ranges) {
        if (
          (start <= end && hour >= start && hour < end) ||  // e.g., 4–10
          (start > end && (hour >= start || hour < end))    // e.g., 22–04 wrap-around
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
    const clusterMatch = selectedCluster === null || p.cluster === selectedCluster; // Added for filter cluster legend

    // return birdMatch && yearMatch && monthMatch && slotMatch && distanceMatch;
    return birdMatch && yearMatch && monthMatch && slotMatch && distanceMatch && clusterMatch;

  });

  allSortedPoints = [...filteredPoints].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const downsampleStep = 100;  // You can change this to 50, 200, etc.
  
  // Monthly or weekly slider toggle
  const timeGrouping = document.querySelector('input[name="timeGrouping"]:checked')?.value || 'monthly';
  // Whether to use weekly or monthly average points for the slider animation
  let result;
  if (timeGrouping === 'weekly') {
    result = getWeeklyAveragedPoints(allSortedPoints);
  } else {
    result = getMonthlyAveragedPoints(allSortedPoints);
  }

  animationGroupedPoints = result.groupedPoints;
  animationTimestamps = result.timestamps;

  console.log("DEBUG → groupedPoints:", animationGroupedPoints);
  console.log("DEBUG → timestamps:", animationTimestamps);

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
  populateDropdowns(allPoints);
  
  const isSingleBird = currentBird !== "all";

 
  // newer version
  if (isSingleBird && allSortedPoints.length > 0) {
    document.getElementById('time-animation-controls').style.display = 'flex';

    // ✅ Step 2: Generate animation points — one per month
    // const result = getMonthlyAveragedPoints(allSortedPoints);
    // animationGroupedPoints = result.groupedPoints;
    // animationTimestamps = result.timestamps;

    console.log("📅 Monthly Averaged Points Result:", result);  // ← Debug output

    // animationGroupedPoints = result.groupedPoints;
    // animationTimestamps = result.timestamps;


    // ✅ Guard against bad data
    if (!animationGroupedPoints || !animationTimestamps || !animationTimestamps.length) {
      console.warn('⚠️ No animation data available');
      return;
    }

    // ✅ Step 3: Set up slider
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

    // ✅ Step 4: Hook up play/pause button
    playPauseBtn.onclick = () => {
      if (animationInterval) {
        stopAnimation();
        playPauseBtn.textContent = '▶️ Play';
      } else {
        playPauseBtn.textContent = '⏸️ Pause';
        startAnimation(animationGroupedPoints, animationTimestamps);
      }
    };

    // Show first frame
    updateMapForTimeIndex(animationGroupedPoints, animationTimestamps, 0);

  } else {
    document.getElementById('time-animation-controls').style.display = 'none';
  }


  // Rebuild groupedPoints with filtered data
  const groupedPoints = {};
  filteredPoints.forEach(point => {
    const time = point.timestamp;
    if (!groupedPoints[time]) groupedPoints[time] = [];
    groupedPoints[time].push(point);
    uniqueClusters.add(point.cluster);
  });

  
  // Count cluster sizes
  const clusterCounts = {};
  
  filteredPoints.forEach(p => {
  clusterCounts[p.cluster] = (clusterCounts[p.cluster] || 0) + 1;
  });

  // Sort clusters by size, descending
  const sortedClusters = Object.entries(clusterCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([clusterId]) => parseInt(clusterId));

  const topClustersToShow = 20;

  sortedClusters.slice(0, topClustersToShow).forEach((clusterId) => {
    const color = getColorForCluster(clusterId);
    const count = clusterCounts[clusterId];

    const item = document.createElement("div");

    // item.innerHTML = `
    //   <div class="color-box" style="background:${color}"></div>
    //   Cluster ${clusterId} <span style="color: #666;">(0 pts)</span>
    // `;
    // legendContainer.appendChild(item);

    // NEW CODE START
    item.classList.add("legend-item");
    item.style.cursor = "pointer";
    item.innerHTML = `
      <div class="color-box" style="background:${color}; display: inline-block; width: 16px; height: 16px; margin-right: 8px;"></div>
      <span class="legend-label">Cluster ${clusterId}</span> 
      <span class="legend-count" style="color: #666;"></span>
    `;

    // Highlight if this cluster is selected
    if (selectedCluster === clusterId) {
      item.classList.add("selected-cluster");
    }

    legendContainer.appendChild(item);

    // Add click event to legend entry
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
    // NEW CODE END

    // Animate count up on the span element
    animateCountUp(item.querySelector(".legend-count"), count, 1500);
  });


  if (sortedClusters.length > topClustersToShow) {
    const remaining = sortedClusters.length - topClustersToShow;
    const item = document.createElement("div");
    item.innerHTML = `
      <div class="color-box" style="background: #999;"></div>
      ${remaining} more clusters hidden
    `;
    legendContainer.appendChild(item);
  }

  if (allPoints.length > 0) {
    const bounds = L.latLngBounds(filteredPoints.map(p => [p.location_lat, p.location_long]));
    map.fitBounds(bounds);
  }


  // Show all points without filtering by time
  Object.values(groupedPoints).flat().forEach((point) => {
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

      // return `
      //   <div>
      //     <strong>Cluster:</strong> ${cluster}<br/>
      //     <strong>Bird ID:</strong> ${point.individual_local_identifier}<br/>
      //     <strong>Heading:</strong> ${heading}° (${compass})<br/>
      //     <strong>Distance:</strong> ${distance} m<br/>
      //     <strong>Time:</strong> ${timestamp}<br/>
      //     <strong>Latitude:</strong> ${lat}<br/>
      //     <strong>Longitude:</strong> ${lon}
      //   </div>
      // `;


      // return `
      //   <div>
      //     <strong>Cluster:</strong> ${cluster}<br/>
      //     <strong>Bird ID:</strong> ${point.individual_local_identifier}<br/>
      //     <strong>Heading:</strong> ${heading}° (${compass})<br/>
      //     <strong>Distance:</strong> ${distance} m<br/>
      //     <strong>Time:</strong> ${timestamp}<br/>
      //     <strong>Latitude:</strong> ${lat}<br/>
      //     <strong>Longitude:</strong> ${lon}<br/>
      //     <div style="margin-top: 6px;">
            // <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" style="margin-right: 8px;">🌍 Google Maps</a>
            // <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}" target="_blank">🗺️ OpenStreetMap</a>
      //     </div>
      //   </div>
      // `;

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

    clusterLayerGroup.addLayer(marker);
  });

}

// Returns a color for a given cluster ID using a D3 palette
function getColorForCluster(clusterId) {
  const palette = d3.schemeCategory10.concat(d3.schemePaired); // Needs D3.js
  return palette[clusterId % palette.length];
}


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

function selectAll(id) {
  const select = document.getElementById(id);
  for (let opt of select.options) opt.selected = true;
  $(`#${id}`).trigger('change'); // <- Trigger UI update
}

// Deselect all years and birds in the clustering form
function deselectAll(id) {
  const select = document.getElementById(id);
  for (let opt of select.options) opt.selected = false;
  $(`#${id}`).trigger('change'); // <- Trigger UI update
}

// Filter birds by years
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

// Function to add options with record counts
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

// Fiter the years by bird
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

// For time slider
function toggleGPSFilterLayer(show) {
  if (clusterLayerGroup) {
    show ? map.addLayer(clusterLayerGroup) : map.removeLayer(clusterLayerGroup);
  }
}


// Slider animation start
function startAnimation(timeGrouping = 'monthly') {

  // Dynamically select based on current radio button
  const result = timeGrouping === 'weekly'
    ? getWeeklyAveragedPoints(allSortedPoints)
    : getMonthlyAveragedPoints(allSortedPoints);

  animationGroupedPoints = result.groupedPoints;
  // animationTimestamps = result.sortedTimestamps;
  animationTimestamps = result.timestamps;
  console.log("Animation Data Returned:", result);

  if (!animationGroupedPoints || !Array.isArray(animationTimestamps) || animationTimestamps.length === 0) {
    console.warn("Invalid animation data.");
    return;
  }

  // ✅ Choose animation speed
  // const intervalMs = timeGrouping === 'weekly' ? 400 : 800;
  // ✅ Read selected speed option
  const speedInput = document.getElementById("speedSelect");
  const selectedSpeed = speedInput?.value || "medium";

  // ✅ Mode-specific interval mapping
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
  }
  
  const legend = document.getElementById("legend");
  if (legend) legend.style.display = "none";

  timeDisplayControl.addTo(map);

  animationInterval = setInterval(() => {
     if (animationPaused) return;

    if (animationIndex >= animationTimestamps.length) {
      stopAnimation();
      return;
    }

    const timestamp = animationTimestamps[animationIndex];
    const point = animationGroupedPoints[timestamp]?.[0];

    if (!point) {
      animationIndex++;
      return;
    }

    const latLng = [point.location_lat, point.location_long];
    animationTrail.push(latLng);

    // ➤ Draw polyline trail
    if (animationPolyline) animationLayerGroup.removeLayer(animationPolyline);
    animationPolyline = L.polyline(animationTrail, {
      color: 'red',
      weight: 4,
      opacity: 0.8
    }).addTo(animationLayerGroup);

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


// Slider animation stop
function stopAnimation() {
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

  // Reset play/pause button (optional)
  if (playPauseBtn) playPauseBtn.textContent = "▶️ Play";

  document.getElementById("pauseButton").disabled = true;
  document.getElementById("pauseButton").textContent = "Pause";
  animationPaused = false;

  // Reset time slider and label (optional)
  // const timeSlider = document.getElementById("time-slider");
  // const timeLabel = document.getElementById('time-label');
  if (timeSlider) timeSlider.value = 0;
  if (timeSliderLabel) timeSliderLabel.textContent = 'No time loaded';

  if (timeDisplayControl && timeDisplayControl.getContainer()) {
    timeDisplayControl.getContainer().innerHTML = '';
  }
  
  // Restore legend
  const legend = document.getElementById("legend");
  if (legend) legend.style.display = "block";

  map.removeControl(timeDisplayControl);
}







// ################# ONLY ADD WHAT NEEDS TO GO INTO DOM BELOW #################
// Initialises the app when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", async () => {
  window.scrollTo(0, 0);
  console.log("startAnimation type inside DOMContentLoaded:", typeof startAnimation);
  // Initialise the map
  initMap();

  // Wait until dropdowns are populated
  await fetchAndPopulateDropdowns();

  // Hide the loading section once metadata is fetched and dropdowns populated
  // document.getElementById('loading-section').style.display = 'none';

  // const loadingSection = document.getElementById('loading-section');

  // ### Animated loading text ###
  // const textElem = document.querySelector('#loading-metadata p');
  // const rawText = textElem.textContent;
  // const text = rawText.replace(/\s+/g, ' ').trim(); // collapse whitespace
  // const text = textElem.textContent;

  // console.log("Animating text:", text);
  // console.log("Text length:", text.length);

  // textElem.textContent = ''; // clear existing text

  // // Wrap each letter in a span with a class and a delay style for wave effect
  // for (let i = 0; i < text.length; i++) {
  //   const span = document.createElement('span');
  //   span.textContent = text[i];
  //   span.style.animationDelay = `${(text.length - i - 1) * 0.1}s`; // right to left
  //   span.classList.add('wave-letter');
  //   textElem.appendChild(span);
  // }




  // Total delay = max animation delay + duration (e.g., 0.1s * text.length + 1s)
  // const totalAnimTime = text.length * 100 + 1000; // ms

  const loadingSection = document.getElementById('loading-section');

  // Add fade-out class
  loadingSection.classList.add('fade-out');

  // // After transition finishes, set display to none
  setTimeout(() => {
    loadingSection.style.display = 'none';
  }, 1500); // Match fade-out CSS transition (0.5s = 500ms)

  // setTimeout(() => {
  //   loadingSection.classList.add('fade-out');

  //   setTimeout(() => {
  //     loadingSection.style.display = 'none';
  //   }, 1000); // Match fade-out CSS transition
  // }, totalAnimTime);

  


   // Initialise Select2 on the clustering dropdowns
  $('#year-select-clustering').select2({
    placeholder: "Select year(s)",
    width: '100%'
  });

  $('#bird-select-clustering').select2({
    placeholder: "Select bird(s)",
    width: '100%'
  });

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

  $("#year-select-clustering").on("select2:select select2:unselect", updateFilteredDropdowns);
  $("#bird-select-clustering").on("select2:select select2:unselect", updateFilteredDropdowns);

  const form = document.getElementById("clusteringForm");
  // Event listener for clustering method drop-downs
  document.getElementById("method").addEventListener("change", function () {
    document.querySelectorAll(".method-params").forEach(el => el.classList.add("d-none"));
    const visible = document.getElementById(`${this.value}-params`);
    if (visible) visible.classList.remove("d-none");
  });
  // Event listener for Bird drop-downs
  document.getElementById("bird-select").addEventListener("change", (e) => {
    currentBird = e.target.value;
    renderClustersOnMap({ all_points: allPoints });
  });
  // Event listener for year drop-downs
  document.getElementById("year-select").addEventListener("change", (e) => {
    currentYear = e.target.value;
    renderClustersOnMap({ all_points: allPoints });
  });

  document.getElementById('time-slider').addEventListener('input', (e) => {
    const index = parseInt(e.target.value, 10);
    updateAnimationMarker(index);
  });


  // Attach listeners after DOM loads
  // Event listener for toggle buttons
  document.querySelectorAll('button[data-toggle-type]').forEach(button => {
    button.addEventListener('click', () => {
      const type = button.dataset.toggleType;
      const check = button.dataset.toggleCheck === 'true';
      toggleAll(type, check);
    });
  });


  // ✅ Distance filter listener
  document.getElementById("applyDistanceFilter").addEventListener("click", () => {
    renderClustersOnMap({ all_points: allPoints });
  });

  
  // Event listener for form submission - form submission handler
  form.addEventListener("submit", async (e) => {
    // prevents form default behaviour
    e.preventDefault();

    document.getElementById("logsOutput").textContent = "";

    const timerDisplay = document.getElementById("clustering-timer");
    timerDisplay.textContent = "Running...";
    const startTime = performance.now();

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
      // Grab selected year and bird values
      const selectedYears = getSelectedValues("year-select-clustering").map(y => parseInt(y));
      const selectedBirds = getSelectedValues("bird-select-clustering");

      // Add to params object
      params.selected_years = selectedYears;
      params.selected_birds = selectedBirds;

      // Log to console for terminal debugging
      console.log("Selected Years for clustering:", selectedYears);
      console.log("Selected Birds for clustering:", selectedBirds);
      
      // Sends a POST request to /api/cluster with method & params
      const response = await fetch("/api/cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, params })
      });

      // Clustering timer
      const endTime = performance.now(); // End timer
      const duration = ((endTime - startTime) / 1000).toFixed(2); // in seconds
      // timerDisplay.textContent = `Completed in: ${duration} sec`;
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

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      console.log("Clustering result:", data);

      // Display logs if available
      if (data?.logs) {
        const logsBox = document.getElementById("logsOutput");
        if (logsBox) {
          // Step 3: Ensure logs are displayed properly even if not a plain string
          logsBox.textContent = typeof data.logs === 'string'
            ? data.logs
            : JSON.stringify(data.logs, null, 2);

          // Optional: Scroll to bottom for long logs
          logsBox.scrollTop = logsBox.scrollHeight;

          // Debug log to confirm it worked
          console.log(" Logs displayed in frontend:", logsBox.textContent);
        } else {
          console.warn(" logsBox element not found");
        }
      } else {
        console.warn(" No logs found in data.logs:", data?.logs);
      }

      sortedTimePoints = (data?.all_points || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));


      // Render received data 
      renderClustersOnMap(data);

      const resultsBox = document.getElementById("clusteringResults");
      if (resultsBox) resultsBox.textContent = JSON.stringify(data, null, 2);

      // Update cluster metrics if present
      if (data.metrics) {
        const metricsList = document.getElementById("metricsList");
        metricsList.innerHTML = "";

        const m = data.metrics;
        const metric = (n, v, d = 3) =>
          `<li><strong>${n}:</strong> ${v != null && !isNaN(v) ? v.toFixed(d) : 'N/A'}</li>`;

        metricsList.innerHTML += metric("Silhouette Score", m.silhouette_score);
        metricsList.innerHTML += metric("Adjusted Rand Index", m.adjusted_rand_index);
        metricsList.innerHTML += metric("Calinski-Harabasz Index", m.calinski_harabasz);
        metricsList.innerHTML += metric("Davies-Bouldin Index", m.davies_bouldin);
        metricsList.innerHTML += metric("Number of Clusters", m.n_clusters, 0);
        metricsList.innerHTML += metric("Noise Ratio", m.noise_ratio, 2);
      }

      // Save key settings to localStorage
      const fieldsToPersist = [
        "method", "n_clusters", "eps", "min_samples", "min_cluster_size",
        "decimal_places", "interval_minutes", "sample_rate",
        "use_distance", "use_heading", "use_year", "use_month", "use_scaling",
        "use_timestamp", "use_interval_mins", "auto_silhouette", "max_cluster_size", 
        "leaf_size_dbscan", "leaf_size_hdbscan", "timeGrouping", "use_coordinates", "animationSpeed"  
      ];

      // fieldsToPersist.forEach((key) => {
      //   const input = document.querySelector(`[name="${key}"]`);
      //   if (input) {
      //     const value = input.type === "checkbox" ? input.checked : input.value; 
      //     localStorage.setItem(`clustering_${key}`, value);
      //   }
      // });

      fieldsToPersist.forEach((key) => {
        let input = document.querySelector(`[name="${key}"]`);

        // Special case for radio button groups (like timeGrouping)
        if (input?.type === "radio") {
          input = document.querySelector(`input[name="${key}"]:checked`);
        }

        if (input) {
          const value = input.type === "checkbox" ? input.checked : input.value;
          localStorage.setItem(`clustering_${key}`, value);
        }
      });



    } catch (err) {
      console.error("Clustering error:", err);
      alert("There was an error running clustering.");
    }
  });

  document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", () => {
      if (allPoints.length === 0) return; // <- skip if no data has been loaded yet
      renderClustersOnMap({ all_points: allPoints });
    });
  });

  // Restore previous form state
  const persistFields = [
    "method", "n_clusters", "eps", "min_samples", "min_cluster_size",
    "decimal_places", "interval_minutes", "sample_rate",
    "use_distance", "use_heading", "use_year", "use_month", "use_scaling",
    "use_timestamp", "use_interval_mins", "auto_silhouette", "max_cluster_size", 
    "leaf_size_dbscan", "leaf_size_hdbscan", "timeGrouping", "use_coordinates", "animationSpeed"
  ];

  // persistFields.forEach((key) => {
  //   const input = document.querySelector(`[name="${key}"]`);
  //   const saved = localStorage.getItem(`clustering_${key}`);
  //   if (!input || saved === null) return;

  //   if (input.type === "checkbox") input.checked = saved === "true";
  //   else input.value = saved;

  //   if (key === "method") {
  //     document.querySelectorAll(".method-params").forEach(el => el.classList.add("d-none"));
  //     const visible = document.getElementById(`${saved}-params`);
  //     if (visible) visible.classList.remove("d-none");
  //   }
  // });

  persistFields.forEach((key) => {
    // Load saved value
    const saved = localStorage.getItem(`clustering_${key}`);
    if (saved === null) return;

    const input = document.querySelector(`[name="${key}"]`);

    // ✅ Special case for radio buttons
    const radios = document.querySelectorAll(`input[type="radio"][name="${key}"]`);
    if (radios.length > 0) {
      radios.forEach(radio => {
        radio.checked = radio.value === saved;
      });
      return; // skip rest of loop
    }

    if (!input) return;

    if (input.type === "checkbox") {
      input.checked = saved === "true";
    } else {
      input.value = saved;
    }

    if (key === "method") {
      document.querySelectorAll(".method-params").forEach(el => el.classList.add("d-none"));
      const visible = document.getElementById(`${saved}-params`);
      if (visible) visible.classList.remove("d-none");
    }
  });

  const savedSpeed = localStorage.getItem("clustering_animationSpeed");
  if (savedSpeed) {
    const speedSelect = document.getElementById("speedSelect");
    if (speedSelect) speedSelect.value = savedSpeed;
  }


  timeSlider.addEventListener('input', (e) => {
    if (animationInterval) stopAnimation();
    updateAnimationMarker(parseInt(e.target.value, 10));
  });


  // document.getElementById("playButton").addEventListener("click", () => {
  //   if (animationInterval) {
  //     stopAnimation();
  //   } else {
  //     startAnimation(animationGroupedPoints, animationTimestamps);
  //   }
  // });

  document.getElementById("playButton").addEventListener("click", () => {
    const selectedGrouping = document.querySelector('input[name="timeGrouping"]:checked')?.value || "monthly";

    if (animationInterval) {
      stopAnimation();
    } else {
      startAnimation(selectedGrouping);
    }
  });

  // Slider Pause button
  document.getElementById("pauseButton").addEventListener("click", () => {
    animationPaused = !animationPaused;

    const pauseBtn = document.getElementById("pauseButton");
    pauseBtn.textContent = animationPaused ? "Resume" : "Pause";
  });
   // Slider - change beteen monthly and weekly
  document.querySelectorAll('input[name="timeGrouping"]').forEach(rb => {
    rb.addEventListener('change', () => {
      const selected = document.querySelector('input[name="timeGrouping"]:checked')?.value;
      localStorage.setItem("clustering_timeGrouping", selected);
    });
  });
   // Slider speed selection
  document.getElementById("speedSelect").addEventListener("change", (e) => {
    localStorage.setItem("clustering_animationSpeed", e.target.value);
  });

  // Clear All Filters Button in Filter section
  document.getElementById("clearAllFilters").addEventListener("click", () => {
    // Reset Year & Bird dropdowns to "all"
    const yearSelect = document.getElementById("year-select");
    const birdSelect = document.getElementById("bird-select");

    yearSelect.value = "all";
    birdSelect.value = "all";

    // Dispatch change events to trigger existing listeners
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

    // Clear Distance inputs
    document.getElementById("distanceMin").value = "";
    document.getElementById("distanceMax").value = "";

    // If you have a distance filtering function that must run:
    renderClustersOnMap({ all_points: allPoints });

    // Reset time slider UI (optional, depending on your app behavior)
    const timeSlider = document.getElementById("time-slider");
    const timeLabel = document.getElementById("time-label");
    if (timeSlider && timeLabel) {
      timeSlider.value = 0;
      timeLabel.innerText = "No time loaded";
    }

    // Reset time grouping radio buttons to 'monthly' (if needed)
    const monthlyRadio = document.querySelector('input[name="timeGrouping"][value="monthly"]');
    if (monthlyRadio) monthlyRadio.checked = true;
  });

  
  
  // Temporarily disable tooltips to prevent flicker
  document.querySelectorAll('.deferred-tooltip').forEach(el => {
    const tooltipInstance = bootstrap.Tooltip.getInstance(el);
    if (tooltipInstance) {
      tooltipInstance.disable();
    }
  });

  // Transfer data-title-html -> title
  document.querySelectorAll('.deferred-tooltip').forEach(el => {
    const htmlTitle = el.getAttribute('data-title-html');
    if (htmlTitle) {
      el.setAttribute('title', htmlTitle);
    }
  });

  // Initialise all tooltips
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(function (tooltipTriggerEl) {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Reveal all label text hidden initially
document.querySelectorAll('.method-label-text').forEach(el => {
  el.style.visibility = 'visible';
});

  // Re-enable tooltips when ready
  document.querySelectorAll('.deferred-tooltip').forEach(el => {
    const tooltipInstance = bootstrap.Tooltip.getInstance(el);
    if (tooltipInstance) {
      tooltipInstance.enable();
    }
  });

});
