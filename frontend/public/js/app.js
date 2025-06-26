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
}

// Re-formats the timestamps to a date time string
function formatTimestamp(iso) {
  const date = new Date(iso);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Updates the map to show points
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

// Update filtered dropdowns 
// function updateFilteredDropdowns() {
//   const selectedYears = getSelectedValues("year-select-clustering");
//   const selectedBirds = getSelectedValues("bird-select-clustering");

//   // Filtering logic
//   const filteredYears = Object.entries(metadata.years).filter(([year, data]) => {
//     if (selectedBirds.length === 0) return true;
//     return data.birds.some(bird => selectedBirds.includes(bird));
//   });

//   const filteredBirds = Object.entries(metadata.birds).filter(([bird, data]) => {
//     if (selectedYears.length === 0) return true;
//     return data.years.some(year => selectedYears.includes(year));
//   });

//   // Populate Year dropdown
//   const yearSelect = document.getElementById("year-select-clustering");
//   yearSelect.innerHTML = "";
//   filteredYears.forEach(([year, data]) => {
//     const option = document.createElement("option");
//     option.value = year;
//     option.textContent = `${year} (${data.count})`;
//     if (selectedYears.includes(year)) option.selected = true;
//     yearSelect.appendChild(option);
//   });

//   // Populate Bird dropdown
//   const birdSelect = document.getElementById("bird-select-clustering");
//   birdSelect.innerHTML = "";
//   filteredBirds.forEach(([bird, data]) => {
//     const option = document.createElement("option");
//     option.value = bird;
//     option.textContent = `${bird} (${data.count})`;
//     if (selectedBirds.includes(bird)) option.selected = true;
//     birdSelect.appendChild(option);
//   });
// }

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



// Update to use populateMultiSelectWithCounts function
function renderYearOptions(yearList) {
  const yearCounts = {};
  yearList.forEach(year => {
    const birdData = metadata.years[year];
    const total = Object.values(birdData || {}).reduce((a, b) => a + b, 0);
    yearCounts[year] = total;
  });
  populateMultiSelectWithCounts("year-select-clustering", yearList, yearCounts);
}

// Update to use populateMultiSelectWithCounts function
function renderBirdOptions(birdList) {
  const birdCounts = {};
  birdList.forEach(bird => {
    const yearData = metadata.birds[bird];
    const total = Object.values(yearData || {}).reduce((a, b) => a + b, 0);
    birdCounts[bird] = total;
  });
  populateMultiSelectWithCounts("bird-select-clustering", birdList, birdCounts);
}


function getSelectedValues(selectId) {
  const select = document.getElementById(selectId);
  return Array.from(select.selectedOptions).map(opt => opt.value);
}



// To populate the drop-downs with all available years and birds

// async function fetchAndPopulateDropdowns() {
//   try {
//     const response = await fetch('/api/metadata');
//     const data = await response.json();

//     const availableYears = data.years;
//     const availableBirds = data.birds;

//     populateMultiSelect("year-select-clustering", availableYears);
//     populateMultiSelect("bird-select-clustering", availableBirds);
//   } catch (err) {
//     console.error("Error fetching metadata:", err);
//   }
// }

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


// Main function responsible for rendering filtered points
function renderClustersOnMap(data) {
  clusterLayerGroup.clearLayers();
  const legendContainer = document.getElementById("legend");
  legendContainer.innerHTML = ""; // Clear old legend entries
  const uniqueClusters = new Set();

  if (!data || !data.all_points || data.all_points.length === 0) {

    alert('No preview data returned');
    return;
  }

  // Group by timestamp
  // const groupedPoints = {};
  allPoints = data.all_points;

  // centre on the map on first load
  if (!mapHasBeenCentered && allPoints.length > 0) {
  const bounds = L.latLngBounds(allPoints.map(p => [p.location_lat, p.location_long]));
  map.fitBounds(bounds);
  mapHasBeenCentered = true;
  }

  // Populate dropdowns
  populateDropdowns(allPoints);

  // Filtered points
  
  const selectedMonths = getSelectedCheckboxValues("month"); // from checkboxes
  const selectedSlots = getSelectedCheckboxValues("hour");   // from checkboxes

  const filteredPoints = allPoints.filter(p => {
    const date = new Date(p.timestamp);
    const year = date.getFullYear().toString();
    const month = date.getUTCMonth() + 1; // JS months: 0–11
    const hour = date.getUTCHours();
    // const timeslot = Math.floor(hour / 3); // 3-hour buckets: 0–7

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

    return birdMatch && yearMatch && monthMatch && slotMatch && distanceMatch;
  });


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
  // data.all_points.forEach(p => {
  //   clusterCounts[p.cluster] = (clusterCounts[p.cluster] || 0) + 1;
  // });
  filteredPoints.forEach(p => {
  clusterCounts[p.cluster] = (clusterCounts[p.cluster] || 0) + 1;
});


  // Sort clusters by size, descending
  const sortedClusters = Object.entries(clusterCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([clusterId]) => parseInt(clusterId));

  const topClustersToShow = 15;

  sortedClusters.slice(0, topClustersToShow).forEach((clusterId) => {
    const color = getColorForCluster(clusterId);
    const count = clusterCounts[clusterId];

    const item = document.createElement("div");
    item.innerHTML = `
      <div class="color-box" style="background:${color}"></div>
      Cluster ${clusterId} <span style="color: #666;">(0 pts)</span>
    `;
    legendContainer.appendChild(item);

    // Animate count up on the span element
    animateCountUp(item.querySelector("span"), count, 1500);
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

    return `
      <div>
        <strong>Cluster:</strong> ${cluster}<br/>
        <strong>Bird ID:</strong> ${point.individual_local_identifier}<br/>
        <strong>Heading:</strong> ${heading}° (${compass})<br/>
        <strong>Distance:</strong> ${distance} m<br/>
        <strong>Time:</strong> ${timestamp}<br/>
        <strong>Latitude:</strong> ${lat}<br/>
        <strong>Longitude:</strong> ${lon}
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

// duplicate function call
// function fetchAndPopulateDropdowns() {
//   fetch('/api/metadata')
//     .then(res => res.json())
//     .then(data => {
//       populateMultiSelect("year-select-clustering", data.years);
//       populateMultiSelect("bird-select-clustering", data.birds);
//     })
//     .catch(err => console.error("Error loading metadata:", err));
// }

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




// ################# ONLY ADD WHAT NEEDS TO GO INTO DOM BELOW #################
// Initialises the app when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", async () => {
  // Initialise the map
  initMap();

  // Wait until dropdowns are populated
  await fetchAndPopulateDropdowns();

   // Initialise Select2 on the clustering dropdowns
  $('#year-select-clustering').select2({
    placeholder: "Select year(s)",
    width: '100%'
  });

  $('#bird-select-clustering').select2({
    placeholder: "Select bird(s)",
    width: '100%'
  });

  // Attach event listeners
  // document.getElementById("selectAllYears").addEventListener("click", () => selectAll("year-select-clustering"));
  // document.getElementById("deselectAllYears").addEventListener("click", () => deselectAll("year-select-clustering"));
  // document.getElementById("selectAllBirds").addEventListener("click", () => selectAll("bird-select-clustering"));
  // document.getElementById("deselectAllBirds").addEventListener("click", () => deselectAll("bird-select-clustering"));

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


  // document.getElementById("year-select-clustering").addEventListener("change", updateFilteredDropdowns);
  // document.getElementById("bird-select-clustering").addEventListener("change", updateFilteredDropdowns);

//   ["change", "click", "keyup"].forEach(eventType => {
//   document.getElementById("year-select-clustering").addEventListener(eventType, updateFilteredDropdowns);
//   document.getElementById("bird-select-clustering").addEventListener(eventType, updateFilteredDropdowns);
// });

  $("#year-select-clustering").on("select2:select select2:unselect", updateFilteredDropdowns);
  $("#bird-select-clustering").on("select2:select select2:unselect", updateFilteredDropdowns);



  // Attach dropdown change listeners
  // document.getElementById("year-select-clustering").addEventListener("change", () => {
  //   const selectedYears = Array.from(document.getElementById("year-select-clustering").selectedOptions).map(opt => opt.value);
  //   filterBirdsByYears(selectedYears);
  // });

  // document.getElementById("bird-select-clustering").addEventListener("change", () => {
  //   const selectedBirds = Array.from(document.getElementById("bird-select-clustering").selectedOptions).map(opt => opt.value);
  //   filterYearsByBirds(selectedBirds);
  // });

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
      // timerDisplay.textContent = `Completed in ${duration} sec`;
      const rawSeconds = (endTime - startTime) / 1000;
      const minutes = Math.floor(rawSeconds / 60);
      const seconds = (rawSeconds % 60).toFixed(2);

      let timeText = '';
      if (minutes > 0) {
        timeText = `Completed in ${minutes} min, ${seconds} sec`;
      } else {
        timeText = `Completed in ${seconds} sec`;
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
        "leaf_size_dbscan", "leaf_size_hdbscan" 
      ];

      fieldsToPersist.forEach((key) => {
        const input = document.querySelector(`[name="${key}"]`);
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
    "leaf_size_dbscan", "leaf_size_hdbscan" 
  ];

  persistFields.forEach((key) => {
    const input = document.querySelector(`[name="${key}"]`);
    const saved = localStorage.getItem(`clustering_${key}`);
    if (!input || saved === null) return;

    if (input.type === "checkbox") input.checked = saved === "true";
    else input.value = saved;

    if (key === "method") {
      document.querySelectorAll(".method-params").forEach(el => el.classList.add("d-none"));
      const visible = document.getElementById(`${saved}-params`);
      if (visible) visible.classList.remove("d-none");
    }
  });
});
