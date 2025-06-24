// routes/metadata.js
const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');

router.get('/', (req, res) => {
  const scriptPath = path.join(__dirname, '../../scripts/get_metadata.py');
  const pythonWorkingDir = path.join(__dirname, '../../');

  const python = spawn(
    'C:\\Users\\krist\\OneDrive\\UEA Folder\\Dissertation\\stork_project\\venv\\Scripts\\python.exe',
    [scriptPath],
    { cwd: pythonWorkingDir }
  );

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
