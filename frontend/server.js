// frontend/server.js

const express = require('express');
const path = require('path');
const fs = require('fs');
const clusterRoute = require('./routes/cluster'); // Clustering API route
const metadataRouter = require('./routes/metadata'); // metadata api route
const bodyParser = require('body-parser');

const app = express();

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Routes
app.use('/api/cluster', clusterRoute); // connects the clustering endpoint
app.use('/api/metadata', metadataRouter); // Mounts Python metadata script

// Sample test route
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express backend!' });
});

app.get('/', (req, res) => {
  const layer_mapping = {
    'Temperature': ['Heat Map', 'Cold Zones'],
    'Migration': ['Spring Path', 'Autumn Path']
  };
  res.render('index', { layer_mapping });
});



// ######### LEAVE THIS AT VERY BOTTOM OF FILE ##############################
// Initialize and start server
async function startServer() {
  try {

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

startServer(); // Start the app