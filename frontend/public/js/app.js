console.log(" app.js loaded");

let map;
let clusterLayerGroup;
let timeSlider;
let timeSliderLabel;
let allPoints = [];
let currentBird = "all";
let currentYear = "all";
let mapHasBeenCentered = false;

function getSelectedCheckboxValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
    .map(cb => parseInt(cb.value, 10));
}


function initMap() {
  map = L.map('map').setView([48.0, 10.0], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(map);

  clusterLayerGroup = L.layerGroup().addTo(map);
}

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




function updateMapForTimeIndex(groupedPoints, timestamps, index) {
  clusterLayerGroup.clearLayers();
  const points = groupedPoints[timestamps[index]] || [];

  points.forEach((point) => {
    // const lat = point.location_lat;
    // const lon = point.location_long;
    // const cluster = point.cluster;

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

function toggleAll(type, check) {
  const checkboxes = document.querySelectorAll(`input[type="checkbox"][id^="${type}-"]`);
  checkboxes.forEach(cb => cb.checked = check);

  // Optionally, update filters or map here
  // updateFilters();
}

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
  // const filteredPoints = allPoints.filter(p => {
  //   const year = new Date(p.timestamp).getFullYear().toString();
  //   const birdMatch = currentBird === "all" || p.individual_local_identifier === currentBird;
  //   const yearMatch = currentYear === "all" || year === currentYear;
  //   return birdMatch && yearMatch;
  // });
  const selectedMonths = getSelectedCheckboxValues("month"); // from checkboxes
  const selectedSlots = getSelectedCheckboxValues("hour");   // from checkboxes

  const filteredPoints = allPoints.filter(p => {
    const date = new Date(p.timestamp);
    const year = date.getFullYear().toString();
    const month = date.getUTCMonth() + 1; // JS months: 0–11
    const hour = date.getUTCHours();
    const timeslot = Math.floor(hour / 3); // 3-hour buckets: 0–7

    const birdMatch = currentBird === "all" || p.individual_local_identifier === currentBird;
    const yearMatch = currentYear === "all" || year === currentYear;
    const monthMatch = selectedMonths.length === 0 || selectedMonths.includes(month);
    const slotMatch = selectedSlots.length === 0 || selectedSlots.includes(timeslot);

    return birdMatch && yearMatch && monthMatch && slotMatch;
  });


  // Rebuild groupedPoints with filtered data
  const groupedPoints = {};
  filteredPoints.forEach(point => {
    const time = point.timestamp;
    if (!groupedPoints[time]) groupedPoints[time] = [];
    groupedPoints[time].push(point);
    uniqueClusters.add(point.cluster);
  });

  // data.all_points.forEach(point => {
  //   const time = point.timestamp;
  //   if (!groupedPoints[time]) groupedPoints[time] = [];
  //   groupedPoints[time].push(point);
  //   uniqueClusters.add(point.cluster);
  // });

  // Build legend
  // [...uniqueClusters].sort((a, b) => a - b).forEach((clusterId) => {
  //   const color = getColorForCluster(clusterId);
  //   const item = document.createElement("div");
  //   item.innerHTML = `
  //     <div class="color-box" style="background:${color}"></div>
  //     Cluster ${clusterId}
  //   `;
  //   legendContainer.appendChild(item);
  // });

  // Count cluster sizes
  const clusterCounts = {};
  data.all_points.forEach(p => {
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




  // Build time slider
  // const timestamps = Object.keys(groupedPoints).sort();
  // const container = document.getElementById("timeSliderContainer") || document.createElement("div");
  // container.id = "timeSliderContainer";
  // container.style.margin = "10px";

  // Clear and rebuild
  // container.innerHTML = `
  //   <input type="range" min="0" max="${timestamps.length - 1}" value="0" id="timeSlider" style="width:300px;">
  //   <span id="timeSliderLabel">Time: ${formatTimestamp(timestamps[0])}</span>
  // `;

  // Append if not present
  // if (!document.getElementById("timeSliderContainer")) {
  //   document.body.appendChild(container);
  // }

  // timeSlider = document.getElementById("timeSlider");
  // timeSliderLabel = document.getElementById("timeSliderLabel");

  // timeSlider.addEventListener("input", () => {
  //   updateMapForTimeIndex(groupedPoints, timestamps, parseInt(timeSlider.value));
  // });

  // Initial render
//   updateMapForTimeIndex(groupedPoints, timestamps, 0);

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
        <strong>Time:</strong> ${timestamp}
      </div>
    `;
  });

  clusterLayerGroup.addLayer(marker);
});

}


// function getColorForCluster(clusterId) {
//   const colors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00'];
//   return colors[clusterId % colors.length];
// }

function getColorForCluster(clusterId) {
  const palette = d3.schemeCategory10.concat(d3.schemePaired); // Needs D3.js
  return palette[clusterId % palette.length];
}

// ################# REMOVE FULL document.addEventListener("DOMContentLoaded" PART BELOW TEST FIRST #######################################
// document.addEventListener("DOMContentLoaded", () => {
//   initMap();

//   const form = document.getElementById("clusteringForm");

//   document.getElementById("method").addEventListener("change", function () {
//     const selected = this.value;
//     document.querySelectorAll(".method-params").forEach(el => el.classList.add("d-none"));
//     const visible = document.getElementById(`${selected}-params`);
//     if (visible) visible.classList.remove("d-none");
//   });

//     document.getElementById("bird-select").addEventListener("change", (e) => {
//     currentBird = e.target.value;
//     renderClustersOnMap({ all_points: allPoints });
//   });

//   document.getElementById("year-select").addEventListener("change", (e) => {
//     currentYear = e.target.value;
//     renderClustersOnMap({ all_points: allPoints });
//   });

//   // Form block Handling
//   form.addEventListener("submit", async (e) => {
//     e.preventDefault();

//     const timerDisplay = document.getElementById("clustering-timer");
//     timerDisplay.textContent = "Running...";
//     const startTime = performance.now(); // Start timer    

//     const formData = new FormData(form);
//     const method = formData.get("method");
    
//     // const decimal_places = parseInt(formData.get("decimal_places"));
//     // const interval_minutes = parseInt(formData.get("interval_minutes"));
//     // const sample_rate = parseInt(formData.get("sample_rate"));

//     let params = {};
//     if (method === "kmeans") {
//       params.n_clusters = parseInt(formData.get("n_clusters"));
//     } else if (method === "dbscan") {
//       params.eps = parseFloat(formData.get("eps"));
//       params.min_samples = parseInt(formData.get("min_samples"));
//     } else if (method === "hdbscan") {
//       params.min_cluster_size = parseInt(formData.get("min_cluster_size"));
//     }

//     // Initial parameter confirmation for the backend
//     params.decimal_places = decimal_places;
//     params.interval_minutes = interval_minutes;
//     params.sample_rate = sample_rate;
//     // Feature selection parameters
//     params.use_distance = formData.get("use_distance") === "on";
//     params.use_heading = formData.get("use_heading") === "on";
//     params.use_year = formData.get("use_year") === "on";
//     params.use_month = formData.get("use_month") === "on";
//     params.use_scaling = formData.get("use_scaling") === "on";

//     const requestBody = {
//       method,
//       params
//     };

//     try {
//       const response = await fetch("/api/cluster", {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json"
//         },
//         body: JSON.stringify(requestBody)
//       });

//       const endTime = performance.now(); // End timer
//       const duration = ((endTime - startTime) / 1000).toFixed(2); // in seconds
//       // timerDisplay.textContent = `Completed in ${duration} sec`;
//       const rawSeconds = (endTime - startTime) / 1000;
//       const minutes = Math.floor(rawSeconds / 60);
//       const seconds = (rawSeconds % 60).toFixed(2);

//       let timeText = '';
//       if (minutes > 0) {
//         timeText = `Completed in ${minutes} min, ${seconds} sec`;
//       } else {
//         timeText = `Completed in ${seconds} sec`;
//       }
//       timerDisplay.textContent = timeText;


//       if (!response.ok) {
//         throw new Error(`HTTP error! Status: ${response.status}`);
//       }

//       const data = await response.json();
//       console.log("Clustering result:", data);
//       renderClustersOnMap(data);

//       const resultsBox = document.getElementById("clusteringResults");
//       if (resultsBox) {
//         resultsBox.textContent = JSON.stringify(data, null, 2);
//       }
//       // Clustering success metrics
//       if (data.metrics) {
//       const metricsList = document.getElementById("metricsList");
//       metricsList.innerHTML = "";  // Clear old results

//       const metrics = data.metrics;

//       const formatMetric = (name, value, decimals = 3) =>
//         `<li><strong>${name}:</strong> ${value !== null && !isNaN(value) ? value.toFixed(decimals) : 'N/A'}</li>`;

//       metricsList.innerHTML += formatMetric("Silhouette Score", metrics.silhouette_score);
//       metricsList.innerHTML += formatMetric("Adjusted Rand Index", metrics.adjusted_rand_index); // PERHAPS REMOVE IF YOU HAVE NO GROUND TRUTH
//       metricsList.innerHTML += formatMetric("Calinski-Harabasz Index", metrics.calinski_harabasz);
//       metricsList.innerHTML += formatMetric("Davies-Bouldin Index", metrics.davies_bouldin);
//       metricsList.innerHTML += formatMetric("Number of Clusters", metrics.n_clusters, 0);
//       metricsList.innerHTML += formatMetric("Noise Ratio", metrics.noise_ratio, 2);
//     }

//       // Persist form preferences using localStorage
//     const fieldsToPersist = [
//       "method", "n_clusters", "eps", "min_samples", "min_cluster_size",
//       "decimal_places", "interval_minutes", "sample_rate",
//       "use_distance", "use_heading", "use_year", "use_month", "use_scaling"
//     ];

//     // Restore saved values on load
//     fieldsToPersist.forEach((key) => {
//       const input = document.querySelector(`[name="${key}"]`);
//       if (!input) return;

//       const savedValue = localStorage.getItem(`clustering_${key}`);
//       if (savedValue !== null) {
//         if (input.type === "checkbox") {
//           input.checked = savedValue === "true";
//         } else {
//           input.value = savedValue;
//         }

//         // Show correct method parameters if method was saved
//         if (key === "method") {
//           document.querySelectorAll(".method-params").forEach(el => el.classList.add("d-none"));
//           const visible = document.getElementById(`${savedValue}-params`);
//           if (visible) visible.classList.remove("d-none");
//         }
//       }
//     });

//     // Save values on form change
//     document.getElementById("clusteringForm").addEventListener("change", () => {
//       fieldsToPersist.forEach((key) => {
//         const input = document.querySelector(`[name="${key}"]`);
//         if (!input) return;

//         const value = input.type === "checkbox" ? input.checked : input.value;
//         localStorage.setItem(`clustering_${key}`, value);
//       });
//     });

//     } catch (error) {
//       console.error("Error running clustering:", error);
//       alert("There was an error running clustering.");
//     }
//   });
// });

document.addEventListener("DOMContentLoaded", () => {
  initMap();

  const form = document.getElementById("clusteringForm");

  document.getElementById("method").addEventListener("change", function () {
    document.querySelectorAll(".method-params").forEach(el => el.classList.add("d-none"));
    const visible = document.getElementById(`${this.value}-params`);
    if (visible) visible.classList.remove("d-none");
  });

  document.getElementById("bird-select").addEventListener("change", (e) => {
    currentBird = e.target.value;
    renderClustersOnMap({ all_points: allPoints });
  });

  document.getElementById("year-select").addEventListener("change", (e) => {
    currentYear = e.target.value;
    renderClustersOnMap({ all_points: allPoints });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

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
      use_timestamp: formData.get("use_timestamp") === "on",
      use_interval_mins: formData.get("use_interval_mins") === "on"
    };

    if (method === "kmeans") params.n_clusters = parseInt(formData.get("n_clusters"));
    if (method === "dbscan") {
      params.eps = parseFloat(formData.get("eps"));
      params.min_samples = parseInt(formData.get("min_samples"));
    }
    if (method === "hdbscan") params.min_cluster_size = parseInt(formData.get("min_cluster_size"));

    try {
      const response = await fetch("/api/cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, params })
      });

      // const endTime = performance.now();
      // const seconds = ((endTime - startTime) / 1000).toFixed(2);
      // timerDisplay.textContent = `Completed in ${seconds} sec`;

      // ####################### CHECK THIS #########################################
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
 // ####################### CHECK THIS #########################################

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      console.log("Clustering result:", data);
      renderClustersOnMap(data);

      const resultsBox = document.getElementById("clusteringResults");
      if (resultsBox) resultsBox.textContent = JSON.stringify(data, null, 2);

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

      // Save settings
      const fieldsToPersist = [
        "method", "n_clusters", "eps", "min_samples", "min_cluster_size",
        "decimal_places", "interval_minutes", "sample_rate",
        "use_distance", "use_heading", "use_year", "use_month", "use_scaling",
        "use_timestamp", "use_interval_mins"
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
      renderClustersOnMap({ all_points: allPoints });
    });
  });

  // Restore previous form state
  const persistFields = [
    "method", "n_clusters", "eps", "min_samples", "min_cluster_size",
    "decimal_places", "interval_minutes", "sample_rate",
    "use_distance", "use_heading", "use_year", "use_month", "use_scaling",
    "use_timestamp", "use_interval_mins"
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
