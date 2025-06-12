// routes/cluster.js
const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');

router.post('/', (req, res) => {
  const method = req.body.method || 'kmeans';
  const params = req.body.params || {};
  const scriptPath = path.join(__dirname, '../../scripts/run_clustering.py');
  const pythonWorkingDir = path.join(__dirname, '../../');
  const paramsStr = JSON.stringify(params);

  console.log('[DEBUG] Running python script with:');
  console.log('  method:', method);
  console.log('  params:', params);
  console.log('  scriptPath:', scriptPath);
  console.log('  cwd:', pythonWorkingDir);

  // const python = spawn('python3', [scriptPath, method, paramsStr], {
  const python = spawn('C:\\Users\\krist\\OneDrive\\UEA Folder\\Dissertation\\stork_project\\venv\\Scripts\\python.exe', [scriptPath, method, paramsStr], {

    cwd: pythonWorkingDir,
  });

  let result = '';
  let errorOutput = '';

  python.stdout.on('data', (data) => {
    result += data.toString();
  });

  python.stderr.on('data', (data) => {
    errorOutput += data.toString();
    console.error('[Python stderr]', errorOutput);
  });

  python.on('close', (code) => {
    if (code !== 0) {
      console.error('[Python exit code]', code);
      return res.status(500).json({
        error: 'Python script failed',
        code,
        stderr: errorOutput,
      });
    }

    try {
      const parsed = JSON.parse(result);
      res.json(parsed);
    } catch (e) {
      console.error('[Parse error]', e.message);
      res.status(500).json({
        error: 'Failed to parse Python output',
        rawOutput: result,
      });
    }
  });
});


module.exports = router;


