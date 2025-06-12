// frontend/server.js

const express = require('express');
const path = require('path');
const fs = require('fs');
// const { Pool } = require('pg');
const clusterRoute = require('./routes/cluster'); // Clustering API route
const bodyParser = require('body-parser');

const app = express();

// CONNECTING TO THE DATABASE VIA PYTHON INSTEAD
// PostgreSQL config
// const pool = new Pool({
//   user: 'postgres',
//   host: 'localhost',
//   database: 'stork_migration_data',
//   password: 'Firetrap77',
//   port: 5432,
// });

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Routes
app.use('/api/cluster', clusterRoute); // <== ✅ connects your clustering endpoint

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

// CONNECTING TO THE DATABASE VIA PYTHON INSTEAD
// Run SQL file helper
// async function runSqlFile(filename) {
//   try {
//     const sql = fs.readFileSync(path.join(__dirname, filename), 'utf8');
//     await pool.query('SET search_path TO migration_data');
//     const result = await pool.query(sql);
//     console.log('Query result:', result.rows);
//     console.log('SQL file executed successfully');
//   } catch (err) {
//     console.error('Error executing SQL file:', err);
//   }
// }






// ######### LEAVE THIS AT VERY BOTTOM OF FILE ##############################
// Initialize and start server
async function startServer() {
  try {
    // await runSqlFile('../backend/db/init.sql');

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
  }
}

startServer(); // 🚀 Start the app